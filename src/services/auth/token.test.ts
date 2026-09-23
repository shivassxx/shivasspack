import { describe, expect, it } from "vitest";
import { generateToken, hashIp, hashToken, tokensMatch } from "./token";

describe("opaque token helpers", () => {
  it("generates URL-safe tokens that differ on every call", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it("stores only a stable SHA-256 digest", () => {
    const token = generateToken();
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it("compares digests without early exit and rejects mismatched shapes", () => {
    const digest = hashToken("one");
    expect(tokensMatch(digest, hashToken("one"))).toBe(true);
    expect(tokensMatch(digest, hashToken("two"))).toBe(false);
    expect(tokensMatch(digest, digest.slice(0, 32))).toBe(false);
    expect(tokensMatch("", "")).toBe(false);
  });

  it("hashes IP addresses without persisting the raw value", () => {
    const hash = hashIp("203.0.113.9");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("203.0.113.9");
    expect(hashIp("203.0.113.9")).toBe(hash);
    expect(hashIp(undefined)).toBe(hashIp("unknown"));
    // Uzun/garip değerler sabit bir bilinmeyen anahtarına düşer.
    expect(hashIp("x".repeat(500))).toBe(hashIp("unknown"));
  });
});
