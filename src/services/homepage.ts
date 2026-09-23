import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { siteConfig } from "@/lib/site-config";
import { readSiteDescription } from "@/services/admin/settings";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

// Only sections with real public renderers can be enabled in the builder.
export const homepageKeys = ["hero", "featured", "trending", "known"] as const;
export type HomepageKey = (typeof homepageKeys)[number];
export const defaultHero = {
  eyebrow: "FiveM için seçilmiş içerik",
  headline: "grafik, PvP ve performans paketleri tek yerde.",
  description: siteConfig.description,
  primaryLabel: "Paketleri keşfet",
  secondaryLabel: "Topluluk kuralları",
};
export const defaultPackTitles = { featured: "Öne çıkanlar", trending: "Popüler paketler", known: "Bilinen paketler" } as const;
export type HeroContent = { eyebrow: string; headline: string; description: string; primaryLabel: string; secondaryLabel: string };
export type HomepageSection = { key: HomepageKey; enabled: boolean; order: number; maxItems?: number; title?: string; hero?: HeroContent };

function cleanText(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= max &&
    !/[\p{Cc}\p{Cf}]/u.test(value) ? value.trim() : fallback;
}

function validateText(value: unknown, field: string, max: number): string {
  const text = cleanText(value, "", max);
  if (!text) throw new HomepageError("validation", `${field} 2-${max} karakter olmalı.`, 400);
  return text;
}

function validateHero(value: unknown): HeroContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HomepageError("validation", "Geçersiz karşılama içeriği.", 400);
  }
  const row = value as Record<string, unknown>;
  return {
    eyebrow: validateText(row.eyebrow, "Üst yazı", 80),
    headline: validateText(row.headline, "Başlık", 120),
    description: validateText(row.description, "Açıklama", 320),
    primaryLabel: validateText(row.primaryLabel, "İlk bağlantı", 40),
    secondaryLabel: validateText(row.secondaryLabel, "İkinci bağlantı", 40),
  };
}

function heroContent(config: Record<string, unknown>, siteDescription: string): HeroContent {
  const stored = config.hero && typeof config.hero === "object" && !Array.isArray(config.hero)
    ? config.hero as Record<string, unknown> : {};
  return {
    eyebrow: cleanText(stored.eyebrow, defaultHero.eyebrow, 80),
    headline: cleanText(stored.headline, defaultHero.headline, 120),
    description: stored.description === defaultHero.description
      ? siteDescription : cleanText(stored.description, siteDescription, 320),
    primaryLabel: cleanText(stored.primaryLabel, defaultHero.primaryLabel, 40),
    secondaryLabel: cleanText(stored.secondaryLabel, defaultHero.secondaryLabel, 40),
  };
}

function maxItems(config: Record<string, unknown>): number {
  const value = config.maxItems;
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 12 ? Number(value) : 6;
}

function publicSection(row: { key: (typeof s.homepageKey.enumValues)[number]; enabled: boolean; order: number; config: Record<string, unknown> }, siteDescription: string): HomepageSection {
  return row.key === "hero" ? { key: row.key, enabled: row.enabled, order: row.order, hero: heroContent(row.config, siteDescription) }
    : { key: row.key as HomepageKey, enabled: row.enabled, order: row.order, maxItems: maxItems(row.config),
      title: cleanText(row.config.title, defaultPackTitles[row.key as keyof typeof defaultPackTitles], 80) };
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
    const { key, enabled, maxItems: limit, title, hero } = row as HomepageSection;
    if (keys.has(key)) throw new HomepageError("validation", "Bölüm anahtarları tekrarlanamaz.", 400);
    keys.add(key);
    if (limit !== undefined && (key === "hero" || !Number.isInteger(limit) || limit < 1 || limit > 12)) {
      throw new HomepageError("validation", "Paket sayısı 1-12 arasında olmalı.", 400);
    }
    if (title !== undefined && key === "hero" || hero !== undefined && key !== "hero") {
      throw new HomepageError("validation", "Bölüm içeriği yanlış alanda.", 400);
    }
    return { key, enabled, order, ...(limit === undefined ? {} : { maxItems: limit }),
      ...(title === undefined ? {} : { title: validateText(title, "Bölüm başlığı", 80) }),
      ...(hero === undefined ? {} : { hero: validateHero(hero) }) };
  });
  return sections;
}

export async function listHomepageSections(db: Database): Promise<HomepageSection[]> {
  const [rows, siteDescription] = await Promise.all([db.select({ key: s.homepageSections.key, enabled: s.homepageSections.enabled,
    order: s.homepageSections.order, config: s.homepageSections.config })
    .from(s.homepageSections)
    .where(inArray(s.homepageSections.key, homepageKeys))
    .orderBy(asc(s.homepageSections.order), asc(s.homepageSections.key)), readSiteDescription(db)]);
  return rows.map((row) => publicSection(row, siteDescription));
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
  const siteDescription = await readSiteDescription(db);
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
      const existing = publicSection(current, siteDescription);
      return section.key === "hero" ? { ...section, hero: section.hero ?? existing.hero }
        : { ...section, maxItems: section.maxItems ?? existing.maxItems, title: section.title ?? existing.title };
    });
    for (const section of effective) {
      const current = before.find((row) => row.key === section.key)!;
      await tx.update(s.homepageSections).set({ order: section.order, enabled: section.enabled,
        config: { ...current.config, ...(section.key === "hero" ? { hero: { ...section.hero,
          description: section.hero?.description === siteDescription ? defaultHero.description : section.hero?.description } }
          : { maxItems: section.maxItems, title: section.title }) } })
        .where(eq(s.homepageSections.key, section.key));
    }
    await tx.insert(s.auditLogs).values({
      actorId: actor.id, action: "homepage.update", targetType: "homepage", targetId: "sections",
      before: { sections: before.map((row) => publicSection(row, siteDescription)) }, after: { sections: effective },
    });
    return effective;
  });
}
