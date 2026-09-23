import { describe, expect, it } from "vitest";
import { isNavItemActive, primaryNavItems } from "./navigation";

describe("primary navigation", () => {
  it("contains unique canonical paths", () => {
    const paths = primaryNavItems([
      { slug: "graphics", name: "Grafik Paketleri" }, { slug: "pvp", name: "PvP" },
      { slug: "enb", name: "ENB" },
    ]).map((item) => item.href);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.startsWith("/") && !path.endsWith("/"))).toBe(true);
  });

  it("only links categories returned by the enabled-category query", () => {
    const items = primaryNavItems([{ slug: "pvp", name: "PvP" }, { slug: "other", name: "Diğer" }]);
    expect(items.map((item) => item.href)).toEqual(["/packs", "/packs/category/pvp", "/packs/category/other", "/forum"]);
    expect(primaryNavItems([])).toEqual([{ href: "/packs", label: "Paketler" }, { href: "/forum", label: "Forum" }]);
  });

  it("marks only the category entry on category pages", () => {
    const pathname = "/packs/category/graphics";
    expect(isNavItemActive(pathname, "/packs/category/graphics")).toBe(true);
    expect(isNavItemActive(pathname, "/packs")).toBe(false);
    expect(isNavItemActive(pathname, "/packs/category/pvp")).toBe(false);
  });

  it("keeps parent sections active for nested content", () => {
    expect(isNavItemActive("/packs/example-pack", "/packs")).toBe(true);
    expect(isNavItemActive("/forum/topic/example", "/forum")).toBe(true);
    expect(isNavItemActive("/news/example", "/news")).toBe(true);
  });
});
