"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";

type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: "graphics" | "pvp" | "reshade" | "enb" | "performance" | "known" | "other";
  enabled: boolean;
  sortOrder: number;
  packCount: number;
};

const kinds = ["graphics", "pvp", "reshade", "enb", "performance", "known", "other"] as const;
const inputClass = "h-10 rounded-md border border-line bg-surface-950 px-3 text-sm text-white outline-none focus:border-accent-500";

async function api(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.ok) return;
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(payload?.error?.message ?? "İşlem tamamlanamadı.");
}

export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    setMessage("");
    try {
      await work();
      setMessage("Değişiklik kaydedildi.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-7">
      <section className="rounded-xl border border-line bg-surface-900 p-4" aria-labelledby="new-category-heading">
        <h2 id="new-category-heading" className="font-semibold text-white">Yeni kategori</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void run("create", async () => {
              await api("/api/admin/categories", "POST", {
                name: data.get("name"),
                slug: data.get("slug"),
                kind: data.get("kind"),
                description: data.get("description"),
              });
              form.reset();
            });
          }}
        >
          <input name="name" required minLength={2} maxLength={80} placeholder="Kategori adı" className={inputClass} onBlur={(event) => {
            const slugInput = event.currentTarget.form?.elements.namedItem("slug") as HTMLInputElement | null;
            if (slugInput && !slugInput.value) slugInput.value = slugify(event.currentTarget.value);
          }} />
          <input name="slug" required maxLength={96} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="kategori-slug" className={inputClass} />
          <select name="kind" className={inputClass}>{kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select>
          <button disabled={busy !== null} className="h-10 rounded-md bg-accent-600 px-4 text-sm font-medium text-white disabled:opacity-50">Kategori ekle</button>
          <textarea name="description" maxLength={500} placeholder="Açıklama (isteğe bağlı)" className="min-h-20 rounded-md border border-line bg-surface-950 p-3 text-sm text-white outline-none focus:border-accent-500 md:col-span-2 lg:col-span-4" />
        </form>
      </section>

      <p aria-live="polite" className="min-h-5 text-sm text-zinc-400">{message}</p>
      <div className="space-y-3">
        {categories.map((category) => (
          <form
            key={category.id}
            className="grid gap-3 rounded-xl border border-line bg-surface-900 p-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_10rem_6rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run(category.id, () => api(`/api/admin/categories/${category.id}`, "PATCH", {
                name: data.get("name"), slug: data.get("slug"), kind: data.get("kind"),
                sortOrder: Number(data.get("sortOrder")), enabled: data.get("enabled") === "on",
                description: data.get("description"),
              }));
            }}
          >
            <input name="name" required defaultValue={category.name} className={inputClass} />
            <input name="slug" required defaultValue={category.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={inputClass} />
            <select name="kind" defaultValue={category.kind} className={inputClass}>{kinds.map((kind) => <option key={kind}>{kind}</option>)}</select>
            <input name="sortOrder" type="number" min={0} max={10000} defaultValue={category.sortOrder} className={inputClass} aria-label="Sıra" />
            <label className="flex h-10 items-center gap-2 text-sm text-zinc-400"><input name="enabled" type="checkbox" defaultChecked={category.enabled} className="accent-orange-600" /> Aktif</label>
            <textarea name="description" defaultValue={category.description ?? ""} maxLength={500} className="min-h-16 rounded-md border border-line bg-surface-950 p-3 text-sm text-white outline-none focus:border-accent-500 md:col-span-2 lg:col-span-4" aria-label={`${category.name} açıklaması`} />
            <div className="flex items-center justify-between gap-3 lg:col-span-5">
              <span className="text-xs text-zinc-500">{category.packCount} paket</span>
              <div className="flex gap-2">
                <button type="submit" disabled={busy !== null} className="rounded-md border border-line px-3 py-2 text-xs text-zinc-300 hover:text-white disabled:opacity-50">Kaydet</button>
                <button type="button" disabled={busy !== null || category.packCount > 0} title={category.packCount > 0 ? "Bağlı paket bulunan kategori silinemez" : undefined} onClick={() => {
                  if (window.confirm(`${category.name} kategorisi silinsin mi?`)) void run(`delete-${category.id}`, () => api(`/api/admin/categories/${category.id}`, "DELETE"));
                }} className="rounded-md border border-red-900/60 px-3 py-2 text-xs text-red-400 disabled:opacity-40">Sil</button>
              </div>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
