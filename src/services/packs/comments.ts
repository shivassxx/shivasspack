import { and, count, desc, eq, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug } from "@/lib/utils";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

export class PackCommentError extends Error {
  readonly status: number;
  readonly code: "validation" | "not_found";
  constructor(code: "validation" | "not_found", message: string) {
    super(message);
    this.name = "PackCommentError";
    this.code = code;
    this.status = code === "validation" ? 400 : 404;
  }
}

export function validateCommentBody(value: unknown): string {
  const body = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
  if (body.length < 3 || body.length > 2000 || /[\p{Cf}\u0000-\u0008\u000b-\u001f\u007f]/u.test(body)) {
    throw new PackCommentError("validation", "Yorum 3-2000 görünür karakter olmalı.");
  }
  return body;
}

function publicPackConditions(slug: string) {
  return and(eq(s.packs.slug, slug), eq(s.packs.status, "approved"), eq(s.packs.isDemo, false),
    eq(s.packCategories.enabled, true), lte(s.packs.publishedAt, new Date()));
}

export async function listPackComments(db: Database, slug: string, inputPage = 1) {
  if (!isSafeSlug(slug)) throw new PackCommentError("not_found", "Paket bulunamadı.");
  const page = Number.isInteger(inputPage) ? Math.max(1, Math.min(1000, inputPage)) : 1;
  const [pack] = await db.select({ id: s.packs.id }).from(s.packs)
    .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
    .where(publicPackConditions(slug));
  if (!pack) throw new PackCommentError("not_found", "Paket bulunamadı.");
  const visible = and(eq(s.comments.packId, pack.id), eq(s.comments.status, "visible"), eq(s.comments.isDemo, false));
  const total = Number((await db.select({ value: count() }).from(s.comments).where(visible))[0]?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / 12));
  const safePage = Math.min(page, pageCount);
  const items = await db.select({ id: s.comments.id, body: s.comments.body, createdAt: s.comments.createdAt,
    authorName: s.users.displayName, authorUsername: s.users.username })
    .from(s.comments).innerJoin(s.users, eq(s.users.id, s.comments.userId))
    .where(visible).orderBy(desc(s.comments.createdAt), desc(s.comments.id))
    .limit(12).offset((safePage - 1) * 12);
  return { items, total, page: safePage, pageCount };
}

export async function createPackComment(db: Database, actor: Actor, slug: string, value: unknown) {
  assertActive(actor);
  requirePermission(actor, "pack.view");
  if (!isSafeSlug(slug)) throw new PackCommentError("not_found", "Paket bulunamadı.");
  const body = validateCommentBody(value);
  return db.transaction(async (tx) => {
    const [pack] = await tx.select({ id: s.packs.id }).from(s.packs)
      .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
      .where(publicPackConditions(slug)).for("update");
    if (!pack) throw new PackCommentError("not_found", "Paket bulunamadı.");
    const [comment] = await tx.insert(s.comments).values({ packId: pack.id, userId: actor.id!, body })
      .returning({ id: s.comments.id, body: s.comments.body, createdAt: s.comments.createdAt });
    if (!comment) throw new Error("Comment insert returned no row.");
    await tx.update(s.packs).set({ commentCount: sql`${s.packs.commentCount} + 1` })
      .where(eq(s.packs.id, pack.id));
    return comment;
  });
}
