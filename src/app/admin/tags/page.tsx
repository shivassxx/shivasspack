import { getDatabase } from "@/db/client";
import { TagManager } from "@/features/admin/tag-manager";
import { getCurrentSession } from "@/lib/auth-context";
import { PageState } from "@/components/ui/page-state";
import { listAdminTags } from "@/services/admin/catalog";

export default async function AdminTagsPage() {
  const session = await getCurrentSession();
  if (!session?.actor.permissions.has("tag.manage")) {
    return <PageState code="403" title="Etiket yönetimi iznin yok" description="Bu bölüm tag.manage izni gerektirir." />;
  }
  return <TagManager tags={await listAdminTags(getDatabase().db, session.actor)} />;
}
