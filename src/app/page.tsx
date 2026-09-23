import Link from "next/link";
import { ArrowRight, Gauge, ShieldCheck, Wrench, Sparkles, Crosshair, Palette, Layers } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

const categories = [
  {
    slug: "graphics",
    title: "Grafik Paketleri",
    description: "Doku, aydınlatma ve post-process yükseltmeleri.",
    icon: Palette,
  },
  {
    slug: "pvp",
    title: "PvP",
    description: "Nişan alma netliği ve rekabetçi performans ayarları.",
    icon: Crosshair,
  },
  {
    slug: "reshade",
    title: "ReShade",
    description: "Doğrulanmış shader preset'leri ve FPS maliyet notları.",
    icon: Sparkles,
  },
  {
    slug: "enb",
    title: "ENB",
    description: "Seri donanımlar için dengeli ENB konfigürasyonları.",
    icon: Layers,
  },
] as const;

const features = [
  {
    icon: Gauge,
    title: "FPS etkisi ölçülü",
    body: "Her paket için bildirilen donanımda ortalama FPS farkı ve test notları yer alır.",
  },
  {
    icon: Wrench,
    title: "Güvenli kurulum",
    body: "İmzalı manifest ve whitelist operasyonlarla çalışan SHIVASS kurucusu; rastgele komut yok.",
  },
  {
    icon: ShieldCheck,
    title: "Dağıtım izni şeffaf",
    body: "Üçüncü taraf içeriklerde izin durumu (granted / metadata_only / unknown) açıkça belirtilir.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(249,115,22,0.16),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-xs font-medium text-accent-300">
            FiveM için seçilmiş içerik
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
            SHIVASS PACK — grafik, PvP ve <span className="text-accent-500">performans</span>{" "}
            paketleri tek yerde.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            {siteConfig.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/packs"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent-600 px-5 text-sm font-medium text-white transition hover:bg-accent-500"
            >
              Paketleri keşfet
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/guides/installation"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-surface-900 px-5 text-sm font-medium text-zinc-300 transition hover:border-line-strong hover:text-white"
            >
              Kurulum rehberi
            </Link>
          </div>
        </div>
      </section>

      {/* Kategoriler */}
      <section aria-labelledby="categories-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 id="categories-heading" className="text-lg font-semibold text-white">
          Kategoriler
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/packs/category/${c.slug}`}
              className="group rounded-xl border border-line bg-surface-900 p-5 transition hover:border-accent-500/40 hover:bg-surface-800"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-surface-800 text-accent-400 transition group-hover:bg-accent-600 group-hover:text-white">
                <c.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-medium text-white">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{c.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-accent-500 opacity-0 transition group-hover:opacity-100">
                İncele <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Neden SHIVASS */}
      <section aria-labelledby="why-heading" className="border-t border-line bg-surface-900/50">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 id="why-heading" className="text-lg font-semibold text-white">
            Neden {siteConfig.name}?
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-line bg-surface-900 p-5">
                <span className="grid size-9 place-items-center rounded-lg bg-accent-600/15 text-accent-400">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3.5 font-medium text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
