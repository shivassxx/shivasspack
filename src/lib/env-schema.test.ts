import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env-schema";

const valid = {
  DATABASE_URL: "postgresql://app:password@localhost:5432/shivasspack",
  SESSION_SECRET: "a1".repeat(32),
};

describe("server environment contract", () => {
  it("accepts the documented template after supplying a generated secret", () => {
    const example = parseEnv(readFileSync(".env.example", "utf8"));
    const env = parseServerEnv({ ...example, ...valid });
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
    expect(env.AI_API_KEY).toBeUndefined();
    expect(env.SESSION_TTL_DAYS).toBe(30);
  });

  it.each([undefined, "", "dev-only-insecure-session-secret-change-me-000", "x".repeat(64)])(
    "rejects missing or placeholder production secrets: %s",
    (secret) => {
      expect(() =>
        parseServerEnv({ ...valid, NODE_ENV: "production", SESSION_SECRET: secret }),
      ).toThrow("SESSION_SECRET");
    },
  );

  it("rejects non-Postgres URLs without exposing credentials", () => {
    const input = { ...valid, DATABASE_URL: "https://app:private-password@localhost" };
    expect(() => parseServerEnv(input)).toThrow("DATABASE_URL");
    expect(() => parseServerEnv(input)).not.toThrow("private-password");
  });

  it.each(["0", "366", "1.5", "invalid"])("rejects invalid session TTL: %s", (ttl) => {
    expect(() => parseServerEnv({ ...valid, SESSION_TTL_DAYS: ttl })).toThrow("SESSION_TTL_DAYS");
  });

  it("does not include unrelated or public environment variables in server config", () => {
    const env = parseServerEnv({
      ...valid,
      UNRELATED_SECRET: "private",
      NEXT_PUBLIC_SITE_URL: "https://example.com",
    });
    expect(env).not.toHaveProperty("UNRELATED_SECRET");
    expect(env).not.toHaveProperty("NEXT_PUBLIC_SITE_URL");
  });
});
