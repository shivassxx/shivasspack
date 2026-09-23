import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { RegistrationManager } from "@/features/admin/registration-manager";
import { getCurrentSession } from "@/lib/auth-context";
import { getAdminRegistrationSetting } from "@/services/admin/settings";

export default async function AdminSettingsPage() {
  const session = await getCurrentSession();
  if (!session?.actor.permissions.has("admin.settings")) {
    return <PageState code="403" title="Site ayarları iznin yok" description="Bu bölüm admin.settings izni gerektirir." />;
  }
  const setting = await getAdminRegistrationSetting(getDatabase().db, session.actor);
  return <RegistrationManager initialEnabled={setting.enabled} />;
}
