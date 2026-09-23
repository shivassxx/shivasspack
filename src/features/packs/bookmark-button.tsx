"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";

export function BookmarkButton({ slug, initialSaved, initialCount }: { slug: string; initialSaved: boolean; initialCount: number }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/packs/${encodeURIComponent(slug)}/bookmark`, { method: saved ? "DELETE" : "PUT" });
      const body = await response.json() as { saved?: boolean; bookmarkCount?: number; error?: { message: string } };
      if (!response.ok || typeof body.saved !== "boolean" || typeof body.bookmarkCount !== "number") {
        throw new Error(body.error?.message ?? "Paket kaydedilemedi.");
      }
      setSaved(body.saved); setCount(body.bookmarkCount);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Paket kaydedilemedi.");
    } finally { setPending(false); }
  }

  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" aria-pressed={saved} disabled={pending} onClick={() => void toggle()}
      className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-900 px-4 py-2 text-sm text-zinc-200 transition hover:border-accent-500 hover:text-white disabled:opacity-50">
      <Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />
      {pending ? "Kaydediliyor…" : saved ? "Kaydedilenlerden çıkar" : "Paketi kaydet"}
    </button>
    <span className="text-xs text-zinc-500">{count} kayıt</span>
    {error ? <span role="alert" className="text-sm text-red-400">{error}</span> : null}
  </div>;
}
