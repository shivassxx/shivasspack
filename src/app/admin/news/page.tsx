import type { Metadata } from "next";
import Link from "next/link";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { NewsStatusButton } from "@/features/news/news-status-button";
import { getCurrentSession } from "@/lib/auth-context";
import { listAdminNews } from "@/services/news";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = { title: "Haber yönetimi", robots: { index: false, follow: false } };

export default async function AdminNewsPage() {
  const session = await getCurrentSession();
  let permitted = false;
  if (session) {
    try { assertActive(session.actor); permitted = session.actor.permissions.has("news.write") || session.actor.permissions.has("news.manage"); } catch { /* denied */ }
  }
  if (!session || !permitted) return <PageState code="403" title="Haber yönetimi iznin yok" description="Haber yönetimi izni gerekiyor." />;
  const items = await listAdminNews(getDatabase().db, session.actor);
  const canManage = session.actor.permissions.has("news.manage");
  return <section>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-xl font-semibold text-white">Haberler</h2>
        <p className="mt-2 text-sm text-zinc-400">Taslak oluştur, incelemeye gönder ve yayımlanacak haberleri yönet.</p></div>
      {session.actor.permissions.has("news.write") ? <Link href="/admin/news/new" className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white">Yeni haber</Link> : null}
    </div>
    {items.length ? <ul className="mt-6 space-y-3">{items.map((item) => <li key={item.id} className="rounded-xl border border-line bg-surface-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-semibold text-white">{item.title}</h3><p className="mt-1 text-xs text-zinc-400">{item.status === "draft" ? "Taslak" : item.status === "review" ? "İncelemede" : item.status === "published" ? "Yayında" : "Arşivde"} · /news/{item.slug}</p></div>
        {item.status === "published" ? <Link href={`/news/${item.slug}`} className="text-xs text-accent-400">Haberi gör ↗</Link> : null}
      </div>
      <p className="mt-2 text-sm text-zinc-400">{item.excerpt}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(item.status === "draft" || item.status === "review") && (canManage || item.authorId === session.actor.id && session.actor.permissions.has("news.write"))
          ? <Link href={`/admin/news/${item.id}`} className="rounded-md border border-line px-3 py-1.5 text-xs text-white">Düzenle</Link> : null}
        {item.status === "draft" && (canManage || item.authorId === session.actor.id && session.actor.permissions.has("news.write"))
          ? <NewsStatusButton id={item.id} action="review" label="İncelemeye gönder" /> : null}
        {item.status === "review" && canManage ? <NewsStatusButton id={item.id} action="publish" label="Yayınla" /> : null}
        {item.status === "published" && canManage ? <NewsStatusButton id={item.id} action="archive" label="Arşivle" /> : null}
      </div>
    </li>)}</ul> : <p className="mt-6 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">Henüz haber taslağı yok.</p>}
  </section>;
}
