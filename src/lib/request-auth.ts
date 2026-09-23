import "server-only";
import type { Database } from "@/db/connection";
import { getServerEnv } from "@/lib/env";
import { readCookieValue, resolveCookieName } from "@/lib/session-cookie";
import { resolveSession } from "@/services/auth/session";

export async function resolveRequestSession(db: Database, request: Request) {
  const env = getServerEnv();
  const token = readCookieValue(
    request.headers.get("cookie"),
    resolveCookieName(env.SESSION_COOKIE_NAME),
  );
  return token ? resolveSession(db, token) : null;
}
