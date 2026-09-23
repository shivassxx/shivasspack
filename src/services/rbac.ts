import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";

export const permissionKeys = [
  "pack.view",
  "pack.submit",
  "pack.edit_own",
  "pack.edit_any",
  "pack.publish",
  "pack.feature",
  "pack.delete",
  "pack.manage",
  "category.manage",
  "tag.manage",
  "submission.review",
  "download.use",
  "installer.manifest.edit",
  "installer.manage",
  "forum.read",
  "forum.topic.create",
  "forum.reply.create",
  "forum.edit_own",
  "forum.moderate",
  "forum.category.manage",
  "moderation.access",
  "moderation.resolve",
  "user.ban",
  "user.manage",
  "user.delete",
  "news.write",
  "news.manage",
  "ai.manage",
  "profile.edit_own",
  "admin.dashboard",
  "admin.settings",
  "homepage.manage",
  "audit.view",
  "role.manage",
  "analytics.view",
  "notification.manage",
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

const permissionKeySet = new Set<string>(permissionKeys);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === "string" && permissionKeySet.has(value);
}

/**
 * `id` is null for guests. `permissions` is the complete effective set; there is
 * no role-name branching anywhere downstream.
 */
export type Actor = {
  id: string | null;
  /** Yalnızca gösterim amaçlı; izin kararlarında kullanılmaz. */
  displayName: string | null;
  roleKey: string;
  permissions: ReadonlySet<PermissionKey>;
  status: "active" | "suspended" | "deleted";
  banUntil: Date | null;
};

export class AuthorizationError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 403, code = "forbidden") {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
    this.code = code;
  }
}

export function can(actor: Actor, permission: PermissionKey): boolean {
  return actor.permissions.has(permission);
}

/** Member-only actions: suspended, deleted or banned accounts are blocked. */
export function assertActive(actor: Actor, now = new Date()): void {
  if (actor.id === null) throw new AuthorizationError("Sign in required.", 401, "unauthenticated");
  if (actor.status !== "active") throw new AuthorizationError("Account unavailable.", 403, "account_inactive");
  if (actor.banUntil && actor.banUntil.getTime() > now.getTime()) {
    throw new AuthorizationError("Account suspended.", 403, "account_banned");
  }
}

/** Authoritative server-side gate. UI gating is cosmetic only. */
export function requirePermission(actor: Actor, permission: PermissionKey): void {
  if (!can(actor, permission)) throw new AuthorizationError(`Missing permission: ${permission}`);
}

export function assertCanAct(actor: Actor, permission: PermissionKey, owner: string | null): void {
  assertActive(actor);
  if (owner !== null && actor.id === owner) return;
  requirePermission(actor, permission);
}

export const guestActor: Actor = Object.freeze({
  id: null,
  displayName: null,
  roleKey: "guest",
  permissions: new Set<PermissionKey>(["pack.view", "download.use", "forum.read"]),
  status: "active",
  banUntil: null,
}) as Actor;

/** Load an authenticated actor with its complete permission set. */
export async function loadActor(db: Database, userId: string): Promise<Actor | null> {
  const rows = await db
    .select({
      id: s.users.id,
      displayName: s.users.displayName,
      roleKey: s.roles.key,
      status: s.users.status,
      banUntil: s.users.banUntil,
      permissionKey: s.permissions.key,
    })
    .from(s.users)
    .innerJoin(s.roles, eq(s.users.roleId, s.roles.id))
    // Rolün izinleriyle join: her satır bir grant'tır (izinsiz rolde tek null satır).
    .leftJoin(s.rolePermissions, eq(s.rolePermissions.roleId, s.roles.id))
    .leftJoin(s.permissions, eq(s.permissions.id, s.rolePermissions.permissionId))
    .where(eq(s.users.id, userId));

  const head = rows[0];
  // Kayıt yoksa döndür; izin satırları olmasa da actor (boş setle) döner.
  if (!head || (head.id === null && head.roleKey === null)) return null;
  if (typeof head.roleKey !== "string") return null;

  const permissions = new Set<PermissionKey>();
  for (const row of rows) {
    if (row.permissionKey !== null && isPermissionKey(row.permissionKey)) {
      permissions.add(row.permissionKey);
    }
  }

  return {
    id: head.id,
    displayName: head.displayName,
    roleKey: head.roleKey,
    permissions,
    status: head.status,
    banUntil: head.banUntil,
  };
}

/** Role assignment guard: actor must outrank both current and destination roles. */
export async function assertCanAssignRole(
  db: Database,
  actor: Actor,
  targetRoleKey: string,
  currentTargetRoleKey?: string,
): Promise<void> {
  assertActive(actor);
  requirePermission(actor, "role.manage");
  const roleKeys = [targetRoleKey];
  if (currentTargetRoleKey) roleKeys.push(currentTargetRoleKey);
  const [roles, [own]] = await Promise.all([
    db.select({ key: s.roles.key, rank: s.roles.rank })
    .from(s.roles)
    .where(inArray(s.roles.key, [...new Set(roleKeys)])),
    db.select({ rank: s.roles.rank }).from(s.users)
      .innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).where(eq(s.users.id, actor.id!)),
  ]);

  const target = roles.find((role) => role.key === targetRoleKey);
  const current = currentTargetRoleKey ? roles.find((role) => role.key === currentTargetRoleKey) : undefined;
  if (!target || !own) throw new AuthorizationError("Unknown role.", 400, "unknown_role");
  if (target.rank <= 0 || target.rank >= own.rank) {
    throw new AuthorizationError("Cannot assign a role at or above your own rank.");
  }
  if (current && current.rank >= own.rank) {
    throw new AuthorizationError("Cannot modify a role at or above your own rank.");
  }
}
