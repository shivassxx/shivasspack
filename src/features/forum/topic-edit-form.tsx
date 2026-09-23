"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";

export function TopicEditForm({ id, slug, title, body }: { id: string; slug: string; title: string; body: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <form className="space-y-5 rounded-xl border border-line bg-surface-900 p-5" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setPending(true);
      void (async () => {
        const result = await requestJson(`/api/forum/topics/${id}`, { method: "PATCH",
          body: { title: String(data.get("title") ?? ""), body: String(data.get("body") ?? "") } });
        setPending(false);
        if (!result.ok) { toast.error(result.message); return; }
        toast.success("Konu güncellendi.");
        router.push(`/forum/topic/${slug}`);
        router.refresh();
      })();
    }}>
      <label className="block text-sm text-zinc-300">Başlık
        <input name="title" required minLength={8} maxLength={160} defaultValue={title} disabled={pending}
          className="mt-2 block h-10 w-full rounded-md border border-line bg-surface-950 px-3 text-white focus:border-accent-500" />
      </label>
      <label className="block text-sm text-zinc-300">Mesaj
        <textarea name="body" required minLength={20} maxLength={10000} rows={10} defaultValue={body} disabled={pending}
          className="mt-2 block w-full rounded-md border border-line bg-surface-950 p-3 text-white focus:border-accent-500" />
      </label>
      <button type="submit" disabled={pending} className="h-10 rounded-md bg-accent-600 px-5 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-60">
        {pending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
      </button>
    </form>
  );
}
