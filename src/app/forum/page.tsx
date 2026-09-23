import type { Metadata } from "next";
import Link from "next/link";
import { getDatabase } from "@/db/client";
import { TopicList } from "@/features/forum/topic-list";
import { getCurrentSession } from "@/lib/auth-context";
import { listForumCategories, listForumTopics } from "@/services/forum";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = {
  title: "Forum", description: "FiveM paketleri, kurulum ve topluluk konuları.", alternates: { canonical: "/forum" },
};

export default async function ForumPage() {
  const db = getDatabase().db;
  const [categories, topics, session] = await Promise.all([
    listForumCategories(db), listForumTopics(db), getCurrentSession(),
  ]);
  let canCreate = false;
  if (session) {
    try { assertActive(session.actor); canCreate = session.actor.permissions.has("forum.topic.create"); } catch { /* no create action */ }
  }
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-semibold text-white">Forum</h1>
          <p className="mt-2 text-sm text-zinc-400">Paketleri tartış, kurulum için yardım al ve toplulukla konuş.</p></div>
        {canCreate && categories.length ? <Link href="/forum/new" className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500">Yeni konu</Link> : null}
      </div>
      <section aria-labelledby="forum-categories" className="mt-8">
        <h2 id="forum-categories" className="text-xl font-semibold text-white">Kategoriler</h2>
        {categories.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {categories.map((category) => <li key={category.id}>
            <Link href={`/forum/${category.slug}`} className="block h-full rounded-xl border border-line bg-surface-900 p-5 hover:border-accent-500/50">
              <span className="font-semibold text-white">{category.name}</span>
              {category.description ? <p className="mt-2 text-sm text-zinc-400">{category.description}</p> : null}
              <span className="mt-3 block text-xs text-zinc-500">{category.topicCount} konu</span>
            </Link>
          </li>)}
        </ul> : <p className="mt-4 text-sm text-zinc-400">Henüz açık kategori yok.</p>}
      </section>
      <section aria-labelledby="recent-topics" className="mt-10">
        <h2 id="recent-topics" className="mb-4 text-xl font-semibold text-white">Son konular</h2>
        <TopicList items={topics.items} />
      </section>
    </div>
  );
}
