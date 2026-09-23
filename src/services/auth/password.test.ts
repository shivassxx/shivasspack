import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isAcceptablePassword,
  verifyPassword,
  PasswordError,
  PASSWORD_MIN_LENGTH,
} from "./password";

describe("password hashing", () => {
  it("produces a self-describing scrypt hash and verifies it", async () => {
    const password = "correct horse battery staple";
    const stored = await hashPassword(password);
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain(password);
    expect(await verifyPassword(password, stored)).toBe(true);
    expect(await verifyPassword("wrong password value", stored)).toBe(false);
  });

  it("salts each hash so identical passwords differ", async () => {
    const a = await hashPassword("identical-password-1");
    const b = await hashPassword("identical-password-1");
    expect(a).not.toBe(b);
  });

  it("rejects short or oversized passwords before hashing", async () => {
    await expect(hashPassword("short")).rejects.toBeInstanceOf(PasswordError);
    await expect(hashPassword("x".repeat(5000))).rejects.toBeInstanceOf(PasswordError);
  });

  it("returns false for malformed or missing hashes instead of throwing", async () => {
    for (const bad of [null, "", "plaintext", "scrypt$1$2$3", "bcrypt$1$8$1$aa$bb"]) {
      expect(await verifyPassword("anything", bad)).toBe(false);
    }
  });

  it("refuses absurd parameters embedded in a tampered hash", async () => {
    const tampered = "scrypt$1048576$32$16$AA==$BB==";
    expect(await verifyPassword("anything", tampered)).toBe(false);
  });

  it("never verifies an empty password", async () => {
    const stored = await hashPassword("a-real-password-1");
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("enforces the documented minimum and diversity rules", () => {
    expect(isAcceptablePassword("a".repeat(PASSWORD_MIN_LENGTH))).toBe(false);
    expect(isAcceptablePassword("short12")).toBe(false);
    expect(isAcceptablePassword(" password12 ")).toBe(false);
    expect(isAcceptablePassword("valid-password-42")).toBe(true);
  });
});
