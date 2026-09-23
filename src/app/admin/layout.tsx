import { redirect } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
import { AdminNav } from "@/features/admin/admin-nav";
import { getCurrentSession, type CurrentSession } from "@/lib/auth-context";
import { assertActive, type PermissionKey } from "@/services/rbac";

const adminPermissions: readonly PermissionKey[] = [
  "admin.dashboard",
  "pack.manage",
  "category.manage",
  "tag.manage",
  "submission.review",
  "user.manage",
  "user.ban",
  "role.manage",
  "forum.moderate",
  "moderation.access",
  "news.manage",
  "news.write",
  "ai.manage",
  "installer.manage",
  "homepage.manage",
  "admin.settings",
  "audit.view",
  "analytics.view",
];

async function resolveAdminSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/admin");
  try {
    assertActive(session.actor);
  } catch {
    redirect("/login?next=/admin");
  }
  return session;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveAdminSession();
  const allowed = adminPermissions.some((permission) => session.actor.permissions.has(permission));
  if (!allowed) {
    return <PageState code="403" title="Bu alana erişimin yok" description="Yönetim alanı için gerekli izin hesabına tanımlanmamış." />;
  }
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent-400">Yönetim</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">İçerik yönetimi</h1>
        <p className="mt-1 text-sm text-zinc-500">Değişiklikler yetki kontrolünden geçer ve denetim kaydına yazılır.</p>
      </header>
      <AdminNav permissions={[...session.actor.permissions]} />
      <div className="py-7">{children}</div>
    </div>
  );
}
