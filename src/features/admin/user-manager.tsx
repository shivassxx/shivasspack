"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { listAdminUsers } from "@/services/admin/users";

type Data = Awaited<ReturnType<typeof listAdminUsers>>;

export function UserManager({ data }: { data: Data }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function assign(id: string, roleId: string) {
    setBusy(id); setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId }) });
      const payload = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Rol atanamadı.");
      setMessage("Kullanıcı rolü değiştirildi. Oturum izinleri sonraki istekte güncellenir.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Rol atanamadı."); }
    finally { setBusy(null); }
  }

  const pageHref = (page: number) => `/admin/users?q=${encodeURIComponent(data.q)}&page=${page}`;
  return (
    <section aria-labelledby="users-heading" className="space-y-5">
      <div><h2 id="users-heading" className="text-lg font-semibold text-white">Kullanıcılar</h2>
        <p className="mt-1 text-sm text-zinc-400">Kullanıcı adında ara; alt seviyedeki hesaplara rol ata. Kendi rolünü değiştiremezsin.</p></div>
      <form action="/admin/users" method="get" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={data.q} maxLength={32} placeholder="Kullanıcı adı" aria-label="Kullanıcı adıyla ara" className="h-10 min-w-56 flex-1 rounded-md border border-line bg-surface-900 px-3 text-sm text-white" />
        <button className="rounded-md bg-accent-600 px-4 text-sm font-medium text-white">Ara</button>
      </form>
      <p role="status" className="text-sm text-accent-400">{message}</p>
      {data.roles.length === 0 ? <p className="text-sm text-zinc-400">Rol atamak için ayrıca role.manage izni gerekir.</p> : null}
      <div className="space-y-2">
        {data.items.map((user) => <form key={user.id} onSubmit={(event) => {
          event.preventDefault();
          const roleId = new FormData(event.currentTarget).get("roleId");
          if (typeof roleId === "string") void assign(user.id, roleId);
        }} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-900 p-4">
          <div className="min-w-0">
            <p className="font-medium text-white">{user.displayName} <span className="text-sm font-normal text-zinc-500">@{user.username}</span></p>
            <p className="mt-1 text-xs text-zinc-500">{user.email} · {user.status} · {user.roleName}</p>
          </div>
          {user.editable && data.roles.length > 0 ? <div className="flex gap-2">
            <select name="roleId" defaultValue={user.roleId} disabled={busy !== null} aria-label={`${user.username} için rol`} className="h-9 rounded-md border border-line bg-surface-950 px-2 text-sm text-zinc-200">
              {data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
            <button disabled={busy !== null} className="rounded-md border border-line px-3 text-sm text-zinc-200 disabled:opacity-50">Ata</button>
          </div> : <span className="text-xs text-zinc-500">Korunan hesap</span>}
        </form>)}
        {data.items.length === 0 ? <p className="rounded-xl border border-line p-6 text-sm text-zinc-400">Eşleşen kullanıcı bulunamadı.</p> : null}
      </div>
      <nav aria-label="Kullanıcı sayfaları" className="flex items-center justify-between text-sm text-zinc-400">
        <span>{data.total} kullanıcı · Sayfa {data.page}/{data.pageCount}</span>
        <div className="flex gap-3">
          {data.page > 1 ? <Link className="text-accent-400" href={pageHref(data.page - 1)}>Önceki</Link> : null}
          {data.page < data.pageCount ? <Link className="text-accent-400" href={pageHref(data.page + 1)}>Sonraki</Link> : null}
        </div>
      </nav>
    </section>
  );
}
