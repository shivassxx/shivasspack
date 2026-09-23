"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Fires the view beacon once per mount; deduplication happens server-side. */
export function ViewTracker({ slug }: { slug: string }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void fetch(`/api/packs/${encodeURIComponent(slug)}/view`, { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body && typeof body === "object" && (body as { viewed?: boolean }).viewed === true) router.refresh();
      })
      .catch(() => undefined);
  }, [slug, router]);

  return null;
}
