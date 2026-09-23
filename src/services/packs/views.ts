import { and, eq, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug } from "@/lib/utils";
import { consumeRateLimit } from "@/services/rate-limit";

const DEDUP_WINDOW_SECONDS = 1800;

export class PackViewError extends Error {
  readonly status = 404;
  readonly code = "not_found";
  constructor() {
    super("Paket bulunamadı.");
    this.name = "PackViewError";
  }
}

function publicPackConditions(slug: string) {
  return and(eq(s.packs.slug, slug), eq(s.packs.status, "approved"), eq(s.packs.isDemo, false),
    eq(s.packCategories.enabled, true), lte(s.packs.publishedAt, new Date()));
}

/**
 * Single beacon view. The dedup key is the member id, or client IP + user
 * agent for guests, so one visitor counts at most once per pack per window.
 * The increment is a single atomic UPDATE; the row is never locked for read.
 */
export async function recordPackView(db: Database, slug: string, identity: string) {
  if (!isSafeSlug(slug)) throw new PackViewError();
  const [pack] = await db.select({ id: s.packs.id, viewCount: s.packs.viewCount }).from(s.packs)
    .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
    .where(publicPackConditions(slug));
  if (!pack) throw new PackViewError();
  const decision = await consumeRateLimit(db, `pack-view:${pack.id}:${identity}`, 1, DEDUP_WINDOW_SECONDS);
  if (!decision.allowed) return { viewed: false, viewCount: pack.viewCount };
  const [updated] = await db.update(s.packs)
    .set({ viewCount: sql`${s.packs.viewCount} + 1` })
    .where(eq(s.packs.id, pack.id)).returning({ viewCount: s.packs.viewCount });
  if (!updated) throw new PackViewError();
  return { viewed: true, viewCount: updated.viewCount };
}
