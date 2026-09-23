import { getDatabase } from "@/db/client";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { forumErrorResponse } from "@/lib/forum-api";
import { resolveRequestSession } from "@/lib/request-auth";
import { isForumModerationAction, moderateForumTopic } from "@/services/forum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<{ action?: unknown }>(request);
    if (!body || !isForumModerationAction(body.action)) return jsonError(400, "bad_request", "Geçersiz işlem.");
    const { id } = await context.params;
    return jsonOk({ topic: await moderateForumTopic(db, session.actor, id, body.action) }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
