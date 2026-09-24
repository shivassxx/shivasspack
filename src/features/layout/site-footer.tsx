import Link from "next/link";
import { Github, MessageCircle } from "lucide-react";
import { BrandName } from "@/components/ui/brand-name";
import { siteConfig } from "@/lib/site-config";

const columns = [
  {
    title: "Discover",
    links: [
      { href: "/packs", label: "Tüm paketler" },
      { href: "/packs?sort=trending", label: "Trending" },
      { href: "/packs?sort=rating", label: "Top rated" },
      { href: "/packs?known=1", label: "Known packs" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "/forum", label: "Forum" },
      { href: "/news", label: "News & updates" },
      { href: "/submit", label: "Paket paylaş" },
      { href: "/guidelines", label: "Topluluk kuralları" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Gizlilik" },
      { href: "/legal/terms", label: "Kullanım koşulları" },
      { href: "/legal/dmca", label: "DMCA / Telif" },
    ],
  },
] as const;

export function SiteFooter({ siteName, siteDescription }: { siteName: string; siteDescription: string }) {
  return (
    <footer className="mt-10 border-t border-white/[0.07] bg-[#08080a]">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <p className="text-base font-semibold tracking-tight text-white">
            <BrandName name={siteName} />
          </p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-500">{siteDescription}</p>
          <div className="mt-5 flex gap-2">
            <a href={siteConfig.links.discord} className="grid size-9 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition hover:border-accent-500/30 hover:text-white" aria-label="Discord">
              <MessageCircle className="size-4" aria-hidden />
            </a>
            <a href={siteConfig.links.github} className="grid size-9 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition hover:border-accent-500/30 hover:text-white" aria-label="GitHub">
              <Github className="size-4" aria-hidden />
            </a>
          </div>
        </div>

        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-600">{column.title}</p>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-zinc-400 transition hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-5 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} {siteName}. Tüm hakları saklıdır.</p>
          <p>FiveM, Cfx.re ve Rockstar Games ile bağlantılı değildir.</p>
        </div>
      </div>
    </footer>
  );
}
