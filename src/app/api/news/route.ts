import { getDatabase } from "@/db/client";
import { jsonOk } from "@/lib/api";
import { adminErrorResponse } from "@/lib/admin-api";
import { listPublishedNews, newsPage } from "@/services/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const page = newsPage(new URL(request.url).searchParams.get("page"));
    return jsonOk(await listPublishedNews(getDatabase().db, page), 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
