import { describe, expect, it } from "vitest";
import { buildPackJsonLd } from "./seo";

const base = {
  siteUrl: "https://example.com",
  slug: "neon-graphics",
  title: "Neon Graphics",
  excerpt: "High contrast graphics pack.",
  creatorName: "Shiva",
  publishedAt: new Date("2026-01-05T10:00:00.000Z"),
  modifiedAt: new Date("2026-02-01T10:00:00.000Z"),
  softwareVersion: "2.1.0",
  ratingValue: "4.5",
  ratingCount: 12,
};

describe("pack JSON-LD", () => {
  it("builds valid SoftwareApplication data with rating, version and canonical URL", () => {
    const parsed = JSON.parse(buildPackJsonLd(base)) as Record<string, unknown>;
    expect(parsed["@type"]).toBe("SoftwareApplication");
    expect(parsed.url).toBe("https://example.com/packs/neon-graphics");
    expect(parsed.softwareVersion).toBe("2.1.0");
    expect(parsed.datePublished).toBe("2026-01-05T10:00:00.000Z");
    expect(parsed.aggregateRating).toEqual({
      "@type": "AggregateRating", ratingValue: "4.5", ratingCount: 12, bestRating: "5", worstRating: "1",
    });
  });

  it("omits rating/version/dates when absent and neutralizes script-closing text", () => {
    const html = buildPackJsonLd({
      ...base, title: "</script><img src=x>", softwareVersion: null,
      publishedAt: null, modifiedAt: null, ratingValue: null, ratingCount: 0,
    });
    expect(html).not.toContain("<");
    expect(html).toContain("\\u003c/script");
    const parsed = JSON.parse(html) as Record<string, unknown>;
    expect(parsed.name).toBe("</script><img src=x>");
    expect(parsed).not.toHaveProperty("aggregateRating");
    expect(parsed).not.toHaveProperty("softwareVersion");
  });
});
