"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import {
  canEditSubmission,
  canSubmitForReview,
  canWithdrawSubmission,
} from "@/lib/submission-state";

type Option = { id: string; name: string };

const inputClass = "h-10 rounded-md border border-line bg-surface-950 px-3 text-sm text-white outline-none focus:border-accent-500 disabled:opacity-60";
const textAreaClass = "min-h-24 rounded-md border border-line bg-surface-950 p-3 text-sm text-white outline-none focus:border-accent-500 disabled:opacity-60";
const primaryButton = "inline-flex h-10 items-center justify-center rounded-md bg-accent-600 px-4 text-sm font-semibold text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton = "inline-flex h-10 items-center justify-center rounded-md border border-line bg-surface-950 px-4 text-sm font-medium text-zinc-200 transition hover:border-accent-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60";

export type SubmissionFormValues = {
  title: string;
  excerpt: string;
  description: string;
  categoryId: string;
  sourceUrl: string | null;
  license: string | null;
  tagIds: string[];
};

function readForm(form: HTMLFormElement): SubmissionFormValues {
  const data = new FormData(form);
  return {
    title: String(data.get("title") ?? ""),
    excerpt: String(data.get("excerpt") ?? ""),
    description: String(data.get("description") ?? ""),
    categoryId: String(data.get("categoryId") ?? ""),
    sourceUrl: String(data.get("sourceUrl") ?? ""),
    license: String(data.get("license") ?? ""),
    tagIds: data.getAll("tagIds").filter((value): value is string => typeof value === "string"),
  };
}

function Fields({ categories, tags, initial, disabled }: {
  categories: Option[];
  tags: Option[];
  initial?: SubmissionFormValues;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <input name="title" required minLength={3} maxLength={120} defaultValue={initial?.title ?? ""}
        placeholder="Paket başlığı" disabled={disabled} className={inputClass} aria-label="Başlık" />
      <select name="categoryId" required disabled={disabled} className={inputClass} aria-label="Kategori"
        defaultValue={initial?.categoryId ?? ""}>
        <option value="">Kategori seç</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
      <select name="tagIds" multiple disabled={disabled} defaultValue={initial?.tagIds ?? []}
        className="min-h-24 rounded-md border border-line bg-surface-950 p-2 text-sm text-white disabled:opacity-60"
        aria-label="Etiketler">
        {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
      </select>
      <div className="grid gap-3">
        <input name="sourceUrl" type="url" maxLength={2048} defaultValue={initial?.sourceUrl ?? ""}
          placeholder="Kaynak URL (isteğe bağlı)" disabled={disabled} className={inputClass} aria-label="Kaynak URL" />
        <input name="license" maxLength={120} defaultValue={initial?.license ?? ""}
          placeholder="Lisans (isteğe bağlı)" disabled={disabled} className={inputClass} aria-label="Lisans" />
      </div>
      <textarea name="excerpt" required minLength={10} maxLength={300} defaultValue={initial?.excerpt ?? ""}
        placeholder="Kısa özet" disabled={disabled} className={`${textAreaClass} lg:col-span-2`} aria-label="Özet" />
      <textarea name="description" required minLength={20} maxLength={50000} defaultValue={initial?.description ?? ""}
        placeholder="Ayrıntılı açıklama" disabled={disabled} className={`${textAreaClass} lg:col-span-2`} aria-label="Açıklama" />
    </div>
  );
}

export function SubmissionCreateForm({ categories, tags }: { categories: Option[]; tags: Option[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <form
      aria-label="Yeni gönderi"
      className="rounded-xl border border-line bg-surface-900 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setPending(true);
        void (async () => {
          const result = await requestJson<{ submission: { id: string } }>("/api/submissions", {
            method: "POST",
            body: readForm(form),
          });
          setPending(false);
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          toast.success("Taslak oluşturuldu.");
          router.push(`/submit/${result.data.submission.id}`);
          router.refresh();
        })();
      }}
    >
      <h2 className="text-base font-semibold text-white">Yeni gönderi oluştur</h2>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        Gönderiler taslak olarak başlar; incelemeye göndermeden önce düzenleyebilirsin.
      </p>
      <div className="mt-4"><Fields categories={categories} tags={tags} /></div>
      <button type="submit" disabled={pending} className={`${primaryButton} mt-4`}>
        {pending ? "Oluşturuluyor…" : "Taslak oluştur"}
      </button>
    </form>
  );
}

export function SubmissionEditor({ initial, categories, tags }: {
  initial: SubmissionFormValues & { id: string; status: string };
  categories: Option[];
  tags: Option[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const editable = canEditSubmission(initial.status);

  async function run(action: "save" | "submit" | "withdraw") {
    setSaving(action === "save");
    setActing(action !== "save");
    const form = document.getElementById("submission-edit-form") as HTMLFormElement | null;
    const result = action === "save"
      ? await requestJson(`/api/submissions/${initial.id}`, { method: "PATCH", body: form ? readForm(form) : {} })
      : await requestJson(`/api/submissions/${initial.id}/status`, { method: "POST", body: { action } });
    setSaving(false);
    setActing(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(action === "save" ? "Kaydedildi." : action === "submit" ? "İncelemeye gönderildi." : "Taslağa alındı.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form
        id="submission-edit-form"
        aria-label="Gönderi düzenle"
        className="rounded-xl border border-line bg-surface-900 p-5"
        onSubmit={(event) => { event.preventDefault(); void run("save"); }}
      >
        <Fields categories={categories} tags={tags} initial={initial} disabled={!editable || saving} />
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" disabled={!editable || saving} className={primaryButton}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          {canSubmitForReview(initial.status) ? (
            <button type="button" disabled={acting} onClick={() => void run("submit")} className={secondaryButton}>
              {acting ? "Gönderiliyor…" : "İncelemeye gönder"}
            </button>
          ) : null}
          {canWithdrawSubmission(initial.status) ? (
            <button type="button" disabled={acting} onClick={() => void run("withdraw")} className={secondaryButton}>
              {acting ? "Geri alınıyor…" : "Geri çek"}
            </button>
          ) : null}
        </div>
        {!editable ? (
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Bu gönderi incelemede veya yayında olduğu için alanlar kilitli.
          </p>
        ) : null}
      </form>
    </div>
  );
}

export function SubmissionReviewItem({ item }: {
  item: { id: string; title: string; excerpt: string; authorName: string; authorUsername: string; updatedAt: string };
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<null | "approved" | "rejected" | "changes_requested">(null);

  async function decide(decision: "approved" | "rejected" | "changes_requested") {
    const trimmed = note.trim();
    if (decision !== "approved" && trimmed.length < 3) {
      toast.error("Olumsuz karar için en az 3 karakterlik not gerekli.");
      return;
    }
    setPending(decision);
    const result = await requestJson(`/api/admin/submissions/${item.id}`, {
      method: "PATCH",
      body: { decision, reviewNote: decision === "approved" ? null : trimmed },
    });
    setPending(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setNote("");
    toast.success("Karar kaydedildi.");
    router.refresh();
  }

  return (
    <article className="rounded-xl border border-line bg-surface-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">{item.title}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {item.authorName} (@{item.authorUsername}) · {new Date(item.updatedAt).toISOString().slice(0, 10)}
          </p>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">{item.excerpt}</p>
        </div>
      </div>
      <label className="mt-4 block text-xs font-medium text-zinc-400" htmlFor={`review-note-${item.id}`}>
        İnceleme notu (reddet / değişiklik iste)
      </label>
      <textarea
        id={`review-note-${item.id}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        minLength={3}
        maxLength={1000}
        placeholder="Yazara iletilecek gerekçe"
        className={`${textAreaClass} mt-1 min-h-20`}
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" disabled={pending !== null} onClick={() => void decide("approved")}
          className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
          {pending === "approved" ? "İşleniyor…" : "Onayla"}
        </button>
        <button type="button" disabled={pending !== null} onClick={() => void decide("changes_requested")}
          className="inline-flex h-9 items-center rounded-md bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60">
          {pending === "changes_requested" ? "İşleniyor…" : "Değişiklik iste"}
        </button>
        <button type="button" disabled={pending !== null} onClick={() => void decide("rejected")}
          className="inline-flex h-9 items-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60">
          {pending === "rejected" ? "İşleniyor…" : "Reddet"}
        </button>
      </div>
    </article>
  );
}
