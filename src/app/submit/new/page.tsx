import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { VersionCreateForm } from "@/features/submissions/submission-form";
import { getCurrentSession } from "@/lib/auth-context";
import { submissionStatusClass, submissionStatusLabels } from "@/lib/submission-state";
import { formatDate } from "@/lib/utils";
import { assertActive } from "@/services/rbac";
import { listSubmissions } from "@/services/submissions";

export const metadata: Metadata = { title: "Yeni sürüm ekle", robots: { index: false, follow: false } };

export default async function NewVersionPage({ searchParams }: { searchParams: Promise<{ pack?: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/submit/new");
  let canEdit = false;
  try {
    assertActive(session.actor);
    canEdit = session.actor.permissions.has("pack.edit_own");
  } catch {
    canEdit = false;
  }
  if (!canEdit) {
    return <PageState code="403" title="Sürüm ekleme iznin yok" description="Yeni sürüm eklemek için pack.edit_own izni gerekiyor." />;
  }
  const { pack } = await searchParams;
  const db = getDatabase().db;
  const submissions = await listSubmissions(db, session.actor);
  const approved = submissions.filter((item) => item.status === "approved");
  if (approved.length === 0) {
    return (
      <PageState
        code="404"
        title="Onaylı paketin yok"
        description="Yeni sürüm yalnızca incelemeden geçip yayına çıkmış kendi paketlerine eklenebilir."
      >
        <Link href="/submit" className="inline-flex items-center rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500">
          Gönderilerime dön
        </Link>
      </PageState>
    );
  }
  const initialPackId = approved.some((item) => item.id === pack) ? pack : approved[0]!.id;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <nav aria-label="İçerik yolu" className="flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/submit" className="hover:text-accent-400">Gönderilerim</Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="text-zinc-400">Yeni sürüm</span>
      </nav>
      <h1 className="mt-3 text-3xl font-semibold text-white">Yeni sürüm ekle</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Yayındaki paketine sürüm eklediğinde en güncel sürüm olarak işaretlenir; indirme bağlantısı bu adrese geçer.
      </p>
      <div className="mt-6">
        <VersionCreateForm
          packs={approved.map((item) => ({ id: item.id, slug: item.slug, title: item.title }))}
          initialPackId={initialPackId}
        />
      </div>
      <section aria-labelledby="versionable-packs" className="mt-9">
        <h2 id="versionable-packs" className="text-xl font-semibold text-white">Sürüm eklenebilir paketlerin</h2>
        <ul className="mt-4 space-y-3">
          {approved.map((item) => (
            <li key={item.id} className="rounded-xl border border-line bg-surface-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href={`/packs/${item.slug}`} className="truncate font-medium text-white hover:text-accent-300">
                  {item.title}
                </Link>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${submissionStatusClass[item.status] ?? submissionStatusClass.draft}`}>
                  {submissionStatusLabels[item.status] ?? item.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Yayın tarihi: {item.publishedAt ? formatDate(item.publishedAt) : "—"}
                {" · "}
                <Link href={`/submit/${item.id}`} className="text-accent-400 hover:text-accent-300">Gönderi ayrıntısı</Link>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
