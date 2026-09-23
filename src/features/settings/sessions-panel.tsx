"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { timeAgo } from "@/lib/utils";

export type SessionRow = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
};

function summarizeAgent(agent: string | null): string {
  if (!agent) return "Bilinmeyen cihaz";
  const browser = /edg\//i.test(agent)
    ? "Edge"
    : /chrome\//i.test(agent)
      ? "Chrome"
      : /firefox\//i.test(agent)
        ? "Firefox"
        : /safari\//i.test(agent)
          ? "Safari"
          : null;
  const os = /windows/i.test(agent)
    ? "Windows"
    : /mac os/i.test(agent)
      ? "macOS"
      : /android/i.test(agent)
        ? "Android"
        : /iphone|ipad/i.test(agent)
          ? "iOS"
          : /linux/i.test(agent)
            ? "Linux"
            : null;
  return [browser, os].filter(Boolean).join(" · ") || "Bilinmeyen cihaz";
}

/**
 * Liste sunucudan gelir; istemci yalnızca mutation sonrası tazeler.
 * İlk yükleme effect içinde setState yapmaz (hydration/tetikleme gürültüsü yok).
 */
export function SessionsPanel({
  initialSessions,
  currentId,
}: {
  initialSessions: SessionRow[];
  currentId: string;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [current, setCurrent] = useState(currentId);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const result = await requestJson<{ current: string; sessions: SessionRow[] }>("/api/auth/sessions", {
      method: "GET",
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setSessions(result.data.sessions);
    setCurrent(result.data.current);
  }

  async function closeSession(id?: string) {
    setPending(true);
    const url = id ? `/api/auth/sessions?id=${encodeURIComponent(id)}` : "/api/auth/sessions";
    const result = await requestJson<{ closed: number; self: boolean }>(url, { method: "DELETE" });
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }
    if (result.data.self) {
      toast.success("Bu oturum kapatıldı.");
      router.push("/login");
      router.refresh();
      return;
    }
    toast.success(result.data.closed > 0 ? `${result.data.closed} oturum kapatıldı.` : "Kapatılacak oturum yok.");
    await refresh();
    setPending(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                <span className="truncate">{summarizeAgent(session.userAgent)}</span>
                {session.id === current ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                    Bu cihaz
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Başlangıç {timeAgo(session.createdAt)} · Bitiş{" "}
                {new Date(session.expiresAt).toLocaleDateString("tr-TR")}
                {session.ip ? ` · ${session.ip}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => void closeSession(session.id)}
              className="shrink-0 self-start rounded-md border border-line px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-red-500/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
            >
              {session.id === current ? "Bu oturumu kapat" : "Kapat"}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => void closeSession()}
          className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Diğer tüm oturumları kapat
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void refresh()}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Yenile
        </button>
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
