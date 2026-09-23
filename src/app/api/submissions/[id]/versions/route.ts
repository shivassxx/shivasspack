import { getDatabase } from "@/db/client";
import { adminErrorResponse } from "@/lib/admin-api";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import type { PackVersionInput } from "@/lib/pack-version";
import { createPackVersion } from "@/services/submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const { id } = await context.params;
    const body = await readJsonBody<PackVersionInput>(request);
    if (!body) return jsonError(400, "bad_request", "Geçersiz istek.");
    return jsonOk(
      { version: await createPackVersion(db, session.actor, id, body) },
      201,
      { "Cache-Control": "no-store" },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
