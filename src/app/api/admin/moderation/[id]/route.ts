import { getDatabase } from "@/db/client";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { forumErrorResponse } from "@/lib/forum-api";
import { resolveRequestSession } from "@/lib/request-auth";
import { decideReport, isReportDecision } from "@/services/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<{ action?: unknown; note?: unknown }>(request);
    if (!body || !isReportDecision(body.action)) return jsonError(400, "bad_request", "Geçersiz karar.");
    const { id } = await context.params;
    return jsonOk({ report: await decideReport(db, session.actor, id, body.action, body.note) }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
