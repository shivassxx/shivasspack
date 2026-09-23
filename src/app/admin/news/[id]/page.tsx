import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { ArticleForm } from "@/features/news/article-form";
import { getCurrentSession } from "@/lib/auth-context";
import { getAdminNewsArticle, listNewsCategories } from "@/services/news";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = { title: "Haberi düzenle", robots: { index: false, follow: false } };

export default async function EditAdminNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  let permitted = false;
  if (session) {
    try { assertActive(session.actor); permitted = session.actor.permissions.has("news.write") || session.actor.permissions.has("news.manage"); } catch { /* denied */ }
  }
  if (!session || !permitted) return <PageState code="403" title="Haber yönetimi iznin yok" description="Bu bölüm için haber izni gerekiyor." />;
  const { id } = await params;
  const db = getDatabase().db;
  const [article, categories] = await Promise.all([getAdminNewsArticle(db, session.actor, id), listNewsCategories(db)]);
  if (!article) notFound();
  if (article.status !== "draft" && article.status !== "review") return <PageState code="409" title="Haber düzenlenemiyor" description="Yayınlanmış veya arşivlenmiş haber kilitlidir." />;
  return <section><Link href="/admin/news" className="text-xs text-accent-400">← Haber yönetimi</Link>
    <h2 className="mb-5 mt-3 text-xl font-semibold text-white">Haberi düzenle</h2>
    <ArticleForm article={article} categories={categories} />
  </section>;
}
