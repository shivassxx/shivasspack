import { getDatabase } from "@/db/client";
import * as schema from "@/db/schema";
import { PageState } from "@/components/ui/page-state";
import { PackManager } from "@/features/admin/pack-manager";
import { getCurrentSession } from "@/lib/auth-context";
import { listAdminCategories, listAdminTags } from "@/services/admin/catalog";
import { listAdminPacks } from "@/services/admin/packs";

export default async function AdminPacksPage() {
  const session = await getCurrentSession();
  if (!session?.actor.permissions.has("pack.manage")) {
    return <PageState code="403" title="Paket yönetimi iznin yok" description="Bu bölüm pack.manage izni gerektirir." />;
  }
  const db = getDatabase().db;
  const [packs, categories, tags] = await Promise.all([
    listAdminPacks(db, session.actor),
    session.actor.permissions.has("category.manage")
      ? listAdminCategories(db, session.actor)
      : db.select({ id: schema.packCategories.id, name: schema.packCategories.name }).from(schema.packCategories),
    session.actor.permissions.has("tag.manage")
      ? listAdminTags(db, session.actor)
      : db.select({ id: schema.tags.id, name: schema.tags.name }).from(schema.tags),
  ]);
  return (
    <PackManager
      packs={packs.map((pack) => ({ ...pack, updatedAt: pack.updatedAt.toISOString() }))}
      categories={categories.map((category) => ({ id: category.id, name: category.name }))}
      tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
      canPublish={session.actor.permissions.has("pack.publish")}
      canFeature={session.actor.permissions.has("pack.feature")}
      canArchive={session.actor.permissions.has("pack.delete")}
    />
  );
}
