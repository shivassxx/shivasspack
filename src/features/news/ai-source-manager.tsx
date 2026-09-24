"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toaster";
import { requestJson } from "@/lib/client-api";
import type { listAiSources } from "@/services/ai-sources";
import type { FeedItem } from "@/lib/news-feed";

type Source = Awaited<ReturnType<typeof listAiSources>>[number];

export function AiSourceManager({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; items: FeedItem[] } | null>(null);
  async function save(form: HTMLFormElement, id?: string) {
    const data = new FormData(form);
    setPending(id ?? "new");
    const response = await requestJson(id ? `/api/admin/ai-sources/${id}` : "/api/admin/ai-sources", {
      method: id ? "PATCH" : "POST", body: {
        name: String(data.get("name") ?? ""), url: String(data.get("url") ?? ""),
        intervalMinutes: Number(data.get("intervalMinutes")), language: String(data.get("language") ?? ""),
        enabled: data.has("enabled"), trusted: data.has("trusted"),
      },
    });
    setPending(null);
    if (!response.ok) { toast.error(response.message); return; }
    toast.success(id ? "Kaynak güncellendi." : "Kaynak eklendi.");
    if (!id) form.reset();
    setEditing(null);
    router.refresh();
  }
  async function remove(id: string) {
    setPending(id);
    const result = await requestJson(`/api/admin/ai-sources/${id}`, { method: "DELETE" });
    setPending(null);
    if (!result.ok) { toast.error(result.message); return; }
    toast.success("Kaynak silindi.");
    router.refresh();
  }
  async function showPreview(id: string) {
    setPending(id);
    const result = await requestJson<{ items: FeedItem[] }>(`/api/admin/ai-sources/${id}/preview`, { method: "POST" });
    setPending(null);
    if (!result.ok) { toast.error(result.message); return; }
    setPreview({ id, items: result.data.items });
  }
  async function checkSource(id: string) {
    setPending(id);
    const result = await requestJson<{ found: number; queued: number }>(`/api/admin/ai-sources/${id}/check`, { method: "POST" });
    setPending(null);
    if (!result.ok) { toast.error(result.message); return; }
    toast.success(`${result.data.found} başlık kontrol edildi, ${result.data.queued} taslak işi kuyruğa alındı.`);
    router.refresh();
  }
  return <section>
    <h2 className="text-xl font-semibold text-white">AI haber kaynakları</h2>
    <p className="mt-2 text-sm text-zinc-400">Kaynak adreslerini ve kontrol aralıklarını yönet. Etkin olmayan kaynaklar kontrol kapsamına alınmaz.</p>
    <div className="mt-6 rounded-xl border border-line bg-surface-900 p-5">
      <h3 className="mb-4 font-medium text-white">Yeni kaynak ekle</h3>
      <SourceForm onSave={(form) => void save(form)} pending={pending !== null} />
    </div>
    <ul className="mt-6 space-y-3">{sources.map((source) => <li key={source.id} className="rounded-xl border border-line bg-surface-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold text-white">{source.name}</h3>
          <p className="mt-1 break-all text-xs text-zinc-400">{source.url}</p>
          <p className="mt-1 text-xs text-zinc-500">{source.enabled ? "Etkin" : "Kapalı"} · {source.trusted ? "Güvenilir" : "Standart"} · {source.intervalMinutes} dk · {source.language}{source.lastCheckedAt ? ` · Son kontrol: ${new Date(source.lastCheckedAt).toLocaleString("tr-TR")}` : ""}</p></div>
        <div className="flex gap-2 text-xs">
          <button type="button" disabled={pending !== null} onClick={() => void showPreview(source.id)} className="rounded-md border border-line px-3 py-1.5 text-white disabled:opacity-60">Önizle</button>
          {source.enabled ? <button type="button" disabled={pending !== null} onClick={() => void checkSource(source.id)} className="rounded-md border border-line px-3 py-1.5 text-white disabled:opacity-60">Kontrol et</button> : null}
          <button type="button" disabled={pending !== null} onClick={() => setEditing(editing === source.id ? null : source.id)} className="rounded-md border border-line px-3 py-1.5 text-white disabled:opacity-60">{editing === source.id ? "Vazgeç" : "Düzenle"}</button>
          <button type="button" disabled={pending !== null} onClick={() => void remove(source.id)} className="rounded-md border border-line px-3 py-1.5 text-white disabled:opacity-60">Sil</button>
        </div>
      </div>
      {preview?.id === source.id ? <div className="mt-4 border-t border-line pt-3 text-sm">
        <h4 className="font-medium text-white">Kaynak önizlemesi</h4>
        {preview.items.length ? <ul className="mt-2 space-y-2">{preview.items.map((item) => <li key={item.url}>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:text-accent-300">{item.title}</a>
          {item.summary ? <p className="text-xs text-zinc-400">{item.summary}</p> : null}
        </li>)}</ul> : <p className="mt-2 text-zinc-400">Kaynakta uygun içerik yok.</p>}
      </div> : null}
      {editing === source.id ? <div className="mt-5 border-t border-line pt-4"><SourceForm source={source} onSave={(form) => void save(form, source.id)} pending={pending !== null} /></div> : null}
    </li>)}</ul>
    {!sources.length ? <p className="mt-5 rounded-xl border border-line p-5 text-sm text-zinc-400">Henüz haber kaynağı eklenmedi.</p> : null}
  </section>;
}

function SourceForm({ source, onSave, pending }: { source?: Source; onSave: (form: HTMLFormElement) => void; pending: boolean }) {
  const input = "mt-1 block w-full rounded-md border border-line bg-surface-950 px-2 py-1.5 text-sm text-white";
  return <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave(event.currentTarget); }}>
    <label className="text-xs text-zinc-300">Ad <input name="name" required minLength={3} maxLength={120} defaultValue={source?.name} disabled={pending} className={input} /></label>
    <label className="text-xs text-zinc-300">HTTP(S) kaynak URL <input name="url" type="url" required maxLength={2048} defaultValue={source?.url} disabled={pending} className={input} /></label>
    <label className="text-xs text-zinc-300">Kontrol aralığı (dk) <input name="intervalMinutes" type="number" min={5} max={1440} required defaultValue={source?.intervalMinutes ?? 60} disabled={pending} className={input} /></label>
    <label className="text-xs text-zinc-300">Dil <select name="language" defaultValue={source?.language ?? "tr"} disabled={pending} className={input}><option value="tr">Türkçe</option><option value="en">İngilizce</option></select></label>
    <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" name="enabled" defaultChecked={source?.enabled ?? false} disabled={pending} /> Etkin</label>
    <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" name="trusted" defaultChecked={source?.trusted ?? false} disabled={pending} /> Güvenilir kaynak</label>
    <div className="sm:col-span-2"><button type="submit" disabled={pending} className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Kaydediliyor…" : source ? "Kaydet" : "Kaynağı ekle"}</button></div>
  </form>;
}
