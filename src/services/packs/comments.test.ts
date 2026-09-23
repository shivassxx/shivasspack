import { describe, expect, it } from "vitest";
import { validateCommentBody } from "./comments";

describe("pack comment input", () => {
  it("keeps line breaks, trims whitespace and rejects empty/control-heavy content", () => {
    expect(validateCommentBody("  İyi paket!\r\nKurulumu kolay.  ")).toBe("İyi paket!\nKurulumu kolay.");
    for (const value of ["ab", " ", 3, "x".repeat(2001), "geçersiz\u0000yorum", "metin\u200bgizli"]) {
      expect(() => validateCommentBody(value)).toThrow();
    }
  });
});
