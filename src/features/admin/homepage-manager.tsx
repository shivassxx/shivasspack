"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HomepageSection } from "@/services/homepage";

const labels: Record<HomepageSection["key"], string> = {
  hero: "Karşılama", featured: "Öne çıkanlar", trending: "Popüler paketler", known: "Bilinen paketler",
};

export function HomepageManager({ initialSections }: { initialSections: HomepageSection[] }) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function move(index: number, change: number) {
    const next = [...sections];
    const current = next[index];
    const target = next[index + change];
    if (!current || !target) return;
    next[index] = target;
    next[index + change] = current;
    setSections(next);
    setMessage("");
  }

  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/homepage", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: sections.map(({ key, enabled }) => ({ key, enabled })) }),
      });
      const payload = await response.json() as { sections?: HomepageSection[]; error?: { message: string } };
      if (!response.ok || !payload.sections) throw new Error(payload.error?.message ?? "Değişiklik kaydedilemedi.");
      setSections(payload.sections);
      setMessage("Ana sayfa güncellendi.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Değişiklik kaydedilemedi.");
    } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="homepage-heading" className="space-y-5">
      <div><h2 id="homepage-heading" className="text-lg font-semibold text-white">Ana sayfa bölümleri</h2>
        <p className="mt-1 text-sm text-zinc-400">Yalnızca çalışan bölümler listelenir. Kategoriler ve bilgi alanı her zaman görünür.</p></div>
      <ol className="space-y-2">
        {sections.map((section, index) => (
          <li key={section.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-900 p-4">
            <label className="flex items-center gap-3 text-sm text-white">
              <input type="checkbox" checked={section.enabled} disabled={busy} onChange={(event) => {
                setSections(sections.map((item) => item.key === section.key ? { ...item, enabled: event.target.checked } : item));
                setMessage("");
              }} className="size-4 accent-orange-500" />{labels[section.key]}
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`${labels[section.key]} yukarı`} className="rounded-md border border-line px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-40">Yukarı</button>
              <button type="button" disabled={busy || index === sections.length - 1} onClick={() => move(index, 1)} aria-label={`${labels[section.key]} aşağı`} className="rounded-md border border-line px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-40">Aşağı</button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" disabled={busy} onClick={() => void save()} className="rounded-md bg-accent-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Kaydediliyor…" : "Bölümleri kaydet"}</button>
      <p role="status" className="text-sm text-zinc-400">{message}</p>
    </section>
  );
}
