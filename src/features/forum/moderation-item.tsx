"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import type { ForumModerationAction } from "@/services/forum";

export function ForumModerationItem({ item }: { item: {
  id: string; slug: string; title: string; status: string; isLocked: boolean; isPinned: boolean;
  categoryName: string; authorName: string;
} }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function act(action: ForumModerationAction) {
    setPending(true);
    const result = await requestJson(`/api/admin/forum/topics/${item.id}`, { method: "PATCH", body: { action } });
    setPending(false);
    if (!result.ok) { toast.error(result.message); return; }
    toast.success("Konu güncellendi.");
    router.refresh();
  }
  const buttonClass = "rounded-md border border-line bg-surface-950 px-3 py-1.5 text-xs text-zinc-300 hover:border-accent-500/50 hover:text-white disabled:opacity-60";
  return (
    <li className="rounded-xl border border-line bg-surface-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {item.status === "visible" ? <Link href={`/forum/topic/${item.slug}`} className="font-medium text-white hover:text-accent-300">{item.title}</Link>
          : <span className="font-medium text-zinc-300">{item.title}</span>}
        <span className="text-xs text-zinc-400">{item.status === "hidden" ? "Gizli" : "Görünür"}{item.isLocked ? " · Kilitli" : ""}{item.isPinned ? " · Sabit" : ""}</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{item.categoryName} · {item.authorName}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={buttonClass} onClick={() => void act(item.isLocked ? "unlock" : "lock")}>{item.isLocked ? "Kilidi aç" : "Kilitle"}</button>
        <button type="button" disabled={pending} className={buttonClass} onClick={() => void act(item.isPinned ? "unpin" : "pin")}>{item.isPinned ? "Sabiti kaldır" : "Sabitle"}</button>
        <button type="button" disabled={pending} className={buttonClass} onClick={() => void act(item.status === "hidden" ? "show" : "hide")}>{item.status === "hidden" ? "Yeniden göster" : "Gizle"}</button>
      </div>
    </li>
  );
}
