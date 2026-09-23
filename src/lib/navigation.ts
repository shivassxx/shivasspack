export type NavItem = { href: string; label: string };

const shortLabels: Record<string, string> = { graphics: "Grafik", pvp: "PvP", reshade: "ReShade", enb: "ENB" };

/** PublicCategory is already restricted to enabled categories in sort order. */
export function primaryNavItems(categories: readonly { slug: string; name: string }[]): NavItem[] {
  return [
    { href: "/packs", label: "Paketler" },
    ...categories.slice(0, 4).map((category) => ({
      href: `/packs/category/${category.slug}`,
      label: shortLabels[category.slug] ?? category.name,
    })),
  ];
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href.startsWith("/packs/category/")) return pathname === href;
  if (href === "/packs" && pathname.startsWith("/packs/category/")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
