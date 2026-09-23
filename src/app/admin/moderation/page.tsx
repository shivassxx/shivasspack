import type { Metadata } from "next";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { ReportQueue } from "@/features/forum/report-queue";
import { getCurrentSession } from "@/lib/auth-context";
import { listModerationReports } from "@/services/moderation";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = { title: "Moderasyon kuyruğu", robots: { index: false, follow: false } };

export default async function ModerationPage() {
  const session = await getCurrentSession();
  let allowed = false;
  if (session) {
    try { assertActive(session.actor); allowed = session.actor.permissions.has("moderation.access"); } catch { /* denied */ }
  }
  if (!allowed || !session) return <PageState code="403" title="Moderasyon kuyruğuna erişimin yok" description="Bu bölüm moderation.access izni gerektirir." />;
  const reports = await listModerationReports(getDatabase().db, session.actor);
  return <section>
    <h2 className="text-xl font-semibold text-white">Forum bildirimleri</h2>
    <p className="mt-2 text-sm text-zinc-400">En son 100 bildirimi incele. Konu ve yanıt görünürlüğünü Forum yönetiminden değiştirebilirsin.</p>
    {reports.length ? <div className="mt-5"><ReportQueue items={reports} canResolve={session.actor.permissions.has("moderation.resolve")} /></div>
      : <p className="mt-5 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">Henüz bildirim yok.</p>}
  </section>;
}
