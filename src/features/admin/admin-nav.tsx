"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Genel" },
  { href: "/admin/packs", label: "Paketler" },
  { href: "/admin/categories", label: "Kategoriler" },
  { href: "/admin/tags", label: "Etiketler" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Yönetim bölümleri" className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((item) => {
        const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm transition",
              active ? "border-accent-500 text-white" : "border-transparent text-zinc-400 hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
