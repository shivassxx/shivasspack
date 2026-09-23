import { getDatabase } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/api";
import { forumErrorResponse } from "@/lib/forum-api";
import { resolveRequestSession } from "@/lib/request-auth";
import { setForumLike, type ForumLikeType } from "@/services/forum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function set(request: Request, context: { params: Promise<{ type: string; id: string }> }, liked: boolean) {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const { type, id } = await context.params;
    if (type !== "topic" && type !== "reply") return jsonError(400, "bad_request", "Geçersiz beğeni hedefi.");
    return jsonOk(await setForumLike(db, session.actor, type as ForumLikeType, id, liked), 200, { "Cache-Control": "no-store" });
  } catch (error) { return forumErrorResponse(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  return set(request, context, true);
}

export async function DELETE(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  return set(request, context, false);
}
