import Link from "next/link";
import { MonitorPlay, Menu } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { getCurrentActor } from "@/lib/auth-context";
import { NavSearch } from "@/features/layout/nav-search";
import { UserMenu } from "@/features/layout/user-menu";
import { MobileNav } from "@/features/layout/mobile-nav";
import { SiteNav } from "@/features/layout/site-nav";
import { primaryNavItems } from "@/lib/navigation";

export async function SiteHeader() {
  // Gerçek oturum: çerez okunduğu için sayfalar dinamik render olur.
  const actor = await getCurrentActor();
  const menuUser =
    actor.id === null || actor.displayName === null
      ? null
      : { displayName: actor.displayName, role: actor.roleKey, permissions: [...actor.permissions] };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-950/85 backdrop-blur supports-[backdrop-filter]:bg-surface-950/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-white"
          aria-label={`${siteConfig.name} ana sayfa`}
        >
          <span className="grid size-7 place-items-center rounded-md bg-accent-600 text-white">
            <MonitorPlay className="size-4" aria-hidden />
          </span>
          <span className="hidden sm:inline">
            SHIVASS <span className="text-accent-500">PACK</span>
          </span>
        </Link>

        <SiteNav items={primaryNavItems} />

        <div className="ml-auto flex items-center gap-2">
          <NavSearch />
          <UserMenu user={menuUser} />
          <MobileNav items={primaryNavItems} triggerLabel="Menüyü aç">
            <Menu className="size-5 lg:hidden" aria-hidden />
          </MobileNav>
        </div>
      </div>
    </header>
  );
}
