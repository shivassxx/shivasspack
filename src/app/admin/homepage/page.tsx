import { getDatabase } from "@/db/client";
import { PageState } from "@/components/ui/page-state";
import { HomepageManager } from "@/features/admin/homepage-manager";
import { getCurrentSession } from "@/lib/auth-context";
import { listAdminHomepageSections } from "@/services/homepage";

export default async function AdminHomepagePage() {
  const session = await getCurrentSession();
  if (!session?.actor.permissions.has("homepage.manage")) {
    return <PageState code="403" title="Ana sayfa yönetimi iznin yok" description="Bu bölüm homepage.manage izni gerektirir." />;
  }
  const sections = await listAdminHomepageSections(getDatabase().db, session.actor);
  return <HomepageManager initialSections={sections} />;
}
