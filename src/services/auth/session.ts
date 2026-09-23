import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import type { Actor } from "@/services/rbac";
import { loadActor } from "@/services/rbac";
import { generateToken, hashToken } from "./token";

export type SessionPayload = {
  token: string;
  sessionId: string;
  expiresAt: Date;
};

export type SessionContext = {
  userAgent: string | null;
  ip: string | null;
};

/**
 * Sessions are rows, not signed blobs: revocation is immediate and every device
 * can be listed/revoked independently.
 */
export async function createSession(
  db: Database,
  userId: string,
  ttlDays: number,
  context: SessionContext,
): Promise<SessionPayload> {
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 365) {
    throw new Error("Session TTL must be between 1 and 365 days.");
  }
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(s.sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      // Cap stored values so one very long header cannot bloat the table.
      userAgent: context.userAgent?.slice(0, 256) ?? null,
      ip: context.ip?.slice(0, 64) ?? null,
      expiresAt,
    })
    .returning({ id: s.sessions.id });
  if (!row) throw new Error("Session creation failed.");
  return { token, sessionId: row.id, expiresAt };
}

/**
 * Resolve a raw cookie token to a session + actor.
 * Returns null for missing, unknown, revoked or expired sessions.
 */
export async function resolveSession(
  db: Database,
  token: string | undefined | null,
  now = new Date(),
): Promise<{ sessionId: string; actor: Actor } | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      id: s.sessions.id,
      userId: s.sessions.userId,
      expiresAt: s.sessions.expiresAt,
      revokedAt: s.sessions.revokedAt,
    })
    .from(s.sessions)
    .where(eq(s.sessions.tokenHash, tokenHash));
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;

  const actor = await loadActor(db, row.userId);
  if (!actor || actor.id === null) return null;
  return { sessionId: row.id, actor };
}

export async function revokeSession(db: Database, sessionId: string): Promise<boolean> {
  const updated = await db
    .update(s.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(s.sessions.id, sessionId), isNull(s.sessions.revokedAt)))
    .returning({ id: s.sessions.id });
  return updated.length > 0;
}

/** Revoke every session for a user, optionally keeping the current device. */
export async function revokeAllSessions(
  db: Database,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const conditions = [eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt)];
  if (exceptSessionId) conditions.push(sql`${s.sessions.id} <> ${exceptSessionId}`);
  const updated = await db
    .update(s.sessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: s.sessions.id });
  return updated.length;
}

export type ActiveSession = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export async function listActiveSessions(db: Database, userId: string): Promise<ActiveSession[]> {
  return db
    .select({
      id: s.sessions.id,
      userAgent: s.sessions.userAgent,
      ip: s.sessions.ip,
      createdAt: s.sessions.createdAt,
      expiresAt: s.sessions.expiresAt,
    })
    .from(s.sessions)
    .where(and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, new Date())))
    .orderBy(sql`${s.sessions.createdAt} desc`);
}

/** Delete expired/revoked rows older than the retention window. */
export async function purgeDeadSessions(db: Database, retentionDays = 7): Promise<number> {
  const deleted = await db
    .delete(s.sessions)
    .where(sql`(expires_at < now() - interval '${sql.raw(String(retentionDays))} day') or (revoked_at < now() - interval '${sql.raw(String(retentionDays))} day')`)
    .returning({ id: s.sessions.id });
  return deleted.length;
}
