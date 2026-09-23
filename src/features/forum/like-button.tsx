"use client";

import { useState } from "react";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";

export function ForumLikeButton({ type, id, liked: initialLiked, count: initialCount }: {
  type: "topic" | "reply"; id: string; liked: boolean; count: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  async function toggle() {
    setPending(true);
    const result = await requestJson<{ liked: boolean; likeCount: number }>(`/api/forum/likes/${type}/${id}`,
      { method: liked ? "DELETE" : "PUT" });
    setPending(false);
    if (!result.ok) { toast.error(result.message); return; }
    setLiked(result.data.liked);
    setCount(result.data.likeCount);
  }
  return <button type="button" aria-pressed={liked} disabled={pending} onClick={() => void toggle()}
    className="rounded-md border border-line px-3 py-1.5 text-xs text-zinc-300 hover:text-accent-300 disabled:opacity-60">
    {liked ? "Beğenildi" : "Beğen"} · {count}
  </button>;
}
