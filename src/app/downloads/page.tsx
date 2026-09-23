import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { getCurrentSession } from "@/lib/auth-context";
import { formatDate } from "@/lib/utils";
import { getMemberDownloadHistory } from "@/services/packs/downloads";

export const metadata: Metadata = { title: "İndirme geçmişi", robots: { index: false, follow: false } };

const kindLabels = { manual: "Elle indirme", installer: "Kurulumcu", external: "Dış bağlantı" } as const;

export default async function DownloadsPage({ searchParams }: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/downloads");
  if (!session.actor.permissions.has("download.use")) {
    return <PageState code="403" title="İndirme geçmişine erişimin yok" description="İndirme izni gerekiyor." />;
  }
  const { page } = await searchParams;
  const result = await getMemberDownloadHistory(getDatabase().db, session.actor, Number(page ?? 1));
  return <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
    <h1 className="flex items-center gap-2 text-3xl font-semibold text-white"><Download className="size-7 text-accent-400" aria-hidden />İndirme geçmişi</h1>
    <p className="mt-2 text-sm text-zinc-400">Hesabınla yaptığın {result.total} kayıtlı indirme burada. Son 30 dakikada tekrarladığın indirmeler tek kayıt sayılır.</p>
    {result.items.length ? <ol className="mt-7 divide-y divide-line rounded-xl border border-line bg-surface-900">
      {result.items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <Link href={`/packs/${item.slug}`} className="font-medium text-white hover:text-accent-300">{item.title}</Link>
          <p className="mt-1 text-xs text-zinc-500">
            {item.version ? `Sürüm ${item.version} · ` : ""}
            {item.mirror === "primary" ? "Ana bağlantı" : `Ayna: ${item.mirror}`} · {kindLabels[item.kind]}
          </p>
        </div>
        <time dateTime={item.createdAt.toISOString()} className="text-xs text-zinc-500">{formatDate(item.createdAt)}</time>
      </li>)}
    </ol> : <div className="mt-7 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">
      Henüz kayıtlı indirme yok. <Link href="/packs" className="text-accent-400 hover:text-accent-300">Paketlere göz at</Link>
    </div>}
    {result.pageCount > 1 ? <nav aria-label="İndirme sayfaları" className="mt-8 flex items-center justify-center gap-5 text-sm text-zinc-400">
      {result.page > 1 ? <Link href={`/downloads?page=${result.page - 1}`} className="text-accent-400">Önceki</Link> : null}
      <span>{result.page} / {result.pageCount}</span>
      {result.page < result.pageCount ? <Link href={`/downloads?page=${result.page + 1}`} className="text-accent-400">Sonraki</Link> : null}
    </nav> : null}
  </div>;
}
