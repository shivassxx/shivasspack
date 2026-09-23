"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, type NavItem } from "@/lib/navigation";

/**
 * Mobil menü. Masaüstünde tetrikleyici gizlenir (lg:hidden),
 * panel klavye/odak yönetimi içerir.
 */
export function MobileNav({
  items,
  triggerLabel,
  children,
}: {
  items: readonly NavItem[];
  triggerLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className="grid size-9 place-items-center rounded-md border border-line bg-surface-900 text-zinc-400 transition hover:text-white"
        aria-label={triggerLabel}
        aria-expanded={open}
      >
        {children}
      </button>

      {open ? <div
        className={cn(
          "fixed inset-0 z-50 transition",
          "visible opacity-100"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Mobil menü"
      >
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={() => closeMenu(true)}
          aria-hidden
        />
        <div ref={panelRef} className="absolute right-0 top-0 h-full w-72 max-w-[85vw] border-l border-line bg-surface-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Menü</span>
            <button
              type="button"
              ref={closeRef}
              onClick={() => closeMenu(true)}
              className="grid size-8 place-items-center rounded-md text-zinc-400 transition hover:bg-surface-800 hover:text-white"
              aria-label="Menüyü kapat"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <nav aria-label="Mobil gezinme" className="space-y-1">
            {items.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => closeMenu()}
                  className={cn(
                    "block rounded-md px-3 py-2.5 text-sm transition",
                    active ? "bg-surface-800 text-white" : "text-zinc-300 hover:bg-surface-800 hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div> : null}
    </div>
  );
}
