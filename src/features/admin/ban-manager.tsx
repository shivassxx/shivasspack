"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";
import type { listBanTargets } from "@/services/admin/users";

type Data = Awaited<ReturnType<typeof listBanTargets>>;

export function BanManager({ data }: { data: Data }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  async function decide(id: string, action: "ban" | "unban", form?: HTMLFormElement) {
    const values = form ? new FormData(form) : null;
    setPending(id);
    const result = await requestJson(`/api/admin/bans/${id}`, { method: "PATCH", body: {
      action, ...(action === "ban" ? { days: Number(values?.get("days")), reason: String(values?.get("reason") ?? "") } : {}),
    } });
    setPending(null);
    if (!result.ok) { toast.error(result.message); return; }
    toast.success(action === "ban" ? "Kullanıcı yasaklandı." : "Yasak kaldırıldı.");
    router.refresh();
  }
  return <section>
    <h2 className="text-xl font-semibold text-white">Kullanıcı yasakları</h2>
    <p className="mt-2 text-sm text-zinc-400">Alt seviyedeki hesapları kullanıcı adına göre ara; etkin yasaklar aşağıda gösterilir.</p>
    <form action="/admin/bans" className="mt-5 flex gap-2">
      <input name="q" defaultValue={data.q} maxLength={32} placeholder="Kullanıcı adı" aria-label="Kullanıcı adı"
        className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface-900 px-3 text-sm text-white" />
      <button type="submit" className="rounded-md bg-accent-600 px-4 text-sm font-medium text-white">Ara</button>
    </form>
    {data.items.length ? <ul className="mt-5 space-y-3">{data.items.map((user) => <li key={user.id} className="rounded-xl border border-line bg-surface-900 p-4">
      <p className="font-medium text-white">{user.displayName} (@{user.username}) <span className="text-xs text-zinc-400">· {user.roleName}</span></p>
      {user.banUntil && user.banUntil > new Date() ? <p className="mt-1 text-sm text-zinc-400">{formatDate(user.banUntil)} tarihine kadar yasaklı · {user.bannedReason}</p> : null}
      {user.manageable ? <div className="mt-3">
        {user.banUntil && user.banUntil > new Date() ? <button type="button" disabled={pending !== null} onClick={() => void decide(user.id, "unban")}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-white disabled:opacity-60">Yasağı kaldır</button> :
          <form onSubmit={(event) => { event.preventDefault(); void decide(user.id, "ban", event.currentTarget); }} className="flex flex-wrap gap-2">
            <label className="text-xs text-zinc-300">Gün <input name="days" type="number" required min={1} max={365} defaultValue={7} disabled={pending !== null}
              className="ml-1 h-9 w-20 rounded-md border border-line bg-surface-950 px-2 text-white" /></label>
            <input name="reason" required minLength={10} maxLength={500} disabled={pending !== null} placeholder="Yasak gerekçesi"
              className="h-9 min-w-48 flex-1 rounded-md border border-line bg-surface-950 px-2 text-sm text-white" />
            <button type="submit" disabled={pending !== null} className="rounded-md border border-line px-3 text-xs text-white disabled:opacity-60">Yasakla</button>
          </form>}
      </div> : <p className="mt-2 text-xs text-zinc-500">Korunan hesap</p>}
    </li>)}</ul> : <p className="mt-5 rounded-xl border border-line bg-surface-900 p-5 text-sm text-zinc-400">{data.q ? "Eşleşen kullanıcı yok." : "Etkin yasak yok. Kullanıcı adıyla arayabilirsin."}</p>}
  </section>;
}
