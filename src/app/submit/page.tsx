import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { SubmissionCreateForm } from "@/features/submissions/submission-form";
import { SubmissionList } from "@/features/submissions/submission-list";
import { getCurrentSession } from "@/lib/auth-context";
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
          <SubmissionList items={submissions} categories={options.categories} tags={options.tags}
            canEdit={session.actor.permissions.has("pack.edit_own")} />
        ) : (
          <div className="mt-4 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">
            Henüz bir gönderin yok. Yukarıdaki formdan ilk taslağını oluştur.
          </div>
        )}
      </section>
    </div>
  );
}
