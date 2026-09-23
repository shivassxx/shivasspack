import { getDatabase } from "@/db/client";
import { getClientIp, getUserAgent, jsonError } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { DownloadError, resolvePackDownload } from "@/services/packs/downloads";
import { AuthorizationError, guestActor } from "@/services/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 302 to the resolved source; counting/dedup happen inside the service. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    const { slug } = await context.params;
    const mirror = new URL(request.url).searchParams.get("mirror") ?? undefined;
    const result = await resolvePackDownload(db, session?.actor ?? guestActor,
      slug, { ip: getClientIp(request), userAgent: getUserAgent(request) }, mirror);
    let location: string;
    try { location = new URL(result.url).href; }
    catch { return jsonError(404, "not_found", "İndirme bağlantısı bulunamadı."); }
    return new Response(null, {
      status: 302,
      headers: { Location: location, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    if (error instanceof DownloadError || error instanceof AuthorizationError) {
      const headers: Record<string, string> = error.status === 429 ? { "Retry-After": "3600" } : {};
      return jsonError(error.status, error.code, error.message, headers);
    }
    console.error(`[download] unexpected error (${error instanceof Error ? error.name : typeof error})`);
    return jsonError(500, "internal_error", "Beklenmeyen bir hata oluştu.");
  }
}
