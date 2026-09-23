import Link from "next/link";
import { Download, Eye, Gauge, Star } from "lucide-react";
import type { PackListItem } from "@/services/packs/public";
import { formatBytes, formatCompact } from "@/lib/utils";

const kindLabels: Record<PackListItem["kind"], string> = {
  graphics: "Grafik",
  pvp: "PvP",
  reshade: "ReShade",
  enb: "ENB",
  performance: "Performans",
  known: "Bilinen",
  other: "Diğer",
};

const impactLabels: Record<PackListItem["performanceImpact"], string> = {
  low: "Düşük etki",
  medium: "Orta etki",
  high: "Yüksek etki",
  extreme: "Çok yüksek etki",
};

const kindTone: Record<PackListItem["kind"], string> = {
  graphics: "from-violet-500/25 via-surface-900 to-surface-900",
  pvp: "from-red-500/20 via-surface-900 to-surface-900",
  reshade: "from-pink-500/20 via-surface-900 to-surface-900",
  enb: "from-cyan-500/20 via-surface-900 to-surface-900",
  performance: "from-emerald-500/20 via-surface-900 to-surface-900",
  known: "from-amber-500/20 via-surface-900 to-surface-900",
  other: "from-zinc-500/20 via-surface-900 to-surface-900",
};

export function PackCard({ pack }: { pack: PackListItem }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface-900 transition hover:border-accent-500/40">
      <Link
        href={`/packs/${pack.slug}`}
        className={`relative block h-32 border-b border-line bg-gradient-to-br ${kindTone[pack.kind]} p-4`}
        aria-label={`${pack.title} paketini aç`}
      >
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-semibold text-zinc-200">
            {kindLabels[pack.kind]}
          </span>
          {pack.editorPick ? <span className="rounded-full bg-accent-600 px-2 py-1 text-[11px] font-semibold text-white">Editör seçimi</span> : null}
          {pack.isKnown ? <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-200">Bilinen paket</span> : null}
        </div>
        <span className="absolute bottom-3 right-3 font-mono text-[11px] text-zinc-500">{impactLabels[pack.performanceImpact]}</span>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div>
          <Link href={`/packs/${pack.slug}`} className="font-semibold text-white transition group-hover:text-accent-300">
            {pack.title}
          </Link>
          <p className="mt-1 text-xs text-zinc-500">
            <Link href={`/packs/category/${pack.categorySlug}`} className="hover:text-accent-400">{pack.categoryName}</Link>
            <span aria-hidden> · </span><Link href={`/u/${pack.creatorUsername}`} className="hover:text-accent-400">@{pack.creatorUsername}</Link>
          </p>
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-400">{pack.excerpt}</p>
        {pack.tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Etiketler">
            {pack.tags.slice(0, 3).map((tag) => (
              <li key={tag.slug} className="rounded bg-surface-800 px-2 py-1 text-[11px] text-zinc-500">#{tag.name}</li>
            ))}
          </ul>
        ) : null}
        <dl className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-zinc-500">
          <div className="flex items-center gap-1" title="Puan">
            <Star className="size-3.5" aria-hidden />
            <dt className="sr-only">Puan</dt>
            <dd>{pack.ratingCount > 0 ? pack.ratingAvg : "—"}</dd>
          </div>
          <div className="flex items-center gap-1" title="İndirme">
            <Download className="size-3.5" aria-hidden />
            <dt className="sr-only">İndirme</dt>
            <dd>{formatCompact(pack.downloadCount)}</dd>
          </div>
          <div className="flex items-center gap-1" title="Görüntülenme">
            <Eye className="size-3.5" aria-hidden />
            <dt className="sr-only">Görüntülenme</dt>
            <dd>{formatCompact(pack.viewCount)}</dd>
          </div>
          <div className="ml-auto flex items-center gap-1" title="Dosya boyutu">
            <Gauge className="size-3.5" aria-hidden />
            <dt className="sr-only">Dosya boyutu</dt>
            <dd>{pack.fileSizeBytes ? formatBytes(Number(pack.fileSizeBytes)) : "—"}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
