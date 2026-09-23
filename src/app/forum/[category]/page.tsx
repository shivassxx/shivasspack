import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/db/client";
import { TopicList } from "@/features/forum/topic-list";
import { getCurrentSession } from "@/lib/auth-context";
import { forumPage, getForumCategory, listForumTopics } from "@/services/forum";
import { assertActive } from "@/services/rbac";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getForumCategory(getDatabase().db, slug);
  if (!category) return {};
  return { title: `${category.name} · Forum`, description: category.description ?? `${category.name} forum konuları.`,
    alternates: { canonical: `/forum/${category.slug}` } };
}

export default async function ForumCategoryPage({ params, searchParams }: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { category: slug } = await params;
  const db = getDatabase().db;
  const category = await getForumCategory(db, slug);
  if (!category) notFound();
  const [topics, session] = await Promise.all([
    listForumTopics(db, { categorySlug: slug, page: forumPage((await searchParams).page) }), getCurrentSession(),
  ]);
  let canCreate = false;
  if (session) {
    try { assertActive(session.actor); canCreate = session.actor.permissions.has("forum.topic.create"); } catch { /* read-only */ }
  }
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="İçerik yolu" className="text-xs text-zinc-500"><Link href="/forum" className="hover:text-accent-300">Forum</Link> / {category.name}</nav>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-semibold text-white">{category.name}</h1>
          {category.description ? <p className="mt-2 text-sm text-zinc-400">{category.description}</p> : null}</div>
        {canCreate ? <Link href={`/forum/new?category=${category.slug}`} className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500">Yeni konu</Link> : null}
      </div>
      <div className="mt-8"><TopicList items={topics.items} /></div>
      {topics.pageCount > 1 ? <nav aria-label="Konu sayfaları" className="mt-6 flex items-center gap-4 text-sm">
        {topics.page > 1 ? <Link href={`/forum/${slug}?page=${topics.page - 1}`} className="text-accent-400 hover:text-accent-300">Önceki</Link> : null}
        <span className="text-zinc-400">{topics.page} / {topics.pageCount}</span>
        {topics.page < topics.pageCount ? <Link href={`/forum/${slug}?page=${topics.page + 1}`} className="text-accent-400 hover:text-accent-300">Sonraki</Link> : null}
      </nav> : null}
    </div>
  );
}
