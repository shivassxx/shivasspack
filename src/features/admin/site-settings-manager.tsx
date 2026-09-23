"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SettingInput = { enabled: boolean } | { siteName: string } | { siteDescription: string };

async function saveSetting(input: SettingInput) {
  const response = await fetch("/api/admin/settings", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  const payload = await response.json() as {
    registrations?: { enabled: boolean }; siteName?: string; siteDescription?: string; error?: { message: string };
  };
  if (!response.ok) throw new Error(payload.error?.message ?? "Ayar kaydedilemedi.");
  return payload;
}

export function SiteSettingsManager({ initialEnabled, initialName, initialDescription }: { initialEnabled: boolean; initialName: string; initialDescription: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(input: SettingInput) {
    setBusy(true); setMessage("");
    try {
      const result = await saveSetting(input);
      if (result.registrations) setEnabled(result.registrations.enabled);
      if (result.siteName) setName(result.siteName);
      if (result.siteDescription) setDescription(result.siteDescription);
      setMessage("Ayar güncellendi.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ayar kaydedilemedi."); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-xl space-y-5">
      <form aria-labelledby="site-name-heading" onSubmit={(event) => { event.preventDefault(); void save({ siteName: name }); }} className="space-y-4 rounded-xl border border-line bg-surface-900 p-5">
        <div><h2 id="site-name-heading" className="text-lg font-semibold text-white">Site adı</h2>
          <p className="mt-1 text-sm text-zinc-400">Başlık, üst menü, alt bilgi ve ana sayfada görünür.</p></div>
        <label htmlFor="site-name" className="block text-sm text-zinc-300">Görünen ad</label>
        <input id="site-name" value={name} onChange={(event) => { setName(event.target.value); setMessage(""); }} minLength={3} maxLength={64} required disabled={busy} className="h-10 w-full rounded-md border border-line bg-surface-950 px-3 text-sm text-white outline-none focus:border-accent-500" />
        <button disabled={busy} className="rounded-md bg-accent-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">Site adını kaydet</button>
      </form>
      <form aria-labelledby="site-description-heading" onSubmit={(event) => { event.preventDefault(); void save({ siteDescription: description }); }} className="space-y-4 rounded-xl border border-line bg-surface-900 p-5">
        <div><h2 id="site-description-heading" className="text-lg font-semibold text-white">Site açıklaması</h2>
          <p className="mt-1 text-sm text-zinc-400">Arama/sosyal paylaşım açıklamasında ve alt bilgide görünür. Özelleştirilmemiş karşılama açıklaması da bunu kullanır.</p></div>
        <label htmlFor="site-description" className="block text-sm text-zinc-300">Varsayılan açıklama</label>
        <textarea id="site-description" value={description} onChange={(event) => { setDescription(event.target.value); setMessage(""); }} minLength={20} maxLength={320} rows={4} required disabled={busy} className="w-full rounded-md border border-line bg-surface-950 p-3 text-sm text-white outline-none focus:border-accent-500" />
        <button disabled={busy} className="rounded-md bg-accent-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">Açıklamayı kaydet</button>
      </form>
      <section aria-labelledby="settings-heading" className="space-y-5 rounded-xl border border-line bg-surface-900 p-5">
        <div><h2 id="settings-heading" className="text-lg font-semibold text-white">Yeni üyelikler</h2>
          <p className="mt-1 text-sm text-zinc-400">Kapalıyken yeni hesap oluşturulamaz; mevcut hesaplar giriş yapmaya devam edebilir.</p></div>
        <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => { setEnabled(event.target.checked); setMessage(""); }} className="size-4 accent-orange-500" /> Kayıtlara izin ver</label>
        <button type="button" disabled={busy} onClick={() => void save({ enabled })} className="rounded-md bg-accent-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">Kayıt ayarını kaydet</button>
      </section>
      <p role="status" className="text-sm text-zinc-400">{message}</p>
    </div>
  );
}
