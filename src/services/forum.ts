import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug, slugify } from "@/lib/utils";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

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
  const [topic] = await db.select({ ...topicListSelection, body: s.forumTopics.body }).from(s.forumTopics)
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
