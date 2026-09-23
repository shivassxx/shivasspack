import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { TopicEditForm } from "@/features/forum/topic-edit-form";
import { getCurrentSession } from "@/lib/auth-context";
import { getForumTopic } from "@/services/forum";
import { assertActive } from "@/services/rbac";

export const metadata: Metadata = { title: "Konuyu düzenle · Forum", robots: { index: false, follow: false } };

export default async function EditForumTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/forum");
  const { slug } = await params;
  const topic = await getForumTopic(getDatabase().db, slug);
  if (!topic) notFound();
  let permitted = false;
  try {
    assertActive(session.actor);
    permitted = session.actor.permissions.has("forum.moderate") ||
      (session.actor.id === topic.authorId && session.actor.permissions.has("forum.edit_own") && !topic.isLocked);
  } catch { /* read-only */ }
  if (!permitted) return <PageState code="403" title="Konuyu düzenleme iznin yok" description="Kilitli konular yalnızca moderatörler tarafından düzenlenebilir." />;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <nav aria-label="İçerik yolu" className="text-xs text-zinc-500">
        <Link href="/forum" className="hover:text-accent-300">Forum</Link> / <Link href={`/forum/topic/${slug}`} className="hover:text-accent-300">{topic.title}</Link> / Düzenle
      </nav>
      <h1 className="mb-6 mt-4 text-3xl font-semibold text-white">Konuyu düzenle</h1>
      <TopicEditForm id={topic.id} slug={topic.slug} title={topic.title} body={topic.body} />
    </div>
  );
}
