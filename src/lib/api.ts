import type { Database } from "@/db/connection";
import { consumeRateLimit } from "@/services/rate-limit";
import { AuthError } from "@/services/auth/service";
import { AuthorizationError } from "@/services/rbac";

const MAX_BODY_BYTES = 16 * 1024;

export type ApiErrorBody = { error: { code: string; message: string } };

/** Standart hata gövdesi; dahili ayrıntı asla istemciye sızmaz. */
export function jsonError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

export function jsonOk<T>(body: T, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers });
}

/**
 * Auth/RBAC hatalarını HTTP'ye çevirir.
 * Beklenmeyen hatalarda istemciye yalnızca genel bir mesaj döner; günlüğe
 * yalnızca hata türü yazılır (parola/URL/credential basılmaz).
 */
export function authErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) return jsonError(error.status, error.code, error.message);
  if (error instanceof AuthorizationError) return jsonError(error.status, error.code, error.message);
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(`[auth] unexpected error (${kind})`);
  return jsonError(500, "internal_error", "Beklenmeyen bir hata oluştu.");
}

/** İstemci IP'si; proxy başlığı yoksa "unknown". Ham değer 64 karakterle sınırlı. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}

export function getUserAgent(request: Request): string | null {
  return request.headers.get("user-agent")?.slice(0, 256) ?? null;
}

/**
 * Gövdeyi sınırlı boyutta okur ve ayrıştırır.
 * Aşım veya geçersiz JSON → `null`; çağıran 400 döner.
 */
export async function readJsonBody<T>(request: Request): Promise<Partial<T> | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Partial<T>;
  } catch {
    return null;
  }
}

export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 900 },
  register: { limit: 5, windowSeconds: 3600 },
  forgot: { limit: 5, windowSeconds: 3600 },
  reset: { limit: 10, windowSeconds: 900 },
  changePassword: { limit: 10, windowSeconds: 900 },
} as const;

/**
 * Sınır aşılırsa `429` yanıtı, aksi halde `null`.
 * Sayaç okunamıyorsa kimlik işlemi geçici olarak reddedilir.
 */
export async function enforceRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  try {
    const decision = await consumeRateLimit(db, key, limit, windowSeconds);
    if (decision.allowed) return null;
    return jsonError(429, "rate_limited", "Çok fazla deneme yaptınız. Lütfen daha sonra tekrar deneyin.", {
      "Retry-After": String(decision.retryAfterSeconds),
    });
  } catch {
    return jsonError(503, "rate_limit_unavailable", "Lütfen daha sonra tekrar deneyin.");
  }
}
