"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Header'daki hızlı arama kutusu.
 * ⌘K palette ile aynı yerden tetiklenir; şimdilik basit bir yönlendirme.
 */
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
      if (e.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
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
        onClick={() => {
          if (open) closeSearch();
          else setOpen(true);
        }}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface-900 px-2.5 text-sm text-zinc-500 transition hover:border-line-strong hover:text-zinc-300"
        aria-expanded={open}
        aria-label="Paket ara"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden md:inline">Ara…</span>
        <kbd className="hidden rounded border border-line bg-surface-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 md:inline">
          ⌘K
        </kbd>
      </button>

      {open ? <div
        className="absolute right-0 top-11 w-72 overflow-hidden rounded-lg border border-line bg-surface-900 shadow-xl"
        role="dialog"
        aria-label="Paket arama"
      >
        <form onSubmit={submit} className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Paket, etiket veya yazar…"
            className="h-11 w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            aria-label="Arama terimi"
          />
        </form>
        <p className="px-3 py-3 text-xs text-zinc-600">
          Aramak için Enter&apos;a bas, kapatmak için Esc.
        </p>
      </div> : null}
    </div>
  );
}
