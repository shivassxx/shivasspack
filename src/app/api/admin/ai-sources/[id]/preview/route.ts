import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { previewAiSource } from "@/services/ai-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const { id } = await context.params;
    return jsonOk(await previewAiSource(db, session.actor, id), 200, { "Cache-Control": "no-store" });
  } catch (error) { return adminErrorResponse(error); }
}
