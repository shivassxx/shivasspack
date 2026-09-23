import { getDatabase } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/api";
import { getPublishedPack } from "@/services/packs/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const { slug } = await context.params;
    const pack = await getPublishedPack(getDatabase().db, slug);
    if (!pack) return jsonError(404, "not_found", "Paket bulunamadı.");
    return jsonOk(
      {
        ...pack,
        publishedAt: pack.publishedAt.toISOString(),
        latestVersion: pack.latestVersion
          ? {
              ...pack.latestVersion,
              publishedAt: pack.latestVersion.publishedAt?.toISOString() ?? null,
            }
          : null,
      },
      200,
      { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    );
  } catch {
    return jsonError(500, "internal_error", "Paket yüklenemedi.");
  }
}
