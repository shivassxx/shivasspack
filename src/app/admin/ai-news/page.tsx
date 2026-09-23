import type { Metadata } from "next";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { AiSourceManager } from "@/features/news/ai-source-manager";
import { AiConfigForm } from "@/features/news/ai-config-form";
import { getCurrentSession } from "@/lib/auth-context";
import { getAiConfig, listAiSources } from "@/services/ai-sources";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = { title: "AI haber kaynakları", robots: { index: false, follow: false } };

export default async function AiNewsPage() {
  const session = await getCurrentSession();
  let allowed = false;
  if (session) {
    try { assertActive(session.actor); allowed = session.actor.permissions.has("ai.manage"); } catch { /* denied */ }
  }
  if (!session || !allowed) return <PageState code="403" title="AI haber yönetimi iznin yok" description="Bu bölüm ai.manage izni gerektirir." />;
  const db = getDatabase().db;
  const [config, sources] = await Promise.all([getAiConfig(db, session.actor), listAiSources(db, session.actor)]);
  return <><AiConfigForm config={config} /><AiSourceManager sources={sources} /></>;
}
