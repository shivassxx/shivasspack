import { describe, expect, it } from "vitest";
import { isNavItemActive, primaryNavItems } from "./navigation";

describe("primary navigation", () => {
  it("contains unique canonical paths", () => {
    const paths = primaryNavItems.map((item) => item.href);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.startsWith("/") && !path.endsWith("/"))).toBe(true);
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
