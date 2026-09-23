import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { PackCard } from "@/features/packs/pack-card";
import { getCurrentSession } from "@/lib/auth-context";
import { getMemberBookmarks } from "@/services/packs/bookmarks";

export const metadata: Metadata = { title: "Kaydedilen paketler", robots: { index: false, follow: false } };

export default async function BookmarksPage({ searchParams }: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/bookmarks");
  if (!session.actor.permissions.has("pack.view")) {
    return <PageState code="403" title="Kaydedilen paketlere erişimin yok" description="Paketleri görüntüleme izni gerekiyor." />;
  }
  const { page } = await searchParams;
  const result = await getMemberBookmarks(getDatabase().db, session.actor, Number(page ?? 1));
  return <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-semibold text-white">Kaydedilen paketler</h1>
    <p className="mt-2 text-sm text-zinc-400">Yayındaki {result.total} kaydın burada. Arşivlenen veya erişimi kapanan paketler gösterilmez.</p>
    {result.items.length ? <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {result.items.map((pack) => <PackCard key={pack.id} pack={pack} />)}
    </div> : <div className="mt-7 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">
      {result.total ? "Bu sayfada kayıt yok." : "Henüz bir paket kaydetmedin."} <Link href="/packs" className="text-accent-400 hover:text-accent-300">Paketlere göz at</Link>
    </div>}
    {result.pageCount > 1 ? <nav aria-label="Kaydedilen paket sayfaları" className="mt-8 flex items-center justify-center gap-5 text-sm text-zinc-400">
      {result.page > 1 ? <Link href={`/bookmarks?page=${result.page - 1}`} className="text-accent-400">Önceki</Link> : null}
      <span>{result.page} / {result.pageCount}</span>
      {result.page < result.pageCount ? <Link href={`/bookmarks?page=${result.page + 1}`} className="text-accent-400">Sonraki</Link> : null}
    </nav> : null}
  </div>;
}
