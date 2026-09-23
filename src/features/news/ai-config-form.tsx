"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toaster";
import { requestJson } from "@/lib/client-api";
import type { getAiConfig } from "@/services/ai-sources";

type Config = Awaited<ReturnType<typeof getAiConfig>>;

export function AiConfigForm({ config }: { config: Config }) {
  const [pending, setPending] = useState(false);
  return <form className="mb-7 space-y-3 rounded-xl border border-line bg-surface-900 p-5" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    void (async () => {
      const result = await requestJson("/api/admin/ai-config", { method: "PUT", body: {
        provider: String(form.get("provider") ?? "none"), model: String(form.get("model") ?? ""),
        prompt: String(form.get("prompt") ?? ""), minConfidence: Number(form.get("minConfidence")),
      } });
      setPending(false);
      if (!result.ok) { toast.error(result.message); return; }
      toast.success("AI ayarları kaydedildi.");
    })();
  }}>
    <h2 className="text-lg font-semibold text-white">Sağlayıcı ayarları</h2>
    <p className="text-xs text-zinc-400">Sağlayıcı API anahtarı yalnızca sunucu ortamında saklanır. Otomatik yayımlama kapalıdır.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-zinc-300">Sağlayıcı
        <select name="provider" defaultValue={config.provider} disabled={pending}
          className="mt-1 block w-full rounded-md border border-line bg-surface-950 p-2 text-sm text-white">
          <option value="none">Kapalı</option><option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option><option value="gemini">Gemini</option>
        </select>
      </label>
      <label className="text-xs text-zinc-300">Model
        <input name="model" defaultValue={config.model ?? ""} maxLength={120} disabled={pending}
          className="mt-1 block w-full rounded-md border border-line bg-surface-950 p-2 text-sm text-white" />
      </label>
      <label className="text-xs text-zinc-300">Güven eşiği (0-1)
        <input name="minConfidence" type="number" min={0} max={1} step={0.001} required defaultValue={config.minConfidence} disabled={pending}
          className="mt-1 block w-full rounded-md border border-line bg-surface-950 p-2 text-sm text-white" />
      </label>
      <label className="text-xs text-zinc-300 sm:col-span-2">Ek editoryal yönerge
        <textarea name="prompt" maxLength={5000} rows={4} defaultValue={config.prompt} disabled={pending}
          className="mt-1 block w-full rounded-md border border-line bg-surface-950 p-2 text-sm text-white" />
      </label>
    </div>
    <button type="submit" disabled={pending} className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Kaydediliyor…" : "Ayarları kaydet"}</button>
  </form>;
}
