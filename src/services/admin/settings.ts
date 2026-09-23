import { eq } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

const registrationKey = "registrations_enabled";

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

export async function getAdminRegistrationSetting(db: Database, actor: Actor) {
  assertActive(actor);
  requirePermission(actor, "admin.settings");
  return { enabled: await registrationEnabled(db) };
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
