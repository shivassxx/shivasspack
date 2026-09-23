import type { Metadata } from "next";
import Link from "next/link";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { ArticleForm } from "@/features/news/article-form";
import { getCurrentSession } from "@/lib/auth-context";
import { listNewsCategories } from "@/services/news";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = { title: "Yeni haber", robots: { index: false, follow: false } };

export default async function NewAdminNewsPage() {
  const session = await getCurrentSession();
  let canWrite = false;
  if (session) {
    try { assertActive(session.actor); canWrite = session.actor.permissions.has("news.write"); } catch { /* denied */ }
  }
  if (!canWrite) return <PageState code="403" title="Haber yazma iznin yok" description="Bu bölüm news.write izni gerektirir." />;
  const categories = await listNewsCategories(getDatabase().db);
  return <section><Link href="/admin/news" className="text-xs text-accent-400">← Haber yönetimi</Link>
    <h2 className="mb-5 mt-3 text-xl font-semibold text-white">Yeni haber taslağı</h2>
    {categories.length ? <ArticleForm categories={categories} /> : <p className="text-sm text-zinc-400">Yazı oluşturmak için en az bir haber kategorisi gerekli.</p>}
  </section>;
}
