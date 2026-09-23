import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { listSubmissionQueue } from "@/services/submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    return jsonOk({ queue: await listSubmissionQueue(db, session.actor) }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
