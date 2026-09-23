import { getDatabase } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { BookmarkError, setPackBookmark } from "@/services/packs/bookmarks";
import { AuthorizationError } from "@/services/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function setBookmark(request: Request, context: { params: Promise<{ slug: string }> }, saved: boolean) {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const { slug } = await context.params;
    return jsonOk(await setPackBookmark(db, session.actor, slug, saved), 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof BookmarkError || error instanceof AuthorizationError) {
      return jsonError(error.status, error.code, error.message);
    }
    console.error(`[bookmark] unexpected error (${error instanceof Error ? error.name : typeof error})`);
    return jsonError(500, "internal_error", "Beklenmeyen bir hata oluştu.");
  }
}

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  return setBookmark(request, context, true);
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string }> }) {
  return setBookmark(request, context, false);
}
