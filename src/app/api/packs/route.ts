import { getDatabase } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/api";
import { parsePackSearchParams } from "@/lib/pack-query";
import { listPublishedPacks } from "@/services/packs/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const result = await listPublishedPacks(getDatabase().db, parsePackSearchParams({
      q: url.searchParams.get("q") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      known: url.searchParams.get("known") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
    }));
    return jsonOk({
      ...result,
      items: result.items.map((item) => ({ ...item, publishedAt: item.publishedAt.toISOString() })),
    }, 200, { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" });
  } catch {
    return jsonError(500, "internal_error", "Paketler yüklenemedi.");
  }
}
