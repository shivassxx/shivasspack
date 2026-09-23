import { describe, expect, it } from "vitest";
import { AuthError, validateRegisterInput } from "./service";

describe("registration input validation", () => {
  const valid = { username: "player_one", email: "Player@Example.com", password: "valid-password-42" };

  it("normalizes username and email", () => {
    const result = validateRegisterInput({ ...valid, username: "  Player_One " });
    expect(result.username).toBe("player_one");
    expect(result.email).toBe("player@example.com");
    expect(result.displayName).toBe("player_one");
  });

  it("uses a trimmed display name when supplied", () => {
    const result = validateRegisterInput({ ...valid, displayName: "  Oyuncu  " });
    expect(result.displayName).toBe("Oyuncu");
  });

  it.each([
    "ab",
    "has space",
    "-leading",
    "x".repeat(33),
    "emoji🎮name",
  ])("rejects invalid username %s", (username) => {
    expect(() => validateRegisterInput({ ...valid, username })).toThrowError(AuthError);
  });

  it("normalizes an uppercase username instead of rejecting it", () => {
    expect(validateRegisterInput({ ...valid, username: "UPPERCASE" }).username).toBe("uppercase");
  });

  it.each(["plain", "a@b", "@example.com", "a b@example.com", ""])(
    "rejects invalid email %s",
    (email) => {
      expect(() => validateRegisterInput({ ...valid, email })).toThrowError(/e-posta/i);
    },
  );

  it("rejects weak or oversized passwords", () => {
    for (const password of ["short12", "            ", "sameeeeeeee"]) {
      expect(() => validateRegisterInput({ ...valid, password })).toThrowError(AuthError);
    }
    expect(() => validateRegisterInput({ ...valid, password: "x".repeat(500) })).toThrowError(AuthError);
  });

  it("reports 400 with a stable machine-readable code", () => {
    try {
      validateRegisterInput({ ...valid, username: "ab" });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).status).toBe(400);
      expect((error as AuthError).code).toBe("bad_request");
    }
  });
});
