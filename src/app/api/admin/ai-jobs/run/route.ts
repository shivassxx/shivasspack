import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { runAiDraftJob } from "@/services/ai-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    return jsonOk(await runAiDraftJob(db, session.actor, process.env.AI_API_KEY), 200,
      { "Cache-Control": "no-store" });
  } catch (error) { return adminErrorResponse(error); }
}
