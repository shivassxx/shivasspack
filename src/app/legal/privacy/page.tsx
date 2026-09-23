import type { Metadata } from "next";
import { LegalDocumentPage, resolveLegalDocument } from "@/features/legal/legal-page";

const document = resolveLegalDocument("privacy");
export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPage() {
  return <LegalDocumentPage document={document} />;
}
