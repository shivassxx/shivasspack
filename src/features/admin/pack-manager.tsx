"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";

type Category = { id: string; name: string };
type Tag = { id: string; name: string };
type Pack = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  description: string;
  installGuide: string | null;
  categoryId: string;
  categoryName: string;
  creatorName: string;
  publisher: string | null;
  isKnown: boolean;
  sourceType: "internal" | "external" | "github" | "mirror_only";
  license: string | null;
  sourceUrl: string | null;
  distributionPermission: "granted" | "metadata_only" | "unknown";
  status: "draft" | "pending" | "approved" | "rejected" | "changes_requested" | "archived";
  featured: boolean;
  editorPick: boolean;
  recommended: boolean;
  trendingOverride: boolean;
  performanceImpact: "low" | "medium" | "high" | "extreme";
  compatibility: string[];
  fileSizeBytes: string | null;
  fivemVersion: string | null;
  videoUrl: string | null;
  tagIds: string[];
  updatedAt: string;
};

const inputClass = "h-10 rounded-md border border-line bg-surface-950 px-3 text-sm text-white outline-none focus:border-accent-500";
const textAreaClass = "min-h-24 rounded-md border border-line bg-surface-950 p-3 text-sm text-white outline-none focus:border-accent-500";

async function api(path: string, method: string, body?: unknown) {
  const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (response.ok) return;
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(payload?.error?.message ?? "İşlem tamamlanamadı.");
}

function selectedValues(data: FormData, name: string): string[] {
  return data.getAll(name).filter((value): value is string => typeof value === "string");
}

function editPayload(data: FormData, canFeature: boolean) {
  const payload: Record<string, unknown> = {
    title: data.get("title"), slug: data.get("slug"), categoryId: data.get("categoryId"),
    excerpt: data.get("excerpt"), description: data.get("description"), status: data.get("status"),
    installGuide: data.get("installGuide"),
    publisher: data.get("publisher"), sourceType: data.get("sourceType"), sourceUrl: data.get("sourceUrl"),
    license: data.get("license"), distributionPermission: data.get("distributionPermission"),
    performanceImpact: data.get("performanceImpact"), compatibility: String(data.get("compatibility") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    fileSizeBytes: data.get("fileSizeBytes"), fivemVersion: data.get("fivemVersion"), videoUrl: data.get("videoUrl"),
    isKnown: data.get("isKnown") === "on", tagIds: selectedValues(data, "tagIds"),
  };
  if (canFeature) {
    payload.featured = data.get("featured") === "on";
    payload.editorPick = data.get("editorPick") === "on";
    payload.recommended = data.get("recommended") === "on";
    payload.trendingOverride = data.get("trendingOverride") === "on";
  }
  return payload;
}

export function PackManager({
  packs,
  categories,
  tags,
  canPublish,
  canFeature,
  canArchive,
}: {
  packs: Pack[];
  categories: Category[];
  tags: Tag[];
  canPublish: boolean;
  canFeature: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function run(key: string, work: () => Promise<void>) {
    setBusy(key); setMessage("");
    try { await work(); setMessage("Değişiklik kaydedildi."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "İşlem tamamlanamadı."); }
    finally { setBusy(null); }
  }
  return (
    <div className="space-y-7">
      <details className="rounded-xl border border-line bg-surface-900 p-4">
        <summary className="cursor-pointer font-semibold text-white">Yeni taslak oluştur</summary>
        <form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={(event) => {
          event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
          void run("create", async () => {
            await api("/api/admin/packs", "POST", {
              title: data.get("title"), slug: data.get("slug"), categoryId: data.get("categoryId"),
              excerpt: data.get("excerpt"), description: data.get("description"), status: "draft", tagIds: selectedValues(data, "tagIds"),
            });
            form.reset();
          });
        }}>
          <input name="title" required minLength={3} maxLength={120} placeholder="Paket başlığı" className={inputClass} onBlur={(event) => {
            const target = event.currentTarget.form?.elements.namedItem("slug") as HTMLInputElement | null;
            if (target && !target.value) target.value = slugify(event.currentTarget.value);
          }} />
          <input name="slug" required maxLength={96} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="paket-slug" className={inputClass} />
          <select name="categoryId" required className={inputClass}><option value="">Kategori seç</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select name="tagIds" multiple className="min-h-24 rounded-md border border-line bg-surface-950 p-2 text-sm text-white" aria-label="Etiketler">{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
          <textarea name="excerpt" required minLength={10} maxLength={300} placeholder="Kısa özet" className={textAreaClass} />
          <textarea name="description" required minLength={20} maxLength={50000} placeholder="Ayrıntılı açıklama" className={textAreaClass} />
          <button disabled={busy !== null} className="h-10 rounded-md bg-accent-600 px-4 text-sm font-medium text-white disabled:opacity-50 md:col-span-2">Taslak oluştur</button>
        </form>
      </details>

      <p aria-live="polite" className="min-h-5 text-sm text-zinc-400">{message}</p>
      <div className="space-y-3">
        {packs.length === 0 ? <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-zinc-500">Yönetilecek gerçek paket yok.</p> : null}
        {packs.map((pack) => (
          <details key={pack.id} className="rounded-xl border border-line bg-surface-900 p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-semibold text-white">{pack.title}</h2><p className="mt-1 text-xs text-zinc-500">{pack.categoryName} · {pack.creatorName} · {pack.slug}</p></div>
                <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-zinc-400">{pack.status}</span>
              </div>
            </summary>
            <form className="mt-5 grid gap-3 border-t border-line pt-5 md:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => {
              event.preventDefault(); const data = new FormData(event.currentTarget);
              void run(pack.id, () => api(`/api/admin/packs/${pack.id}`, "PATCH", editPayload(data, canFeature)));
            }}>
              <input name="title" required defaultValue={pack.title} className={inputClass} aria-label="Başlık" />
              <input name="slug" required defaultValue={pack.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={inputClass} aria-label="Slug" />
              <select name="categoryId" defaultValue={pack.categoryId} className={inputClass} aria-label="Kategori">{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <textarea name="excerpt" required minLength={10} maxLength={300} defaultValue={pack.excerpt} className={textAreaClass} aria-label="Özet" />
              <textarea name="description" required minLength={20} maxLength={50000} defaultValue={pack.description} className={`${textAreaClass} lg:col-span-2`} aria-label="Açıklama" />
              <textarea name="installGuide" maxLength={50000} defaultValue={pack.installGuide ?? ""} placeholder="Kurulum rehberi (isteğe bağlı, en az 10 karakter)" className={`${textAreaClass} lg:col-span-2`} aria-label="Kurulum rehberi" />
              <select name="status" defaultValue={pack.status} className={inputClass} aria-label="Durum">
                {(["draft", "pending", "changes_requested", "rejected", "archived", ...(canPublish || pack.status === "approved" ? ["approved"] : [])] as const).map((status) => <option key={status}>{status}</option>)}
              </select>
              <select name="sourceType" defaultValue={pack.sourceType} className={inputClass} aria-label="Kaynak türü">{["internal", "external", "github", "mirror_only"].map((item) => <option key={item}>{item}</option>)}</select>
              <select name="distributionPermission" defaultValue={pack.distributionPermission} className={inputClass} aria-label="Dağıtım izni">{["granted", "metadata_only", "unknown"].map((item) => <option key={item}>{item}</option>)}</select>
              <input name="publisher" defaultValue={pack.publisher ?? ""} placeholder="Yayıncı" className={inputClass} />
              <input name="sourceUrl" type="url" defaultValue={pack.sourceUrl ?? ""} placeholder="Kaynak URL" className={inputClass} />
              <input name="license" defaultValue={pack.license ?? ""} placeholder="Lisans" className={inputClass} />
              <select name="performanceImpact" defaultValue={pack.performanceImpact} className={inputClass} aria-label="Performans etkisi">{["low", "medium", "high", "extreme"].map((item) => <option key={item}>{item}</option>)}</select>
              <input name="compatibility" defaultValue={pack.compatibility.join(", ")} placeholder="Uyumluluk (virgülle)" className={inputClass} />
              <input name="fileSizeBytes" type="number" min={0} defaultValue={pack.fileSizeBytes ?? ""} placeholder="Dosya boyutu (byte)" className={inputClass} />
              <input name="fivemVersion" defaultValue={pack.fivemVersion ?? ""} placeholder="FiveM sürümü" className={inputClass} />
              <input name="videoUrl" type="url" defaultValue={pack.videoUrl ?? ""} placeholder="Video URL" className={inputClass} />
              <select name="tagIds" multiple defaultValue={pack.tagIds} className="min-h-24 rounded-md border border-line bg-surface-950 p-2 text-sm text-white" aria-label="Etiketler">{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
              <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-line bg-surface-950 p-3 text-sm text-zinc-400 md:col-span-2 lg:col-span-3">
                <label><input name="isKnown" type="checkbox" defaultChecked={pack.isKnown} className="mr-2 accent-orange-600" />Bilinen</label>
                {canFeature ? <>
                  <label><input name="featured" type="checkbox" defaultChecked={pack.featured} className="mr-2 accent-orange-600" />Öne çıkan</label>
                  <label><input name="editorPick" type="checkbox" defaultChecked={pack.editorPick} className="mr-2 accent-orange-600" />Editör seçimi</label>
                  <label><input name="recommended" type="checkbox" defaultChecked={pack.recommended} className="mr-2 accent-orange-600" />Önerilen</label>
                  <label><input name="trendingOverride" type="checkbox" defaultChecked={pack.trendingOverride} className="mr-2 accent-orange-600" />Trend override</label>
                </> : null}
              </div>
              <div className="flex justify-end gap-2 md:col-span-2 lg:col-span-3">
                <button disabled={busy !== null} className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Kaydet</button>
                {canArchive && pack.status !== "archived" ? <button type="button" disabled={busy !== null} onClick={() => {
                  if (window.confirm(`${pack.title} arşivlensin mi?`)) void run(`archive-${pack.id}`, () => api(`/api/admin/packs/${pack.id}`, "DELETE"));
                }} className="rounded-md border border-red-900/60 px-4 py-2 text-sm text-red-400 disabled:opacity-50">Arşivle</button> : null}
              </div>
            </form>
          </details>
        ))}
      </div>
    </div>
  );
}
