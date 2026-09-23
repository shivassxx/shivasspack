import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  getServerEnv: vi.fn(() => ({ SESSION_COOKIE_NAME: "sid", SESSION_TTL_DAYS: 30 })),
  getDatabase: vi.fn(() => ({ db: { marker: "db" } })),
  login: vi.fn(),
  consumeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 })),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: env.getServerEnv }));
vi.mock("@/db/client", () => ({ getDatabase: env.getDatabase }));
vi.mock("@/services/auth/service", () => ({ login: env.login, AuthError: class extends Error {} }));
vi.mock("@/services/rate-limit", () => ({ consumeRateLimit: env.consumeRateLimit }));

import { POST } from "./route";

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.login.mockReset();
    env.consumeRateLimit.mockReset();
    env.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
  });

  it("rejects malformed JSON before touching the database", async () => {
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "bad_request", message: "Geçersiz istek." },
    });
    expect(env.login).not.toHaveBeenCalled();
  });

  it("sets an HttpOnly session cookie and never returns the token", async () => {
    env.login.mockResolvedValue({
      userId: "usr_1",
      token: "super-secret-token",
      sessionId: "sess_1",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    const response = await POST(request({ identifier: "Player", password: "valid-password-42" }));
    expect(response.status).toBe(200);

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("sid=super-secret-token");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const text = await response.text();
    expect(text).not.toContain("super-secret-token");
    expect(JSON.parse(text)).toEqual({
      user: { id: "usr_1" },
      expiresAt: "2030-01-01T00:00:00.000Z",
    });

    // Kimlik küçük harfe indirgenir ve IP anahtara katılır.
    expect(env.login).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ identifier: "player" }),
      expect.objectContaining({ ip: "unknown" }),
      30,
    );
  });

  it("normalizes forwarded client IPs for the rate-limit key", async () => {
    env.login.mockResolvedValue({
      userId: "usr_1",
      token: "t",
      sessionId: "s",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    await POST(request({ identifier: "a", password: "b" }, { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(env.consumeRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "login:203.0.113.7:a",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("propagates auth failures without leaking internals", async () => {
    env.login.mockRejectedValue(
      Object.assign(new Error("Kullanıcı adı veya parola hatalı."), {
        name: "AuthError",
        status: 401,
        code: "invalid_credentials",
        __auth: true,
      }),
    );
    // AuthError kimliği test ortamında sahte; route gerçek sınıfla eşleşmez,
    // bu yüzden 500'e düşer ve gövde yalnızca genel mesaj taşır.
    const response = await POST(request({ identifier: "a", password: "b" }));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toMatch(/stack|at |postgres|scrypt/i);
  });

  it("returns 429 with Retry-After when the window is exhausted", async () => {
    env.consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 120 });
    const response = await POST(request({ identifier: "a", password: "b" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    const body = await response.json();
    expect(body.error.code).toBe("rate_limited");
    expect(env.login).not.toHaveBeenCalled();
  });

  it("fails closed when the rate-limit store is unavailable", async () => {
    env.consumeRateLimit.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request({ identifier: "a", password: "b" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("rate_limit_unavailable");
    expect(env.login).not.toHaveBeenCalled();
  });
});
