import { describe, expect, it } from "vitest";
import { validateHomepageSections } from "./homepage";

describe("homepage section input", () => {
  const valid = ["featured", "hero", "known", "trending"].map((key) => ({ key, enabled: key !== "known" }));

  it("derives order from the submitted list", () => {
    expect(validateHomepageSections(valid)).toEqual(valid.map((row, order) => ({ ...row, order })));
  });

  it("rejects missing, duplicate and unsupported sections", () => {
    expect(() => validateHomepageSections(valid.slice(1))).toThrow();
    expect(() => validateHomepageSections([...valid.slice(1), valid[1]])).toThrow();
    expect(() => validateHomepageSections([{ key: "news", enabled: true }, ...valid.slice(1)])).toThrow();
    expect(() => validateHomepageSections([...valid.slice(1), { key: "featured", enabled: "yes" }])).toThrow();
  });
});
