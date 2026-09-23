import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(() => ({ SESSION_COOKIE_NAME: "sid", SESSION_TTL_DAYS: 30 })),
  getDatabase: vi.fn(() => ({ db: {} })),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/db/client", () => ({ getDatabase: mocks.getDatabase }));

import { POST as logout } from "./route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => vi.resetAllMocks());

  it("always clears the cookie and answers 204 even without a session", async () => {
    const response = await logout(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    expect(response.status).toBe(204);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("sid=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("reports failure when server-side revocation is unavailable", async () => {
    mocks.getDatabase.mockImplementation(() => {
      throw new Error("postgresql://user:secret@internal/db");
    });
    const response = await logout(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { cookie: "sid=raw-token-value" },
      }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).not.toMatch(/secret|internal|postgresql/);
  });
});
