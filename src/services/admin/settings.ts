import { eq } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { siteConfig } from "@/lib/site-config";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

const registrationKey = "registrations_enabled";
const siteNameKey = "site_name";

export class SettingsError extends Error {
  constructor(readonly code: "validation" | "conflict", message: string, readonly status: number) {
    super(message);
    this.name = "SettingsError";
  }
}

export async function registrationEnabled(db: Database): Promise<boolean> {
  const [flag] = await db.select({ enabled: s.featureFlags.enabled }).from(s.featureFlags)
    .where(eq(s.featureFlags.key, registrationKey));
  return flag?.enabled ?? false;
}

export async function readSiteName(db: Database): Promise<string> {
  const [setting] = await db.select({ value: s.siteSettings.value }).from(s.siteSettings)
    .where(eq(s.siteSettings.key, siteNameKey));
  return typeof setting?.value === "string" && setting.value.trim()
    ? setting.value : siteConfig.name;
}

export async function getAdminRegistrationSetting(db: Database, actor: Actor) {
  assertActive(actor);
  requirePermission(actor, "admin.settings");
  return { enabled: await registrationEnabled(db) };
}

export async function getAdminSiteName(db: Database, actor: Actor) {
  assertActive(actor);
  requirePermission(actor, "admin.settings");
  return readSiteName(db);
}

export async function updateSiteName(db: Database, actor: Actor, value: unknown) {
  assertActive(actor);
  requirePermission(actor, "admin.settings");
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 3 || name.length > 64 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new SettingsError("validation", "Site adı 3-64 görünür karakter olmalı.", 400);
  }
  if (!actor.id) throw new SettingsError("validation", "Geçersiz aktör.", 400);
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ value: s.siteSettings.value }).from(s.siteSettings)
      .where(eq(s.siteSettings.key, siteNameKey)).for("update");
    if (!before) throw new SettingsError("conflict", "Site adı bulunamadı; seed işlemini kontrol edin.", 409);
    if (before.value === name) return { name };
    const [updated] = await tx.update(s.siteSettings).set({ value: name, updatedById: actor.id })
      .where(eq(s.siteSettings.key, siteNameKey)).returning({ value: s.siteSettings.value });
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "site_setting.update",
      targetType: "site_setting", targetId: siteNameKey, before, after: updated });
    return { name };
  });
}

export async function updateRegistrationSetting(db: Database, actor: Actor, enabled: unknown) {
  assertActive(actor);
  requirePermission(actor, "admin.settings");
  if (typeof enabled !== "boolean") throw new SettingsError("validation", "enabled boolean olmalı.", 400);
  if (!actor.id) throw new SettingsError("validation", "Geçersiz aktör.", 400);
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ enabled: s.featureFlags.enabled }).from(s.featureFlags)
      .where(eq(s.featureFlags.key, registrationKey)).for("update");
    if (!before) throw new SettingsError("conflict", "Kayıt bayrağı bulunamadı; seed işlemini kontrol edin.", 409);
    if (before.enabled === enabled) return before;
    const [updated] = await tx.update(s.featureFlags).set({ enabled })
      .where(eq(s.featureFlags.key, registrationKey)).returning({ enabled: s.featureFlags.enabled });
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "feature_flag.update",
      targetType: "feature_flag", targetId: registrationKey, before, after: updated });
    return updated;
  });
}
