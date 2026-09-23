import { getDatabase } from "@/db/client";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { forumErrorResponse } from "@/lib/forum-api";
import { resolveRequestSession } from "@/lib/request-auth";
import { reportForumContent, type ForumReportInput } from "@/services/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<ForumReportInput>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    return jsonOk({ report: await reportForumContent(db, session.actor, body) }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
