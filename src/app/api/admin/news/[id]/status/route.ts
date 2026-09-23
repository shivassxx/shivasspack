import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { isNewsAction, transitionNews } from "@/services/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<{ action?: unknown }>(request);
    if (!body || !isNewsAction(body.action)) return jsonError(400, "bad_request", "Geçersiz işlem.");
    const { id } = await context.params;
    return jsonOk({ article: await transitionNews(db, session.actor, id, body.action) }, 200, { "Cache-Control": "no-store" });
  } catch (error) { return adminErrorResponse(error); }
}
