import "server-only";
import type { Database } from "@/db/connection";
import { resolveSession } from "@/services/auth/session";
import type { Actor } from "@/services/rbac";

export { resolveCookieName } from "./session-cookie";

/**
 * `server-only` köprüsü: saf cookie yardımcıları ile DB oturum çözümünü ayırır.
 * Route handler'lar ve RSC bunu kullanır.
 */
export async function resolveSessionFromHeader(
  db: Database,
  token: string | undefined | null,
): Promise<{ sessionId: string; actor: Actor } | null> {
  if (!token) return null;
  return resolveSession(db, token);
}
