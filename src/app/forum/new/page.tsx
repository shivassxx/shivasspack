import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { NewTopicForm } from "@/features/forum/new-topic-form";
import { getCurrentSession } from "@/lib/auth-context";
import { listForumCategories } from "@/services/forum";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = { title: "Yeni konu · Forum", robots: { index: false, follow: false } };

export default async function NewForumTopicPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/forum/new");
  let canCreate = false;
  try { assertActive(session.actor); canCreate = session.actor.permissions.has("forum.topic.create"); } catch { /* read-only */ }
  if (!canCreate) return <PageState code="403" title="Konu açma iznin yok" description="Konu açmak için forum.topic.create izni gerekiyor." />;
  const categories = await listForumCategories(getDatabase().db);
  if (!categories.length) return <PageState code="404" title="Açık kategori yok" description="Şu anda yeni konu açılabilecek bir kategori bulunmuyor."><Link href="/forum" className="text-accent-400">Foruma dön</Link></PageState>;
  const { category } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <nav aria-label="İçerik yolu" className="text-xs text-zinc-500"><Link href="/forum" className="hover:text-accent-300">Forum</Link> / Yeni konu</nav>
      <h1 className="mt-4 text-3xl font-semibold text-white">Yeni konu aç</h1>
      <p className="mb-6 mt-2 text-sm text-zinc-400">Konunu uygun bir kategoriye ekleyerek toplulukla paylaş.</p>
      <NewTopicForm categories={categories} initialCategory={category} />
    </div>
  );
}
