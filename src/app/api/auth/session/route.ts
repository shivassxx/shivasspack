import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/api";
import { readCookieValue, resolveCookieName } from "@/lib/session-cookie";
import { resolveSession } from "@/services/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * İstemcinin oturumunu okuması için tek uç nokta.
 * Yetki listesi döner; UI yalnızca gösterim için kullanır, servisler yeniden doğrular.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const env = getServerEnv();
    const token = readCookieValue(request.headers.get("cookie"), resolveCookieName(env.SESSION_COOKIE_NAME));
    const session = token ? await resolveSession(getDatabase().db, token) : null;
    if (!session) return jsonOk({ user: null }, 200, { "Cache-Control": "no-store" });
    return jsonOk(
      {
        user: {
          id: session.actor.id,
          role: session.actor.roleKey,
          permissions: [...session.actor.permissions],
          status: session.actor.status,
        },
        sessionId: session.sessionId,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch {
    return jsonError(500, "internal_error", "Oturum okunamadı.");
  }
}
