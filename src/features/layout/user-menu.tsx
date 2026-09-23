"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Download, LogIn, Settings, MonitorSmartphone, LogOut, Shield, User as UserIcon } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";

export type MenuUser = {
  displayName: string;
  role: string;
  /** Yalnızca gösterim için; gerçek yetki servis katmanında tekrar doğrulanır. */
  permissions: string[];
};

/**
 * Sunucu tarafında gerçek oturumdan geçirilen veriyi gösterir.
 * Misafirken "Giriş yap"; girişte ayar/oturum bağlantıları ve gerçek çıkış.
 */
export function UserMenu({ user }: { user: MenuUser | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  async function signOut() {
    setPending(true);
    const result = await requestJson("/api/auth/logout", { method: "POST" });
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setOpen(false);
    toast.success("Çıkış yapıldı.");
    router.push("/");
    router.refresh();
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent-600 px-3 text-sm font-medium text-white transition hover:bg-accent-500"
      >
        <LogIn className="size-4" aria-hidden />
        <span className="hidden sm:inline">Giriş yap</span>
      </Link>
    );
  }

  const initials = user.displayName.trim().slice(0, 1).toUpperCase() || "?";
  const canOpenAdmin = user.permissions.some((permission) =>
    permission === "admin.dashboard" || permission.endsWith(".manage") || permission === "submission.review" || permission === "moderation.access",
  );
  const links = [
    { href: "/settings/profile", label: "Profil ayarları", icon: UserIcon },
    ...(user.permissions.includes("pack.view") ? [{ href: "/bookmarks", label: "Kaydedilen paketler", icon: Bookmark }] : []),
    ...(user.permissions.includes("download.use") ? [{ href: "/downloads", label: "İndirme geçmişi", icon: Download }] : []),
    { href: "/settings/sessions", label: "Oturumlar", icon: MonitorSmartphone },
    { href: "/settings/account", label: "Hesap", icon: Settings },
    ...(canOpenAdmin ? [{ href: "/admin", label: "Yönetim", icon: Shield }] : []),
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid size-9 place-items-center rounded-md border border-line bg-surface-900 text-sm font-semibold text-accent-300 transition hover:text-white"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${user.displayName} hesap menüsü`}
      >
        {initials}
      </button>
      {open ? <div
        role="menu"
        aria-label="Hesap menüsü"
        className="absolute right-0 top-11 w-56 overflow-hidden rounded-lg border border-line bg-surface-900 py-1 shadow-xl"
      >
        <div className="border-b border-line px-3 py-2">
          <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
          <p className="truncate font-mono text-[11px] text-zinc-500">{user.role}</p>
        </div>
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 transition hover:bg-surface-800 hover:text-white"
            onClick={() => setOpen(false)}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        ))}
        <div className="my-1 border-t border-line" />
        <button
          type="button"
          role="menuitem"
          onClick={() => void signOut()}
          disabled={pending}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="size-4" aria-hidden />
          {pending ? "Çıkış yapılıyor…" : "Çıkış yap"}
        </button>
      </div> : null}
    </div>
  );
}
