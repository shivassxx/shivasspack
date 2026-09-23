import type { Metadata } from "next";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { BanManager } from "@/features/admin/ban-manager";
import { getCurrentSession } from "@/lib/auth-context";
import { listBanTargets } from "@/services/admin/users";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = { title: "Kullanıcı yasakları", robots: { index: false, follow: false } };

export default async function BanPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await getCurrentSession();
  let allowed = false;
  if (session) {
    try { assertActive(session.actor); allowed = session.actor.permissions.has("user.ban"); } catch { /* denied */ }
  }
  if (!allowed || !session) return <PageState code="403" title="Kullanıcı yasakları iznin yok" description="Bu bölüm user.ban izni gerektirir." />;
  const { q } = await searchParams;
  return <BanManager data={await listBanTargets(getDatabase().db, session.actor, q)} />;
}
