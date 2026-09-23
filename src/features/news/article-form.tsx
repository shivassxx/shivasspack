"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toaster";
import { requestJson } from "@/lib/client-api";
import type { getAdminNewsArticle, listNewsCategories } from "@/services/news";

type Article = NonNullable<Awaited<ReturnType<typeof getAdminNewsArticle>>>;
type Category = Awaited<ReturnType<typeof listNewsCategories>>[number];

export function ArticleForm({ article, categories }: { article?: Article; categories: Category[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const inputClass = "mt-1 block w-full rounded-md border border-line bg-surface-950 p-2 text-sm text-white focus:border-accent-500";
  return <form className="space-y-4 rounded-xl border border-line bg-surface-900 p-5" onSubmit={(event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const body = Object.fromEntries(["title", "excerpt", "content", "categoryId", "sourceUrl", "seoTitle", "seoDescription"]
      .map((key) => [key, String(fields.get(key) ?? "")]));
    setPending(true);
    void (async () => {
      const result = await requestJson(article ? `/api/admin/news/${article.id}` : "/api/admin/news", {
        method: article ? "PATCH" : "POST", body,
      });
      setPending(false);
      if (!result.ok) { toast.error(result.message); return; }
      toast.success(article ? "Haber kaydedildi." : "Haber taslağı oluşturuldu.");
      router.push("/admin/news");
      router.refresh();
    })();
  }}>
    <label className="block text-sm text-zinc-300">Başlık
      <input name="title" required minLength={8} maxLength={160} defaultValue={article?.title} disabled={pending} className={inputClass} />
    </label>
    <label className="block text-sm text-zinc-300">Özet
      <textarea name="excerpt" required minLength={20} maxLength={500} defaultValue={article?.excerpt} disabled={pending} rows={3} className={inputClass} />
    </label>
    <label className="block text-sm text-zinc-300">İçerik
      <textarea name="content" required minLength={50} maxLength={50_000} defaultValue={article?.content} disabled={pending} rows={14} className={inputClass} />
    </label>
    <label className="block text-sm text-zinc-300">Kategori
      <select name="categoryId" required defaultValue={article?.categoryId ?? categories[0]?.id} disabled={pending} className={inputClass}>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
    </label>
    <label className="block text-sm text-zinc-300">Kaynak URL (isteğe bağlı)
      <input name="sourceUrl" type="url" maxLength={2048} defaultValue={article?.sourceUrl ?? ""} disabled={pending} className={inputClass} />
    </label>
    <label className="block text-sm text-zinc-300">SEO başlığı (isteğe bağlı)
      <input name="seoTitle" maxLength={160} defaultValue={article?.seoTitle ?? ""} disabled={pending} className={inputClass} />
    </label>
    <label className="block text-sm text-zinc-300">SEO açıklaması (isteğe bağlı)
      <textarea name="seoDescription" maxLength={300} defaultValue={article?.seoDescription ?? ""} disabled={pending} rows={2} className={inputClass} />
    </label>
    <button type="submit" disabled={pending} className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-60">
      {pending ? "Kaydediliyor…" : article ? "Değişiklikleri kaydet" : "Taslak oluştur"}
    </button>
  </form>;
}
