import type { Metadata } from "next";
import Link from "next/link";
import { PageState } from "@/components/ui/page-state";
import { getDatabase } from "@/db/client";
import { SubmissionReviewItem } from "@/features/submissions/submission-form";
import { getCurrentSession } from "@/lib/auth-context";
import { assertActive } from "@/services/rbac";
import { listSubmissionQueue } from "@/services/submissions";

export const metadata: Metadata = { title: "Gönderi inceleme" };

export default async function AdminSubmissionsPage() {
  const session = await getCurrentSession();
  if (!session) return <PageState code="401" title="Giriş gerekli" description="Bu bölüm için giriş yapmalısın." />;
  let canReview = false;
  try {
    assertActive(session.actor);
    canReview = session.actor.permissions.has("submission.review");
  } catch {
    canReview = false;
  }
  if (!canReview) {
    return <PageState code="403" title="İnceleme iznin yok" description="Gönderi kuyruğunu görmek için submission.review izni gerekiyor." />;
  }
  const queue = await listSubmissionQueue(getDatabase().db, session.actor);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">İnceleme kuyruğu</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Üyelerin incelemeye gönderdiği taslaklar en eski güncellemeden itibaren listelenir.
          </p>
        </div>
        <Link href="/admin/packs" className="text-sm text-accent-400 hover:text-accent-300">Tüm paketler ↗</Link>
      </div>
      {queue.length ? (
        <div className="mt-5 grid gap-4">
          {queue.map((item) => (
            <SubmissionReviewItem
              key={item.id}
              item={{
                ...item,
                updatedAt: item.updatedAt.toISOString(),
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">
          İnceleme bekleyen gönderi yok.
        </div>
      )}
    </div>
  );
}
