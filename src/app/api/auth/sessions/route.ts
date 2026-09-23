import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { authErrorResponse, jsonError, jsonOk } from "@/lib/api";
import { readCookieValue, resolveCookieName } from "@/lib/session-cookie";
import { listActiveSessions, revokeAllSessions, revokeSession, resolveSession } from "@/services/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authenticate(request: Request) {
  const env = getServerEnv();
  const token = readCookieValue(request.headers.get("cookie"), resolveCookieName(env.SESSION_COOKIE_NAME));
  const session = token ? await resolveSession(getDatabase().db, token) : null;
  if (!session) return null;
  return session;
}

/** Aktif cihaz listesi (yalnızca oturum sahibi). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await authenticate(request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const rows = await listActiveSessions(getDatabase().db, session.actor.id!);
    return jsonOk(
      {
        current: session.sessionId,
        sessions: rows.map((row) => ({
          id: row.id,
          current: row.id === session.sessionId,
          userAgent: row.userAgent,
          ip: row.ip,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        })),
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * `DELETE` gövdesiz: mevcut cihaz dışındaki tüm oturumları kapatır.
 * Tekil kapatma için `?id=<sessionId>` verilir ve yalnızca kendi satırı silinebilir.
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const session = await authenticate(request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const db = getDatabase().db;
    const requestedId = new URL(request.url).searchParams.get("id");

    if (requestedId) {
      const own = await listActiveSessions(db, session.actor.id!);
      if (!own.some((row) => row.id === requestedId)) {
        // Başkasının oturumunu sormak yetkisizlik sinyali: 403, 404 değil.
        return jsonError(403, "forbidden", "Bu oturumu kapatamazsınız.");
      }
      const closed = await revokeSession(db, requestedId);
      return jsonOk({ closed: closed ? 1 : 0, self: requestedId === session.sessionId }, 200, {
        "Cache-Control": "no-store",
      });
    }

    const closed = await revokeAllSessions(db, session.actor.id!, session.sessionId);
    return jsonOk({ closed, self: false }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
