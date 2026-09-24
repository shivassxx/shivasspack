import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { AiSourceError } from "@/services/ai-sources";
import { previewAiSource } from "@/services/ai-preview";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

/** A manual check records what was found; it never publishes or generates an article. */
export async function checkAiSource(db: Database, actor: Actor, id: string,
  fetcher: typeof fetch = fetch, addresses?: (host: string) => Promise<string[]>) {
  assertActive(actor);
  requirePermission(actor, "ai.manage");
  const [source] = await db.select().from(s.aiSources)
    .where(and(eq(s.aiSources.id, id), eq(s.aiSources.isDemo, false))).limit(1);
  if (!source) throw new AiSourceError("not_found", "Kaynak bulunamadı.", 404);
  if (!source.enabled) throw new AiSourceError("conflict", "Kaynak etkin değil.", 409);
  const now = new Date();
  const bucket = Math.floor(now.getTime() / (source.intervalMinutes * 60_000));
  const dedupeKey = `check:${id}:${bucket}`;
  const [job] = await db.insert(s.aiJobs).values({ sourceId: id, type: "check_source",
    status: "running", attempts: 1, startedAt: now, dedupeKey })
    .onConflictDoNothing({ target: s.aiJobs.dedupeKey }).returning({ id: s.aiJobs.id });
  if (!job) throw new AiSourceError("conflict", "Bu aralıkta kaynak zaten kontrol edildi.", 409);
  try {
    const { items } = await previewAiSource(db, actor, id, fetcher, addresses);
    const completed = await db.transaction(async (tx) => {
      // Do not record the old URL as checked if the source changed during the fetch.
      const [current] = await tx.select().from(s.aiSources).where(eq(s.aiSources.id, id)).for("update");
      if (!current || !current.enabled || current.url !== source.url) {
        throw new AiSourceError("conflict", "Kaynak kontrol sırasında değişti.", 409);
      }
      let queued = 0;
      for (const item of items) {
        const key = `draft:${createHash("sha256").update(item.url).digest("hex")}`;
        const [inserted] = await tx.insert(s.aiJobs).values({ sourceId: id, type: "draft_article",
          dedupeKey: key, input: { title: item.title, url: item.url, summary: item.summary } })
          .onConflictDoNothing({ target: s.aiJobs.dedupeKey }).returning({ id: s.aiJobs.id });
        if (inserted) queued++;
      }
      await tx.update(s.aiSources).set({ lastCheckedAt: now }).where(eq(s.aiSources.id, id));
      await tx.update(s.aiJobs).set({ status: "done", output: { found: items.length, queued },
        finishedAt: new Date() }).where(eq(s.aiJobs.id, job.id));
      await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "ai.source.check",
        targetType: "ai_source", targetId: id, after: { found: items.length, queued } });
      return { found: items.length, queued };
    });
    return completed;
  } catch (error) {
    await db.update(s.aiJobs).set({ status: "failed", error: error instanceof AiSourceError ? error.message : "Kaynak kontrolü başarısız.",
      finishedAt: new Date() }).where(eq(s.aiJobs.id, job.id));
    throw error;
  }
}
