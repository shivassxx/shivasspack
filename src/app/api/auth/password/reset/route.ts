import { getDatabase } from "@/db/client";
import {
  authErrorResponse,
  enforceRateLimit,
  getClientIp,
  jsonError,
  jsonOk,
  readJsonBody,
  RATE_LIMITS,
} from "@/lib/api";
import { resetPasswordWithToken } from "@/services/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { token?: string; password?: string };

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const body = await readJsonBody<Body>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");

    const limited = await enforceRateLimit(
      db,
      `reset:${getClientIp(request)}`,
      RATE_LIMITS.reset.limit,
      RATE_LIMITS.reset.windowSeconds,
    );
    if (limited) return limited;

    await resetPasswordWithToken(db, String(body.token ?? ""), String(body.password ?? ""));
    return jsonOk({ status: "reset" }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
