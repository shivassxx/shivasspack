import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

export class AiSourceError extends Error {
  constructor(readonly code: "validation" | "not_found" | "conflict", message: string, readonly status: number) {
    super(message);
    this.name = "AiSourceError";
  }
}

function gate(actor: Actor) {
  assertActive(actor);
  requirePermission(actor, "ai.manage");
}

export type AiSourceInput = { name?: unknown; url?: unknown; enabled?: unknown;
  trusted?: unknown; intervalMinutes?: unknown; language?: unknown };

function parseInput(input: AiSourceInput) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 3 || name.length > 120) throw new AiSourceError("validation", "Kaynak adı 3-120 karakter olmalı.", 400);
  if (typeof input.url !== "string" || input.url.length > 2048) throw new AiSourceError("validation", "Kaynak URL geçersiz.", 400);
  let url: URL;
  try { url = new URL(input.url); } catch { throw new AiSourceError("validation", "Kaynak URL geçersiz.", 400); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AiSourceError("validation", "Kaynak HTTP(S) olmalı.", 400);
  if (url.username || url.password) throw new AiSourceError("validation", "Kaynak URL kimlik bilgisi içeremez.", 400);
  if (typeof input.enabled !== "boolean" || typeof input.trusted !== "boolean") {
    throw new AiSourceError("validation", "Etkin ve güvenilir alanları boolean olmalı.", 400);
  }
  if (typeof input.intervalMinutes !== "number" || !Number.isInteger(input.intervalMinutes) ||
      input.intervalMinutes < 5 || input.intervalMinutes > 1440) {
    throw new AiSourceError("validation", "Kontrol aralığı 5-1440 dakika olmalı.", 400);
  }
  if (input.language !== "tr" && input.language !== "en") throw new AiSourceError("validation", "Dil tr veya en olmalı.", 400);
  return { name, url: url.href, enabled: input.enabled, trusted: input.trusted,
    intervalMinutes: input.intervalMinutes, language: input.language };
}

export async function listAiSources(db: Database, actor: Actor) {
  gate(actor);
  return db.select({ id: s.aiSources.id, name: s.aiSources.name, url: s.aiSources.url,
    enabled: s.aiSources.enabled, trusted: s.aiSources.trusted,
    intervalMinutes: s.aiSources.intervalMinutes, language: s.aiSources.language,
    lastCheckedAt: s.aiSources.lastCheckedAt })
    .from(s.aiSources).where(eq(s.aiSources.isDemo, false)).orderBy(asc(s.aiSources.name));
}

function sourceConflict(error: unknown): never {
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
  if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
    throw new AiSourceError("conflict", "Bu kaynak URL zaten kayıtlı.", 409);
  }
  throw error;
}

export async function createAiSource(db: Database, actor: Actor, input: AiSourceInput) {
  gate(actor);
  const fields = parseInput(input);
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(s.aiSources).values(fields)
        .returning({ id: s.aiSources.id, name: s.aiSources.name, enabled: s.aiSources.enabled });
      if (!created) throw new Error("AI source insert returned no row.");
      await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "ai.source.create",
        targetType: "ai_source", targetId: created.id, after: { name: fields.name, url: fields.url,
          enabled: fields.enabled } });
      return created;
    });
  } catch (error) { return sourceConflict(error); }
}

export async function updateAiSource(db: Database, actor: Actor, id: string, input: AiSourceInput) {
  gate(actor);
  const fields = parseInput(input);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(s.aiSources)
        .where(eq(s.aiSources.id, id)).for("update");
      if (!before || before.isDemo) throw new AiSourceError("not_found", "Kaynak bulunamadı.", 404);
      const [updated] = await tx.update(s.aiSources).set(fields).where(eq(s.aiSources.id, before.id))
        .returning({ id: s.aiSources.id, name: s.aiSources.name, enabled: s.aiSources.enabled });
      if (!updated) throw new Error("AI source update returned no row.");
      await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "ai.source.update",
        targetType: "ai_source", targetId: before.id,
        before: { name: before.name, url: before.url, enabled: before.enabled },
        after: { name: fields.name, url: fields.url, enabled: fields.enabled,
          trusted: fields.trusted, intervalMinutes: fields.intervalMinutes, language: fields.language } });
      return updated;
    });
  } catch (error) { return sourceConflict(error); }
}

export async function deleteAiSource(db: Database, actor: Actor, id: string) {
  gate(actor);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.aiSources).where(eq(s.aiSources.id, id)).for("update");
    if (!before || before.isDemo) throw new AiSourceError("not_found", "Kaynak bulunamadı.", 404);
    await tx.delete(s.aiSources).where(eq(s.aiSources.id, before.id));
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "ai.source.delete",
      targetType: "ai_source", targetId: before.id, before: { name: before.name, url: before.url } });
    return { id: before.id };
  });
}
