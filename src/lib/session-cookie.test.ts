import { describe, expect, it } from "vitest";
import {
  buildClearCookie,
  buildSessionCookie,
  cookieFlagsForSite,
  defaultCookieFlags,
  readCookieValue,
  resolveCookieName,
  safeNextPath,
  DEFAULT_SESSION_COOKIE_NAME,
} from "./session-cookie";

const expiresAt = () => new Date(Date.now() + 60_000);

describe("session cookie contract", () => {
  it("falls back to the documented cookie name", () => {
    expect(resolveCookieName(undefined)).toBe(DEFAULT_SESSION_COOKIE_NAME);
    expect(resolveCookieName("")).toBe(DEFAULT_SESSION_COOKIE_NAME);
    expect(resolveCookieName("bad name")).toBe(DEFAULT_SESSION_COOKIE_NAME);
    expect(resolveCookieName("custom_session")).toBe("custom_session");
  });

  it("marks session cookies HttpOnly and SameSite=Lax", () => {
    const value = buildSessionCookie("sid", "token-value", expiresAt(), defaultCookieFlags(false));
    expect(value).toContain("sid=token-value");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Path=/");
    expect(value).toContain("Max-Age=");
    expect(value).not.toContain("Secure");
  });

  it("adds Secure only on secure deployments", () => {
    expect(buildSessionCookie("sid", "t", expiresAt(), defaultCookieFlags(true))).toContain("Secure");
  });

  it("derives Secure from the canonical deployment protocol", () => {
    expect(cookieFlagsForSite("https://packs.example").secure).toBe(true);
    expect(cookieFlagsForSite("http://localhost:3000").secure).toBe(false);
    expect(cookieFlagsForSite("not-a-url").secure).toBe(true);
  });

  it("expires the cookie when clearing", () => {
    const value = buildClearCookie("sid", defaultCookieFlags(false));
    expect(value).toContain("sid=");
    expect(value).toContain("Max-Age=0");
    expect(value).toContain("HttpOnly");
  });

  it("does not emit a negative Max-Age for an already expired session", () => {
    const value = buildSessionCookie("sid", "t", new Date(Date.now() - 5000), defaultCookieFlags(false));
    expect(value).toContain("Max-Age=0");
    expect(value).not.toContain("Max-Age=-");
  });

  it("reads a value from a multi-cookie header", () => {
    const header = "other=1; sid=abc%3Ddef; last=x";
    expect(readCookieValue(header, "sid")).toBe("abc=def");
    expect(readCookieValue(header, "missing")).toBeUndefined();
    expect(readCookieValue(null, "sid")).toBeUndefined();
  });

  it("ignores malformed encodings instead of throwing", () => {
    expect(readCookieValue("sid=%E0%A4%A", "sid")).toBeUndefined();
  });

  it("accepts only same-origin relative redirect targets", () => {
    expect(safeNextPath("/settings/profile")).toBe("/settings/profile");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("/ok?a=1")).toBe("/ok?a=1");
  });
});
