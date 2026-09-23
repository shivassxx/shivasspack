import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { listAdminHomepageSections, updateHomepageSections } from "@/services/homepage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    return jsonOk({ sections: await listAdminHomepageSections(db, session.actor) }, 200, { "Cache-Control": "no-store" });
  } catch (error) { return adminErrorResponse(error); }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<{ sections: unknown }>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    return jsonOk({ sections: await updateHomepageSections(db, session.actor, body.sections) }, 200, { "Cache-Control": "no-store" });
  } catch (error) { return adminErrorResponse(error); }
}
