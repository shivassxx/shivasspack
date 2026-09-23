import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug, slugify } from "@/lib/utils";
import { assertActive, AuthorizationError, requirePermission, type Actor } from "@/services/rbac";

export class NewsError extends Error {
  constructor(readonly code: "validation" | "not_found" | "conflict", message: string, readonly status: number) {
    super(message);
    this.name = "NewsError";
  }
}

export function newsPage(value: unknown) {
  const page = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : 1;
  return Math.max(1, Math.min(1000, page));
}

export async function listNewsCategories(db: Database) {
  return db.select({ id: s.newsCategories.id, slug: s.newsCategories.slug,
    name: s.newsCategories.name }).from(s.newsCategories)
    .where(eq(s.newsCategories.isDemo, false))
    .orderBy(asc(s.newsCategories.sortOrder), asc(s.newsCategories.name));
}

const newsListFields = {
  id: s.newsArticles.id, slug: s.newsArticles.slug, title: s.newsArticles.title,
  excerpt: s.newsArticles.excerpt, publishedAt: s.newsArticles.publishedAt,
  categorySlug: s.newsCategories.slug, categoryName: s.newsCategories.name,
  authorName: s.users.displayName,
} as const;

export async function listPublishedNews(db: Database, page = 1) {
  const safePage = Math.max(1, Math.min(1000, Number.isInteger(page) ? page : 1));
  const where = and(eq(s.newsArticles.status, "published"), eq(s.newsArticles.isDemo, false),
    eq(s.newsCategories.isDemo, false), sql`${s.newsArticles.publishedAt} <= clock_timestamp()`);
  const [items, totals] = await Promise.all([
    db.select(newsListFields).from(s.newsArticles)
      .innerJoin(s.newsCategories, eq(s.newsCategories.id, s.newsArticles.categoryId))
      .leftJoin(s.users, eq(s.users.id, s.newsArticles.authorId))
      .where(where).orderBy(desc(s.newsArticles.publishedAt), desc(s.newsArticles.id))
      .limit(12).offset((safePage - 1) * 12),
    db.select({ value: count() }).from(s.newsArticles)
      .innerJoin(s.newsCategories, eq(s.newsCategories.id, s.newsArticles.categoryId)).where(where),
  ]);
  const total = Number(totals[0]?.value ?? 0);
  return { items, total, page: safePage, pageCount: Math.max(1, Math.ceil(total / 12)) };
}

export async function getPublishedArticle(db: Database, slug: string) {
  if (!isSafeSlug(slug)) return null;
  const [article] = await db.select({ ...newsListFields, content: s.newsArticles.content,
    sourceUrl: s.newsArticles.sourceUrl, seoTitle: s.newsArticles.seoTitle,
    seoDescription: s.newsArticles.seoDescription })
    .from(s.newsArticles).innerJoin(s.newsCategories, eq(s.newsCategories.id, s.newsArticles.categoryId))
    .leftJoin(s.users, eq(s.users.id, s.newsArticles.authorId))
    .where(and(eq(s.newsArticles.slug, slug), eq(s.newsArticles.status, "published"),
      eq(s.newsArticles.isDemo, false), eq(s.newsCategories.isDemo, false),
      sql`${s.newsArticles.publishedAt} <= clock_timestamp()`)).limit(1);
  return article ?? null;
}

export type NewsInput = { title?: unknown; excerpt?: unknown; content?: unknown;
  categoryId?: unknown; sourceUrl?: unknown; seoTitle?: unknown; seoDescription?: unknown };

function optionalText(value: unknown, max: number, label: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new NewsError("validation", `${label} en fazla ${max} karakter olmalı.`, 400);
  }
  return value.trim() || null;
}

function parseNews(input: NewsInput) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const excerpt = typeof input.excerpt === "string" ? input.excerpt.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim().replace(/\r\n/g, "\n") : "";
  if (title.length < 8 || title.length > 160) throw new NewsError("validation", "Başlık 8-160 karakter olmalı.", 400);
  if (excerpt.length < 20 || excerpt.length > 500) throw new NewsError("validation", "Özet 20-500 karakter olmalı.", 400);
  if (content.length < 50 || content.length > 50_000) throw new NewsError("validation", "Haber içeriği 50-50000 karakter olmalı.", 400);
  if (typeof input.categoryId !== "string" || !/^ncat_[a-z0-9_-]{1,96}$/.test(input.categoryId)) {
    throw new NewsError("validation", "Geçerli kategori seçmelisin.", 400);
  }
  const sourceUrl = optionalText(input.sourceUrl, 2048, "Kaynak URL");
  if (sourceUrl) {
    try { const u = new URL(sourceUrl); if (!(["http:", "https:"].includes(u.protocol))) throw new Error("protocol"); }
    catch { throw new NewsError("validation", "Kaynak HTTP(S) bağlantısı olmalı.", 400); }
  }
  return { title, excerpt, content, categoryId: input.categoryId, sourceUrl,
    seoTitle: optionalText(input.seoTitle, 160, "SEO başlığı"),
    seoDescription: optionalText(input.seoDescription, 300, "SEO açıklaması") };
}

async function ensureNewsCategory(db: Database, id: string) {
  const [category] = await db.select({ id: s.newsCategories.id }).from(s.newsCategories)
    .where(and(eq(s.newsCategories.id, id), eq(s.newsCategories.isDemo, false))).limit(1);
  if (!category) throw new NewsError("validation", "Kategori bulunamadı.", 400);
}

export async function listAdminNews(db: Database, actor: Actor) {
  assertActive(actor);
  if (!actor.permissions.has("news.write") && !actor.permissions.has("news.manage")) {
    throw new AuthorizationError("Haber yönetimi iznin yok.");
  }
  return db.select({ id: s.newsArticles.id, slug: s.newsArticles.slug, title: s.newsArticles.title,
    excerpt: s.newsArticles.excerpt, content: s.newsArticles.content,
    categoryId: s.newsArticles.categoryId, status: s.newsArticles.status,
    sourceUrl: s.newsArticles.sourceUrl, seoTitle: s.newsArticles.seoTitle,
    seoDescription: s.newsArticles.seoDescription, authorId: s.newsArticles.authorId,
    publishedAt: s.newsArticles.publishedAt, updatedAt: s.newsArticles.updatedAt })
    .from(s.newsArticles).where(and(eq(s.newsArticles.isDemo, false),
      actor.permissions.has("news.manage") ? undefined : eq(s.newsArticles.authorId, actor.id!)))
    .orderBy(desc(s.newsArticles.updatedAt), desc(s.newsArticles.id)).limit(100);
}

export async function getAdminNewsArticle(db: Database, actor: Actor, id: string) {
  assertActive(actor);
  if (!actor.permissions.has("news.write") && !actor.permissions.has("news.manage")) {
    throw new AuthorizationError("Haber yönetimi iznin yok.");
  }
  const [article] = await db.select().from(s.newsArticles)
    .where(and(eq(s.newsArticles.id, id), eq(s.newsArticles.isDemo, false),
      actor.permissions.has("news.manage") ? undefined : eq(s.newsArticles.authorId, actor.id!))).limit(1);
  return article ?? null;
}

export async function createNews(db: Database, actor: Actor, input: NewsInput) {
  assertActive(actor);
  requirePermission(actor, "news.write");
  const fields = parseNews(input);
  const base = slugify(fields.title).slice(0, 88);
  if (!base) throw new NewsError("validation", "Başlıktan adres oluşturulamadı.", 400);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`news:${base}`}, 0))`);
    await ensureNewsCategory(tx as unknown as Database, fields.categoryId);
    for (let n = 1; n <= 30; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const [existing] = await tx.select({ id: s.newsArticles.id }).from(s.newsArticles)
        .where(eq(s.newsArticles.slug, slug)).limit(1);
      if (existing) continue;
      const [created] = await tx.insert(s.newsArticles).values({ ...fields, slug,
        authorId: actor.id }).returning({ id: s.newsArticles.id, slug: s.newsArticles.slug,
        status: s.newsArticles.status });
      if (!created) throw new Error("News insert returned no row.");
      await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "news.create",
        targetType: "news", targetId: created.id, after: { slug, status: "draft" } });
      return created;
    }
    throw new NewsError("conflict", "Benzersiz haber adresi oluşturulamadı.", 409);
  });
}

export async function updateNews(db: Database, actor: Actor, id: string, input: NewsInput) {
  assertActive(actor);
  const fields = parseNews(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.newsArticles)
      .where(and(eq(s.newsArticles.id, id), eq(s.newsArticles.isDemo, false))).for("update");
    if (!before) throw new NewsError("not_found", "Haber bulunamadı.", 404);
    const manager = actor.permissions.has("news.manage");
    if (!manager && (!actor.permissions.has("news.write") || before.authorId !== actor.id)) {
      throw new AuthorizationError("Bu haberi düzenleme iznin yok.");
    }
    if (before.status !== "draft" && before.status !== "review") {
      throw new NewsError("conflict", "Yayınlanmış veya arşivlenmiş haber düzenlenemez.", 409);
    }
    await ensureNewsCategory(tx as unknown as Database, fields.categoryId);
    const [updated] = await tx.update(s.newsArticles).set(fields).where(eq(s.newsArticles.id, before.id))
      .returning({ id: s.newsArticles.id, slug: s.newsArticles.slug, status: s.newsArticles.status });
    if (!updated) throw new Error("News update returned no row.");
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "news.update",
      targetType: "news", targetId: id, after: { fields: Object.keys(fields) } });
    return updated;
  });
}

export type NewsAction = "review" | "publish" | "archive";
export function isNewsAction(value: unknown): value is NewsAction {
  return value === "review" || value === "publish" || value === "archive";
}

export async function transitionNews(db: Database, actor: Actor, id: string, action: NewsAction) {
  assertActive(actor);
  if (!isNewsAction(action)) throw new NewsError("validation", "Geçersiz haber işlemi.", 400);
  if (action === "review") requirePermission(actor, "news.write");
  else requirePermission(actor, "news.manage");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.newsArticles)
      .where(and(eq(s.newsArticles.id, id), eq(s.newsArticles.isDemo, false))).for("update");
    if (!before) throw new NewsError("not_found", "Haber bulunamadı.", 404);
    if (action === "review" && before.authorId !== actor.id && !actor.permissions.has("news.manage")) {
      throw new AuthorizationError("Başkasının haberini incelemeye gönderemezsin.");
    }
    const allowed = action === "review" ? before.status === "draft" : action === "publish"
      ? before.status === "review" : before.status === "published";
    if (!allowed) throw new NewsError("conflict", "Geçersiz haber durumu geçişi.", 409);
    const status = action === "review" ? "review" : action === "publish" ? "published" : "archived";
    const [updated] = await tx.update(s.newsArticles).set({ status,
      publishedAt: action === "publish" ? new Date() : before.publishedAt })
      .where(eq(s.newsArticles.id, id)).returning({ id: s.newsArticles.id, slug: s.newsArticles.slug,
        status: s.newsArticles.status });
    if (!updated) throw new Error("News transition returned no row.");
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: `news.${action}`,
      targetType: "news", targetId: id, before: { status: before.status }, after: { status } });
    return updated;
  });
}
