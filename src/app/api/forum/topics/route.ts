import { getDatabase } from "@/db/client";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { forumErrorResponse } from "@/lib/forum-api";
import { resolveRequestSession } from "@/lib/request-auth";
import { createForumTopic, forumPage, getForumCategory, listForumTopics, type NewForumTopic } from "@/services/forum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const category = params.get("category") ?? undefined;
    const db = getDatabase().db;
    if (category && !(await getForumCategory(db, category))) {
      return jsonError(404, "not_found", "Forum kategorisi bulunamadı.");
    }
    const result = await listForumTopics(db, { categorySlug: category, page: forumPage(params.get("page")) });
    return jsonOk(result, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return forumErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<NewForumTopic>(request, 64 * 1024);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    return jsonOk({ topic: await createForumTopic(db, session.actor, body) }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
