"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { submissionStatusClass, submissionStatusLabels } from "@/lib/submission-state";
import { formatDate } from "@/lib/utils";
import type { SubmissionDetail } from "@/services/submissions";
import {
  Fields,
  primaryButton,
  readForm,
  secondaryButton,
  type Option,
  type SubmissionFormValues,
} from "./submission-form";

/** Decision outcomes where the author edits and resends straight from the list. */
const resubmittableStatuses = new Set(["changes_requested", "rejected"]);

function toFormValues(item: SubmissionDetail): SubmissionFormValues {
  return {
    title: item.title,
    excerpt: item.excerpt,
    description: item.description,
    categoryId: item.categoryId,
    sourceUrl: item.sourceUrl,
    license: item.license,
    tagIds: item.tagIds,
  };
}

export function SubmissionList({ items, categories, tags }: {
  items: SubmissionDetail[];
  categories: Option[];
  tags: Option[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function resubmit(item: SubmissionDetail) {
    const form = document.getElementById(`inline-edit-${item.id}`) as HTMLFormElement | null;
    if (!form) return;
    setPending(true);
    try {
      const save = await requestJson(`/api/submissions/${item.id}`, { method: "PATCH", body: readForm(form) });
      if (!save.ok) {
        toast.error(save.message);
        return;
      }
      const send = await requestJson(`/api/submissions/${item.id}/status`, { method: "POST", body: { action: "submit" } });
      if (!send.ok) {
        toast.error(send.message);
        router.refresh();
        return;
      }
      toast.success("İncelemeye yeniden gönderildi.");
      setOpenId(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => {
        const resubmittable = resubmittableStatuses.has(item.status);
        const open = resubmittable && openId === item.id;
        return (
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
            {resubmittable && !open ? (
              <button
                id={`inline-edit-btn-${item.id}`}
                type="button"
                disabled={pending}
                onClick={() => setOpenId(item.id)}
                className={`${secondaryButton} mt-3 h-9`}
              >
                Düzenle ve tekrar gönder
              </button>
            ) : null}
            {open ? (
              <form
                id={`inline-edit-${item.id}`}
                aria-label="Gönderiyi düzenle ve tekrar gönder"
                className="mt-4 border-t border-line pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void resubmit(item);
                }}
              >
                <Fields categories={categories} tags={tags} initial={toFormValues(item)} disabled={pending} />
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="submit" disabled={pending} className={primaryButton}>
                    {pending ? "Gönderiliyor…" : "Kaydet ve tekrar gönder"}
                  </button>
                  <button type="button" disabled={pending} onClick={() => setOpenId(null)} className={secondaryButton}>
                    Vazgeç
                  </button>
                </div>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
