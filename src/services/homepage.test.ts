import { describe, expect, it } from "vitest";
import { validateHomepageSections } from "./homepage";

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

  it("rejects missing, duplicate and unsupported sections", () => {
    expect(() => validateHomepageSections(valid.slice(1))).toThrow();
    expect(() => validateHomepageSections([...valid.slice(1), valid[1]])).toThrow();
    expect(() => validateHomepageSections([{ key: "news", enabled: true }, ...valid.slice(1)])).toThrow();
    expect(() => validateHomepageSections([...valid.slice(1), { key: "featured", enabled: "yes" }])).toThrow();
  });
});
