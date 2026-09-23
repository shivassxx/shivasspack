import { getDatabase } from "@/db/client";
import { enforceRateLimit, jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { createPackComment, listPackComments, PackCommentError } from "@/services/packs/comments";
import { AuthorizationError } from "@/services/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown): Response {
  if (error instanceof PackCommentError || error instanceof AuthorizationError) {
    return jsonError(error.status, error.code, error.message);
  }
  console.error(`[comment] unexpected error (${error instanceof Error ? error.name : typeof error})`);
  return jsonError(500, "internal_error", "Beklenmeyen bir hata oluştu.");
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const page = Number(new URL(request.url).searchParams.get("page") ?? 1);
    return jsonOk(await listPackComments(getDatabase().db, slug, page), 200, { "Cache-Control": "no-store" });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<{ body: unknown }>(request);
    if (!body) return jsonError(400, "validation", "Geçersiz yorum.");
    const limit = await enforceRateLimit(db, `pack-comment:${session.actor.id}`, 5, 300);
    if (limit) return limit;
    const { slug } = await context.params;
    return jsonOk({ comment: await createPackComment(db, session.actor, slug, body.body) }, 201, { "Cache-Control": "no-store" });
  } catch (error) { return errorResponse(error); }
}
