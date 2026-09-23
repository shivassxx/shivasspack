import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/db/client";
import { ReplyForm } from "@/features/forum/reply-form";
import { ForumReportForm } from "@/features/forum/report-form";
import { getCurrentSession } from "@/lib/auth-context";
import { formatDate } from "@/lib/utils";
import { forumPage, getForumTopic, listForumReplies } from "@/services/forum";
import { assertActive } from "@/services/rbac";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const topic = await getForumTopic(getDatabase().db, slug);
  if (!topic) return {};
  return { title: `${topic.title} · Forum`, description: topic.body.slice(0, 160),
    alternates: { canonical: `/forum/topic/${topic.slug}` } };
}

export default async function ForumTopicPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const db = getDatabase().db;
  const topic = await getForumTopic(db, slug);
  if (!topic) notFound();
  const [replies, session] = await Promise.all([
    listForumReplies(db, topic.id, forumPage((await searchParams).page)), getCurrentSession(),
  ]);
  let canReply = false;
  let active = false;
  if (session) {
    try { assertActive(session.actor); active = true; canReply = session.actor.permissions.has("forum.reply.create"); } catch { /* read-only */ }
  }
  const canEdit = active && session && (session.actor.permissions.has("forum.moderate") ||
    (session.actor.id === topic.authorId && session.actor.permissions.has("forum.edit_own") && !topic.isLocked));
  const canReport = active && session?.actor.permissions.has("forum.read");
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
        {canEdit ? <Link href={`/forum/topic/${topic.slug}/edit`} className="mt-3 inline-block text-sm text-accent-400 hover:text-accent-300">Konuyu düzenle</Link> : null}
        {canReport ? <ForumReportForm targetType="topic" targetId={topic.id} /> : null}
      </header>
      <div className="mt-7 whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-900 p-6 text-sm leading-7 text-zinc-200">{topic.body}</div>
      <section aria-labelledby="topic-replies" className="mt-10">
        <h2 id="topic-replies" className="text-xl font-semibold text-white">Yanıtlar ({replies.total})</h2>
        {replies.items.length ? <ol className="mt-4 space-y-3">
          {replies.items.map((reply) => <li key={reply.id} className="rounded-xl border border-line bg-surface-900 p-5">
            <p className="text-xs text-zinc-400">{reply.authorName} (@{reply.authorUsername}) · <time dateTime={reply.createdAt.toISOString()}>{formatDate(reply.createdAt)}</time></p>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-200">{reply.body}</p>
            {canReport ? <ForumReportForm targetType="reply" targetId={reply.id} /> : null}
          </li>)}
        </ol> : <p className="mt-4 text-sm text-zinc-400">Henüz yanıt yok.</p>}
        {replies.pageCount > 1 ? <nav aria-label="Yanıt sayfaları" className="mt-5 flex items-center gap-4 text-sm">
          {replies.page > 1 ? <Link href={`/forum/topic/${topic.slug}?page=${replies.page - 1}`} className="text-accent-400">Önceki</Link> : null}
          <span className="text-zinc-400">{replies.page} / {replies.pageCount}</span>
          {replies.page < replies.pageCount ? <Link href={`/forum/topic/${topic.slug}?page=${replies.page + 1}`} className="text-accent-400">Sonraki</Link> : null}
        </nav> : null}
        {topic.isLocked ? <p className="mt-6 rounded-lg border border-line p-4 text-sm text-zinc-400">Bu konu kilitli; yeni yanıt eklenemez.</p>
          : canReply ? <ReplyForm topicId={topic.id} />
          : !session ? <p className="mt-6 text-sm text-zinc-400"><Link href={`/login?next=/forum/topic/${topic.slug}`} className="text-accent-400 hover:text-accent-300">Giriş yap</Link> ve yanıt yaz.</p>
          : null}
      </section>
    </article>
  );
}
