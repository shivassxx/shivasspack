import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { getAdminRegistrationSetting, getAdminSiteName, updateRegistrationSetting, updateSiteName } from "@/services/admin/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const [registrations, siteName] = await Promise.all([
      getAdminRegistrationSetting(db, session.actor), getAdminSiteName(db, session.actor),
    ]);
    return jsonOk({ registrations, siteName }, 200, { "Cache-Control": "no-store" });
  } catch (error) { return adminErrorResponse(error); }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<{ enabled: unknown; siteName: unknown }>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    const keys = Object.keys(body);
    if (keys.length !== 1) return jsonError(400, "bad_request", "Bir ayar gönderin.");
    if (keys[0] === "siteName") {
      return jsonOk({ siteName: (await updateSiteName(db, session.actor, body.siteName)).name }, 200, { "Cache-Control": "no-store" });
    }
    if (keys[0] === "enabled") {
      return jsonOk({ registrations: await updateRegistrationSetting(db, session.actor, body.enabled) }, 200, { "Cache-Control": "no-store" });
    }
    return jsonError(400, "bad_request", "Bilinmeyen ayar.");
  } catch (error) { return adminErrorResponse(error); }
}
