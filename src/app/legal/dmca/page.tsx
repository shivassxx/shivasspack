import type { Metadata } from "next";
import { LegalDocumentPage, resolveLegalDocument } from "@/features/legal/legal-page";

const document = resolveLegalDocument("dmca");
export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/legal/dmca" },
};

export default function DmcaPage() {
  return <LegalDocumentPage document={document} />;
}
