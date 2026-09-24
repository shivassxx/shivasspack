"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function NavSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function closeSearch(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (e.key === "Escape") closeSearch(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    closeSearch();
    router.push(`/packs?q=${encodeURIComponent(term)}`);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 min-w-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 text-sm text-zinc-400 transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white md:min-w-48"
        aria-expanded={open}
        aria-label="Paket ara"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden flex-1 text-left md:inline">Paket ara...</span>
        <kbd className="hidden rounded border border-white/[0.08] bg-black/25 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 md:inline">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0b0b0d]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
          role="dialog"
          aria-label="Paket arama"
        >
          <form onSubmit={submit} className="flex items-center gap-3 border-b border-white/[0.08] px-4">
            <Search className="size-4 shrink-0 text-accent-400" aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Paket, etiket veya içerik üreticisi..."
              className="h-13 w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
              aria-label="Arama terimi"
            />
          </form>
          <p className="px-4 py-3 text-xs text-zinc-600">
            Enter ile ara · Esc ile kapat
          </p>
        </div>
      ) : null}
    </div>
  );
}
