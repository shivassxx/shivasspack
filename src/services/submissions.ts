import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { validatePackVersion, type PackVersionInput } from "@/lib/pack-version";
import { slugify } from "@/lib/utils";
import {
  SubmissionError,
  canEditSubmission,
  canReviewSubmission,
  canSubmitForReview,
  canWithdrawSubmission,
  isSubmissionDecision,
  validateReviewNote,
} from "@/lib/submission-state";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

export type SubmissionInput = {
  title?: unknown;
  excerpt?: unknown;
  description?: unknown;
  categoryId?: unknown;
  sourceUrl?: unknown;
  license?: unknown;
  tagIds?: unknown;
};

export type { SubmissionDecision } from "@/lib/submission-state";

export type SubmissionSummary = {
  id: string;
  slug: string;
  title: string;
  status: (typeof s.packStatus.enumValues)[number];
  reviewNote: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

export type SubmissionDetail = SubmissionSummary & {
  excerpt: string;
  description: string;
  categoryId: string;
  sourceUrl: string | null;
  license: string | null;
  tagIds: string[];
};

export type PackVersionSummary = {
  id: string;
  packId: string;
  packSlug: string;
  version: string;
  isLatest: boolean;
  createdAt: Date;
};

export type SubmissionQueueItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  updatedAt: Date;
  authorName: string;
  authorUsername: string;
};

function cleanText(value: unknown, label: string, min: number, max: number): string {
  const clean = typeof value === "string" ? value.trim().replace(/\r\n/g, "\n") : "";
  if (clean.length < min || clean.length > max) {
    throw new SubmissionError("validation", `${label} ${min}-${max} karakter olmalı.`, 400);
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
    throw new SubmissionError("validation", `${label} geçerli bir HTTP(S) adresi olmalı.`, 400);
  }
}

function gate(actor: Actor, permission: "pack.submit" | "pack.edit_own" | "submission.review") {
  assertActive(actor);
  requirePermission(actor, permission);
  if (!actor.id) throw new SubmissionError("validation", "Geçersiz aktör.", 400);
  return actor.id;
}

/** Drizzle sarmalayıcı (`DrizzleQueryError`) altındaki PostgreSQL kodunu bulur. */
function hasPgCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function mapConstraint(error: unknown): never {
  if (error instanceof SubmissionError) throw error;
  if (hasPgCode(error, "23505")) {
    throw new SubmissionError("conflict", "Bu slug zaten kullanılıyor.", 409);
  }
  throw error;
}

function normalizeTagIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new SubmissionError("validation", "Geçersiz etiket listesi.", 400);
  const ids = value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 64);
  if (ids.length !== value.length) throw new SubmissionError("validation", "Geçersiz etiket listesi.", 400);
  return [...new Set(ids)].slice(0, 10);
}

async function ensureCategory(db: Database, categoryId: unknown): Promise<string> {
  const id = typeof categoryId === "string" ? categoryId : "";
  if (!id) throw new SubmissionError("validation", "Kategori zorunlu.", 400);
  const [row] = await db
    .select({ id: s.packCategories.id })
    .from(s.packCategories)
    .where(and(
      eq(s.packCategories.id, id),
      eq(s.packCategories.enabled, true),
      eq(s.packCategories.isDemo, false),
    ))
    .limit(1);
  if (!row) throw new SubmissionError("validation", "Geçersiz veya kapalı kategori.", 400);
  return row.id;
}

async function ensureTags(db: Database, tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const rows = await db
    .select({ id: s.tags.id })
    .from(s.tags)
    .where(and(inArray(s.tags.id, tagIds), eq(s.tags.isDemo, false)));
  if (rows.length !== tagIds.length) throw new SubmissionError("validation", "Geçersiz etiket.", 400);
  return tagIds;
}

function parseFields(input: SubmissionInput) {
  const patch: Partial<typeof s.packs.$inferInsert> = {};
  if (input.title !== undefined) patch.title = cleanText(input.title, "Başlık", 3, 120);
  if (input.excerpt !== undefined) patch.excerpt = cleanText(input.excerpt, "Özet", 10, 300);
  if (input.description !== undefined) patch.description = cleanText(input.description, "Açıklama", 20, 50_000);
  if (input.sourceUrl !== undefined) patch.sourceUrl = optionalUrl(input.sourceUrl, "Kaynak URL");
  if (input.license !== undefined) patch.license = optionalText(input.license, "Lisans", 120);
  return patch;
}

async function uniqueSlug(db: Database, title: string): Promise<string> {
  const base = slugify(title).slice(0, 88);
  if (!base) throw new SubmissionError("validation", "Başlıktan slug oluşturulamadı.", 400);
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const [existing] = await db.select({ id: s.packs.id }).from(s.packs).where(eq(s.packs.slug, candidate)).limit(1);
    if (!existing) return candidate;
  }
  throw new SubmissionError("conflict", "Slug oluşturulamadı, başlığı değiştirip tekrar deneyin.", 409);
}

export async function createSubmission(db: Database, actor: Actor, input: SubmissionInput) {
  const actorId = gate(actor, "pack.submit");
  const fields = parseFields(input);
  if (fields.title === undefined || fields.excerpt === undefined || fields.description === undefined) {
    throw new SubmissionError("validation", "Başlık, özet ve açıklama zorunlu.", 400);
  }
  const title = fields.title;
  const excerpt = fields.excerpt;
  const description = fields.description;
  const categoryId = await ensureCategory(db, input.categoryId);
  const tagIds = await ensureTags(db, normalizeTagIds(input.tagIds));
  const slug = await uniqueSlug(db, title);
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(s.packs).values({
        title,
        excerpt,
        description,
        sourceUrl: fields.sourceUrl ?? null,
        license: fields.license ?? null,
        categoryId,
        slug,
        creatorId: actorId,
        status: "draft",
      }).returning();
      if (!created) throw new Error("Submission insert returned no row.");
      if (tagIds.length > 0) {
        await tx.insert(s.packTags).values(tagIds.map((tagId) => ({ packId: created.id, tagId })));
      }
      await tx.insert(s.auditLogs).values({
        actorId,
        action: "submission.create",
        targetType: "pack",
        targetId: created.id,
        after: { slug: created.slug, status: created.status },
      });
      return { ...toSummary(created), ...detailFields(created), tagIds };
    });
  } catch (error) {
    return mapConstraint(error);
  }
}

export async function listSubmissions(db: Database, actor: Actor): Promise<SubmissionDetail[]> {
  const actorId = gate(actor, "pack.submit");
  const rows = await db
    .select()
    .from(s.packs)
    .where(and(eq(s.packs.creatorId, actorId), eq(s.packs.isDemo, false)))
    .orderBy(desc(s.packs.updatedAt), desc(s.packs.id));
  const tagRows = rows.length > 0
    ? await db
        .select({ packId: s.packTags.packId, tagId: s.packTags.tagId })
        .from(s.packTags)
        .where(inArray(s.packTags.packId, rows.map((row) => row.id)))
    : [];
  return rows.map((row) => ({
    ...toSummary(row),
    ...detailFields(row),
    tagIds: tagRows.filter((tag) => tag.packId === row.id).map((tag) => tag.tagId),
  }));
}

async function loadOwn(db: Database, actorId: string, id: string) {
  const [row] = await db
    .select()
    .from(s.packs)
    .where(and(eq(s.packs.id, id), eq(s.packs.creatorId, actorId), eq(s.packs.isDemo, false)))
    .limit(1);
  if (!row) throw new SubmissionError("not_found", "Gönderi bulunamadı.", 404);
  return row;
}

export async function getOwnSubmission(db: Database, actor: Actor, id: string): Promise<SubmissionDetail> {
  const actorId = gate(actor, "pack.edit_own");
  const row = await loadOwn(db, actorId, id);
  const tagRows = await db.select({ tagId: s.packTags.tagId }).from(s.packTags).where(eq(s.packTags.packId, row.id));
  return {
    ...toSummary(row),
    excerpt: row.excerpt,
    description: row.description,
    categoryId: row.categoryId,
    sourceUrl: row.sourceUrl,
    license: row.license,
    tagIds: tagRows.map((tag) => tag.tagId),
  };
}

export async function updateSubmission(db: Database, actor: Actor, id: string, input: SubmissionInput) {
  const actorId = gate(actor, "pack.edit_own");
  const before = await loadOwn(db, actorId, id);
  if (!canEditSubmission(before.status)) {
    throw new SubmissionError("conflict", "İncelemedeki veya yayındaki gönderi düzenlenemez.", 409);
  }
  const patch = parseFields(input);
  const categoryId = await ensureCategory(db, input.categoryId !== undefined ? input.categoryId : before.categoryId);
  patch.categoryId = categoryId;
  const replaceTags = input.tagIds !== undefined;
  const tagIds = replaceTags ? await ensureTags(db, normalizeTagIds(input.tagIds)) : [];
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(s.packs).set(patch).where(eq(s.packs.id, before.id)).returning();
      if (!updated) throw new SubmissionError("not_found", "Gönderi bulunamadı.", 404);
      if (replaceTags) {
        await tx.delete(s.packTags).where(eq(s.packTags.packId, before.id));
        if (tagIds.length > 0) {
          await tx.insert(s.packTags).values(tagIds.map((tagId) => ({ packId: before.id, tagId })));
        }
      }
      await tx.insert(s.auditLogs).values({
        actorId,
        action: "submission.update",
        targetType: "pack",
        targetId: before.id,
        before: { status: before.status },
        after: { status: updated.status, fields: Object.keys(patch) },
      });
      const finalTags = replaceTags
        ? tagIds
        : (await tx.select({ tagId: s.packTags.tagId }).from(s.packTags).where(eq(s.packTags.packId, before.id))).map((tag) => tag.tagId);
      return { ...toSummary(updated), ...detailFields(updated), tagIds: finalTags };
    });
  } catch (error) {
    return mapConstraint(error);
  }
}

export async function transitionSubmission(
  db: Database,
  actor: Actor,
  id: string,
  action: "submit" | "withdraw",
) {
  const actorId = gate(actor, "pack.submit");
  const before = await loadOwn(db, actorId, id);
  if (action === "submit") {
    if (!canSubmitForReview(before.status)) {
      throw new SubmissionError("conflict", "Bu gönderi zaten incelemede veya yayında.", 409);
    }
    try {
      return await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(s.packs)
          .set({ status: "pending", reviewNote: null })
          .where(eq(s.packs.id, before.id))
          .returning();
        if (!updated) throw new SubmissionError("not_found", "Gönderi bulunamadı.", 404);
        await tx.insert(s.auditLogs).values({
          actorId,
          action: "submission.submit",
          targetType: "pack",
          targetId: before.id,
          before: { status: before.status },
          after: { status: "pending" },
        });
        return toSummary(updated);
      });
    } catch (error) {
      return mapConstraint(error);
    }
  }
  if (action === "withdraw") {
    if (!canWithdrawSubmission(before.status)) {
      throw new SubmissionError("conflict", "Yalnızca incelemedeki gönderi geri çekilebilir.", 409);
    }
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(s.packs)
        .set({ status: "draft" })
        .where(eq(s.packs.id, before.id))
        .returning();
      if (!updated) throw new SubmissionError("not_found", "Gönderi bulunamadı.", 404);
      await tx.insert(s.auditLogs).values({
        actorId,
        action: "submission.withdraw",
        targetType: "pack",
        targetId: before.id,
        before: { status: "pending" },
        after: { status: "draft" },
      });
      return toSummary(updated);
    });
  }
  throw new SubmissionError("validation", "Geçersiz durum geçişi.", 400);
}

export async function reviewSubmission(
  db: Database,
  actor: Actor,
  id: string,
  decision: unknown,
  reviewNote: unknown,
) {
  const actorId = gate(actor, "submission.review");
  if (!isSubmissionDecision(decision)) {
    throw new SubmissionError("validation", "Geçersiz inceleme kararı.", 400);
  }
  const note = validateReviewNote(decision, reviewNote);
  const [before] = await db
    .select()
    .from(s.packs)
    .where(and(eq(s.packs.id, id), eq(s.packs.isDemo, false)))
    .limit(1);
  if (!before) throw new SubmissionError("not_found", "Gönderi bulunamadı.", 404);
  if (!canReviewSubmission(before.status)) {
    throw new SubmissionError("conflict", "Yalnızca incelemedeki gönderiler değerlendirilebilir.", 409);
  }
  if (before.creatorId === actorId) {
    throw new SubmissionError("conflict", "Kendi gönderinizi inceleyemezsiniz.", 409);
  }
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(s.packs)
        .set({
          status: decision,
          reviewNote: note,
          ...(decision === "approved" ? { publishedAt: before.publishedAt ?? new Date() } : {}),
        })
        .where(and(eq(s.packs.id, before.id), eq(s.packs.status, "pending")))
        .returning();
      if (!updated) throw new SubmissionError("conflict", "Gönderi bu sırada incelendi.", 409);
      await tx.insert(s.auditLogs).values({
        actorId,
        action: "submission.review",
        targetType: "pack",
        targetId: before.id,
        before: { status: before.status },
        after: { status: decision, reviewNote: note },
      });
      return toSummary(updated);
    });
  } catch (error) {
    return mapConstraint(error);
  }
}

/**
 * Adds a new version to the actor's own approved pack.
 * The new row becomes the single `isLatest` entry; downloads resolve through it.
 */
export async function createPackVersion(db: Database, actor: Actor, packId: string, input: PackVersionInput): Promise<PackVersionSummary> {
  const actorId = gate(actor, "pack.edit_own");
  const [pack] = await db
    .select({ id: s.packs.id, slug: s.packs.slug, status: s.packs.status })
    .from(s.packs)
    .where(and(eq(s.packs.id, packId), eq(s.packs.creatorId, actorId), eq(s.packs.isDemo, false)))
    .limit(1);
  if (!pack) throw new SubmissionError("not_found", "Gönderi bulunamadı.", 404);
  if (pack.status !== "approved") {
    throw new SubmissionError("conflict", "Yeni sürüm yalnızca yayındaki paketlere eklenebilir.", 409);
  }
  const values = validatePackVersion(input);
  try {
    return await db.transaction(async (tx) => {
      await tx.update(s.packVersions).set({ isLatest: false }).where(eq(s.packVersions.packId, pack.id));
      const [created] = await tx.insert(s.packVersions).values({
        packId: pack.id,
        version: values.version,
        downloadUrl: values.downloadUrl,
        fileSizeBytes: values.fileSizeBytes,
        checksumSha256: values.checksumSha256,
        changelog: values.changelog,
        isLatest: true,
      }).returning();
      if (!created) throw new Error("Version insert returned no row.");
      await tx.insert(s.auditLogs).values({
        actorId,
        action: "pack.version_add",
        targetType: "pack",
        targetId: pack.id,
        after: { versionId: created.id, version: created.version },
      });
      return {
        id: created.id,
        packId: pack.id,
        packSlug: pack.slug,
        version: created.version,
        isLatest: created.isLatest,
        createdAt: created.createdAt,
      };
    });
  } catch (error) {
    if (error instanceof SubmissionError) throw error;
    if (hasPgCode(error, "23505")) {
      throw new SubmissionError("conflict", "Bu sürüm numarası pakette zaten kayıtlı.", 409);
    }
    throw error;
  }
}

export async function listSubmissionQueue(db: Database, actor: Actor): Promise<SubmissionQueueItem[]> {
  gate(actor, "submission.review");
  const rows = await db
    .select({
      id: s.packs.id,
      slug: s.packs.slug,
      title: s.packs.title,
      excerpt: s.packs.excerpt,
      status: s.packs.status,
      updatedAt: s.packs.updatedAt,
      authorName: s.users.displayName,
      authorUsername: s.users.username,
    })
    .from(s.packs)
    .innerJoin(s.users, eq(s.users.id, s.packs.creatorId))
    .where(and(eq(s.packs.status, "pending"), eq(s.packs.isDemo, false)))
    .orderBy(asc(s.packs.updatedAt), asc(s.packs.id))
    .limit(100);
  return rows;
}

/** Reference lists the submission forms offer (no admin-managed fields). */
export async function listSubmissionOptions(db: Database) {
  const [categories, tags] = await Promise.all([
    db.select({ id: s.packCategories.id, name: s.packCategories.name })
      .from(s.packCategories)
      .where(and(eq(s.packCategories.enabled, true), eq(s.packCategories.isDemo, false)))
      .orderBy(asc(s.packCategories.name)),
    db.select({ id: s.tags.id, name: s.tags.name })
      .from(s.tags)
      .where(eq(s.tags.isDemo, false))
      .orderBy(asc(s.tags.name)),
  ]);
  return { categories, tags };
}

function detailFields(row: typeof s.packs.$inferSelect) {
  return {
    excerpt: row.excerpt,
    description: row.description,
    categoryId: row.categoryId,
    sourceUrl: row.sourceUrl,
    license: row.license,
  };
}

function toSummary(row: {
  id: string;
  slug: string;
  title: string;
  status: (typeof s.packStatus.enumValues)[number];
  reviewNote: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
}): SubmissionSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    reviewNote: row.reviewNote,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  };
}
