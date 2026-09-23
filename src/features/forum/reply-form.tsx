"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";

export function ReplyForm({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <form className="mt-6 rounded-xl border border-line bg-surface-900 p-5" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = String(new FormData(form).get("body") ?? "");
      setPending(true);
      void (async () => {
        const result = await requestJson("/api/forum/replies", { method: "POST", body: { topicId, body } });
        setPending(false);
        if (!result.ok) { toast.error(result.message); return; }
        form.reset();
        toast.success("Yanıtın eklendi.");
        router.refresh();
      })();
    }}>
      <label htmlFor={`reply-${topicId}`} className="text-sm font-semibold text-white">Yanıt yaz</label>
      <textarea id={`reply-${topicId}`} name="body" rows={5} required minLength={3} maxLength={5000} disabled={pending}
        className="mt-2 block w-full rounded-md border border-line bg-surface-950 p-3 text-sm text-white focus:border-accent-500"
        placeholder="Düşünceni paylaş…" />
      <button type="submit" disabled={pending}
        className="mt-3 inline-flex h-10 items-center rounded-md bg-accent-600 px-5 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-60">
        {pending ? "Gönderiliyor…" : "Yanıt gönder"}
      </button>
    </form>
  );
}
