import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(() => ({ SESSION_COOKIE_NAME: "sid" })),
  getDatabase: vi.fn(() => ({ db: {} })),
  resolveSession: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/services/auth/session", () => ({ resolveSession: mocks.resolveSession }));

import { PATCH } from "./route";

const patch = (body: unknown) =>
  new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: "sid=token" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/profile", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects anonymous callers before any write", async () => {
    mocks.resolveSession.mockResolvedValue(null);
    const response = await PATCH(patch({ displayName: "New name" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthenticated", message: "Giriş yapmanız gerekiyor." },
    });
  });

  it("rejects a suspended actor even with a valid session cookie", async () => {
    mocks.resolveSession.mockResolvedValue({
      sessionId: "sess_1",
      actor: {
        id: "usr_1",
        displayName: "Old",
        roleKey: "member",
        permissions: new Set(["profile.edit_own"]),
        status: "suspended",
        banUntil: null,
      },
    });
    const response = await PATCH(patch({ displayName: "New name" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("account_inactive");
  });

  it("rejects a missing permission with 403", async () => {
    mocks.resolveSession.mockResolvedValue({
      sessionId: "sess_1",
      actor: {
        id: "usr_1",
        displayName: "Old",
        roleKey: "guest",
        permissions: new Set(),
        status: "active",
        banUntil: null,
      },
    });
    const response = await PATCH(patch({ displayName: "New name" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
  });

  it("validates lengths before hitting the database", async () => {
    mocks.resolveSession.mockResolvedValue({
      sessionId: "sess_1",
      actor: {
        id: "usr_1",
        displayName: "Old",
        roleKey: "member",
        permissions: new Set(["profile.edit_own"]),
        status: "active",
        banUntil: null,
      },
    });
    const tooLong = await PATCH(patch({ displayName: "x".repeat(65) }));
    expect(tooLong.status).toBe(400);
    expect((await tooLong.json()).error.code).toBe("validation");

    const longBio = await PATCH(patch({ bio: "y".repeat(501) }));
    expect(longBio.status).toBe(400);
  });
});
