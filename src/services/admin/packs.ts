import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug } from "@/lib/utils";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

export class PackAdminError extends Error {
  constructor(
    readonly code: "validation" | "not_found" | "conflict",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PackAdminError";
  }
}

export type AdminPackInput = {
  slug?: unknown;
  title?: unknown;
  excerpt?: unknown;
  description?: unknown;
  categoryId?: unknown;
  publisher?: unknown;
  isKnown?: unknown;
  sourceType?: unknown;
  license?: unknown;
  sourceUrl?: unknown;
  distributionPermission?: unknown;
  status?: unknown;
  featured?: unknown;
  editorPick?: unknown;
  recommended?: unknown;
  trendingOverride?: unknown;
  performanceImpact?: unknown;
  compatibility?: unknown;
  fileSizeBytes?: unknown;
  fivemVersion?: unknown;
  videoUrl?: unknown;
  tagIds?: unknown;
};

const statuses = new Set<string>(s.packStatus.enumValues);
const sources = new Set<string>(s.sourceType.enumValues);
const permissions = new Set<string>(s.distributionPermission.enumValues);
const impacts = new Set<string>(s.performanceImpact.enumValues);

function gate(actor: Actor, permission: "pack.manage" | "pack.publish" | "pack.feature" | "pack.delete") {
  assertActive(actor);
  requirePermission(actor, permission);
  if (!actor.id) throw new PackAdminError("validation", "Geçersiz aktör.", 400);
  return actor.id;
}

function cleanText(value: unknown, label: string, min: number, max: number): string {
  const clean = typeof value === "string" ? value.trim().replace(/\r\n/g, "\n") : "";
  if (clean.length < min || clean.length > max) {
    throw new PackAdminError("validation", `${label} ${min}-${max} karakter olmalı.`, 400);
  }
  return clean;
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === null || value === "" || value === undefined) return null;
  return cleanText(value, label, 1, max);
}

function optionalUrl(value: unknown, label: string): string | null {
  const clean = optionalText(value, label, 2048);
  if (!clean) return null;
  try {
    const url = new URL(clean);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
    return url.href;
  } catch {
    throw new PackAdminError("validation", `${label} geçerli bir HTTP(S) adresi olmalı.`, 400);
  }
}

function enumValue<T extends string>(value: unknown, allowed: Set<string>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new PackAdminError("validation", `Geçersiz ${label}.`, 400);
  }
  return value as T;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new PackAdminError("validation", `${label} boolean olmalı.`, 400);
  return value;
}

function bigintValue(value: unknown): bigint | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new PackAdminError("validation", "Dosya boyutu geçersiz.", 400);
  }
  try {
    const parsed = BigInt(value);
    if (parsed < 0n || parsed > 10_000_000_000_000n) throw new Error("range");
    return parsed;
  } catch {
    throw new PackAdminError("validation", "Dosya boyutu sıfır veya pozitif tam sayı olmalı.", 400);
  }
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new PackAdminError("validation", `${label} dizi olmalı.`, 400);
  const items = [...new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))];
  if (items.length > 30 || items.some((item) => item.length > 80)) {
    throw new PackAdminError("validation", `${label} en fazla 30 kısa değer içerebilir.`, 400);
  }
  return items;
}

function tagList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new PackAdminError("validation", "Etiketler dizi olmalı.", 400);
  const ids = [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 128))];
  if (ids.length > 20) throw new PackAdminError("validation", "En fazla 20 etiket seçilebilir.", 400);
  return ids;
}

function auditSnapshot(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as Record<string, unknown>;
}

function constraintMessage(error: unknown): string {
  let current: unknown = error;
  const messages: string[] = [];
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (current instanceof Error) messages.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return messages.join(" ");
}

function mapConstraint(error: unknown): never {
  const detail = constraintMessage(error);
  if (detail.includes("unique") || detail.includes("duplicate key")) {
    throw new PackAdminError("conflict", "Bu paket slug'ı zaten kullanılıyor.", 409);
  }
  if (detail.includes("foreign key")) {
    throw new PackAdminError("validation", "Kategori veya etiket seçimi geçersiz.", 400);
  }
  throw error;
}

async function ensureReferences(db: Database, categoryId: string, tagIds: string[]) {
  const [category] = await db.select({ id: s.packCategories.id }).from(s.packCategories).where(eq(s.packCategories.id, categoryId));
  if (!category) throw new PackAdminError("validation", "Kategori bulunamadı.", 400);
  if (tagIds.length > 0) {
    const tags = await db.select({ id: s.tags.id }).from(s.tags).where(inArray(s.tags.id, tagIds));
    if (tags.length !== tagIds.length) throw new PackAdminError("validation", "Etiket seçimi geçersiz.", 400);
  }
}

export async function listAdminPacks(db: Database, actor: Actor) {
  gate(actor, "pack.manage");
  const rows = await db
    .select({
      id: s.packs.id,
      slug: s.packs.slug,
      title: s.packs.title,
      excerpt: s.packs.excerpt,
      description: s.packs.description,
      categoryId: s.packs.categoryId,
      categoryName: s.packCategories.name,
      creatorName: s.users.displayName,
      publisher: s.packs.publisher,
      isKnown: s.packs.isKnown,
      sourceType: s.packs.sourceType,
      license: s.packs.license,
      sourceUrl: s.packs.sourceUrl,
      distributionPermission: s.packs.distributionPermission,
      status: s.packs.status,
      featured: s.packs.featured,
      editorPick: s.packs.editorPick,
      recommended: s.packs.recommended,
      trendingOverride: s.packs.trendingOverride,
      performanceImpact: s.packs.performanceImpact,
      compatibility: s.packs.compatibility,
      fileSizeBytes: s.packs.fileSizeBytes,
      fivemVersion: s.packs.fivemVersion,
      videoUrl: s.packs.videoUrl,
      publishedAt: s.packs.publishedAt,
      updatedAt: s.packs.updatedAt,
    })
    .from(s.packs)
    .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
    .innerJoin(s.users, eq(s.users.id, s.packs.creatorId))
    .where(eq(s.packs.isDemo, false))
    .orderBy(desc(s.packs.updatedAt), asc(s.packs.id));
  const packIds = rows.map((row) => row.id);
  const tagRows = packIds.length === 0 ? [] : await db.select().from(s.packTags).where(inArray(s.packTags.packId, packIds));
  return rows.map((row) => ({
    ...row,
    fileSizeBytes: row.fileSizeBytes?.toString() ?? null,
    tagIds: tagRows.filter((tag) => tag.packId === row.id).map((tag) => tag.tagId),
  }));
}

function createValues(actorId: string, input: AdminPackInput) {
  if (!isSafeSlug(input.slug)) throw new PackAdminError("validation", "Slug küçük harfli kebab-case olmalı.", 400);
  const categoryId = cleanText(input.categoryId, "Kategori", 1, 128);
  const status = input.status === undefined ? "draft" : enumValue<(typeof s.packStatus.enumValues)[number]>(input.status, statuses, "durum");
  return {
    values: {
      slug: input.slug,
      title: cleanText(input.title, "Başlık", 3, 120),
      excerpt: cleanText(input.excerpt, "Özet", 10, 300),
      description: cleanText(input.description, "Açıklama", 20, 50_000),
      categoryId,
      creatorId: actorId,
      publisher: optionalText(input.publisher, "Yayıncı", 120),
      isKnown: input.isKnown === undefined ? false : booleanValue(input.isKnown, "isKnown"),
      sourceType: input.sourceType === undefined ? "external" as const : enumValue<(typeof s.sourceType.enumValues)[number]>(input.sourceType, sources, "kaynak türü"),
      license: optionalText(input.license, "Lisans", 120),
      sourceUrl: optionalUrl(input.sourceUrl, "Kaynak URL"),
      distributionPermission: input.distributionPermission === undefined ? "unknown" as const : enumValue<(typeof s.distributionPermission.enumValues)[number]>(input.distributionPermission, permissions, "dağıtım izni"),
      status,
      featured: input.featured === undefined ? false : booleanValue(input.featured, "featured"),
      editorPick: input.editorPick === undefined ? false : booleanValue(input.editorPick, "editorPick"),
      recommended: input.recommended === undefined ? false : booleanValue(input.recommended, "recommended"),
      trendingOverride: input.trendingOverride === undefined ? false : booleanValue(input.trendingOverride, "trendingOverride"),
      performanceImpact: input.performanceImpact === undefined ? "medium" as const : enumValue<(typeof s.performanceImpact.enumValues)[number]>(input.performanceImpact, impacts, "performans etkisi"),
      compatibility: input.compatibility === undefined ? [] : stringList(input.compatibility, "Uyumluluk"),
      fileSizeBytes: bigintValue(input.fileSizeBytes),
      fivemVersion: optionalText(input.fivemVersion, "FiveM sürümü", 80),
      videoUrl: optionalUrl(input.videoUrl, "Video URL"),
      publishedAt: status === "approved" ? new Date() : null,
    },
    tagIds: input.tagIds === undefined ? [] : tagList(input.tagIds),
  };
}

export async function createAdminPack(db: Database, actor: Actor, input: AdminPackInput) {
  const actorId = gate(actor, "pack.manage");
  const { values, tagIds } = createValues(actorId, input);
  if (values.status === "approved") gate(actor, "pack.publish");
  if (values.featured || values.editorPick || values.recommended || values.trendingOverride) gate(actor, "pack.feature");
  await ensureReferences(db, values.categoryId, tagIds);
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(s.packs).values(values).returning();
      if (!created) throw new Error("Pack insert returned no row.");
      if (tagIds.length > 0) await tx.insert(s.packTags).values(tagIds.map((tagId) => ({ packId: created.id, tagId })));
      await tx.insert(s.auditLogs).values({ actorId, action: "pack.create", targetType: "pack", targetId: created.id, after: auditSnapshot(created) });
      return { ...created, fileSizeBytes: created.fileSizeBytes?.toString() ?? null, tagIds };
    });
  } catch (error) {
    mapConstraint(error);
  }
}

export async function updateAdminPack(db: Database, actor: Actor, id: string, input: AdminPackInput) {
  const actorId = gate(actor, "pack.manage");
  const [before] = await db.select().from(s.packs).where(and(eq(s.packs.id, id), eq(s.packs.isDemo, false)));
  if (!before) throw new PackAdminError("not_found", "Paket bulunamadı.", 404);
  const patch: Partial<typeof s.packs.$inferInsert> = {};
  if (input.slug !== undefined) {
    if (!isSafeSlug(input.slug)) throw new PackAdminError("validation", "Slug küçük harfli kebab-case olmalı.", 400);
    patch.slug = input.slug;
  }
  if (input.title !== undefined) patch.title = cleanText(input.title, "Başlık", 3, 120);
  if (input.excerpt !== undefined) patch.excerpt = cleanText(input.excerpt, "Özet", 10, 300);
  if (input.description !== undefined) patch.description = cleanText(input.description, "Açıklama", 20, 50_000);
  if (input.categoryId !== undefined) patch.categoryId = cleanText(input.categoryId, "Kategori", 1, 128);
  if (input.publisher !== undefined) patch.publisher = optionalText(input.publisher, "Yayıncı", 120);
  if (input.isKnown !== undefined) patch.isKnown = booleanValue(input.isKnown, "isKnown");
  if (input.sourceType !== undefined) patch.sourceType = enumValue<(typeof s.sourceType.enumValues)[number]>(input.sourceType, sources, "kaynak türü");
  if (input.license !== undefined) patch.license = optionalText(input.license, "Lisans", 120);
  if (input.sourceUrl !== undefined) patch.sourceUrl = optionalUrl(input.sourceUrl, "Kaynak URL");
  if (input.distributionPermission !== undefined) patch.distributionPermission = enumValue<(typeof s.distributionPermission.enumValues)[number]>(input.distributionPermission, permissions, "dağıtım izni");
  if (input.performanceImpact !== undefined) patch.performanceImpact = enumValue<(typeof s.performanceImpact.enumValues)[number]>(input.performanceImpact, impacts, "performans etkisi");
  if (input.compatibility !== undefined) patch.compatibility = stringList(input.compatibility, "Uyumluluk");
  if (input.fileSizeBytes !== undefined) patch.fileSizeBytes = bigintValue(input.fileSizeBytes);
  if (input.fivemVersion !== undefined) patch.fivemVersion = optionalText(input.fivemVersion, "FiveM sürümü", 80);
  if (input.videoUrl !== undefined) patch.videoUrl = optionalUrl(input.videoUrl, "Video URL");
  for (const key of ["featured", "editorPick", "recommended", "trendingOverride"] as const) {
    if (input[key] !== undefined) {
      gate(actor, "pack.feature");
      patch[key] = booleanValue(input[key], key);
    }
  }
  if (input.status !== undefined) {
    const status = enumValue<(typeof s.packStatus.enumValues)[number]>(input.status, statuses, "durum");
    if (status === "approved" && before.status !== "approved") gate(actor, "pack.publish");
    patch.status = status;
    if (status === "approved" && !before.publishedAt) patch.publishedAt = new Date();
  }
  const tagIds = input.tagIds === undefined ? undefined : tagList(input.tagIds);
  const categoryId = patch.categoryId ?? before.categoryId;
  await ensureReferences(db, categoryId, tagIds ?? []);
  if (Object.keys(patch).length === 0 && tagIds === undefined) throw new PackAdminError("validation", "Güncellenecek alan yok.", 400);
  try {
    return await db.transaction(async (tx) => {
      const [updated] = Object.keys(patch).length > 0
        ? await tx.update(s.packs).set(patch).where(eq(s.packs.id, id)).returning()
        : [before];
      if (!updated) throw new PackAdminError("not_found", "Paket bulunamadı.", 404);
      if (tagIds !== undefined) {
        await tx.delete(s.packTags).where(eq(s.packTags.packId, id));
        if (tagIds.length > 0) await tx.insert(s.packTags).values(tagIds.map((tagId) => ({ packId: id, tagId })));
      }
      await tx.insert(s.auditLogs).values({ actorId, action: "pack.update", targetType: "pack", targetId: id, before: auditSnapshot(before), after: auditSnapshot(updated) });
      return { ...updated, fileSizeBytes: updated.fileSizeBytes?.toString() ?? null, tagIds };
    });
  } catch (error) {
    if (error instanceof PackAdminError) throw error;
    mapConstraint(error);
  }
}

export async function archiveAdminPack(db: Database, actor: Actor, id: string) {
  const actorId = gate(actor, "pack.delete");
  const [before] = await db.select().from(s.packs).where(and(eq(s.packs.id, id), eq(s.packs.isDemo, false)));
  if (!before) throw new PackAdminError("not_found", "Paket bulunamadı.", 404);
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(s.packs)
      .set({ status: "archived", featured: false, editorPick: false, recommended: false, trendingOverride: false })
      .where(eq(s.packs.id, id))
      .returning();
    if (!updated) throw new PackAdminError("not_found", "Paket bulunamadı.", 404);
    await tx.insert(s.auditLogs).values({ actorId, action: "pack.archive", targetType: "pack", targetId: id, before: auditSnapshot(before), after: auditSnapshot(updated) });
    return { ...updated, fileSizeBytes: updated.fileSizeBytes?.toString() ?? null };
  });
}
