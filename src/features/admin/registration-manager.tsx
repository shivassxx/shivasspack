"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegistrationManager({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const payload = await response.json() as { registrations?: { enabled: boolean }; error?: { message: string } };
      if (!response.ok || !payload.registrations) throw new Error(payload.error?.message ?? "Ayar kaydedilemedi.");
      setEnabled(payload.registrations.enabled);
      setMessage("Kayıt ayarı güncellendi.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ayar kaydedilemedi."); }
    finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="settings-heading" className="max-w-xl space-y-5 rounded-xl border border-line bg-surface-900 p-5">
      <div><h2 id="settings-heading" className="text-lg font-semibold text-white">Yeni üyelikler</h2>
        <p className="mt-1 text-sm text-zinc-400">Kapalıyken yeni hesap oluşturulamaz; mevcut hesaplar giriş yapmaya devam edebilir.</p></div>
      <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => { setEnabled(event.target.checked); setMessage(""); }} className="size-4 accent-orange-500" /> Kayıtlara izin ver</label>
      <button type="button" disabled={busy} onClick={() => void save()} className="rounded-md bg-accent-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Kaydediliyor…" : "Ayarı kaydet"}</button>
      <p role="status" className="text-sm text-zinc-400">{message}</p>
    </section>
  );
}
