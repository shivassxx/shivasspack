import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import type { PackListResult, PublicCategory } from "@/services/packs/public";
import { PackCard } from "./pack-card";

function listingHref(
  basePath: string,
  filters: PackListResult["filters"],
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.known) params.set("known", "1");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function PackListing({
  title,
  description,
  basePath,
  result,
  categories,
  showCategories = true,
}: {
  title: string;
  description: string;
  basePath: string;
  result: PackListResult;
  categories: PublicCategory[];
  showCategories?: boolean;
}) {
  const hasFilters = Boolean(result.filters.q || result.filters.known || result.filters.sort !== "newest");
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent-400">Paket kataloğu</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 leading-7 text-zinc-400">{description}</p>
      </header>

      {showCategories ? (
        <nav aria-label="Paket kategorileri" className="mt-7 flex gap-2 overflow-x-auto pb-2">
          <Link href="/packs" aria-current={!result.filters.category ? "page" : undefined} className="shrink-0 rounded-full border border-line bg-surface-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-accent-500/40 hover:text-white">
            Tümü
          </Link>
          {categories.map((category) => (
            <Link key={category.slug} href={`/packs/category/${category.slug}`} className="shrink-0 rounded-full border border-line bg-surface-900 px-3 py-1.5 text-xs text-zinc-400 hover:border-accent-500/40 hover:text-white">
              {category.name} <span className="text-zinc-600">{category.packCount}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <form action={basePath} method="get" className="mt-6 grid gap-3 rounded-xl border border-line bg-surface-900 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <label className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-surface-950 px-3 focus-within:border-accent-500">
          <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />
          <span className="sr-only">Paket ara</span>
          <input name="q" defaultValue={result.filters.q} maxLength={80} placeholder="Paket, açıklama veya özellik ara…" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" />
        </label>
        <label className="flex items-center gap-2 rounded-md border border-line bg-surface-950 px-3 text-sm text-zinc-400">
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="sr-only">Sıralama</span>
          <select name="sort" defaultValue={result.filters.sort} className="h-10 bg-surface-950 text-sm text-zinc-300 outline-none">
            <option value="newest">En yeni</option>
            <option value="trending">Trend</option>
            <option value="rating">En yüksek puan</option>
            <option value="downloads">En çok indirilen</option>
          </select>
        </label>
        <label className="flex h-12 items-center gap-2 rounded-md border border-line bg-surface-950 px-3 text-sm text-zinc-400">
          <input type="checkbox" name="known" value="1" defaultChecked={result.filters.known} className="size-4 accent-orange-600" />
          Bilinenler
        </label>
        <button type="submit" className="h-12 rounded-md bg-accent-600 px-5 text-sm font-medium text-white transition hover:bg-accent-500">Uygula</button>
      </form>

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-500"><strong className="font-medium text-zinc-300">{result.total}</strong> yayınlanmış paket</p>
        {hasFilters ? <Link href={basePath} className="text-xs text-accent-400 hover:text-accent-300">Filtreleri temizle</Link> : null}
      </div>

      {result.items.length > 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.items.map((pack) => <PackCard key={pack.id} pack={pack} />)}
        </div>
      ) : (
        <section className="mt-5 rounded-xl border border-dashed border-line bg-surface-900/60 px-6 py-16 text-center">
          <h2 className="font-medium text-white">{hasFilters ? "Eşleşen paket bulunamadı" : "Henüz yayınlanmış paket yok"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
            {hasFilters ? "Arama veya sıralama seçeneklerini değiştirerek tekrar deneyin." : "İncelenip onaylanan paketler burada listelenecek."}
          </p>
        </section>
      )}

      {result.pageCount > 1 ? (
        <nav aria-label="Sayfalama" className="mt-8 flex items-center justify-center gap-2">
          {result.page > 1 ? <Link href={listingHref(basePath, result.filters, result.page - 1)} className="rounded-md border border-line px-3 py-2 text-sm text-zinc-300 hover:text-white">Önceki</Link> : null}
          <span className="px-3 py-2 text-sm text-zinc-500">{result.page} / {result.pageCount}</span>
          {result.page < result.pageCount ? <Link href={listingHref(basePath, result.filters, result.page + 1)} className="rounded-md border border-line px-3 py-2 text-sm text-zinc-300 hover:text-white">Sonraki</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
