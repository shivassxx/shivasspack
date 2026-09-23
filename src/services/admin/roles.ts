import { asc, count, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { assertActive, AuthorizationError, isPermissionKey, permissionKeys, requirePermission, type Actor, type PermissionKey } from "@/services/rbac";

export class RoleAdminError extends Error {
  constructor(readonly code: "validation" | "not_found" | "conflict", message: string, readonly status: number) {
    super(message);
    this.name = "RoleAdminError";
  }
}

export type RoleInput = {
  key?: unknown;
  name?: unknown;
  description?: unknown;
  rank?: unknown;
  permissions?: unknown;
};

function text(value: unknown, field: string, min: number, max: number): string {
  const clean = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (clean.length < min || clean.length > max || /[\p{Cc}\p{Cf}]/u.test(clean)) {
    throw new RoleAdminError("validation", `${field} ${min}-${max} görünür karakter olmalı.`, 400);
  }
  return clean;
}

function grants(value: unknown): PermissionKey[] {
  if (!Array.isArray(value) || value.length > permissionKeys.length || !value.every(isPermissionKey)) {
    throw new RoleAdminError("validation", "Geçersiz izin listesi.", 400);
  }
  const keys = value as PermissionKey[];
  if (new Set(keys).size !== keys.length) throw new RoleAdminError("validation", "Yinelenen izin anahtarı.", 400);
  return keys;
}

function roleInput(input: RoleInput) {
  return {
    name: text(input.name, "Rol adı", 2, 60),
    description: input.description === "" || input.description === null || input.description === undefined
      ? null : text(input.description, "Açıklama", 2, 240),
    permissions: grants(input.permissions),
  };
}

async function actorRank(db: Database, actor: Actor): Promise<number> {
  assertActive(actor);
  requirePermission(actor, "role.manage");
  const [own] = await db.select({ rank: s.roles.rank }).from(s.users)
    .innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).where(eq(s.users.id, actor.id!));
  if (!own) throw new AuthorizationError("Hesap bulunamadı.");
  return own.rank;
}

function canEdit(rank: number, role: { rank: number; isSystem: boolean }) {
  // The guest actor uses fixed in-memory public grants; editing that seed row would be misleading.
  return role.rank < rank && !(role.isSystem && role.rank === 0);
}

export async function listAdminRoles(db: Database, actor: Actor) {
  const rank = await actorRank(db, actor);
  const [roles, rows, users, catalog] = await Promise.all([
    db.select({ id: s.roles.id, key: s.roles.key, name: s.roles.name, description: s.roles.description,
      rank: s.roles.rank, isSystem: s.roles.isSystem }).from(s.roles).orderBy(asc(s.roles.rank), asc(s.roles.key)),
    db.select({ roleId: s.rolePermissions.roleId, key: s.permissions.key }).from(s.rolePermissions)
      .innerJoin(s.permissions, eq(s.permissions.id, s.rolePermissions.permissionId)),
    db.select({ roleId: s.users.roleId, value: count() }).from(s.users)
      .where(eq(s.users.isDemo, false)).groupBy(s.users.roleId),
    db.select({ key: s.permissions.key, group: s.permissions.group, description: s.permissions.description })
      .from(s.permissions).orderBy(asc(s.permissions.group), asc(s.permissions.key)),
  ]);
  const grantsByRole = new Map<string, PermissionKey[]>();
  for (const row of rows) if (isPermissionKey(row.key)) {
    const current = grantsByRole.get(row.roleId) ?? [];
    current.push(row.key);
    grantsByRole.set(row.roleId, current);
  }
  const counts = new Map(users.map((row) => [row.roleId, Number(row.value)]));
  return {
    actorRank: rank,
    permissions: catalog.filter((row): row is typeof row & { key: PermissionKey } => isPermissionKey(row.key))
      .map((row) => ({ ...row, grantable: actor.permissions.has(row.key) })),
    roles: roles.map((role) => ({ ...role, editable: canEdit(rank, role),
      userCount: counts.get(role.id) ?? 0, permissions: grantsByRole.get(role.id) ?? [] })),
  };
}

export async function createAdminRole(db: Database, actor: Actor, input: RoleInput) {
  const rank = await actorRank(db, actor);
  const key = typeof input.key === "string" ? input.key.trim() : "";
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(key)) throw new RoleAdminError("validation", "Rol anahtarı 3-32 küçük harf/rakam/_ içermeli.", 400);
  if (!Number.isInteger(input.rank) || Number(input.rank) < 1 || Number(input.rank) >= rank) {
    throw new RoleAdminError("validation", "Rol seviyesi kendi seviyenden düşük ve pozitif olmalı.", 400);
  }
  const values = roleInput(input);
  if (values.permissions.some((permission) => !actor.permissions.has(permission))) {
    throw new AuthorizationError("Sahip olmadığın izni başka bir role veremezsin.");
  }
  try {
    return await db.transaction(async (tx) => {
      const [own] = await tx.select({ rank: s.roles.rank }).from(s.users)
        .innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).where(eq(s.users.id, actor.id!));
      if (!own || Number(input.rank) >= own.rank) throw new AuthorizationError("Kendi seviyene eşit veya üst rol oluşturamazsın.");
      const [role] = await tx.insert(s.roles).values({ key, name: values.name, description: values.description, rank: Number(input.rank), isSystem: false })
        .returning({ id: s.roles.id, key: s.roles.key, name: s.roles.name, description: s.roles.description, rank: s.roles.rank });
      if (!role) throw new Error("Role insert returned no row.");
      if (values.permissions.length) {
        const perms = await tx.select({ id: s.permissions.id }).from(s.permissions).where(inArray(s.permissions.key, values.permissions));
        if (perms.length !== values.permissions.length) throw new RoleAdminError("validation", "İzin kataloğu eksik.", 400);
        await tx.insert(s.rolePermissions).values(perms.map((p) => ({ roleId: role.id, permissionId: p.id })));
      }
      await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "role.create", targetType: "role", targetId: role.id,
        after: { ...role, permissions: values.permissions } });
      return role;
    });
  } catch (error) {
    let cause: unknown = error;
    for (let depth = 0; cause && depth < 3; depth += 1) {
      if ((cause as { code?: string }).code === "23505") {
        throw new RoleAdminError("conflict", "Rol anahtarı zaten kullanılıyor.", 409);
      }
      cause = (cause as { cause?: unknown }).cause;
    }
    if (error instanceof Error && /duplicate key|unique constraint/i.test(error.message)) {
      throw new RoleAdminError("conflict", "Rol anahtarı zaten kullanılıyor.", 409);
    }
    throw error;
  }
}

export async function updateAdminRole(db: Database, actor: Actor, id: string, input: RoleInput) {
  await actorRank(db, actor);
  if (input.key !== undefined || input.rank !== undefined) {
    throw new RoleAdminError("validation", "Rol anahtarı ve seviyesi değiştirilemez.", 400);
  }
  if (input.name === undefined && input.description === undefined && input.permissions === undefined) {
    throw new RoleAdminError("validation", "Güncellenecek alan yok.", 400);
  }
  const patch: Partial<{ name: string; description: string | null }> = {};
  if (input.name !== undefined) patch.name = text(input.name, "Rol adı", 2, 60);
  if (input.description !== undefined) patch.description = input.description === null || input.description === ""
    ? null : text(input.description, "Açıklama", 2, 240);
  const selected = input.permissions === undefined ? undefined : grants(input.permissions);

  return db.transaction(async (tx) => {
    const [own] = await tx.select({ rank: s.roles.rank }).from(s.users)
      .innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).where(eq(s.users.id, actor.id!));
    const [before] = await tx.select({ id: s.roles.id, key: s.roles.key, name: s.roles.name,
      description: s.roles.description, rank: s.roles.rank, isSystem: s.roles.isSystem })
      .from(s.roles).where(eq(s.roles.id, id)).for("update");
    if (!before) throw new RoleAdminError("not_found", "Rol bulunamadı.", 404);
    if (!own || !canEdit(own.rank, before)) throw new AuthorizationError("Bu rolü düzenleme yetkin yok.");
    const oldGrants = await tx.select({ key: s.permissions.key }).from(s.rolePermissions)
      .innerJoin(s.permissions, eq(s.permissions.id, s.rolePermissions.permissionId))
      .where(eq(s.rolePermissions.roleId, id));
    const previous = oldGrants.map((p) => p.key).sort();
    const next = selected?.slice().sort() ?? previous;
    if (next.some((key) => !previous.includes(key) && (!isPermissionKey(key) || !actor.permissions.has(key)))) {
      throw new AuthorizationError("Sahip olmadığın izni başka bir role veremezsin.");
    }
    if (before.name === (patch.name ?? before.name) && before.description === (patch.description === undefined ? before.description : patch.description)
      && JSON.stringify(previous) === JSON.stringify(next)) return before;
    if (selected !== undefined) {
      const perms = selected.length ? await tx.select({ id: s.permissions.id }).from(s.permissions).where(inArray(s.permissions.key, selected)) : [];
      if (perms.length !== selected.length) throw new RoleAdminError("validation", "İzin kataloğu eksik.", 400);
      await tx.delete(s.rolePermissions).where(eq(s.rolePermissions.roleId, id));
      if (perms.length) await tx.insert(s.rolePermissions).values(perms.map((p) => ({ roleId: id, permissionId: p.id })));
    }
    const [after] = Object.keys(patch).length ? await tx.update(s.roles).set(patch).where(eq(s.roles.id, id)).returning({
      id: s.roles.id, key: s.roles.key, name: s.roles.name, description: s.roles.description, rank: s.roles.rank, isSystem: s.roles.isSystem,
    }) : [before];
    if (!after) throw new Error("Role update returned no row.");
    await tx.insert(s.auditLogs).values({ actorId: actor.id, action: "role.update", targetType: "role", targetId: id,
      before: { ...before, permissions: previous }, after: { ...after, permissions: next } });
    return after;
  });
}
