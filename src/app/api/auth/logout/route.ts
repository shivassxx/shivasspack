import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { publicEnv } from "@/lib/public-env";
import { jsonError } from "@/lib/api";
import { buildClearCookie, cookieFlagsForSite, readCookieValue, resolveCookieName } from "@/lib/session-cookie";
import * as schema from "@/db/schema";
import { revokeSession } from "@/services/auth/session";
import { hashToken } from "@/services/auth/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Başarılı çıkış 204 döner (çerez yoksa da).
 * Güvenlik çerezin silinmesine değil, satırın `revokedAt` ile iptal edilmesine bağlıdır.
 */
export async function POST(request: Request): Promise<Response> {
  const env = getServerEnv();
  const name = resolveCookieName(env.SESSION_COOKIE_NAME);
  const token = readCookieValue(request.headers.get("cookie"), name);
  const flags = cookieFlagsForSite(publicEnv.siteUrl);

  if (token) {
    try {
      const db = getDatabase().db;
      const [row] = await db
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(eq(schema.sessions.tokenHash, hashToken(token)));
      if (row) await revokeSession(db, row.id);
    } catch {
      return jsonError(503, "logout_unavailable", "Oturum kapatılamadı. Lütfen tekrar deneyin.");
    }
  }

  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": buildClearCookie(name, flags), "Cache-Control": "no-store" },
  });
}
