import { and, eq, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug } from "@/lib/utils";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

export class LikeError extends Error {
  readonly status = 404;
  readonly code = "not_found";
  constructor() {
    super("Paket bulunamadı.");
    this.name = "LikeError";
  }
}

function requireMember(actor: Actor): string {
  assertActive(actor);
  requirePermission(actor, "pack.view");
  if (!actor.id) throw new LikeError();
  return actor.id;
}

export async function getPackLikeState(db: Database, actor: Actor, packId: string): Promise<boolean> {
  const userId = requireMember(actor);
  const [row] = await db.select({ id: s.likes.id }).from(s.likes)
    .where(and(eq(s.likes.userId, userId), eq(s.likes.targetType, "pack"), eq(s.likes.targetId, packId))).limit(1);
  return Boolean(row);
}

/** Idempotent like/unlike; serialization protects the denormalized pack counter. */
export async function setPackLike(db: Database, actor: Actor, slug: string, liked: boolean) {
  const userId = requireMember(actor);
  if (!isSafeSlug(slug)) throw new LikeError();
  return db.transaction(async (tx) => {
    const [pack] = await tx.select({ id: s.packs.id, count: s.packs.likeCount })
      .from(s.packs).innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
      .where(and(eq(s.packs.slug, slug), eq(s.packs.status, "approved"), eq(s.packs.isDemo, false),
        eq(s.packCategories.enabled, true), lte(s.packs.publishedAt, new Date())))
      .for("update");
    if (!pack) throw new LikeError();
    const changed = liked
      ? await tx.insert(s.likes).values({ targetType: "pack", targetId: pack.id, userId })
        .onConflictDoNothing().returning({ id: s.likes.id })
      : await tx.delete(s.likes).where(and(eq(s.likes.targetType, "pack"), eq(s.likes.targetId, pack.id),
        eq(s.likes.userId, userId))).returning({ id: s.likes.id });
    if (!changed.length) return { liked, likeCount: pack.count };
    const [updated] = await tx.update(s.packs).set({ likeCount: sql`${s.packs.likeCount} + ${liked ? 1 : -1}` })
      .where(eq(s.packs.id, pack.id)).returning({ count: s.packs.likeCount });
    if (!updated) throw new Error("Like count update returned no row.");
    return { liked, likeCount: updated.count };
  });
}
