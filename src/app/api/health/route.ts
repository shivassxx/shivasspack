import { getDatabase } from "@/db/client";
import { checkDatabase } from "@/services/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode") ?? "ready";
  const headers = { "Cache-Control": "no-store" };
  if (mode === "live") return Response.json({ status: "ok" }, { headers });
  if (mode !== "ready") return Response.json({ status: "invalid_mode" }, { status: 400, headers });
  try {
    if (await checkDatabase(getDatabase().db)) {
      return Response.json({ status: "ok", database: "up" }, { headers });
    }
  } catch {
    // Config/connection details must never be returned by a public health endpoint.
  }
  return Response.json({ status: "unavailable", database: "down" }, { status: 503, headers });
}
