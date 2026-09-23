import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { reviewSubmission } from "@/services/submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const { id } = await context.params;
    const body = await readJsonBody<{ decision?: unknown; reviewNote?: unknown }>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    return jsonOk(
      { submission: await reviewSubmission(db, session.actor, id, body.decision, body.reviewNote) },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
