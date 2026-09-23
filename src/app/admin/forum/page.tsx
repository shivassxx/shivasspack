import type { Metadata } from "next";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { ForumModerationItem } from "@/features/forum/moderation-item";
import { getCurrentSession } from "@/lib/auth-context";
import { listForumModeration } from "@/services/forum";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = { title: "Forum yönetimi", robots: { index: false, follow: false } };

export default async function AdminForumPage() {
  const session = await getCurrentSession();
  let allowed = false;
  if (session) {
    try { assertActive(session.actor); allowed = session.actor.permissions.has("forum.moderate"); } catch { /* denied */ }
  }
  if (!allowed || !session) return <PageState code="403" title="Forum yönetimi iznin yok" description="Forum konularını yönetmek için forum.moderate izni gerekiyor." />;
  const items = await listForumModeration(getDatabase().db, session.actor);
  return (
    <section aria-labelledby="forum-admin-heading">
      <h2 id="forum-admin-heading" className="text-xl font-semibold text-white">Forum konuları</h2>
      <p className="mt-2 text-sm text-zinc-400">Konuları kilitle, sabitle veya görünürlüğünü değiştir. Son güncellenen 100 konu listelenir.</p>
      {items.length ? <ul className="mt-5 space-y-3">{items.map((item) => <ForumModerationItem key={item.id} item={item} />)}</ul>
        : <p className="mt-5 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">Henüz konu yok.</p>}
    </section>
  );
}
