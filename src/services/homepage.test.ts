import { describe, expect, it } from "vitest";
import { defaultHero, validateHomepageSections } from "./homepage";

describe("homepage section input", () => {
  const valid = ["featured", "hero", "known", "trending"].map((key) => ({ key, enabled: key !== "known" }));

  it("derives order from the submitted list", () => {
    expect(validateHomepageSections(valid)).toEqual(valid.map((row, order) => ({ ...row, order })));
  });

  it("accepts per-section item limits only within 1-12", () => {
    expect(validateHomepageSections([{ key: "featured", enabled: true, maxItems: 4 }, ...valid.slice(1)])[0])
      .toEqual({ key: "featured", enabled: true, maxItems: 4, order: 0 });
    for (const limit of [0, 13, 1.5, "6"]) {
      expect(() => validateHomepageSections([{ key: "featured", enabled: true, maxItems: limit }, ...valid.slice(1)])).toThrow();
    }
    expect(() => validateHomepageSections(valid.map((row) => row.key === "hero" ? { ...row, maxItems: 3 } : row))).toThrow();
  });

  it("validates editable headings and hero copy while retaining legacy payloads", () => {
    expect(validateHomepageSections(valid)[0]?.title).toBeUndefined();
    const content = valid.map((row) => row.key === "hero" ? { ...row, hero: { ...defaultHero, headline: "  Yeni paketler  " } }
      : row.key === "featured" ? { ...row, title: "  Seçkiler  " } : row);
    const result = validateHomepageSections(content);
    expect(result.find((row) => row.key === "hero")?.hero?.headline).toBe("Yeni paketler");
    expect(result.find((row) => row.key === "featured")?.title).toBe("Seçkiler");
    expect(() => validateHomepageSections(valid.map((row) => row.key === "featured" ? { ...row, title: " " } : row))).toThrow();
    expect(() => validateHomepageSections(valid.map((row) => row.key === "hero" ? { ...row, hero: { ...defaultHero, primaryLabel: "\n" } } : row))).toThrow();
    expect(() => validateHomepageSections(valid.map((row) => row.key === "hero" ? { ...row, hero: { ...defaultHero, headline: "x".repeat(121) } } : row))).toThrow();
    expect(() => validateHomepageSections(valid.map((row) => row.key === "hero" ? { ...row, title: "Yanlış" } : row))).toThrow();
  });

  it("rejects missing, duplicate and unsupported sections", () => {
    expect(() => validateHomepageSections(valid.slice(1))).toThrow();
    expect(() => validateHomepageSections([...valid.slice(1), valid[1]])).toThrow();
    expect(() => validateHomepageSections([{ key: "news", enabled: true }, ...valid.slice(1)])).toThrow();
    expect(() => validateHomepageSections([...valid.slice(1), { key: "featured", enabled: "yes" }])).toThrow();
  });
});
