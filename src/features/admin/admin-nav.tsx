"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Genel", permission: "admin.dashboard" },
  { href: "/admin/packs", label: "Paketler", permission: "pack.manage" },
  { href: "/admin/categories", label: "Kategoriler", permission: "category.manage" },
  { href: "/admin/tags", label: "Etiketler", permission: "tag.manage" },
  { href: "/admin/homepage", label: "Ana sayfa", permission: "homepage.manage" },
  { href: "/admin/settings", label: "Ayarlar", permission: "admin.settings" },
  { href: "/admin/users", label: "Kullanıcılar", permission: "user.manage" },
  { href: "/admin/roles", label: "Roller ve izinler", permission: "role.manage" },
] as const;

export function AdminNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Yönetim bölümleri" className="flex gap-1 overflow-x-auto border-b border-line">
      {items.filter((item) => permissions.includes(item.permission)).map((item) => {
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
