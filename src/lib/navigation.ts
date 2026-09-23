export type NavItem = { href: string; label: string };

export const primaryNavItems: readonly NavItem[] = [
  { href: "/packs", label: "Paketler" },
  { href: "/packs/category/graphics", label: "Grafik" },
  { href: "/packs/category/pvp", label: "PvP" },
  { href: "/packs/category/reshade", label: "ReShade" },
  { href: "/packs/category/enb", label: "ENB" },
  { href: "/forum", label: "Forum" },
  { href: "/news", label: "Haberler" },
] as const;

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href.startsWith("/packs/category/")) return pathname === href;
  if (href === "/packs" && pathname.startsWith("/packs/category/")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
