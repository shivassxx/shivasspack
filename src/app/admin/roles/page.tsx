import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { RoleManager } from "@/features/admin/role-manager";
import { getCurrentSession } from "@/lib/auth-context";
import { listAdminRoles } from "@/services/admin/roles";

export default async function AdminRolesPage() {
  const session = await getCurrentSession();
  if (!session?.actor.permissions.has("role.manage")) {
    return <PageState code="403" title="Rol yönetimi iznin yok" description="Bu bölüm role.manage izni gerektirir." />;
  }
  return <RoleManager data={await listAdminRoles(getDatabase().db, session.actor)} />;
}
