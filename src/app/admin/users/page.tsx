import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { UserManager } from "@/features/admin/user-manager";
import { getCurrentSession } from "@/lib/auth-context";
import { listAdminUsers } from "@/services/admin/users";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getCurrentSession();
  if (!session?.actor.permissions.has("user.manage")) {
    return <PageState code="403" title="Kullanıcı yönetimi iznin yok" description="Bu bölüm user.manage izni gerektirir." />;
  }
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  return <UserManager data={await listAdminUsers(getDatabase().db, session.actor, { q, page })} />;
}
