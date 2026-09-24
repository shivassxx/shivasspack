import Link from "next/link";
import { Download, Menu, Sparkles } from "lucide-react";
import { getCurrentActor } from "@/lib/auth-context";
import { NavSearch } from "@/features/layout/nav-search";
import { UserMenu } from "@/features/layout/user-menu";
import { MobileNav } from "@/features/layout/mobile-nav";
import { SiteNav } from "@/features/layout/site-nav";
import { primaryNavItems } from "@/lib/navigation";
import { BrandName } from "@/components/ui/brand-name";
import { getDatabase } from "@/db/client";
import { listPublicCategories } from "@/services/packs/public";

export async function SiteHeader({ siteName }: { siteName: string }) {
  const [actor, categories] = await Promise.all([
    getCurrentActor(),
    listPublicCategories(getDatabase().db),
  ]);
  const navItems = primaryNavItems(categories);
  const menuUser =
    actor.id === null || actor.displayName === null
      ? null
      : { displayName: actor.displayName, role: actor.roleKey, permissions: [...actor.permissions] };

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#070708]/88 backdrop-blur-xl supports-[backdrop-filter]:bg-[#070708]/72">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight text-white"
          aria-label={`${siteName} ana sayfa`}
        >
          <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-accent-600 text-white shadow-[0_0_28px_rgba(255,106,0,.18)]">
            <Sparkles className="size-4.5" aria-hidden />
            <span className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" aria-hidden />
          </span>
          <span className="hidden text-[15px] sm:inline">
            <BrandName name={siteName} />
          </span>
        </Link>

        <SiteNav items={navItems} />

        <div className="ml-auto flex items-center gap-2">
          <NavSearch />
          <Link
            href="/downloads"
            className="hidden h-9 items-center gap-2 rounded-full border border-accent-500/20 bg-accent-500/10 px-3.5 text-sm font-medium text-accent-300 transition hover:border-accent-500/35 hover:bg-accent-500/15 hover:text-white lg:inline-flex"
          >
            <Download className="size-4" aria-hidden />
            Installer
          </Link>
          <UserMenu user={menuUser} />
          <MobileNav items={navItems} triggerLabel="Menüyü aç">
            <Menu className="size-5 xl:hidden" aria-hidden />
          </MobileNav>
        </div>
      </div>
    </header>
  );
}
