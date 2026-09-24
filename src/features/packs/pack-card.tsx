import Link from "next/link";
import { Download, Eye, Gauge, Heart, Sparkles, Star } from "lucide-react";
import type { PackListItem } from "@/services/packs/public";
import { formatCompact } from "@/lib/utils";

const kindLabels: Record<PackListItem["kind"], string> = {
  graphics: "Graphics",
  pvp: "PvP",
  reshade: "ReShade",
  enb: "ENB",
  performance: "Performance",
  known: "Known Pack",
  other: "Pack",
};

const impactLabels: Record<PackListItem["performanceImpact"], string> = {
  low: "Low impact",
  medium: "Balanced",
  high: "High quality",
  extreme: "Ultra",
};

const art: Record<PackListItem["kind"], { bg: string; glow: string; accent: string }> = {
  graphics: {
    bg: "from-orange-950/80 via-[#28170e] to-[#0d0d0f]",
    glow: "bg-orange-500/35",
    accent: "text-orange-300 border-orange-400/20 bg-orange-500/10",
  },
  pvp: {
    bg: "from-red-950/80 via-[#241011] to-[#0d0d0f]",
    glow: "bg-red-500/30",
    accent: "text-red-300 border-red-400/20 bg-red-500/10",
  },
  reshade: {
    bg: "from-violet-950/80 via-[#1c1027] to-[#0d0d0f]",
    glow: "bg-violet-500/30",
    accent: "text-violet-300 border-violet-400/20 bg-violet-500/10",
  },
  enb: {
    bg: "from-sky-950/80 via-[#0d1b25] to-[#0d0d0f]",
    glow: "bg-sky-500/30",
    accent: "text-sky-300 border-sky-400/20 bg-sky-500/10",
  },
  performance: {
    bg: "from-emerald-950/80 via-[#0d2119] to-[#0d0d0f]",
    glow: "bg-emerald-500/25",
    accent: "text-emerald-300 border-emerald-400/20 bg-emerald-500/10",
  },
  known: {
    bg: "from-amber-950/80 via-[#231a0c] to-[#0d0d0f]",
    glow: "bg-amber-500/25",
    accent: "text-amber-300 border-amber-400/20 bg-amber-500/10",
  },
  other: {
    bg: "from-zinc-800 via-[#17171b] to-[#0d0d0f]",
    glow: "bg-zinc-400/20",
    accent: "text-zinc-300 border-white/10 bg-white/5",
  },
};

export function PackCard({ pack }: { pack: PackListItem }) {
  const visual = art[pack.kind];

  return (
    <article className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0d0d0f] shadow-[0_18px_55px_rgba(0,0,0,.18)] transition duration-300 hover:-translate-y-1 hover:border-white/[0.15] hover:shadow-[0_25px_75px_rgba(0,0,0,.35)]">
      <Link
        href={`/packs/${pack.slug}`}
        className={`relative block aspect-[16/9] overflow-hidden border-b border-white/[0.07] bg-gradient-to-br ${visual.bg}`}
        aria-label={`${pack.title} paketini aç`}
      >
        <div className={`absolute -right-10 -top-12 size-40 rounded-full blur-3xl ${visual.glow}`} aria-hidden />
        <div className="absolute inset-0 shivass-grid opacity-30" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" aria-hidden />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur ${visual.accent}`}>
            {kindLabels[pack.kind]}
          </span>
          {pack.editorPick ? (
            <span className="rounded-full border border-accent-400/25 bg-accent-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-200">
              Editor pick
            </span>
          ) : null}
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
              {pack.categoryName}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-white/80">
              <Sparkles className="size-3.5 text-accent-400" aria-hidden />
              {impactLabels[pack.performanceImpact]}
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
            @{pack.creatorUsername}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4.5">
        <div>
          <Link
            href={`/packs/${pack.slug}`}
            className="line-clamp-1 text-[15px] font-semibold tracking-[-0.01em] text-white transition group-hover:text-accent-300"
          >
            {pack.title}
          </Link>
          <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500">{pack.excerpt}</p>
        </div>

        {pack.tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Etiketler">
            {pack.tags.slice(0, 3).map((tag) => (
              <li key={tag.slug} className="rounded-full bg-white/[0.045] px-2 py-1 text-[10px] text-zinc-500">
                #{tag.name}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex items-center gap-3 border-t border-white/[0.07] pt-3.5 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <Star className="size-3.5 fill-amber-400/90 text-amber-400" aria-hidden />
            {pack.ratingCount > 0 ? pack.ratingAvg : "Yeni"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Download className="size-3.5" aria-hidden />
            {formatCompact(pack.downloadCount)}
          </span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <Eye className="size-3.5" aria-hidden />
            {formatCompact(pack.viewCount)}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <Heart className="size-3.5" aria-hidden />
            {formatCompact(pack.likeCount)}
          </span>
          <Gauge className="sr-only" aria-hidden />
        </div>
      </div>
    </article>
  );
}
