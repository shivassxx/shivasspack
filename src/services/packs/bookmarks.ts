import { and, eq, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug } from "@/lib/utils";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";
import { listBookmarkedPacks } from "./public";

export class BookmarkError extends Error {
  readonly status = 404;
  readonly code = "not_found";
  constructor() {
    super("Paket bulunamadı.");
    this.name = "BookmarkError";
  }
}

function requireMember(actor: Actor): string {
  assertActive(actor);
  requirePermission(actor, "pack.view");
  if (!actor.id) throw new BookmarkError();
  return actor.id;
}

export async function getBookmarkState(db: Database, actor: Actor, packId: string): Promise<boolean> {
  const userId = requireMember(actor);
  const [row] = await db.select({ id: s.bookmarks.id }).from(s.bookmarks)
    .where(and(eq(s.bookmarks.userId, userId), eq(s.bookmarks.packId, packId))).limit(1);
  return Boolean(row);
}

export async function getMemberBookmarks(db: Database, actor: Actor, page = 1) {
  return listBookmarkedPacks(db, requireMember(actor), page);
}

/** Idempotent set/unset: concurrent requests serialize on the pack row. */
export async function setPackBookmark(db: Database, actor: Actor, slug: string, saved: boolean) {
  const userId = requireMember(actor);
  if (!isSafeSlug(slug)) throw new BookmarkError();
  return db.transaction(async (tx) => {
    const [pack] = await tx.select({ id: s.packs.id, count: s.packs.bookmarkCount })
      .from(s.packs).innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
      .where(and(eq(s.packs.slug, slug), eq(s.packs.status, "approved"), eq(s.packs.isDemo, false),
        eq(s.packCategories.enabled, true), lte(s.packs.publishedAt, new Date())))
      .for("update");
    if (!pack) throw new BookmarkError();
    const changed = saved
      ? await tx.insert(s.bookmarks).values({ packId: pack.id, userId }).onConflictDoNothing().returning({ id: s.bookmarks.id })
      : await tx.delete(s.bookmarks).where(and(eq(s.bookmarks.packId, pack.id), eq(s.bookmarks.userId, userId)))
        .returning({ id: s.bookmarks.id });
    if (!changed.length) return { saved, bookmarkCount: pack.count };
    const [updated] = await tx.update(s.packs).set({ bookmarkCount: sql`${s.packs.bookmarkCount} + ${saved ? 1 : -1}` })
      .where(eq(s.packs.id, pack.id)).returning({ count: s.packs.bookmarkCount });
    if (!updated) throw new Error("Bookmark count update returned no row.");
    return { saved, bookmarkCount: updated.count };
  });
}
