import { and, asc, count, desc, eq, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug } from "@/lib/utils";
import { hashIp } from "@/services/auth/token";
import { consumeRateLimit } from "@/services/rate-limit";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

/** Per-identity abuse ceiling; the count window below is stricter. */
const ABUSE_LIMIT = 10;
const ABUSE_WINDOW_SECONDS = 3600;
const COUNT_WINDOW_SECONDS = 1800;
const PAGE_SIZE = 15;

export class DownloadError extends Error {
  readonly status: number;
  readonly code: "not_found" | "rate_limited";
  constructor(code: "not_found" | "rate_limited", message: string) {
    super(message);
    this.name = "DownloadError";
    this.code = code;
    this.status = code === "rate_limited" ? 429 : 404;
  }
}

function notFound(message = "Paket bulunamadı.") {
  return new DownloadError("not_found", message);
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

type DownloadSources = {
  packId: string;
  versionId: string | null;
  primaryUrl: string | null;
  mirrors: { id: string; name: string; url: string }[];
  downloadCount: number;
} | null;

/** Only approved, non-demo packs in enabled categories expose download sources. */
async function loadSources(db: Database, slug: string): Promise<DownloadSources> {
  if (!isSafeSlug(slug)) return null;
  const [pack] = await db.select({ id: s.packs.id, downloadCount: s.packs.downloadCount }).from(s.packs)
    .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
    .where(and(eq(s.packs.slug, slug), eq(s.packs.status, "approved"), eq(s.packs.isDemo, false),
      eq(s.packCategories.enabled, true), lte(s.packs.publishedAt, new Date())));
  if (!pack) return null;
  const [version] = await db.select({ id: s.packVersions.id, downloadUrl: s.packVersions.downloadUrl })
    .from(s.packVersions)
    .where(and(eq(s.packVersions.packId, pack.id), eq(s.packVersions.isLatest, true), eq(s.packVersions.isDemo, false)))
    .limit(1);
  const mirrors = version
    ? await db.select({ id: s.downloadMirrors.id, name: s.downloadMirrors.name, url: s.downloadMirrors.url })
      .from(s.downloadMirrors)
      .where(and(eq(s.downloadMirrors.packVersionId, version.id), eq(s.downloadMirrors.enabled, true),
        eq(s.downloadMirrors.isDemo, false)))
      // Lower priority number wins; untied names keep the result deterministic.
      .orderBy(asc(s.downloadMirrors.priority), asc(s.downloadMirrors.name))
    : [];
  return {
    packId: pack.id,
    versionId: version?.id ?? null,
    primaryUrl: safeHttpUrl(version?.downloadUrl ?? null),
    mirrors: mirrors.map((mirror) => ({ ...mirror, url: safeHttpUrl(mirror.url) ?? "" }))
      .filter((mirror) => mirror.url.length > 0),
    downloadCount: pack.downloadCount,
  };
}

export type PackDownloadOptions = {
  available: boolean;
  primary: boolean;
  mirrors: { id: string; name: string }[];
};

/** Detail-page CTA data: whether an indir button/mirror list should render. */
export async function getPackDownloadOptions(db: Database, slug: string): Promise<PackDownloadOptions> {
  const sources = await loadSources(db, slug);
  if (!sources) return { available: false, primary: false, mirrors: [] };
  return {
    available: Boolean(sources.primaryUrl) || sources.mirrors.length > 0,
    primary: Boolean(sources.primaryUrl),
    mirrors: sources.mirrors.map(({ id, name }) => ({ id, name })),
  };
}

function identityKey(actor: Actor, ip: string, userAgent: string | null): string {
  return actor.id ? `user:${actor.id}` : `guest:${ip}|${userAgent ?? ""}`;
}

/**
 * Resolves the redirect target and records the download.
 *
 * Abuse ceiling: 10 attempts/identity/hour (429 beyond).
 * Counting: at most one `downloads` row + `download_count` bump per identity
 * per 30 minutes; repeats inside the window still redirect but stay uncounted.
 * The IP is only stored as its SHA-256 digest.
 */
export async function resolvePackDownload(
  db: Database,
  actor: Actor,
  slug: string,
  identity: { ip: string; userAgent: string | null },
  mirrorId?: string,
): Promise<{ url: string; counted: boolean; downloadCount: number }> {
  if (actor.id) assertActive(actor);
  requirePermission(actor, "download.use");
  const sources = await loadSources(db, slug);
  if (!sources) throw notFound();
  const key = identityKey(actor, identity.ip, identity.userAgent);
  const abuse = await consumeRateLimit(db, `pack-download-abuse:${sources.packId}:${key}`, ABUSE_LIMIT, ABUSE_WINDOW_SECONDS);
  if (!abuse.allowed) throw new DownloadError("rate_limited", "İndirme istekleriniz çok sıklaştı. Lütfen daha sonra tekrar deneyin.");

  let url: string | null;
  let mirror: string;
  if (mirrorId !== undefined) {
    const selected = typeof mirrorId === "string" && mirrorId.length <= 64
      ? sources.mirrors.find((item) => item.id === mirrorId)
      : undefined;
    if (!selected) throw notFound("Ayna bulunamadı.");
    url = selected.url;
    mirror = selected.name;
  } else if (sources.primaryUrl) {
    url = sources.primaryUrl;
    mirror = "primary";
  } else if (sources.mirrors[0]) {
    url = sources.mirrors[0].url;
    mirror = sources.mirrors[0].name;
  } else {
    throw notFound("İndirme bağlantısı bulunamadı.");
  }

  const once = await consumeRateLimit(db, `pack-download-count:${sources.packId}:${key}`, 1, COUNT_WINDOW_SECONDS);
  if (!once.allowed) return { url, counted: false, downloadCount: sources.downloadCount };

  const downloadCount = await db.transaction(async (tx) => {
    await tx.insert(s.downloads).values({
      packId: sources.packId,
      packVersionId: sources.versionId,
      userId: actor.id,
      ipHash: hashIp(identity.ip),
      mirror,
      kind: "manual",
    });
    const [updated] = await tx.update(s.packs).set({ downloadCount: sql`${s.packs.downloadCount} + 1` })
      .where(eq(s.packs.id, sources.packId)).returning({ count: s.packs.downloadCount });
    if (!updated) throw new Error("Download count update returned no row.");
    return updated.count;
  });
  return { url, counted: true, downloadCount };
}

export type DownloadHistoryPage = {
  items: {
    id: string;
    title: string;
    slug: string;
    version: string | null;
    mirror: string;
    kind: (typeof s.downloadKind.enumValues)[number];
    createdAt: Date;
  }[];
  total: number;
  page: number;
  pageCount: number;
};

/** Members see only their own download rows; archived packs stay in history. */
export async function getMemberDownloadHistory(db: Database, actor: Actor, inputPage = 1): Promise<DownloadHistoryPage> {
  if (actor.id) assertActive(actor);
  requirePermission(actor, "download.use");
  if (!actor.id) throw notFound("İndirme kaydı bulunamadı.");
  const page = Number.isInteger(inputPage) ? Math.max(1, inputPage) : 1;
  const visible = eq(s.downloads.userId, actor.id);
  const total = Number((await db.select({ value: count() }).from(s.downloads).where(visible))[0]?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = await db.select({
    id: s.downloads.id,
    title: s.packs.title,
    slug: s.packs.slug,
    version: s.packVersions.version,
    mirror: s.downloads.mirror,
    kind: s.downloads.kind,
    createdAt: s.downloads.createdAt,
  })
    .from(s.downloads)
    .innerJoin(s.packs, eq(s.packs.id, s.downloads.packId))
    .leftJoin(s.packVersions, eq(s.packVersions.id, s.downloads.packVersionId))
    .where(visible)
    .orderBy(desc(s.downloads.createdAt), desc(s.downloads.id))
    .limit(PAGE_SIZE)
    .offset((safePage - 1) * PAGE_SIZE);
  return { items: rows, total, page: safePage, pageCount };
}
