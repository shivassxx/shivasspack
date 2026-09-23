import { getDatabase } from "@/db/client";
import { getClientIp, getUserAgent, jsonError, jsonOk } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { PackViewError, recordPackView } from "@/services/packs/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anonymous beacon: members dedupe by user id, guests by IP + user agent. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    const identity = session
      ? `user:${session.actor.id}`
      : `guest:${getClientIp(request)}|${getUserAgent(request) ?? ""}`;
    const { slug } = await context.params;
    return jsonOk(await recordPackView(db, slug, identity), 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof PackViewError) return jsonError(error.status, error.code, error.message);
    console.error(`[view] unexpected error (${error instanceof Error ? error.name : typeof error})`);
    return jsonError(500, "internal_error", "Beklenmeyen bir hata oluştu.");
  }
}
