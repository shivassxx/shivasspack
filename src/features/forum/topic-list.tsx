import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { listForumTopics } from "@/services/forum";

type TopicListItem = Awaited<ReturnType<typeof listForumTopics>>["items"][number];

export function TopicList({ items }: { items: TopicListItem[] }) {
  if (!items.length) {
    return <p className="rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">Henüz konu açılmamış.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((topic) => (
        <li key={topic.id} className="rounded-xl border border-line bg-surface-900 p-4 transition hover:border-line-strong">
          <div className="flex flex-wrap items-center gap-2">
            {topic.isPinned ? <span className="rounded-full bg-accent-600/20 px-2 py-0.5 text-xs text-accent-300">Sabit</span> : null}
            {topic.isLocked ? <span className="rounded-full bg-zinc-600/20 px-2 py-0.5 text-xs text-zinc-300">Kilitli</span> : null}
            <Link href={`/forum/topic/${topic.slug}`} className="font-semibold text-white hover:text-accent-300">{topic.title}</Link>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            <Link href={`/forum/${topic.categorySlug}`} className="hover:text-accent-300">{topic.categoryName}</Link>
            {" · "}{topic.authorName}{" · "}{formatDate(topic.lastReplyAt ?? topic.createdAt)}
            {" · "}{topic.replyCount} yanıt
          </p>
        </li>
      ))}
    </ul>
  );
}
