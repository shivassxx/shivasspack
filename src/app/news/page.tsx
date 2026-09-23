import type { Metadata } from "next";
import Link from "next/link";
import { getDatabase } from "@/db/client";
import { formatDate } from "@/lib/utils";
import { listPublishedNews, newsPage } from "@/services/news";

export const metadata: Metadata = { title: "Haberler", description: "FiveM paketleri ve topluluktan güncel haberler.",
  alternates: { canonical: "/news" } };

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = newsPage((await searchParams).page);
  const result = await listPublishedNews(getDatabase().db, page);
  return <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-semibold text-white">Haberler</h1>
    <p className="mt-2 text-sm text-zinc-400">FiveM ve topluluk dünyasından rehberler, haberler ve duyurular.</p>
    {result.items.length ? <ul className="mt-8 space-y-4">{result.items.map((item) =>
      <li key={item.id} className="rounded-xl border border-line bg-surface-900 p-5 hover:border-accent-500/50">
        <p className="text-xs text-zinc-400">{item.categoryName} · {item.publishedAt ? formatDate(item.publishedAt) : ""}</p>
        <h2 className="mt-2 text-xl font-semibold text-white"><Link href={`/news/${item.slug}`} className="hover:text-accent-300">{item.title}</Link></h2>
        <p className="mt-2 text-sm text-zinc-300">{item.excerpt}</p>
      </li>)}</ul> : <p className="mt-8 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">Henüz yayımlanmış haber yok.</p>}
    {result.pageCount > 1 ? <nav aria-label="Haber sayfaları" className="mt-6 flex items-center gap-4 text-sm">
      {result.page > 1 ? <Link href={`/news?page=${result.page - 1}`} className="text-accent-400">Önceki</Link> : null}
      <span className="text-zinc-400">{result.page} / {result.pageCount}</span>
      {result.page < result.pageCount ? <Link href={`/news?page=${result.page + 1}`} className="text-accent-400">Sonraki</Link> : null}
    </nav> : null}
  </main>;
}
