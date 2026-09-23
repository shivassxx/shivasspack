import { and, asc, count, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { assertActive, AuthorizationError, requirePermission, type Actor } from "@/services/rbac";

export class UserAdminError extends Error {
  constructor(readonly code: "validation" | "not_found", message: string, readonly status: number) {
    super(message);
    this.name = "UserAdminError";
  }
}

export type UserSearch = { q?: string; page?: number };

export async function listAdminUsers(db: Database, actor: Actor, input: UserSearch = {}) {
  assertActive(actor);
  requirePermission(actor, "user.manage");
  const q = typeof input.q === "string" ? input.q.trim().toLowerCase().slice(0, 32).replace(/[^a-z0-9_-]/g, "") : "";
  const page = Number.isInteger(input.page) ? Math.max(1, Math.min(1000, input.page!)) : 1;
  const where = and(eq(s.users.isDemo, false), q ? sql`position(${q} in ${s.users.username}) > 0` : undefined);
  const [own] = await db.select({ rank: s.roles.rank }).from(s.users)
    .innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).where(eq(s.users.id, actor.id!));
  if (!own) throw new AuthorizationError("Hesap bulunamadı.");
  const [items, totalRows, roles] = await Promise.all([
    db.select({ id: s.users.id, username: s.users.username, displayName: s.users.displayName,
      email: s.users.email, status: s.users.status, createdAt: s.users.createdAt,
      roleId: s.roles.id, roleKey: s.roles.key, roleName: s.roles.name, rank: s.roles.rank })
      .from(s.users).innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).where(where)
      .orderBy(asc(s.users.username)).limit(25).offset((page - 1) * 25),
    db.select({ value: count() }).from(s.users).where(where),
    actor.permissions.has("role.manage")
      ? db.select({ id: s.roles.id, key: s.roles.key, name: s.roles.name, rank: s.roles.rank }).from(s.roles)
        .where(and(sql`${s.roles.rank} > 0`, sql`${s.roles.rank} < ${own.rank}`)).orderBy(asc(s.roles.rank))
      : Promise.resolve([]),
  ]);
  const total = Number(totalRows[0]?.value ?? 0);
  return { items: items.map((item) => ({ ...item, editable: item.id !== actor.id && item.rank < own.rank })),
    roles, total, page, pageCount: Math.max(1, Math.ceil(total / 25)), q };
}

export async function assignUserRole(db: Database, actor: Actor, userId: string, roleId: unknown) {
  assertActive(actor);
  requirePermission(actor, "user.manage");
  requirePermission(actor, "role.manage");
  if (typeof roleId !== "string" || !/^role_[a-z0-9_-]{1,96}$/.test(roleId)) {
    throw new UserAdminError("validation", "Geçersiz rol kimliği.", 400);
  }
  if (userId === actor.id) throw new AuthorizationError("Kendi rolünü değiştiremezsin.");
  return db.transaction(async (tx) => {
    const [own] = await tx.select({ rank: s.roles.rank }).from(s.users)
      .innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).where(eq(s.users.id, actor.id!));
    const [target] = await tx.select({ id: s.users.id, username: s.users.username, roleId: s.users.roleId,
      roleKey: s.roles.key, rank: s.roles.rank, isDemo: s.users.isDemo })
      .from(s.users).innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
      .where(eq(s.users.id, userId)).for("update");
    if (!target || target.isDemo) throw new UserAdminError("not_found", "Kullanıcı bulunamadı.", 404);
    const [nextRole] = await tx.select({ id: s.roles.id, key: s.roles.key, rank: s.roles.rank })
      .from(s.roles).where(eq(s.roles.id, roleId));
    if (!nextRole) throw new UserAdminError("validation", "Rol bulunamadı.", 400);
    if (!own || target.rank >= own.rank || nextRole.rank >= own.rank || nextRole.rank <= 0) {
      throw new AuthorizationError("Yalnızca kendi seviyenin altındaki kullanıcı ve rolleri yönetebilirsin.");
    }
    if (target.roleId === nextRole.id) return { id: target.id, username: target.username, roleId: nextRole.id, roleKey: nextRole.key };
    await tx.update(s.users).set({ roleId: nextRole.id }).where(eq(s.users.id, userId));
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "user.role.assign", targetType: "user", targetId: userId,
      before: { roleId: target.roleId, roleKey: target.roleKey }, after: { roleId: nextRole.id, roleKey: nextRole.key } });
    return { id: target.id, username: target.username, roleId: nextRole.id, roleKey: nextRole.key };
  });
}
