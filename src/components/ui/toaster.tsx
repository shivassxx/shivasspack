"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

type Toast = { id: number; message: string; variant: ToastVariant };

/**
 * Hafif, bağımlılıksız toast sistemi.
 * Global event ile tetiklenir: `toast.success("Kaydedildi")`.
 */
let listeners: Array<(t: Toast) => void> = [];
let counter = 0;

function emit(message: string, variant: ToastVariant) {
  const toast: Toast = { id: ++counter, message, variant };
  listeners.forEach((l) => l(toast));
}

export const toast = {
  success: (m: string) => emit(m, "success"),
  error: (m: string) => emit(m, "error"),
  info: (m: string) => emit(m, "info"),
};

const icons = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

const tones: Record<ToastVariant, string> = {
  success: "border-emerald-500/40 text-emerald-300",
  error: "border-red-500/40 text-red-300",
  info: "border-accent-500/40 text-accent-300",
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (t: Toast) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 4000);
    };
    listeners.push(handler);
    return () => {
      listeners = listeners.filter((l) => l !== handler);
    };
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {items.map((t) => {
        const Icon = icons[t.variant];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface-900 px-3 py-2.5 text-sm shadow-2xl animate-fade-in",
              tones[t.variant]
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="flex-1 text-zinc-200">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-zinc-500 transition hover:text-white"
              aria-label="Bildirimi kapat"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
