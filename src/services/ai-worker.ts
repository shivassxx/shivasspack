import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { slugify } from "@/lib/utils";
import { generateDraft, type DraftInput, type Provider } from "@/services/ai-provider";
import { AiSourceError } from "@/services/ai-sources";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

function parseJobInput(value: Record<string, unknown>): DraftInput {
  const { title, summary, url } = value;
  if (typeof title !== "string" || typeof summary !== "string" || typeof url !== "string" ||
      title.length > 200 || summary.length > 500 || url.length > 2048) {
    throw new Error("Invalid queued draft input.");
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Invalid source URL.");
  return { title, summary, url };
}

/** Processes one queued job per call, with a DB claim shared by concurrent workers. */
export async function runAiDraftJob(db: Database, actor: Actor, apiKey: string | undefined,
  fetcher: typeof fetch = fetch) {
  assertActive(actor);
  requirePermission(actor, "ai.manage");
  const [config] = await db.select().from(s.aiConfigs).where(eq(s.aiConfigs.key, "default")).limit(1);
  if (!config || config.provider === "none" || !config.model || !apiKey) {
    throw new AiSourceError("conflict", "AI sağlayıcısı, modeli ve API anahtarı gerekli.", 409);
  }
  const job = await db.transaction(async (tx) => {
    const [next] = await tx.select().from(s.aiJobs)
      .where(and(eq(s.aiJobs.type, "draft_article"), eq(s.aiJobs.status, "queued"),
        lte(s.aiJobs.availableAt, new Date())))
      .orderBy(asc(s.aiJobs.createdAt), asc(s.aiJobs.id)).limit(1).for("update", { skipLocked: true });
    if (!next) return null;
    await tx.update(s.aiJobs).set({ status: "running", attempts: sql`${s.aiJobs.attempts} + 1`,
      startedAt: new Date() }).where(eq(s.aiJobs.id, next.id));
    return next;
  });
  if (!job) return { processed: false as const };
  try {
    const [source] = job.sourceId ? await db.select().from(s.aiSources)
      .where(and(eq(s.aiSources.id, job.sourceId), eq(s.aiSources.isDemo, false))).limit(1) : [];
    if (!source || !source.enabled) throw new AiSourceError("conflict", "Kaynak artık etkin değil.", 409);
    const input = parseJobInput(job.input);
    const draft = await generateDraft(config.provider as Provider, config.model, apiKey,
      config.prompt, input, fetcher);
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: s.newsArticles.id }).from(s.newsArticles)
        .where(eq(s.newsArticles.sourceUrl, input.url)).limit(1);
      if (existing) {
        await tx.update(s.aiJobs).set({ status: "done", output: { articleId: existing.id, duplicate: true },
          finishedAt: new Date() }).where(eq(s.aiJobs.id, job.id));
        return { processed: true as const, articleId: existing.id, duplicate: true };
      }
      const [category] = await tx.select({ id: s.newsCategories.id }).from(s.newsCategories)
        .where(eq(s.newsCategories.isDemo, false))
        .orderBy(asc(s.newsCategories.sortOrder), asc(s.newsCategories.id)).limit(1);
      if (!category) throw new Error("No news category available.");
      const base = slugify(draft.title).slice(0, 88);
      if (!base) throw new Error("Draft title has no valid slug.");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`news:${base}`}, 0))`);
      let articleId: string | undefined;
      for (let n = 1; n <= 30; n++) {
        const slug = n === 1 ? base : `${base}-${n}`;
        const [taken] = await tx.select({ id: s.newsArticles.id }).from(s.newsArticles)
          .where(eq(s.newsArticles.slug, slug)).limit(1);
        if (taken) continue;
        const [article] = await tx.insert(s.newsArticles).values({ ...draft, slug,
          categoryId: category.id, aiSourceId: source.id, sourceUrl: input.url,
          confidence: draft.confidence.toFixed(3), status: "draft" })
          .returning({ id: s.newsArticles.id });
        articleId = article?.id;
        break;
      }
      if (!articleId) throw new Error("No free news slug.");
      await tx.update(s.aiJobs).set({ status: "done", output: { articleId }, finishedAt: new Date() })
        .where(eq(s.aiJobs.id, job.id));
      await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "ai.draft.create",
        targetType: "news", targetId: articleId, after: { sourceId: source.id, jobId: job.id, status: "draft" } });
      return { processed: true as const, articleId, duplicate: false };
    });
  } catch (error) {
    await db.update(s.aiJobs).set({ status: "failed", finishedAt: new Date(),
      error: error instanceof Error ? error.message.slice(0, 300) : "Draft generation failed." })
      .where(eq(s.aiJobs.id, job.id));
    throw error;
  }
}
