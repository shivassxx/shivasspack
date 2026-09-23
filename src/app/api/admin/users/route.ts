import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { listAdminUsers } from "@/services/admin/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const params = new URL(request.url).searchParams;
    return jsonOk(await listAdminUsers(db, session.actor, { q: params.get("q") ?? "", page: Number(params.get("page") ?? 1) }),
      200, { "Cache-Control": "no-store" });
  } catch (error) { return adminErrorResponse(error); }
}
