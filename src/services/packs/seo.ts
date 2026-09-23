export type PackJsonLdInput = {
  siteUrl: string;
  slug: string;
  title: string;
  excerpt: string;
  creatorName: string;
  publishedAt: Date | null;
  modifiedAt: Date | null;
  softwareVersion: string | null;
  ratingValue: string | null;
  ratingCount: number;
};

/**
 * schema.org SoftwareApplication block for the pack detail page.
 * `<` is escaped so user-controlled text can never close the script element.
 */
export function buildPackJsonLd(input: PackJsonLdInput): string {
  let url: string;
  try {
    url = new URL(`/packs/${encodeURIComponent(input.slug)}`, input.siteUrl).href;
  } catch {
    url = `/packs/${encodeURIComponent(input.slug)}`;
  }
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: input.title,
    description: input.excerpt,
    url,
    applicationCategory: "Game",
    operatingSystem: "FiveM",
    author: { "@type": "Person", name: input.creatorName },
  };
  if (input.softwareVersion) data.softwareVersion = input.softwareVersion;
  if (input.publishedAt) data.datePublished = input.publishedAt.toISOString();
  if (input.modifiedAt) data.dateModified = input.modifiedAt.toISOString();
  if (input.ratingCount > 0 && input.ratingValue !== null) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: input.ratingValue,
      ratingCount: input.ratingCount,
      bestRating: "5",
      worstRating: "1",
    };
  }
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
