import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { SiteSettingsManager } from "@/features/admin/site-settings-manager";
import { getCurrentSession } from "@/lib/auth-context";
import { getAdminRegistrationSetting, getAdminSiteDescription, getAdminSiteName } from "@/services/admin/settings";

export default async function AdminSettingsPage() {
  const session = await getCurrentSession();
  if (!session?.actor.permissions.has("admin.settings")) {
    return <PageState code="403" title="Site ayarları iznin yok" description="Bu bölüm admin.settings izni gerektirir." />;
  }
  const db = getDatabase().db;
  const [setting, name, description] = await Promise.all([
    getAdminRegistrationSetting(db, session.actor), getAdminSiteName(db, session.actor), getAdminSiteDescription(db, session.actor),
  ]);
  return <SiteSettingsManager initialEnabled={setting.enabled} initialName={name} initialDescription={description} />;
}
