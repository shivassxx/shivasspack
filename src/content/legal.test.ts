import { describe, expect, it } from "vitest";
import { getLegalDocument, legalDocuments } from "./legal";

describe("legal documents", () => {
  it("provides every footer legal route with substantive content", () => {
    expect(legalDocuments.map((document) => document.slug)).toEqual(["privacy", "terms", "dmca"]);
    for (const document of legalDocuments) {
      expect(document.title.length).toBeGreaterThan(5);
      expect(document.description.length).toBeGreaterThan(30);
      expect(document.sections.length).toBeGreaterThanOrEqual(4);
      expect(document.sections.every((section) => (section.paragraphs?.length ?? 0) + (section.items?.length ?? 0) > 0)).toBe(true);
      expect(getLegalDocument(document.slug)).toBe(document);
    }
  });

  it("does not resolve unknown documents", () => {
    expect(getLegalDocument("unknown")).toBeUndefined();
  });
});
