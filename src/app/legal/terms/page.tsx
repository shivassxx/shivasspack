import type { Metadata } from "next";
import { LegalDocumentPage, resolveLegalDocument } from "@/features/legal/legal-page";

const document = resolveLegalDocument("terms");
export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return <LegalDocumentPage document={document} />;
}
