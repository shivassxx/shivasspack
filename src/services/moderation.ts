import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

export class ModerationError extends Error {
  constructor(readonly code: "validation" | "not_found" | "conflict", message: string, readonly status: number) {
    super(message);
    this.name = "ModerationError";
  }
}

export type ForumReportInput = { targetType?: unknown; targetId?: unknown; reason?: unknown; details?: unknown };

export async function reportForumContent(db: Database, actor: Actor, input: ForumReportInput) {
  assertActive(actor);
  requirePermission(actor, "forum.read");
  const targetType = input.targetType;
  const targetId = input.targetId;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const details = typeof input.details === "string" ? input.details.trim() : "";
  if ((targetType !== "topic" && targetType !== "reply") || typeof targetId !== "string" || !/^(topic|reply)_[a-z0-9-]{1,96}$/.test(targetId)) {
    throw new ModerationError("validation", "Geçersiz rapor hedefi.", 400);
  }
  if (reason.length < 10 || reason.length > 500 || details.length > 2000 ||
      (input.details !== undefined && typeof input.details !== "string")) {
    throw new ModerationError("validation", "Gerekçe 10-500, ayrıntı en fazla 2000 karakter olmalı.", 400);
  }
  return db.transaction(async (tx) => {
    // One active report per member/target, even for concurrent requests.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`forum-report:${actor.id}:${targetType}:${targetId}`}, 0))`);
    const [target] = targetType === "topic"
      ? await tx.select({ id: s.forumTopics.id }).from(s.forumTopics)
        .innerJoin(s.forumCategories, eq(s.forumCategories.id, s.forumTopics.categoryId))
        .where(and(eq(s.forumTopics.id, targetId), eq(s.forumTopics.status, "visible"),
          eq(s.forumTopics.isDemo, false), eq(s.forumCategories.enabled, true), eq(s.forumCategories.isDemo, false))).limit(1)
      : await tx.select({ id: s.forumReplies.id }).from(s.forumReplies)
        .innerJoin(s.forumTopics, eq(s.forumTopics.id, s.forumReplies.topicId))
        .innerJoin(s.forumCategories, eq(s.forumCategories.id, s.forumTopics.categoryId))
        .where(and(eq(s.forumReplies.id, targetId), eq(s.forumReplies.status, "visible"),
          eq(s.forumReplies.isDemo, false), eq(s.forumTopics.status, "visible"),
          eq(s.forumTopics.isDemo, false), eq(s.forumCategories.enabled, true), eq(s.forumCategories.isDemo, false))).limit(1);
    if (!target) throw new ModerationError("not_found", "İçerik bulunamadı.", 404);
    const [existing] = await tx.select({ id: s.reports.id }).from(s.reports)
      .where(and(eq(s.reports.reporterId, actor.id!), eq(s.reports.targetType, targetType),
        eq(s.reports.targetId, targetId), inArray(s.reports.status, ["open", "reviewing"]))).limit(1);
    if (existing) throw new ModerationError("conflict", "Bu içerik için açık bir raporun var.", 409);
    const [created] = await tx.insert(s.reports).values({ reporterId: actor.id!, targetType, targetId,
      reason, details: details || null }).returning({ id: s.reports.id, status: s.reports.status });
    if (!created) throw new Error("Report insert returned no row.");
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "forum.report.create",
      targetType: "report", targetId: created.id, after: { targetType, targetId } });
    return created;
  });
}

export async function listModerationReports(db: Database, actor: Actor) {
  assertActive(actor);
  requirePermission(actor, "moderation.access");
  const reports = await db.select({ id: s.reports.id, targetType: s.reports.targetType, targetId: s.reports.targetId,
    reason: s.reports.reason, details: s.reports.details, status: s.reports.status,
    resolution: s.reports.resolution, reporterName: s.users.username, createdAt: s.reports.createdAt,
  }).from(s.reports).innerJoin(s.users, eq(s.users.id, s.reports.reporterId))
    .where(inArray(s.reports.targetType, ["topic", "reply"]))
    .orderBy(asc(sql`case when ${s.reports.status} in ('open', 'reviewing') then 0 else 1 end`),
      desc(s.reports.createdAt), desc(s.reports.id)).limit(100);
  const topicIds = reports.filter((item) => item.targetType === "topic").map((item) => item.targetId);
  const replyIds = reports.filter((item) => item.targetType === "reply").map((item) => item.targetId);
  const [topics, replies] = await Promise.all([
    topicIds.length ? db.select({ id: s.forumTopics.id, slug: s.forumTopics.slug, title: s.forumTopics.title,
      body: s.forumTopics.body }).from(s.forumTopics).where(inArray(s.forumTopics.id, topicIds)) : Promise.resolve([]),
    replyIds.length ? db.select({ id: s.forumReplies.id, slug: s.forumTopics.slug, title: s.forumTopics.title,
      body: s.forumReplies.body }).from(s.forumReplies).innerJoin(s.forumTopics, eq(s.forumTopics.id, s.forumReplies.topicId))
      .where(inArray(s.forumReplies.id, replyIds)) : Promise.resolve([]),
  ]);
  const targets = new Map([...topics, ...replies].map((item) => [item.id, item]));
  return reports.map((item) => ({ ...item, target: targets.get(item.targetId) ?? null }));
}

export type ReportDecision = "reviewing" | "resolved" | "dismissed";
export function isReportDecision(value: unknown): value is ReportDecision {
  return value === "reviewing" || value === "resolved" || value === "dismissed";
}

export async function decideReport(db: Database, actor: Actor, id: string, action: ReportDecision, note: unknown) {
  assertActive(actor);
  requirePermission(actor, "moderation.resolve");
  if (!isReportDecision(action)) throw new ModerationError("validation", "Geçersiz karar.", 400);
  const resolution = typeof note === "string" ? note.trim() : "";
  if ((action !== "reviewing" && (resolution.length < 3 || resolution.length > 1000)) ||
      (action === "reviewing" && note !== undefined && note !== null && note !== "")) {
    throw new ModerationError("validation", "Karar notu 3-1000 karakter olmalı.", 400);
  }
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.reports).where(eq(s.reports.id, id)).for("update");
    if (!before || (before.targetType !== "topic" && before.targetType !== "reply")) {
      throw new ModerationError("not_found", "Rapor bulunamadı.", 404);
    }
    if (before.status === "resolved" || before.status === "dismissed" || before.status === action) {
      throw new ModerationError("conflict", "Bu rapor zaten karara bağlandı veya inceleniyor.", 409);
    }
    const [updated] = await tx.update(s.reports).set({ status: action,
      resolvedById: action === "reviewing" ? null : actor.id,
      resolvedAt: action === "reviewing" ? null : new Date(),
      resolution: action === "reviewing" ? null : resolution,
    }).where(eq(s.reports.id, before.id)).returning({ id: s.reports.id, status: s.reports.status });
    if (!updated) throw new Error("Report update returned no row.");
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: `forum.report.${action}`,
      targetType: "report", targetId: before.id, before: { status: before.status },
      after: { status: action, resolution: action === "reviewing" ? null : resolution } });
    return updated;
  });
}
