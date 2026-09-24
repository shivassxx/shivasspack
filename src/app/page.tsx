import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Crosshair,
  Download,
  Layers,
  MessageCircle,
  Newspaper,
  Palette,
  Search,
  Sparkles,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { getDatabase } from "@/db/client";
import { PackCard } from "@/features/packs/pack-card";
import { getSiteName } from "@/lib/site-name";
import { siteConfig } from "@/lib/site-config";
import { defaultHero, defaultPackTitles, listHomepageSections, type HomepageKey } from "@/services/homepage";
import { listForumTopics } from "@/services/forum";
import { listPublishedNews } from "@/services/news";
import { listPublicCategories, listPublishedPacks, type PackListItem, type PublicCategory } from "@/services/packs/public";

const categoryMeta = {
  graphics: { icon: Palette, tone: "from-orange-500/18 to-amber-500/[0.03]", iconTone: "bg-orange-500/12 text-orange-300", label: "Graphics" },
  pvp: { icon: Crosshair, tone: "from-red-500/16 to-rose-500/[0.03]", iconTone: "bg-red-500/12 text-red-300", label: "PvP" },
  reshade: { icon: Sparkles, tone: "from-violet-500/16 to-fuchsia-500/[0.03]", iconTone: "bg-violet-500/12 text-violet-300", label: "ReShade" },
  enb: { icon: Layers, tone: "from-sky-500/16 to-cyan-500/[0.03]", iconTone: "bg-sky-500/12 text-sky-300", label: "ENB" },
  performance: { icon: Zap, tone: "from-emerald-500/16 to-lime-500/[0.03]", iconTone: "bg-emerald-500/12 text-emerald-300", label: "Performance" },
  known: { icon: Star, tone: "from-amber-500/16 to-yellow-500/[0.03]", iconTone: "bg-amber-500/12 text-amber-300", label: "Known" },
  other: { icon: Layers, tone: "from-zinc-500/15 to-zinc-500/[0.03]", iconTone: "bg-white/[0.06] text-zinc-300", label: "Packs" },
} as const;

function SectionTitle({
  eyebrow,
  title,
  description,
  href,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-5">
      <div>
        {eyebrow ? <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-400">{eyebrow}</p> : null}
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-white sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">{description}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-zinc-400 transition hover:text-white sm:inline-flex">
          Tümünü gör <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function PackGrid({ items }: { items: PackListItem[] }) {
  if (!items.length) {
    return (
      <div className="rounded-[20px] border border-dashed border-white/[0.1] bg-white/[0.02] p-8 text-center text-sm text-zinc-600">
        Bu bölüm için yayınlanmış içerik bekleniyor.
      </div>
    );
  }
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map((pack) => <PackCard key={pack.id} pack={pack} />)}</div>;
}

function CategoryCard({ category }: { category: PublicCategory }) {
  const meta = categoryMeta[category.kind];
  const Icon = meta.icon;
  return (
    <Link
      href={`/packs/category/${category.slug}`}
      className={`group relative min-h-48 overflow-hidden rounded-[22px] border border-white/[0.08] bg-gradient-to-br ${meta.tone} p-5 transition duration-300 hover:-translate-y-1 hover:border-white/[0.16]`}
    >
      <div className="absolute inset-0 shivass-grid opacity-20" aria-hidden />
      <div className="relative">
        <span className={`grid size-11 place-items-center rounded-2xl ${meta.iconTone}`}>
          <Icon className="size-5" aria-hidden />
        </span>
        <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">{category.packCount} içerik</p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-white">{meta.label}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-500">
          {category.description ?? "FiveM deneyimini kendi tarzına göre şekillendir."}
        </p>
        <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-zinc-400 transition group-hover:text-white">
          Keşfet <ChevronRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const db = getDatabase().db;
  const [categories, sections, siteName, community, latest, news, forum] = await Promise.all([
    listPublicCategories(db),
    listHomepageSections(db),
    getSiteName(),
    listPublishedPacks(db, { sort: "rating", pageSize: 4 }),
    listPublishedPacks(db, { sort: "newest", pageSize: 4 }),
    listPublishedNews(db, 1),
    listForumTopics(db, { page: 1 }),
  ]);

  const visible = sections.filter((section) => section.enabled);
  const hero = visible.find((section) => section.key === "hero");
  const packSections = visible.filter((section) => section.key !== "hero");
  const packResults = await Promise.all(
    packSections.map((section) =>
      listPublishedPacks(db, {
        pageSize: section.maxItems ?? 4,
        sort: section.key === "trending" ? "trending" : "newest",
        known: section.key === "known",
        featured: section.key === "featured",
      }),
    ),
  );
  const packsBySection = new Map<Exclude<HomepageKey, "hero">, PackListItem[]>(
    packSections.map((section, index) => [section.key as Exclude<HomepageKey, "hero">, packResults[index]?.items ?? []]),
  );
  const heroContent = hero?.hero ?? defaultHero;

  return (
    <div className="overflow-hidden">
      <section className="relative border-b border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 shivass-grid opacity-25 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" aria-hidden />
        <div className="pointer-events-none absolute -left-52 top-0 size-[36rem] rounded-full bg-accent-600/[0.08] blur-[120px]" aria-hidden />
        <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8 lg:py-24">
          <div className="relative z-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent-500/20 bg-accent-500/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-accent-300">
              <span className="size-1.5 rounded-full bg-accent-400 shadow-[0_0_12px_rgba(255,106,0,.8)]" aria-hidden />
              {siteName} · {heroContent.eyebrow}
            </p>

            <h1 className="text-balance mt-6 max-w-3xl text-[clamp(2.9rem,7vw,5.8rem)] font-semibold leading-[0.93] tracking-[-0.055em] text-white">
              Upgrade FiveM.
              <span className="block bg-gradient-to-r from-accent-300 via-accent-500 to-orange-700 bg-clip-text text-transparent">
                Your way.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">
              {heroContent.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/packs" className="inline-flex h-11 items-center gap-2 rounded-full bg-accent-600 px-5 text-sm font-semibold text-white shadow-[0_10px_35px_rgba(244,93,0,.2)] transition hover:bg-accent-500">
                {heroContent.primaryLabel}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/downloads" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-5 text-sm font-semibold text-zinc-200 transition hover:border-white/[0.18] hover:bg-white/[0.07]">
                <Download className="size-4" aria-hidden />
                Get Installer
              </Link>
            </div>

            <form action="/packs" method="get" className="mt-9 flex max-w-xl items-center gap-3 rounded-2xl border border-white/[0.1] bg-[#0d0d0f]/90 p-2 pl-4 shadow-[0_20px_60px_rgba(0,0,0,.35)]">
              <Search className="size-4 shrink-0 text-zinc-600" aria-hidden />
              <input
                name="q"
                aria-label="Paket ara"
                placeholder="Paket, preset veya creator ara..."
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              />
              <button className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-zinc-300 transition hover:bg-accent-600 hover:text-white" aria-label="Ara">
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-600">
              <span>Popular:</span>
              {["Graphics", "PvP", "ReShade", "ENB", "FPS Boost"].map((item) => (
                <span key={item} className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1">{item}</span>
              ))}
            </div>
          </div>

          <div className="relative min-h-[390px] lg:min-h-[520px]">
            <div className="absolute inset-0 rounded-[32px] border border-white/[0.08] bg-gradient-to-br from-[#351b0e] via-[#121216] to-[#08080a] shadow-[0_40px_120px_rgba(0,0,0,.45)]" />
            <div className="absolute inset-0 overflow-hidden rounded-[32px]">
              <div className="absolute -right-20 -top-16 size-80 rounded-full bg-accent-500/20 blur-[90px]" aria-hidden />
              <div className="absolute inset-0 shivass-grid opacity-30" aria-hidden />
              <div className="absolute left-[8%] right-[8%] top-[13%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-black via-black/55 to-transparent" />
              <div className="absolute bottom-[16%] left-[9%]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-300">Featured experience</p>
                <p className="mt-2 max-w-xs text-3xl font-semibold tracking-[-0.04em] text-white">Visuals that make Los Santos feel new again.</p>
              </div>
            </div>

            <div className="glass-panel absolute -right-3 top-[12%] w-[42%] rotate-[3deg] overflow-hidden rounded-[22px] p-3 sm:right-[3%]">
              <div className="aspect-[4/3] rounded-[15px] bg-gradient-to-br from-violet-700/60 via-fuchsia-900/35 to-slate-950 shivass-grid" />
              <div className="px-1 pb-1 pt-3">
                <p className="text-sm font-semibold text-white">Cinematic ReShade</p>
                <p className="mt-1 text-xs text-zinc-500">Deep contrast · Night presets</p>
              </div>
            </div>

            <div className="glass-panel absolute bottom-[8%] right-[8%] w-[38%] -rotate-[3deg] overflow-hidden rounded-[22px] p-3">
              <div className="aspect-[4/3] rounded-[15px] bg-gradient-to-br from-red-800/55 via-[#2c1114] to-slate-950 shivass-grid" />
              <div className="px-1 pb-1 pt-3">
                <p className="text-sm font-semibold text-white">PvP Ready</p>
                <p className="mt-1 text-xs text-zinc-500">Competitive · High FPS</p>
              </div>
            </div>

            <div className="glass-panel absolute left-[6%] top-[10%] w-[46%] -rotate-[2deg] overflow-hidden rounded-[22px] p-3">
              <div className="aspect-[4/3] rounded-[15px] bg-gradient-to-br from-orange-500/45 via-[#43200d] to-slate-950 shivass-grid">
                <div className="flex h-full items-end p-4">
                  <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">Graphics</span>
                </div>
              </div>
              <div className="px-1 pb-1 pt-3">
                <p className="text-sm font-semibold text-white">Realistic Visuals</p>
                <p className="mt-1 text-xs text-zinc-500">Lighting · Roads · Weather</p>
              </div>
            </div>

            <div className="absolute bottom-[8%] left-[8%] hidden rounded-2xl border border-white/[0.08] bg-black/35 px-4 py-3 backdrop-blur sm:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">One ecosystem</p>
              <p className="mt-1 text-sm font-medium text-white">Discover · Install · Share</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] space-y-20 px-4 py-16 sm:px-6 lg:px-8">
        {packSections.map((section) => (
          <section key={section.key}>
            <SectionTitle
              eyebrow={section.key === "trending" ? "Hot right now" : undefined}
              title={section.title ?? defaultPackTitles[section.key as keyof typeof defaultPackTitles]}
              description={section.key === "trending" ? "Topluluğun şu anda en çok keşfettiği FiveM içerikleri." : undefined}
              href="/packs"
            />
            <PackGrid items={packsBySection.get(section.key as Exclude<HomepageKey, "hero">) ?? []} />
          </section>
        ))}

        <section>
          <SectionTitle eyebrow="Browse" title="Explore by category" description="Aradığın kuruluma doğrudan gir. Gereksiz menü turu yok." href="/packs" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {categories.slice(0, 4).map((category) => <CategoryCard key={category.slug} category={category} />)}
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="Community" title="Community favorites" description="Kullanıcıların en yüksek puan verdiği içerikler." href="/packs?sort=rating" />
          <PackGrid items={community.items} />
        </section>

        <section>
          <SectionTitle eyebrow="Fresh" title="Latest releases" description="Platforma yeni eklenen veya yeni yayınlanan paketler." href="/packs?sort=newest" />
          <PackGrid items={latest.items} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <div>
            <SectionTitle eyebrow="Editorial" title="News & updates" href="/news" />
            <div className="grid gap-3 md:grid-cols-3">
              {news.items.slice(0, 3).map((article, index) => (
                <Link key={article.id} href={`/news/${article.slug}`} className="group overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0d0d0f] transition hover:-translate-y-1 hover:border-white/[0.15]">
                  <div className={`relative aspect-[16/9] overflow-hidden ${index === 0 ? "bg-gradient-to-br from-orange-600/35 via-[#35190c] to-[#101013]" : index === 1 ? "bg-gradient-to-br from-violet-700/30 via-[#201129] to-[#101013]" : "bg-gradient-to-br from-sky-700/30 via-[#0c202c] to-[#101013]"}`}>
                    <div className="absolute inset-0 shivass-grid opacity-25" />
                    <Newspaper className="absolute bottom-4 right-4 size-7 text-white/15" aria-hidden />
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-400">{article.categoryName}</p>
                    <h3 className="mt-2 line-clamp-2 font-semibold leading-5 text-white transition group-hover:text-accent-300">{article.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-500">{article.excerpt}</p>
                  </div>
                </Link>
              ))}
              {!news.items.length ? <p className="col-span-full rounded-[20px] border border-dashed border-white/[0.1] p-6 text-sm text-zinc-600">Henüz yayınlanmış haber yok.</p> : null}
            </div>
          </div>

          <div>
            <SectionTitle eyebrow="Community" title="From the forum" href="/forum" />
            <div className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0d0d0f]">
              {forum.items.slice(0, 5).map((topic) => (
                <Link key={topic.id} href={`/forum/topic/${topic.slug}`} className="group flex items-center gap-3 border-b border-white/[0.06] px-4 py-4 last:border-b-0 hover:bg-white/[0.025]">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.05] text-xs font-semibold text-zinc-300">
                    {topic.authorName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-200 group-hover:text-white">{topic.title}</span>
                    <span className="mt-1 block text-xs text-zinc-600">{topic.categoryName} · @{topic.authorUsername}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                    <MessageCircle className="size-3.5" aria-hidden />
                    {topic.replyCount}
                  </span>
                </Link>
              ))}
              {!forum.items.length ? <p className="p-6 text-sm text-zinc-600">Forum sessiz. İlk konuyu sen açabilirsin.</p> : null}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[28px] border border-[#5865f2]/20 bg-gradient-to-br from-[#5865f2]/18 via-[#12131b] to-[#0d0d0f] p-6 sm:p-8">
          <div className="absolute -right-16 -top-20 size-64 rounded-full bg-[#5865f2]/20 blur-[80px]" aria-hidden />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#5865f2] text-white shadow-[0_16px_50px_rgba(88,101,242,.25)]">
                <Users className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8e96ff]">Shivass community</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Discord'a katıl.</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Kurulum desteği al, paketlerini paylaş ve yeni içerikleri herkesten önce gör.</p>
              </div>
            </div>
            <a href={siteConfig.links.discord} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#5865f2] px-5 text-sm font-semibold text-white transition hover:bg-[#6874f5]">
              Discord'u aç <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
