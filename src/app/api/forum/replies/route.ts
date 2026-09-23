import { getDatabase } from "@/db/client";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { forumErrorResponse } from "@/lib/forum-api";
import { resolveRequestSession } from "@/lib/request-auth";
import { createForumReply, forumPage, listForumReplies } from "@/services/forum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const topicId = params.get("topicId");
    if (!topicId) return jsonError(400, "bad_request", "Konu zorunlu.");
    const result = await listForumReplies(getDatabase().db, topicId, forumPage(params.get("page")));
    return jsonOk(result, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" });
  } catch (error) {
    return forumErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<{ topicId?: unknown; body?: unknown }>(request, 32 * 1024);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    return jsonOk({ reply: await createForumReply(db, session.actor, body) }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
