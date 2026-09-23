import type { Metadata } from "next";
import { requireCurrentSession } from "@/lib/auth-context";
import { listActiveSessions } from "@/services/auth/session";
import { getDatabase } from "@/db/client";
import { SessionsPanel } from "@/features/settings/sessions-panel";

export const metadata: Metadata = {
  title: "Oturumlar",
  alternates: { canonical: "/settings/sessions" },
  robots: { index: false, follow: false },
};

export default async function SessionsSettingsPage() {
  const { sessionId, actor } = await requireCurrentSession();
  const rows = await listActiveSessions(getDatabase().db, actor.id!);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Aktif cihazlar</h2>
        <p className="text-sm text-zinc-500">
          Oturumlar sunucuda tutulur; bir cihazı buradan kapattığında o cihaz anında çıkış yapar.
        </p>
      </div>
      <SessionsPanel
        currentId={sessionId}
        initialSessions={rows.map((row) => ({
          id: row.id,
          userAgent: row.userAgent,
          ip: row.ip,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
