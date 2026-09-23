"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";
import type { listModerationReports, ReportDecision } from "@/services/moderation";

type Report = Awaited<ReturnType<typeof listModerationReports>>[number];

export function ReportQueue({ items, canResolve }: { items: Report[]; canResolve: boolean }) {
  return <ul className="space-y-4">{items.map((item) => <ReportRow key={item.id} item={item} canResolve={canResolve} />)}</ul>;
}

function ReportRow({ item, canResolve }: { item: Report; canResolve: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const open = item.status === "open" || item.status === "reviewing";
  async function decide(action: ReportDecision) {
    setPending(true);
    const result = await requestJson(`/api/admin/moderation/${item.id}`, { method: "PATCH", body: { action, note: action === "reviewing" ? undefined : note } });
    setPending(false);
    if (!result.ok) { toast.error(result.message); return; }
    toast.success("Rapor güncellendi.");
    router.refresh();
  }
  return <li className="rounded-xl border border-line bg-surface-900 p-5">
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-line px-2 py-0.5 text-xs text-zinc-300">{item.status === "open" ? "Açık" : item.status === "reviewing" ? "İnceleniyor" : item.status === "resolved" ? "Çözüldü" : "Reddedildi"}</span>
      <span className="text-sm font-semibold text-white">{item.targetType === "topic" ? "Konu" : "Yanıt"}: {item.target?.title ?? item.targetId}</span>
    </div>
    <p className="mt-2 text-xs text-zinc-400">@{item.reporterName} · {formatDate(item.createdAt)}{item.target?.slug ? <> · <Link href={`/forum/topic/${item.target.slug}`} className="text-accent-400 hover:text-accent-300">Konuyu aç</Link></> : null}</p>
    {item.target ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-zinc-300">{item.target.body}</p> : null}
    <p className="mt-3 text-sm text-white">Gerekçe: {item.reason}</p>
    {item.details ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-400">{item.details}</p> : null}
    {item.resolution ? <p className="mt-2 text-sm text-zinc-400">Karar notu: {item.resolution}</p> : null}
    {open && canResolve ? <div className="mt-4 space-y-2">
      <label className="block text-xs text-zinc-300">Karar notu
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} disabled={pending}
          className="mt-1 block w-full rounded-md border border-line bg-surface-950 p-2 text-sm text-white" placeholder="Kararı açıklayın (en az 3 karakter)" />
      </label>
      <div className="flex flex-wrap gap-2">
        {item.status === "open" ? <button type="button" disabled={pending} onClick={() => void decide("reviewing")} className="rounded-md border border-line px-3 py-1.5 text-xs text-white disabled:opacity-60">İncelemeye al</button> : null}
        <button type="button" disabled={pending || note.trim().length < 3} onClick={() => void decide("resolved")} className="rounded-md border border-line px-3 py-1.5 text-xs text-white disabled:opacity-60">Çözüldü</button>
        <button type="button" disabled={pending || note.trim().length < 3} onClick={() => void decide("dismissed")} className="rounded-md border border-line px-3 py-1.5 text-xs text-white disabled:opacity-60">Reddet</button>
      </div>
    </div> : null}
  </li>;
}
