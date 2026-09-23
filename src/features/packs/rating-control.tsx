"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";

export function RatingControl({ slug, initialValue, initialAverage, initialCount }: {
  slug: string; initialValue: number | null; initialAverage: string; initialCount: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue === null ? "" : String(initialValue));
  const [saved, setSaved] = useState(initialValue);
  const [average, setAverage] = useState(initialAverage);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function update(remove: boolean) {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/packs/${encodeURIComponent(slug)}/rate`, remove
        ? { method: "DELETE" }
        : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: Number(value) }) });
      const body = await response.json() as { value?: number | null; ratingAvg?: string; ratingCount?: number; error?: { message: string } };
      if (!response.ok || !("value" in body) || typeof body.ratingAvg !== "string" || typeof body.ratingCount !== "number") {
        throw new Error(body.error?.message ?? "Puan kaydedilemedi.");
      }
      setSaved(body.value ?? null); setAverage(body.ratingAvg); setCount(body.ratingCount);
      if (remove) setValue("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Puan kaydedilemedi.");
    } finally { setPending(false); }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <label htmlFor="pack-rating" className="inline-flex items-center gap-2 text-sm text-zinc-300">
      <Star className="size-4 text-accent-400" aria-hidden />Puanın
    </label>
    <select id="pack-rating" value={value} disabled={pending} onChange={(event) => setValue(event.target.value)}
      className="h-10 rounded-md border border-line bg-surface-900 px-2 text-sm text-white">
      <option value="">Seç</option>
      {[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{number} / 5</option>)}
    </select>
    <button type="button" disabled={pending || !value || Number(value) === saved} onClick={() => void update(false)}
      className="h-10 rounded-md border border-line bg-surface-900 px-3 text-sm text-zinc-200 hover:border-accent-500 disabled:opacity-50">
      {pending ? "Kaydediliyor…" : "Puanı kaydet"}
    </button>
    {saved !== null ? <button type="button" disabled={pending} onClick={() => void update(true)} className="text-xs text-accent-400 disabled:opacity-50">Puanı kaldır</button> : null}
    <span className="text-xs text-zinc-500">{count ? `${average} / 5 · ${count} oy` : "Henüz oy yok"}</span>
    {error ? <span role="alert" className="text-sm text-red-400">{error}</span> : null}
  </div>;
}
