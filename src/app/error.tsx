"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PageState, primaryActionClass, secondaryActionClass } from "@/components/ui/page-state";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[ui] route rendering failed", error.digest ?? error.name);
  }, [error]);

  return (
    <PageState
      code="500"
      title="Bir şeyler ters gitti"
      description="İstek tamamlanamadı. Sorun geçiciyse yeniden denemek yeterli olabilir."
    >
      <button type="button" onClick={() => retry()} className={primaryActionClass}>Tekrar dene</button>
      <Link href="/" className={secondaryActionClass}>Ana sayfaya dön</Link>
    </PageState>
  );
}
