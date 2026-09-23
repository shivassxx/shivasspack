"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";

type Tag = { id: string; slug: string; name: string; usageCount: number };
const inputClass = "h-10 rounded-md border border-line bg-surface-950 px-3 text-sm text-white outline-none focus:border-accent-500";

async function api(path: string, method: string, body?: unknown) {
  const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (response.ok) return;
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(payload?.error?.message ?? "İşlem tamamlanamadı.");
}

export function TagManager({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); setMessage("Değişiklik kaydedildi."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-6">
      <form className="grid gap-3 rounded-xl border border-line bg-surface-900 p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        void run(async () => { await api("/api/admin/tags", "POST", { name: data.get("name"), slug: data.get("slug") }); form.reset(); });
      }}>
        <input name="name" required maxLength={60} placeholder="Etiket adı" className={inputClass} onBlur={(event) => {
          const slugInput = event.currentTarget.form?.elements.namedItem("slug") as HTMLInputElement | null;
          if (slugInput && !slugInput.value) slugInput.value = slugify(event.currentTarget.value);
        }} />
        <input name="slug" required maxLength={96} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="etiket-slug" className={inputClass} />
        <button disabled={busy} className="rounded-md bg-accent-600 px-4 text-sm font-medium text-white disabled:opacity-50">Etiket ekle</button>
      </form>
      <p aria-live="polite" className="min-h-5 text-sm text-zinc-400">{message}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {tags.map((tag) => (
          <form key={tag.id} className="grid gap-3 rounded-xl border border-line bg-surface-900 p-4 sm:grid-cols-2" onSubmit={(event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget);
            void run(() => api(`/api/admin/tags/${tag.id}`, "PATCH", { name: data.get("name"), slug: data.get("slug") }));
          }}>
            <input name="name" required defaultValue={tag.name} className={inputClass} />
            <input name="slug" required defaultValue={tag.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={inputClass} />
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <span className="text-xs text-zinc-500">{tag.usageCount} kullanım</span>
              <div className="flex gap-2">
                <button disabled={busy} className="rounded-md border border-line px-3 py-2 text-xs text-zinc-300 disabled:opacity-50">Kaydet</button>
                <button type="button" disabled={busy} onClick={() => {
                  if (window.confirm(`${tag.name} etiketi silinsin mi? Paket bağlantıları da kaldırılır.`)) void run(() => api(`/api/admin/tags/${tag.id}`, "DELETE"));
                }} className="rounded-md border border-red-900/60 px-3 py-2 text-xs text-red-400 disabled:opacity-50">Sil</button>
              </div>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
