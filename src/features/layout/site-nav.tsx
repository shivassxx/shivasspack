"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavItemActive, type NavItem } from "@/lib/navigation";

export function SiteNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Ana menü" className="ml-4 hidden items-center gap-1 xl:flex">
      {items.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-full px-3 py-2 text-[13px] font-medium transition",
              active
                ? "text-white"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
            )}
          >
            {item.label}
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-[9px] h-px bg-gradient-to-r from-transparent via-accent-500 to-transparent"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
