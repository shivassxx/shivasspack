import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

// Only sections with real public renderers can be enabled in the builder.
export const homepageKeys = ["hero", "featured", "trending", "known"] as const;
export type HomepageKey = (typeof homepageKeys)[number];
export type HomepageSection = { key: HomepageKey; enabled: boolean; order: number; maxItems?: number };

function maxItems(config: Record<string, unknown>): number {
  const value = config.maxItems;
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 12 ? Number(value) : 6;
}

function publicSection(row: { key: (typeof s.homepageKey.enumValues)[number]; enabled: boolean; order: number; config: Record<string, unknown> }): HomepageSection {
  return row.key === "hero" ? { key: row.key, enabled: row.enabled, order: row.order }
    : { key: row.key as HomepageKey, enabled: row.enabled, order: row.order, maxItems: maxItems(row.config) };
}

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
    const { key, enabled, maxItems: limit } = row as HomepageSection;
    if (keys.has(key)) throw new HomepageError("validation", "Bölüm anahtarları tekrarlanamaz.", 400);
    keys.add(key);
    if (limit !== undefined && (key === "hero" || !Number.isInteger(limit) || limit < 1 || limit > 12)) {
      throw new HomepageError("validation", "Paket sayısı 1-12 arasında olmalı.", 400);
    }
    return { key, enabled, order, ...(limit === undefined ? {} : { maxItems: limit }) };
  });
  return sections;
}

export async function listHomepageSections(db: Database): Promise<HomepageSection[]> {
  const rows = await db.select({ key: s.homepageSections.key, enabled: s.homepageSections.enabled,
    order: s.homepageSections.order, config: s.homepageSections.config })
    .from(s.homepageSections)
    .where(inArray(s.homepageSections.key, homepageKeys))
    .orderBy(asc(s.homepageSections.order), asc(s.homepageSections.key));
  return rows.map(publicSection);
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
    const before = await tx.select({ key: s.homepageSections.key, enabled: s.homepageSections.enabled,
      order: s.homepageSections.order, config: s.homepageSections.config })
      .from(s.homepageSections)
      .where(inArray(s.homepageSections.key, homepageKeys))
      .orderBy(asc(s.homepageSections.order), asc(s.homepageSections.key))
      .for("update");
    if (before.length !== homepageKeys.length) {
      throw new HomepageError("conflict", "Ana sayfa bölümleri eksik; seed işlemini kontrol edin.", 409);
    }
    const effective = sections.map((section) => {
      const current = before.find((row) => row.key === section.key)!;
      return section.key === "hero" ? section : { ...section, maxItems: section.maxItems ?? maxItems(current.config) };
    });
    for (const section of effective) {
      const current = before.find((row) => row.key === section.key)!;
      await tx.update(s.homepageSections).set({ order: section.order, enabled: section.enabled,
        ...(section.maxItems === undefined ? {} : { config: { ...current.config, maxItems: section.maxItems } }) })
        .where(eq(s.homepageSections.key, section.key));
    }
    await tx.insert(s.auditLogs).values({
      actorId: actor.id, action: "homepage.update", targetType: "homepage", targetId: "sections",
      before: { sections: before.map(publicSection) }, after: { sections: effective },
    });
    return effective;
  });
}
