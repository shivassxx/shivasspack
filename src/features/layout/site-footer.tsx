import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

const columns = [
  {
    title: "İçerik",
    links: [
      { href: "/packs", label: "Tüm paketler" },
      { href: "/packs?sort=trending", label: "Trend" },
      { href: "/packs?sort=rating", label: "En çok oylanan" },
      { href: "/packs?known=1", label: "Bilinen paketler" },
    ],
  },
  {
    title: "Topluluk",
    links: [
      { href: "/forum", label: "Forum" },
      { href: "/news", label: "Haberler" },
      { href: "/guidelines", label: "Topluluk kuralları" },
    ],
  },
  {
    title: "Yasal",
    links: [
      { href: "/legal/privacy", label: "Gizlilik" },
      { href: "/legal/terms", label: "Kullanım koşulları" },
      { href: "/legal/dmca", label: "DMCA / Telif" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-900">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">
            SHIVASS <span className="text-accent-500">PACK</span>
          </p>
          <p className="max-w-xs text-sm leading-relaxed text-zinc-500">{siteConfig.description}</p>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{col.title}</p>
            <ul className="space-y-1.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-zinc-400 transition hover:text-accent-400"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {siteConfig.name}. Tüm hakları saklıdır.</p>
          <p>FiveM, Cfx.re ve Rockstar Games ile bağlantılı değildir.</p>
        </div>
      </div>
    </footer>
  );
}
