"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

export function LikeButton({ slug, initialLiked, initialCount }: { slug: string; initialLiked: boolean; initialCount: number }) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/packs/${encodeURIComponent(slug)}/like`, { method: liked ? "DELETE" : "PUT" });
      const body = await response.json() as { liked?: boolean; likeCount?: number; error?: { message: string } };
      if (!response.ok || typeof body.liked !== "boolean" || typeof body.likeCount !== "number") {
        throw new Error(body.error?.message ?? "Beğeni kaydedilemedi.");
      }
      setLiked(body.liked); setCount(body.likeCount);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Beğeni kaydedilemedi.");
    } finally { setPending(false); }
  }

  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" aria-pressed={liked} disabled={pending} onClick={() => void toggle()}
      className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-900 px-4 py-2 text-sm text-zinc-200 transition hover:border-accent-500 hover:text-white disabled:opacity-50">
      <Heart className="size-4" fill={liked ? "currentColor" : "none"} aria-hidden />
      {pending ? "Kaydediliyor…" : liked ? "Beğeniyi kaldır" : "Beğen"}
    </button>
    <span className="text-xs text-zinc-500">{count} beğeni</span>
    {error ? <span role="alert" className="text-sm text-red-400">{error}</span> : null}
  </div>;
}
