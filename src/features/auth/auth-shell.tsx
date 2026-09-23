import Link from "next/link";
import { MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

/** Kimlik formları için ortak görsel kabuk (server/client bağımsız). */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-line bg-surface-900 p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-9 place-items-center rounded-lg bg-accent-600 text-white">
            <MonitorPlay className="size-5" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>
        </div>
        {children}
      </div>
      {footer ? <div className="mt-4 text-center text-sm text-zinc-500">{footer}</div> : null}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-300">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-zinc-500">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClassName = cn(
  "w-full rounded-md border border-line bg-surface-950 px-3 py-2 text-sm text-white",
  "placeholder:text-zinc-600 transition focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

export const buttonClassName = cn(
  "inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium",
  "text-white transition hover:bg-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

export { Link };
