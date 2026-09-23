import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { publicEnv } from "@/lib/public-env";
import {
  authErrorResponse,
  enforceRateLimit,
  getClientIp,
  jsonOk,
  readJsonBody,
  RATE_LIMITS,
} from "@/lib/api";
import { requestPasswordReset } from "@/services/auth/service";
import { deliverMail, passwordResetMail, resolveMailConfig, MailDeliveryError } from "@/services/mail/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { email?: string };

/**
 * Enumeration'a izin vermez: adres kayıtlı olsun olmasın aynı 200 döner.
 * Mail teslimi başarısız olursa yalnızca sunucu günlüğüne yazılır.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const ip = getClientIp(request);
    const body = await readJsonBody<Body>(request);
    const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 254);

    const limited = await enforceRateLimit(
      db,
      `forgot:${ip}:${email}`,
      RATE_LIMITS.forgot.limit,
      RATE_LIMITS.forgot.windowSeconds,
    );
    if (limited) return limited;

    const { token } = await requestPasswordReset(db, email);
    if (token) {
      try {
        const env = getServerEnv();
        const config = resolveMailConfig(env);
        const mail = passwordResetMail(publicEnv.siteUrl, token);
        await deliverMail(config, { to: email, ...mail });
      } catch (error) {
        if (error instanceof MailDeliveryError) {
          console.error(`[auth] password reset mail failed (${error.code})`);
        } else {
          console.error("[auth] password reset mail failed (unknown)");
        }
      }
    }
    return jsonOk({ status: "sent" }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
