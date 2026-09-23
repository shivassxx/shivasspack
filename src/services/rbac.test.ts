import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  assertActive,
  assertCanAct,
  can,
  guestActor,
  isPermissionKey,
  requirePermission,
  type Actor,
  type PermissionKey,
} from "./rbac";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: "usr_1",
    displayName: "Test",
    roleKey: "member",
    permissions: new Set<PermissionKey>(["pack.view", "profile.edit_own", "forum.topic.create"]),
    status: "active",
    banUntil: null,
    ...overrides,
  };
}

describe("rbac decisions", () => {
  it("grants only explicitly held permissions", () => {
    const member = actor();
    expect(can(member, "pack.view")).toBe(true);
    expect(can(member, "profile.edit_own")).toBe(true);
    expect(can(member, "admin.settings")).toBe(false);
    expect(can(member, "pack.delete")).toBe(false);
  });

  it("guest has only the public read set", () => {
    expect(guestActor.id).toBeNull();
    expect(can(guestActor, "pack.view")).toBe(true);
    expect(can(guestActor, "forum.read")).toBe(true);
    expect(can(guestActor, "download.use")).toBe(true);
    expect(can(guestActor, "pack.submit")).toBe(false);
    expect(can(guestActor, "forum.topic.create")).toBe(false);
  });

  it("requirePermission throws 403 with the missing key", () => {
    const member = actor();
    expect(() => requirePermission(member, "pack.view")).not.toThrow();
    try {
      requirePermission(member, "user.manage");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).status).toBe(403);
      expect((error as AuthorizationError).message).toContain("user.manage");
    }
  });

  it("assertActive blocks anonymous, suspended, deleted and banned actors", () => {
    expect(() => assertActive(guestActor)).toThrowError(/Sign in/);
    expect(() => assertActive(actor({ status: "suspended" }))).toThrowError(/unavailable/i);
    expect(() => assertActive(actor({ status: "deleted" }))).toThrowError(/unavailable/i);
    expect(() =>
      assertActive(actor({ banUntil: new Date(Date.now() + 60_000) })),
    ).toThrowError(/suspended/i);
    expect(() => assertActive(actor({ banUntil: new Date(Date.now() - 1000) }))).not.toThrow();
  });

  it("distinguishes 401 from 403 so clients can react correctly", () => {
    try {
      assertActive(guestActor);
    } catch (error) {
      expect((error as AuthorizationError).status).toBe(401);
      expect((error as AuthorizationError).code).toBe("unauthenticated");
    }
    try {
      requirePermission(actor(), "admin.settings");
    } catch (error) {
      expect((error as AuthorizationError).status).toBe(403);
    }
  });

  it("assertCanAct allows owners without the broad permission", () => {
    const owner = actor({ permissions: new Set<PermissionKey>(["pack.view"]) });
    expect(() => assertCanAct(owner, "pack.edit_any", "usr_1")).not.toThrow();
    expect(() => assertCanAct(owner, "pack.edit_any", "usr_2")).toThrowError(/pack.edit_any/);
    expect(() => assertCanAct(guestActor, "pack.view", null)).toThrowError(/Sign in/);
  });

  it("does not leak suspended accounts into authorized actions", () => {
    const suspended = actor({
      status: "suspended",
      permissions: new Set<PermissionKey>(["pack.view"]),
    });
    // Sahiplik kontrolü yetkisizliği gizlememeli.
    expect(() => assertCanAct(suspended, "pack.view", "usr_1")).toThrowError(/unavailable/i);
  });

  it("validates permission keys against the closed V1 list", () => {
    expect(isPermissionKey("pack.submit")).toBe(true);
    expect(isPermissionKey("pack.nope")).toBe(false);
    expect(isPermissionKey(42)).toBe(false);
    // Rol adı asla permission değildir.
    expect(isPermissionKey("admin")).toBe(false);
  });
});
