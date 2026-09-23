import { getDatabase } from "@/db/client";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api";
import { resolveRequestSession } from "@/lib/request-auth";
import { RatingError, setPackRating } from "@/services/packs/ratings";
import { AuthorizationError } from "@/services/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function setRating(request: Request, context: { params: Promise<{ slug: string }> }, method: "PUT" | "DELETE") {
  try {
    const db = getDatabase().db;
    const session = await resolveRequestSession(db, request);
    if (!session) return jsonError(401, "unauthenticated", "Giriş yapmanız gerekiyor.");
    const body = method === "PUT" ? await readJsonBody<{ value: unknown }>(request) : null;
    if (method === "PUT" && (!body || !("value" in body) || body.value === null)) {
      return jsonError(400, "validation", "Puan 1-5 arasında tam sayı olmalı.");
    }
    const { slug } = await context.params;
    return jsonOk(await setPackRating(db, session.actor, slug, method === "PUT" ? body?.value : null), 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof RatingError || error instanceof AuthorizationError) {
      return jsonError(error.status, error.code, error.message);
    }
    console.error(`[rating] unexpected error (${error instanceof Error ? error.name : typeof error})`);
    return jsonError(500, "internal_error", "Beklenmeyen bir hata oluştu.");
  }
}

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  return setRating(request, context, "PUT");
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string }> }) {
  return setRating(request, context, "DELETE");
}
