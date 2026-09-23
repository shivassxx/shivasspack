import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { SubmissionCreateForm } from "@/features/submissions/submission-form";
import { getCurrentSession } from "@/lib/auth-context";
import { submissionStatusClass, submissionStatusLabels } from "@/lib/submission-state";
import { formatDate } from "@/lib/utils";
import { assertActive } from "@/services/rbac";
import { listSubmissionOptions, listSubmissions } from "@/services/submissions";

export const metadata: Metadata = { title: "Gönderilerim", robots: { index: false, follow: false } };

export default async function SubmitPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/submit");
  let canSubmit = false;
  try {
    assertActive(session.actor);
    canSubmit = session.actor.permissions.has("pack.submit");
  } catch {
    canSubmit = false;
  }
  if (!canSubmit) {
    return <PageState code="403" title="Gönderi iznin yok" description="Paket göndermek için hesabına pack.submit izni tanımlanmalı." />;
  }
  const db = getDatabase().db;
  const [options, submissions] = await Promise.all([listSubmissionOptions(db), listSubmissions(db, session.actor)]);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold text-white">Gönderilerim</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Topluluk paketlerini burada taslak olarak oluşturur, incelemeye gönderir ve karar durumunu takip edersin.
      </p>
      <div className="mt-6"><SubmissionCreateForm categories={options.categories} tags={options.tags} /></div>

      <section aria-labelledby="my-submissions" className="mt-9">
        <h2 id="my-submissions" className="text-xl font-semibold text-white">Gönderi listem</h2>
        {submissions.length ? (
          <ul className="mt-4 space-y-3">
            {submissions.map((item) => (
              <li key={item.id} className="rounded-xl border border-line bg-surface-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link href={`/submit/${item.id}`} className="truncate font-medium text-white hover:text-accent-300">
                    {item.title}
                  </Link>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${submissionStatusClass[item.status] ?? submissionStatusClass.draft}`}>
                    {submissionStatusLabels[item.status] ?? item.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Son güncelleme: {formatDate(item.updatedAt)}
                  {item.status === "approved" ? (
                    <>
                      {" · "}<Link href={`/packs/${item.slug}`} className="text-accent-400 hover:text-accent-300">Yayındaki sayfa</Link>
                      {" · "}<Link href={`/submit/new?pack=${item.id}`} className="text-accent-400 hover:text-accent-300">Yeni sürüm</Link>
                    </>
                  ) : null}
                </p>
                {item.reviewNote ? (
                  <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs leading-5 text-amber-200">
                    İnceleme notu: {item.reviewNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">
            Henüz bir gönderin yok. Yukarıdaki formdan ilk taslağını oluştur.
          </div>
        )}
      </section>
    </div>
  );
}
