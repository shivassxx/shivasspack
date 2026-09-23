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
import { register, type RegisterInput } from "@/services/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = RegisterInput;

export async function POST(request: Request): Promise<Response> {
  try {
    const env = getServerEnv();
    const db = getDatabase().db;
    const ip = getClientIp(request);

    const limited = await enforceRateLimit(
      db,
      `register:${ip}`,
      RATE_LIMITS.register.limit,
      RATE_LIMITS.register.windowSeconds,
    );
    if (limited) return limited;

    const body = await readJsonBody<Body>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");

    const result = await register(
      db,
      {
        username: String(body.username ?? ""),
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
        displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      },
      { userAgent: getUserAgent(request), ip },
      env.SESSION_TTL_DAYS,
    );

    const headers = new Headers({
      "Set-Cookie": buildSessionCookie(
        resolveCookieName(env.SESSION_COOKIE_NAME),
        result.token,
        result.expiresAt,
        cookieFlagsForSite(publicEnv.siteUrl),
      ),
      "Cache-Control": "no-store",
    });
    return Response.json(
      { user: { id: result.userId }, expiresAt: result.expiresAt.toISOString() },
      { status: 201, headers },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
