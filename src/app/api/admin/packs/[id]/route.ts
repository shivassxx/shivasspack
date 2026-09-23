import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { archiveAdminPack, updateAdminPack, type AdminPackInput } from "@/services/admin/packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<AdminPackInput>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    const { id } = await context.params;
    return jsonOk({ pack: await updateAdminPack(db, session.actor, id, body) }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

/** V1 uses an archive transition instead of destructive row deletion. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const { id } = await context.params;
    return jsonOk({ pack: await archiveAdminPack(db, session.actor, id) }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
