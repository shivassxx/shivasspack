import { sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import { hashToken } from "./auth/token";

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Fixed-window counter backed by `rate_limit_events`.
 *
 * The row is inserted per window and the attempt count is derived from the rows
 * in the current window, so a failed attempt never widens the window for other
 * callers. Keys are hashed before storage; the raw key (IP, login identifier)
 * never reaches the database.
 */
export async function consumeRateLimit(
  db: Database,
  rawKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitDecision> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Rate limit must be a positive integer.");
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error("Rate-limit window must be a positive integer.");
  }
  const keyHash = hashToken(rawKey);
  const rows = await db.transaction(async (tx) => {
    // Separate statements after this lock get a fresh READ COMMITTED snapshot.
    // Concurrent attempts on the same key cannot all observe an empty bucket.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${keyHash}, 0))`);
    await tx.execute(sql`
      insert into rate_limit_events (key_hash, expires_at)
      values (${keyHash}, to_timestamp(
        (floor(extract(epoch from clock_timestamp()) / ${windowSeconds}) + 1) * ${windowSeconds}
      ))
    `);
    return tx.execute<{ count: string; reset_at: Date }>(sql`
      select count(*)::text as count, min(expires_at) as reset_at
      from rate_limit_events
      where key_hash = ${keyHash} and expires_at > clock_timestamp()
    `);
  });
  const used = Number(rows[0]?.count ?? 0);
  const resetAt = rows[0]?.reset_at;
  const retryAfterSeconds = resetAt
    ? Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000))
    : windowSeconds;
  return {
    allowed: used <= limit,
    remaining: Math.max(0, limit - used),
    retryAfterSeconds,
  };
}

/** Best-effort sweep of expired windows; safe to call on any request. */
export async function purgeExpiredRateLimits(db: Database): Promise<void> {
  await db.execute(sql`delete from rate_limit_events where expires_at <= now()`);
}
