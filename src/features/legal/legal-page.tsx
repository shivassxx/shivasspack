import { ProsePage } from "@/components/ui/prose-page";
import { getLegalDocument, type LegalDocument } from "@/content/legal";

export function resolveLegalDocument(slug: LegalDocument["slug"]): LegalDocument {
  const document = getLegalDocument(slug);
  if (!document) throw new Error(`Missing legal document: ${slug}`);
  return document;
}

export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  return (
    <ProsePage
      eyebrow="Yasal"
      title={document.title}
      description={document.description}
      updatedAt="22 Eylül 2026"
      sections={document.sections}
    />
  );
}
