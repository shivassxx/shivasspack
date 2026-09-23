import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import {
  authErrorResponse,
  enforceRateLimit,
  jsonError,
  jsonOk,
  readJsonBody,
  RATE_LIMITS,
} from "@/lib/api";
import { readCookieValue, resolveCookieName } from "@/lib/session-cookie";
import { resolveSession } from "@/services/auth/session";
import { changePassword } from "@/services/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { currentPassword?: string; newPassword?: string };

export async function POST(request: Request): Promise<Response> {
  try {
    const env = getServerEnv();
    const db = getDatabase().db;
    const token = readCookieValue(request.headers.get("cookie"), resolveCookieName(env.SESSION_COOKIE_NAME));
    const session = token ? await resolveSession(db, token) : null;
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");

    const body = await readJsonBody<Body>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");

    const limited = await enforceRateLimit(
      db,
      `change:${session.actor.id}`,
      RATE_LIMITS.changePassword.limit,
      RATE_LIMITS.changePassword.windowSeconds,
    );
    if (limited) return limited;

    await changePassword(
      db,
      session.actor.id!,
      String(body.currentPassword ?? ""),
      String(body.newPassword ?? ""),
      // Oturumu değiştirmeyen cihazlar kapatılır; bu cihaz korunur.
      { currentSessionId: session.sessionId, revokeOtherSessions: true },
    );
    // Bu cihaz korunur; oturum satırları yalnızca DB üzerinden iptal edilir.
    return jsonOk({ status: "changed" }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
