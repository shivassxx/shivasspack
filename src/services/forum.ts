import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug, slugify } from "@/lib/utils";
import { assertActive, AuthorizationError, requirePermission, type Actor } from "@/services/rbac";

const PAGE_SIZE = 20;

export class ForumError extends Error {
  readonly code: "validation" | "not_found" | "conflict";
  readonly status: number;
  constructor(code: ForumError["code"], message: string, status: number) {
    super(message);
    this.name = "ForumError";
    this.code = code;
    this.status = status;
  }
}

function visibleCategory() {
  return and(eq(s.forumCategories.enabled, true), eq(s.forumCategories.isDemo, false));
}

export async function listForumCategories(db: Database) {
  return db.select({
    id: s.forumCategories.id, slug: s.forumCategories.slug, name: s.forumCategories.name,
    description: s.forumCategories.description, topicCount: s.forumCategories.topicCount,
    postCount: s.forumCategories.postCount,
  }).from(s.forumCategories).where(visibleCategory())
    .orderBy(asc(s.forumCategories.sortOrder), asc(s.forumCategories.name));
}

export async function getForumCategory(db: Database, slug: string) {
  if (!isSafeSlug(slug)) return null;
  const [category] = await db.select({
    id: s.forumCategories.id, slug: s.forumCategories.slug, name: s.forumCategories.name,
    description: s.forumCategories.description, topicCount: s.forumCategories.topicCount,
    postCount: s.forumCategories.postCount,
  }).from(s.forumCategories).where(and(eq(s.forumCategories.slug, slug), visibleCategory())).limit(1);
  return category ?? null;
}

export function forumPage(value: unknown): number {
  const page = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : 1;
  return Math.min(1000, Math.max(1, page));
}

const topicListSelection = {
  id: s.forumTopics.id, slug: s.forumTopics.slug, title: s.forumTopics.title,
  isPinned: s.forumTopics.isPinned, isLocked: s.forumTopics.isLocked,
  replyCount: s.forumTopics.replyCount, viewCount: s.forumTopics.viewCount,
  createdAt: s.forumTopics.createdAt, lastReplyAt: s.forumTopics.lastReplyAt,
  categorySlug: s.forumCategories.slug, categoryName: s.forumCategories.name,
  authorName: s.users.displayName, authorUsername: s.users.username,
} as const;

export async function listForumTopics(db: Database, input: { categorySlug?: string; page?: number } = {}) {
  const page = Math.min(1000, Math.max(1, Number.isInteger(input.page) ? input.page! : 1));
  if (input.categorySlug !== undefined && !isSafeSlug(input.categorySlug)) {
    return { items: [], total: 0, page, pageCount: 1 };
  }
  const where = and(
    eq(s.forumTopics.status, "visible"), eq(s.forumTopics.isDemo, false), visibleCategory(),
    input.categorySlug ? eq(s.forumCategories.slug, input.categorySlug) : undefined,
  );
  const [items, totals] = await Promise.all([
    db.select(topicListSelection).from(s.forumTopics)
      .innerJoin(s.forumCategories, eq(s.forumCategories.id, s.forumTopics.categoryId))
      .innerJoin(s.users, eq(s.users.id, s.forumTopics.authorId))
      .where(where)
      .orderBy(desc(s.forumTopics.isPinned), desc(sql`coalesce(${s.forumTopics.lastReplyAt}, ${s.forumTopics.createdAt})`), desc(s.forumTopics.id))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(s.forumTopics)
      .innerJoin(s.forumCategories, eq(s.forumCategories.id, s.forumTopics.categoryId)).where(where),
  ]);
  const total = Number(totals[0]?.value ?? 0);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getForumTopic(db: Database, slug: string) {
  if (!isSafeSlug(slug)) return null;
  const [topic] = await db.select({ ...topicListSelection, body: s.forumTopics.body,
    authorId: s.forumTopics.authorId }).from(s.forumTopics)
    .innerJoin(s.forumCategories, eq(s.forumCategories.id, s.forumTopics.categoryId))
    .innerJoin(s.users, eq(s.users.id, s.forumTopics.authorId))
    .where(and(eq(s.forumTopics.slug, slug), eq(s.forumTopics.status, "visible"),
      eq(s.forumTopics.isDemo, false), visibleCategory())).limit(1);
  return topic ?? null;
}

export type NewForumTopic = { categoryId?: unknown; title?: unknown; body?: unknown };

export async function createForumTopic(db: Database, actor: Actor, input: NewForumTopic) {
  assertActive(actor);
  requirePermission(actor, "forum.topic.create");
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim().replace(/\r\n/g, "\n") : "";
  const categoryId = typeof input.categoryId === "string" ? input.categoryId : "";
  if (title.length < 8 || title.length > 160) throw new ForumError("validation", "Konu başlığı 8-160 karakter olmalı.", 400);
  if (body.length < 20 || body.length > 10_000) throw new ForumError("validation", "Konu metni 20-10000 karakter olmalı.", 400);
  if (!categoryId) throw new ForumError("validation", "Kategori zorunlu.", 400);
  const base = slugify(title).slice(0, 88);
  if (!base) throw new ForumError("validation", "Başlıktan adres oluşturulamadı.", 400);

  return db.transaction(async (tx) => {
    // Slugs are global; this lock serializes the choice even across categories.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`forum-topic:${base}`}, 0))`);
    const [category] = await tx.select({ id: s.forumCategories.id }).from(s.forumCategories)
      .where(and(eq(s.forumCategories.id, categoryId), visibleCategory())).for("update");
    if (!category) throw new ForumError("validation", "Geçersiz veya kapalı kategori.", 400);
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const slug = attempt === 1 ? base : `${base}-${attempt}`;
      const [existing] = await tx.select({ id: s.forumTopics.id }).from(s.forumTopics)
        .where(eq(s.forumTopics.slug, slug)).limit(1);
      if (existing) continue;
      const [created] = await tx.insert(s.forumTopics).values({
        slug, title, body, categoryId: category.id, authorId: actor.id!,
      }).returning({ id: s.forumTopics.id, slug: s.forumTopics.slug });
      if (!created) throw new Error("Forum topic insert returned no row.");
      await tx.update(s.forumCategories).set({
        topicCount: sql`${s.forumCategories.topicCount} + 1`,
        postCount: sql`${s.forumCategories.postCount} + 1`,
      }).where(eq(s.forumCategories.id, category.id));
      await tx.update(s.users).set({ postCount: sql`${s.users.postCount} + 1` })
        .where(eq(s.users.id, actor.id!));
      await tx.insert(s.auditLogs).values({
        actorId: actor.id, action: "forum.topic.create", targetType: "forum_topic",
        targetId: created.id, after: { slug: created.slug, categoryId: category.id },
      });
      return created;
    }
    throw new ForumError("conflict", "Benzersiz konu adresi oluşturulamadı, başlığı değiştirin.", 409);
  });
}

export async function listForumReplies(db: Database, topicId: string, inputPage = 1) {
  const page = Math.min(1000, Math.max(1, Number.isInteger(inputPage) ? inputPage : 1));
  const [topic] = await db.select({ id: s.forumTopics.id }).from(s.forumTopics)
    .innerJoin(s.forumCategories, eq(s.forumCategories.id, s.forumTopics.categoryId))
    .where(and(eq(s.forumTopics.id, topicId), eq(s.forumTopics.status, "visible"),
      eq(s.forumTopics.isDemo, false), visibleCategory())).limit(1);
  if (!topic) throw new ForumError("not_found", "Konu bulunamadı.", 404);
  const visible = and(eq(s.forumReplies.topicId, topic.id), eq(s.forumReplies.status, "visible"), eq(s.forumReplies.isDemo, false));
  const [items, totals] = await Promise.all([
    db.select({
      id: s.forumReplies.id, body: s.forumReplies.body, createdAt: s.forumReplies.createdAt,
      authorName: s.users.displayName, authorUsername: s.users.username,
    }).from(s.forumReplies).innerJoin(s.users, eq(s.users.id, s.forumReplies.authorId))
      .where(visible).orderBy(desc(s.forumReplies.createdAt), desc(s.forumReplies.id))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(s.forumReplies).where(visible),
  ]);
  const total = Number(totals[0]?.value ?? 0);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function createForumReply(db: Database, actor: Actor, input: { topicId?: unknown; body?: unknown }) {
  assertActive(actor);
  requirePermission(actor, "forum.reply.create");
  const topicId = typeof input.topicId === "string" ? input.topicId : "";
  const body = typeof input.body === "string" ? input.body.trim().replace(/\r\n/g, "\n") : "";
  if (body.length < 3 || body.length > 5000) throw new ForumError("validation", "Yanıt 3-5000 karakter olmalı.", 400);
  if (!topicId) throw new ForumError("validation", "Konu zorunlu.", 400);
  return db.transaction(async (tx) => {
    const [topic] = await tx.select({ id: s.forumTopics.id, categoryId: s.forumTopics.categoryId,
      isLocked: s.forumTopics.isLocked }).from(s.forumTopics)
      .where(and(eq(s.forumTopics.id, topicId), eq(s.forumTopics.status, "visible"), eq(s.forumTopics.isDemo, false)))
      .for("update");
    if (!topic) throw new ForumError("not_found", "Konu bulunamadı.", 404);
    const [category] = await tx.select({ id: s.forumCategories.id }).from(s.forumCategories)
      .where(and(eq(s.forumCategories.id, topic.categoryId), visibleCategory())).for("update");
    if (!category) throw new ForumError("not_found", "Konu bulunamadı.", 404);
    if (topic.isLocked) throw new ForumError("conflict", "Bu konu kilitli; yeni yanıt eklenemez.", 409);
    const [created] = await tx.insert(s.forumReplies).values({
      topicId: topic.id, authorId: actor.id!, body,
    }).returning({ id: s.forumReplies.id, body: s.forumReplies.body, createdAt: s.forumReplies.createdAt });
    if (!created) throw new Error("Forum reply insert returned no row.");
    await tx.update(s.forumTopics).set({ replyCount: sql`${s.forumTopics.replyCount} + 1`, lastReplyAt: created.createdAt })
      .where(eq(s.forumTopics.id, topic.id));
    await tx.update(s.forumCategories).set({ postCount: sql`${s.forumCategories.postCount} + 1` })
      .where(eq(s.forumCategories.id, category.id));
    await tx.update(s.users).set({ postCount: sql`${s.users.postCount} + 1` })
      .where(eq(s.users.id, actor.id!));
    await tx.insert(s.auditLogs).values({
      actorId: actor.id, action: "forum.reply.create", targetType: "forum_reply",
      targetId: created.id, after: { topicId: topic.id },
    });
    return created;
  });
}

export async function updateForumTopic(db: Database, actor: Actor, id: string,
  input: { title?: unknown; body?: unknown }) {
  assertActive(actor);
  const patch: { title?: string; body?: string } = {};
  if (input.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length < 8 || title.length > 160) throw new ForumError("validation", "Konu başlığı 8-160 karakter olmalı.", 400);
    patch.title = title;
  }
  if (input.body !== undefined) {
    const body = typeof input.body === "string" ? input.body.trim().replace(/\r\n/g, "\n") : "";
    if (body.length < 20 || body.length > 10_000) throw new ForumError("validation", "Konu metni 20-10000 karakter olmalı.", 400);
    patch.body = body;
  }
  if (!Object.keys(patch).length) throw new ForumError("validation", "Düzenlenecek alan yok.", 400);
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ id: s.forumTopics.id, slug: s.forumTopics.slug,
      categoryId: s.forumTopics.categoryId, authorId: s.forumTopics.authorId,
      status: s.forumTopics.status, isLocked: s.forumTopics.isLocked })
      .from(s.forumTopics).where(and(eq(s.forumTopics.id, id), eq(s.forumTopics.isDemo, false))).for("update");
    if (!before) throw new ForumError("not_found", "Konu bulunamadı.", 404);
    const moderator = actor.permissions.has("forum.moderate");
    if (!moderator && (actor.id !== before.authorId || !actor.permissions.has("forum.edit_own"))) {
      throw new AuthorizationError("Bu konuyu düzenleme iznin yok.");
    }
    if (before.status !== "visible" || (before.isLocked && !moderator)) {
      throw new ForumError("conflict", "Kilitli veya gizli konu düzenlenemez.", 409);
    }
    const [category] = await tx.select({ id: s.forumCategories.id }).from(s.forumCategories)
      .where(and(eq(s.forumCategories.id, before.categoryId), visibleCategory())).limit(1);
    if (!category) throw new ForumError("not_found", "Konu bulunamadı.", 404);
    const [updated] = await tx.update(s.forumTopics).set(patch).where(eq(s.forumTopics.id, before.id))
      .returning({ slug: s.forumTopics.slug, title: s.forumTopics.title, body: s.forumTopics.body });
    if (!updated) throw new Error("Forum topic update returned no row.");
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "forum.topic.update",
      targetType: "forum_topic", targetId: before.id, after: { fields: Object.keys(patch) } });
    return updated;
  });
}

export type ForumModerationAction = "lock" | "unlock" | "pin" | "unpin" | "hide" | "show";
export function isForumModerationAction(value: unknown): value is ForumModerationAction {
  return value === "lock" || value === "unlock" || value === "pin" || value === "unpin" ||
    value === "hide" || value === "show";
}

export async function listForumModeration(db: Database, actor: Actor) {
  assertActive(actor);
  requirePermission(actor, "forum.moderate");
  return db.select({ id: s.forumTopics.id, slug: s.forumTopics.slug, title: s.forumTopics.title,
    status: s.forumTopics.status, isLocked: s.forumTopics.isLocked, isPinned: s.forumTopics.isPinned,
    categoryName: s.forumCategories.name, authorName: s.users.displayName,
    updatedAt: s.forumTopics.updatedAt,
  }).from(s.forumTopics).innerJoin(s.forumCategories, eq(s.forumCategories.id, s.forumTopics.categoryId))
    .innerJoin(s.users, eq(s.users.id, s.forumTopics.authorId))
    .where(and(eq(s.forumTopics.isDemo, false), eq(s.forumCategories.isDemo, false),
      sql`${s.forumTopics.status} in ('visible', 'hidden')`))
    .orderBy(desc(s.forumTopics.updatedAt), desc(s.forumTopics.id)).limit(100);
}

export async function moderateForumTopic(db: Database, actor: Actor, id: string, action: ForumModerationAction) {
  assertActive(actor);
  requirePermission(actor, "forum.moderate");
  if (!isForumModerationAction(action)) throw new ForumError("validation", "Geçersiz işlem.", 400);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.forumTopics)
      .where(and(eq(s.forumTopics.id, id), eq(s.forumTopics.isDemo, false))).for("update");
    if (!before || before.status === "deleted") throw new ForumError("not_found", "Konu bulunamadı.", 404);
    const next = {
      isLocked: action === "lock" ? true : action === "unlock" ? false : before.isLocked,
      isPinned: action === "pin" ? true : action === "unpin" ? false : before.isPinned,
      status: action === "hide" ? "hidden" as const : action === "show" ? "visible" as const : before.status,
    };
    if (next.status === before.status && next.isLocked === before.isLocked && next.isPinned === before.isPinned) {
      return { ...next, id: before.id, slug: before.slug };
    }
    if (next.status !== before.status) {
      const [category] = await tx.select({ id: s.forumCategories.id }).from(s.forumCategories)
        .where(eq(s.forumCategories.id, before.categoryId)).for("update");
      if (!category) throw new ForumError("not_found", "Kategori bulunamadı.", 404);
      const [replies] = await tx.select({ value: count() }).from(s.forumReplies)
        .where(and(eq(s.forumReplies.topicId, before.id), eq(s.forumReplies.isDemo, false)));
      const delta = next.status === "visible" ? 1 : -1;
      const posts = 1 + Number(replies?.value ?? 0);
      await tx.update(s.forumCategories).set({
        topicCount: sql`${s.forumCategories.topicCount} + ${delta}`,
        postCount: sql`${s.forumCategories.postCount} + ${delta * posts}`,
      }).where(eq(s.forumCategories.id, category.id));
    }
    const [updated] = await tx.update(s.forumTopics).set(next).where(eq(s.forumTopics.id, before.id))
      .returning({ id: s.forumTopics.id, slug: s.forumTopics.slug, status: s.forumTopics.status,
        isLocked: s.forumTopics.isLocked, isPinned: s.forumTopics.isPinned });
    if (!updated) throw new Error("Forum moderation update returned no row.");
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: `forum.topic.${action}`,
      targetType: "forum_topic", targetId: before.id,
      before: { status: before.status, isLocked: before.isLocked, isPinned: before.isPinned },
      after: { status: updated.status, isLocked: updated.isLocked, isPinned: updated.isPinned } });
    return updated;
  });
}
