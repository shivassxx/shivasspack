import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

// Only sections with real public renderers can be enabled in the builder.
export const homepageKeys = ["hero", "featured", "trending", "known"] as const;
export type HomepageKey = (typeof homepageKeys)[number];
export type HomepageSection = { key: HomepageKey; enabled: boolean; order: number };

export class HomepageError extends Error {
  constructor(readonly code: "validation" | "conflict", message: string, readonly status: number) {
    super(message);
    this.name = "HomepageError";
  }
}

export function validateHomepageSections(value: unknown): HomepageSection[] {
  if (!Array.isArray(value) || value.length !== homepageKeys.length) {
    throw new HomepageError("validation", "Tüm ana sayfa bölümlerini gönderin.", 400);
  }
  const keys = new Set<string>();
  const sections = value.map((row, order) => {
    if (!row || typeof row !== "object" || !homepageKeys.includes((row as HomepageSection).key) ||
        typeof (row as HomepageSection).enabled !== "boolean") {
      throw new HomepageError("validation", "Geçersiz ana sayfa bölümü.", 400);
    }
    const { key, enabled } = row as HomepageSection;
    if (keys.has(key)) throw new HomepageError("validation", "Bölüm anahtarları tekrarlanamaz.", 400);
    keys.add(key);
    return { key, enabled, order };
  });
  return sections;
}

export async function listHomepageSections(db: Database): Promise<HomepageSection[]> {
  return db.select({ key: s.homepageSections.key, enabled: s.homepageSections.enabled, order: s.homepageSections.order })
    .from(s.homepageSections)
    .where(inArray(s.homepageSections.key, homepageKeys))
    .orderBy(asc(s.homepageSections.order), asc(s.homepageSections.key)) as Promise<HomepageSection[]>;
}

export async function listAdminHomepageSections(db: Database, actor: Actor) {
  assertActive(actor);
  requirePermission(actor, "homepage.manage");
  return listHomepageSections(db);
}

export async function updateHomepageSections(db: Database, actor: Actor, value: unknown) {
  assertActive(actor);
  requirePermission(actor, "homepage.manage");
  if (!actor.id) throw new HomepageError("validation", "Geçersiz aktör.", 400);
  const sections = validateHomepageSections(value);
  return db.transaction(async (tx) => {
    const before = await tx.select({ key: s.homepageSections.key, enabled: s.homepageSections.enabled, order: s.homepageSections.order })
      .from(s.homepageSections)
      .where(inArray(s.homepageSections.key, homepageKeys))
      .orderBy(asc(s.homepageSections.order), asc(s.homepageSections.key))
      .for("update");
    if (before.length !== homepageKeys.length) {
      throw new HomepageError("conflict", "Ana sayfa bölümleri eksik; seed işlemini kontrol edin.", 409);
    }
    for (const section of sections) {
      await tx.update(s.homepageSections).set({ order: section.order, enabled: section.enabled })
        .where(eq(s.homepageSections.key, section.key));
    }
    await tx.insert(s.auditLogs).values({
      actorId: actor.id, action: "homepage.update", targetType: "homepage", targetId: "sections",
      before: { sections: before }, after: { sections },
    });
    return sections;
  });
}
