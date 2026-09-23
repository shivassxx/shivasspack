import "server-only";
import { cookies } from "next/headers";
import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { resolveCookieName, resolveSessionFromHeader } from "@/lib/session";
import {
  AuthorizationError,
  guestActor,
  requirePermission,
  type Actor,
  type PermissionKey,
} from "@/services/rbac";

export type CurrentSession = { sessionId: string; actor: Actor };

/**
 * İstekten oturumu çözer. Çerez yoksa/başarısızsa `null`.
 * Her RSC çağrısında tek DB sorgusu yapar (çerez okunurken dinamik render olur).
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const store = await cookies();
  const env = getServerEnv();
  const name = resolveCookieName(env.SESSION_COOKIE_NAME);
  const token = store.get(name)?.value;
  if (!token) return null;
  return resolveSessionFromHeader(getDatabase().db, token);
}

/** Kimliksiz ziyaretçi için `guest` actor'u döndürür. */
export async function getCurrentActor(): Promise<Actor> {
  const session = await getCurrentSession();
  return session?.actor ?? guestActor;
}

/** Giriş yapılmamışsa 401 fırlatır. */
export async function requireCurrentSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) throw new AuthorizationError("Sign in required.", 401, "unauthenticated");
  return session;
}

/** Servis katmanındaki yetki kapısıyla aynı davranışı RSC için uygular. */
export async function requireCurrentPermission(permission: PermissionKey): Promise<CurrentSession> {
  const session = await requireCurrentSession();
  requirePermission(session.actor, permission);
  return session;
}

export async function canCurrent(permission: PermissionKey): Promise<boolean> {
  const actor = await getCurrentActor();
  return actor.permissions.has(permission);
}

export { AuthorizationError };
