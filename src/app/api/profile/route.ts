import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { authErrorResponse, jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { readCookieValue, resolveCookieName } from "@/lib/session-cookie";
import { getServerEnv } from "@/lib/env";
import * as schema from "@/db/schema";
import { resolveSession } from "@/services/auth/session";
import { assertActive, requirePermission } from "@/services/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { displayName?: string; bio?: string | null };

export async function PATCH(request: Request): Promise<Response> {
  try {
    const env = getServerEnv();
    const db = getDatabase().db;
    const token = readCookieValue(request.headers.get("cookie"), resolveCookieName(env.SESSION_COOKIE_NAME));
    const session = token ? await resolveSession(db, token) : null;
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");

    // Servis katmanı yetkisi: aktif hesap + profile.edit_own.
    assertActive(session.actor);
    requirePermission(session.actor, "profile.edit_own");

    const body = await readJsonBody<Body>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");

    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim().replace(/\s+/g, " ") : null;
    const bio = typeof body.bio === "string" ? body.bio.trim() : body.bio === null ? null : undefined;

    if (displayName !== null && (displayName.length < 2 || displayName.length > 64)) {
      return jsonError(400, "validation", "Görünen ad 2-64 karakter olmalı.");
    }
    if (bio !== undefined && bio !== null && bio.length > 500) {
      return jsonError(400, "validation", "Biyografi en fazla 500 karakter olabilir.");
    }

    const patch: Partial<typeof schema.users.$inferInsert> = {};
    if (displayName !== null) patch.displayName = displayName;
    if (bio !== undefined) patch.bio = bio && bio.length > 0 ? bio : null;

    if (Object.keys(patch).length === 0) return jsonError(400, "bad_request", "Güncellenecek alan yok.");

    const [updated] = await db
      .update(schema.users)
      .set(patch)
      .where(eq(schema.users.id, session.actor.id!))
      .returning({ displayName: schema.users.displayName, bio: schema.users.bio });

    return jsonOk({ profile: updated }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
