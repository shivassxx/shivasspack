import { getDatabase } from "@/db/client";
import { CategoryManager } from "@/features/admin/category-manager";
import { getCurrentSession } from "@/lib/auth-context";
import { PageState } from "@/components/ui/page-state";
import { listAdminCategories } from "@/services/admin/catalog";

export default async function AdminCategoriesPage() {
  const session = await getCurrentSession();
  if (!session?.actor.permissions.has("category.manage")) {
    return <PageState code="403" title="Kategori yönetimi iznin yok" description="Bu bölüm category.manage izni gerektirir." />;
  }
  const categories = await listAdminCategories(getDatabase().db, session.actor);
  return <CategoryManager categories={categories.map((category) => ({ ...category, packCount: Number(category.packCount) }))} />;
}
