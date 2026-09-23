import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { createSubmission, listSubmissions, type SubmissionInput } from "@/services/submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    return jsonOk({ submissions: await listSubmissions(db, session.actor) }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = await readJsonBody<SubmissionInput>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    return jsonOk({ submission: await createSubmission(db, session.actor, body) }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
