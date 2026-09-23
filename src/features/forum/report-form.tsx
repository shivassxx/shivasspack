"use client";

import { useState } from "react";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";

export function ForumReportForm({ targetType, targetId }: { targetType: "topic" | "reply"; targetId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  if (!expanded) return <button type="button" onClick={() => setExpanded(true)}
    className="mt-2 text-xs text-zinc-400 hover:text-accent-300">Bildir</button>;
  return <form className="mt-3 space-y-2 rounded-lg border border-line bg-surface-950 p-3" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    void (async () => {
      const result = await requestJson("/api/forum/reports", { method: "POST", body: {
        targetType, targetId, reason: String(data.get("reason") ?? ""), details: String(data.get("details") ?? ""),
      } });
      setPending(false);
      if (!result.ok) { toast.error(result.message); return; }
      toast.success("Bildirim moderasyon kuyruğuna iletildi.");
      setExpanded(false);
    })();
  }}>
    <label className="block text-xs text-zinc-300">Bildirim gerekçesi
      <input name="reason" required minLength={10} maxLength={500} disabled={pending}
        className="mt-1 block h-9 w-full rounded-md border border-line bg-surface-900 px-2 text-sm text-white" placeholder="İçerikle ilgili sorunu açıkla" />
    </label>
    <label className="block text-xs text-zinc-300">Ek bilgi (isteğe bağlı)
      <textarea name="details" rows={2} maxLength={2000} disabled={pending}
        className="mt-1 block w-full rounded-md border border-line bg-surface-900 p-2 text-sm text-white" />
    </label>
    <div className="flex gap-3 text-xs">
      <button type="submit" disabled={pending} className="text-accent-400 disabled:opacity-60">{pending ? "Gönderiliyor…" : "Bildirimi gönder"}</button>
      <button type="button" disabled={pending} onClick={() => setExpanded(false)} className="text-zinc-400">Vazgeç</button>
    </div>
  </form>;
}
