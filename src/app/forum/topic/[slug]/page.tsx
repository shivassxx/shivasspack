import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/db/client";
import { formatDate } from "@/lib/utils";
import { getForumTopic } from "@/services/forum";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const topic = await getForumTopic(getDatabase().db, slug);
  if (!topic) return {};
  return { title: `${topic.title} · Forum`, description: topic.body.slice(0, 160),
    alternates: { canonical: `/forum/topic/${topic.slug}` } };
}

export default async function ForumTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = await getForumTopic(getDatabase().db, slug);
  if (!topic) notFound();
  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <nav aria-label="İçerik yolu" className="text-xs text-zinc-500">
        <Link href="/forum" className="hover:text-accent-300">Forum</Link> / <Link href={`/forum/${topic.categorySlug}`} className="hover:text-accent-300">{topic.categoryName}</Link>
      </nav>
      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {topic.isPinned ? <span className="rounded-full bg-accent-600/20 px-2 py-0.5 text-accent-300">Sabit</span> : null}
          {topic.isLocked ? <span className="rounded-full bg-zinc-600/20 px-2 py-0.5">Kilitli</span> : null}
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-white">{topic.title}</h1>
        <p className="mt-3 text-sm text-zinc-400">{topic.authorName} (@{topic.authorUsername}) · <time dateTime={topic.createdAt.toISOString()}>{formatDate(topic.createdAt)}</time></p>
      </header>
      <div className="mt-7 whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-900 p-6 text-sm leading-7 text-zinc-200">{topic.body}</div>
    </article>
  );
}
