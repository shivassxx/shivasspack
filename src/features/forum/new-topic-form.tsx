"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";

export function NewTopicForm({ categories, initialCategory }: {
  categories: { id: string; slug: string; name: string }[];
  initialCategory?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const initialId = categories.find((category) => category.slug === initialCategory)?.id ?? categories[0]?.id ?? "";
  return (
    <form className="space-y-5 rounded-xl border border-line bg-surface-900 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        void (async () => {
          const result = await requestJson<{ topic: { slug: string } }>("/api/forum/topics", {
            method: "POST",
            body: {
              categoryId: String(data.get("categoryId") ?? ""),
              title: String(data.get("title") ?? ""),
              body: String(data.get("body") ?? ""),
            },
          });
          setPending(false);
          if (!result.ok) { toast.error(result.message); return; }
          toast.success("Konu açıldı.");
          router.push(`/forum/topic/${result.data.topic.slug}`);
          router.refresh();
        })();
      }}>
      <label className="block text-sm text-zinc-300">Kategori
        <select name="categoryId" required defaultValue={initialId} disabled={pending}
          className="mt-2 block h-10 w-full rounded-md border border-line bg-surface-950 px-3 text-white focus:border-accent-500">
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <label className="block text-sm text-zinc-300">Başlık
        <input name="title" required minLength={8} maxLength={160} disabled={pending} placeholder="Konunun kısa ve açıklayıcı başlığı"
          className="mt-2 block h-10 w-full rounded-md border border-line bg-surface-950 px-3 text-white focus:border-accent-500" />
      </label>
      <label className="block text-sm text-zinc-300">Mesaj
        <textarea name="body" required minLength={20} maxLength={10000} disabled={pending} rows={10}
          placeholder="Sorunu, deneyimini veya önerini anlat."
          className="mt-2 block w-full rounded-md border border-line bg-surface-950 p-3 text-white focus:border-accent-500" />
      </label>
      <button type="submit" disabled={pending}
        className="inline-flex h-10 items-center rounded-md bg-accent-600 px-5 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-60">
        {pending ? "Oluşturuluyor…" : "Konuyu aç"}
      </button>
    </form>
  );
}
