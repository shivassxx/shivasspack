import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { SubmissionEditor } from "@/features/submissions/submission-form";
import { getCurrentSession } from "@/lib/auth-context";
import { submissionStatusClass, submissionStatusLabels } from "@/lib/submission-state";
import { formatDate } from "@/lib/utils";
import { assertActive } from "@/services/rbac";
import { getOwnSubmission, listSubmissionOptions } from "@/services/submissions";

export const metadata: Metadata = { title: "Gönderiyi düzenle", robots: { index: false, follow: false } };

export default async function SubmissionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  let canEdit = false;
  try {
    assertActive(session.actor);
    canEdit = session.actor.permissions.has("pack.edit_own");
  } catch {
    canEdit = false;
  }
  if (!canEdit) {
    return <PageState code="403" title="Gönderi iznin yok" description="Gönderileri düzenlemek için pack.edit_own izni gerekiyor." />;
  }
  const { id } = await params;
  const db = getDatabase().db;
  const [submission, options] = await Promise.all([
    getOwnSubmission(db, session.actor, id),
    listSubmissionOptions(db),
  ]);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <nav aria-label="İçerik yolu" className="flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/submit" className="hover:text-accent-400">Gönderilerim</Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="truncate text-zinc-400">{submission.title}</span>
      </nav>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-white">{submission.title}</h1>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${submissionStatusClass[submission.status] ?? submissionStatusClass.draft}`}>
          {submissionStatusLabels[submission.status] ?? submission.status}
        </span>
        {submission.status === "approved" ? (
          <Link href={`/packs/${submission.slug}`} className="text-sm text-accent-400 hover:text-accent-300">
            Yayındaki sayfa ↗
          </Link>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Son güncelleme: {formatDate(submission.updatedAt)}</p>
      {submission.reviewNote ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">İnceleme notu</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-100">{submission.reviewNote}</p>
        </div>
      ) : null}
      <div className="mt-6">
        <SubmissionEditor
          categories={options.categories}
          tags={options.tags}
          initial={{
            id: submission.id,
            status: submission.status,
            title: submission.title,
            excerpt: submission.excerpt,
            description: submission.description,
            categoryId: submission.categoryId,
            sourceUrl: submission.sourceUrl,
            license: submission.license,
            tagIds: submission.tagIds,
          }}
        />
      </div>
    </div>
  );
}
