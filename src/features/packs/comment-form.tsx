"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CommentForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/packs/${encodeURIComponent(slug)}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Yorum gönderilemedi.");
      setBody(""); setMessage("Yorumun yayınlandı."); router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Yorum gönderilemedi."); }
    finally { setPending(false); }
  }

  return <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3 rounded-xl border border-line bg-surface-900 p-4">
    <label htmlFor="new-pack-comment" className="block text-sm font-medium text-white">Yorum yaz</label>
    <textarea id="new-pack-comment" value={body} onChange={(event) => setBody(event.target.value)}
      minLength={3} maxLength={2000} rows={4} required disabled={pending}
      placeholder="Paket hakkındaki görüşlerini paylaş…"
      className="w-full rounded-md border border-line bg-surface-950 p-3 text-sm text-white outline-none focus:border-accent-500" />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-zinc-500">{body.length}/2000 karakter</span>
      <button disabled={pending} className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "Gönderiliyor…" : "Yorumu gönder"}
      </button>
    </div>
    {message ? <p role="status" className="text-sm text-zinc-300">{message}</p> : null}
  </form>;
}
