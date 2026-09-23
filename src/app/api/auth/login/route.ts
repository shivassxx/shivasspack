import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { publicEnv } from "@/lib/public-env";
import {
  authErrorResponse,
  enforceRateLimit,
  getClientIp,
  getUserAgent,
  jsonError,
  readJsonBody,
  RATE_LIMITS,
} from "@/lib/api";
import { buildSessionCookie, cookieFlagsForSite, resolveCookieName } from "@/lib/session-cookie";
import { login } from "@/services/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { identifier?: string; password?: string };

export async function POST(request: Request): Promise<Response> {
  try {
    const env = getServerEnv();
    const db = getDatabase().db;
    const ip = getClientIp(request);
    const body = await readJsonBody<Body>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    const identifier = String(body.identifier ?? "").trim().toLowerCase().slice(0, 254);

    // IP + hesap anahtarı ayrı ayrı da sınırlanabilir; birlikte koşturma
    // (credential stuffing) için ikisi birden anahtarlanır.
    const limited = await enforceRateLimit(
      db,
      `login:${ip}:${identifier}`,
      RATE_LIMITS.login.limit,
      RATE_LIMITS.login.windowSeconds,
    );
    if (limited) return limited;

    const result = await login(
      db,
      { identifier, password: String(body.password ?? "") },
      { userAgent: getUserAgent(request), ip },
      env.SESSION_TTL_DAYS,
    );

    return new Response(JSON.stringify({ user: { id: result.userId }, expiresAt: result.expiresAt.toISOString() }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": buildSessionCookie(
          resolveCookieName(env.SESSION_COOKIE_NAME),
          result.token,
          result.expiresAt,
          cookieFlagsForSite(publicEnv.siteUrl),
        ),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
