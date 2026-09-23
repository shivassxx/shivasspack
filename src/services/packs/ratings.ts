import { and, eq, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug } from "@/lib/utils";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

export class RatingError extends Error {
  readonly code: "validation" | "not_found";
  readonly status: number;
  constructor(code: "validation" | "not_found", message: string) {
    super(message);
    this.name = "RatingError";
    this.code = code;
    this.status = code === "validation" ? 400 : 404;
  }
}

function requireMember(actor: Actor): string {
  assertActive(actor);
  requirePermission(actor, "pack.view");
  if (!actor.id) throw new RatingError("not_found", "Paket bulunamadı.");
  return actor.id;
}

export async function getMemberRating(db: Database, actor: Actor, packId: string): Promise<number | null> {
  const userId = requireMember(actor);
  const [rating] = await db.select({ value: s.ratings.value }).from(s.ratings)
    .where(and(eq(s.ratings.packId, packId), eq(s.ratings.userId, userId))).limit(1);
  return rating?.value ?? null;
}

/** Pack-row lock serializes votes before recalculating the materialized aggregate. */
export async function setPackRating(db: Database, actor: Actor, slug: string, value: unknown) {
  const userId = requireMember(actor);
  if (!isSafeSlug(slug)) throw new RatingError("not_found", "Paket bulunamadı.");
  if (value !== null && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5)) {
    throw new RatingError("validation", "Puan 1-5 arasında tam sayı olmalı.");
  }
  return db.transaction(async (tx) => {
    const [pack] = await tx.select({ id: s.packs.id, ratingAvg: s.packs.ratingAvg, ratingCount: s.packs.ratingCount })
      .from(s.packs).innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
      .where(and(eq(s.packs.slug, slug), eq(s.packs.status, "approved"), eq(s.packs.isDemo, false),
        eq(s.packCategories.enabled, true), lte(s.packs.publishedAt, new Date())))
      .for("update");
    if (!pack) throw new RatingError("not_found", "Paket bulunamadı.");
    const [existing] = await tx.select({ id: s.ratings.id, value: s.ratings.value }).from(s.ratings)
      .where(and(eq(s.ratings.packId, pack.id), eq(s.ratings.userId, userId)));
    if ((existing?.value ?? null) === value) {
      return { value, ratingAvg: pack.ratingAvg, ratingCount: pack.ratingCount };
    }
    if (value === null) {
      await tx.delete(s.ratings).where(eq(s.ratings.id, existing!.id));
    } else if (existing) {
      await tx.update(s.ratings).set({ value: value as number, updatedAt: new Date() }).where(eq(s.ratings.id, existing.id));
    } else {
      await tx.insert(s.ratings).values({ packId: pack.id, userId, value: value as number });
    }
    const [aggregate] = await tx.select({ count: sql<number>`count(*)::int`,
      average: sql<string>`coalesce(round(avg(${s.ratings.value})::numeric, 1), 0.0)::numeric(2,1)::text` })
      .from(s.ratings).where(eq(s.ratings.packId, pack.id));
    if (!aggregate) throw new Error("Rating aggregate returned no row.");
    await tx.update(s.packs).set({ ratingCount: aggregate.count, ratingAvg: aggregate.average })
      .where(eq(s.packs.id, pack.id));
    return { value, ratingAvg: aggregate.average, ratingCount: aggregate.count };
  });
}
