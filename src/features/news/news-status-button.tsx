"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import type { NewsAction } from "@/services/news";

export function NewsStatusButton({ id, action, label }: { id: string; action: NewsAction; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return <button type="button" disabled={pending} onClick={() => {
    setPending(true);
    void (async () => {
      const result = await requestJson(`/api/admin/news/${id}/status`, { method: "POST", body: { action } });
      setPending(false);
      if (!result.ok) { toast.error(result.message); return; }
      toast.success("Haber durumu güncellendi.");
      router.refresh();
    })();
  }} className="rounded-md border border-line px-3 py-1.5 text-xs text-white hover:border-accent-500/50 disabled:opacity-60">{pending ? "İşleniyor…" : label}</button>;
}
