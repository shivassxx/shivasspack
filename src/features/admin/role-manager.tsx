"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { listAdminRoles } from "@/services/admin/roles";

type Data = Awaited<ReturnType<typeof listAdminRoles>>;
type Role = Data["roles"][number];
type Permission = Data["permissions"][number];

const labels: Record<string, string> = {
  "pack.view": "Paketleri gör", "pack.submit": "Paket gönder", "pack.edit_own": "Kendi paketini düzenle",
  "pack.edit_any": "Tüm paketleri düzenle", "pack.publish": "Paket yayınla", "pack.feature": "Öne çıkar",
  "pack.delete": "Paket arşivle", "pack.manage": "Paket yönetimi", "category.manage": "Kategorileri yönet",
  "tag.manage": "Etiketleri yönet", "submission.review": "Gönderileri incele", "download.use": "İndirme",
  "installer.manifest.edit": "Manifest düzenle", "installer.manage": "Kurucuyu yönet",
  "forum.read": "Forumu oku", "forum.topic.create": "Konu aç", "forum.reply.create": "Yanıt yaz",
  "forum.edit_own": "Kendi iletilerini düzenle", "forum.moderate": "Forum yönetimi",
  "forum.category.manage": "Forum kategorileri", "moderation.access": "Moderasyon kuyruğu",
  "moderation.resolve": "Rapor çöz", "user.ban": "Kullanıcı yasakla", "user.manage": "Kullanıcıları gör/yönet",
  "user.delete": "Kullanıcı sil", "news.write": "Haber yaz", "news.manage": "Haber yönetimi",
  "ai.manage": "Yapay zekâ yönetimi", "profile.edit_own": "Profilini düzenle",
  "admin.dashboard": "Yönetim özeti", "admin.settings": "Site ayarları", "homepage.manage": "Ana sayfa yönetimi",
  "audit.view": "Denetim kayıtları", "role.manage": "Rolleri ve izinleri yönet",
  "analytics.view": "Analitikleri gör", "notification.manage": "Bildirimleri yönet",
};

const implemented = new Set([
  "pack.view", "pack.manage", "pack.publish", "pack.feature", "pack.delete",
  "category.manage", "tag.manage", "profile.edit_own", "admin.dashboard",
  "admin.settings", "homepage.manage", "role.manage", "user.manage",
]);

async function send(path: string, method: string, body: unknown) {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { error?: { message: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "İşlem tamamlanamadı.");
}

function RoleEditor({ role, permissions, actorRank, onSaved }: {
  role: Role | null; permissions: Permission[]; actorRank: number; onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState(role?.description ?? "");
  const [rank, setRank] = useState(Math.max(1, Math.min(15, actorRank - 1)));
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = role?.editable ?? true;
  const groups = [...new Set(permissions.map((item) => item.group))];

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (role) {
        await send(`/api/admin/roles/${role.id}`, "PATCH", { name, description, permissions: selected });
      } else {
        await send("/api/admin/roles", "POST", { key, name, description, rank, permissions: selected });
        setKey(""); setName(""); setDescription(""); setSelected([]);
      }
      onSaved(role ? "Rol ve izinleri kaydedildi." : "Özel rol oluşturuldu.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-5 rounded-xl border border-line bg-surface-900 p-5">
      <div>
        <h3 className="text-lg font-semibold text-white">{role ? role.name : "Yeni özel rol"}</h3>
        <p className="mt-1 text-xs text-zinc-500">{role ? `${role.key} · seviye ${role.rank} · ${role.userCount} kullanıcı` : "Yeni rolün seviyesi kendi seviyenden düşük olmalı."}</p>
      </div>
      {role && !editable ? <p className="rounded-md border border-line p-3 text-sm text-zinc-400">Bu rol eşit/üst seviyede veya sabit misafir rolüdür; izinleri yalnız görüntüleyebilirsin.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {!role ? <label className="text-sm text-zinc-300">Rol anahtarı<input value={key} onChange={(event) => setKey(event.target.value.toLowerCase())} required minLength={3} maxLength={32} pattern="[a-z][a-z0-9_]{2,31}" disabled={busy} className="mt-1 block h-10 w-full rounded-md border border-line bg-surface-950 px-3 text-white" /></label> : null}
        <label className="text-sm text-zinc-300">Görünen ad<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={60} disabled={!editable || busy} className="mt-1 block h-10 w-full rounded-md border border-line bg-surface-950 px-3 text-white" /></label>
        {!role ? <label className="text-sm text-zinc-300">Seviye (1–{actorRank - 1})<input type="number" value={rank} onChange={(event) => setRank(Number(event.target.value))} required min={1} max={actorRank - 1} disabled={busy} className="mt-1 block h-10 w-full rounded-md border border-line bg-surface-950 px-3 text-white" /></label> : null}
        <label className="text-sm text-zinc-300 sm:col-span-2">Açıklama<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} disabled={!editable || busy} className="mt-1 block h-10 w-full rounded-md border border-line bg-surface-950 px-3 text-white" /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">İzinler ({selected.length}/{permissions.length})</p>
        <input aria-label="İzin ara" placeholder="İzin ara..." value={filter} onChange={(event) => setFilter(event.target.value.toLowerCase())} className="h-9 rounded-md border border-line bg-surface-950 px-3 text-sm text-white" />
      </div>
      <div className="max-h-[29rem] space-y-5 overflow-y-auto rounded-md border border-line bg-surface-950 p-4">
        {groups.map((group) => {
          const items = permissions.filter((item) => item.group === group && (`${item.key} ${labels[item.key] ?? ""}`).toLowerCase().includes(filter));
          if (!items.length) return null;
          const grantable = items.filter((item) => item.grantable).map((item) => item.key);
          const allSelected = grantable.length > 0 && grantable.every((key) => selected.includes(key));
          return <fieldset key={group} className="space-y-2">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-400">{group}</legend>
            {editable && grantable.length > 0 ? <button type="button" disabled={busy} onClick={() => setSelected(allSelected
              ? selected.filter((key) => !grantable.includes(key as Permission["key"]))
              : [...new Set([...selected, ...grantable])])} className="text-xs text-accent-400 disabled:opacity-50">
              {allSelected ? "Görünenleri temizle" : "Görünenleri seç"}
            </button> : null}
            <div className="grid gap-2 sm:grid-cols-2">{items.map((item) => <label key={item.key} className="flex items-start gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={selected.includes(item.key)} disabled={!editable || busy || (!item.grantable && !selected.includes(item.key))} onChange={(event) => setSelected(event.target.checked ? [...selected, item.key] : selected.filter((key) => key !== item.key))} className="mt-0.5 size-4 shrink-0 accent-orange-500" />
              <span>{labels[item.key] ?? item.key}<span className="block font-mono text-[11px] text-zinc-500">{item.key}{!implemented.has(item.key) ? " · planlı" : ""}{!item.grantable ? " · sahip olmadığın izin" : ""}</span></span>
            </label>)}</div>
          </fieldset>;
        })}
      </div>
      {editable ? <button disabled={busy} className="rounded-md bg-accent-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Kaydediliyor…" : role ? "Rolü kaydet" : "Rol oluştur"}</button> : null}
      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
    </form>
  );
}

export function RoleManager({ data }: { data: Data }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(data.roles.filter((role) => role.editable).at(-1)?.id ?? null);
  const [message, setMessage] = useState("");
  const active = data.roles.find((role) => role.id === selectedId) ?? null;
  return (
    <section aria-labelledby="roles-heading" className="space-y-5">
      <div><h2 id="roles-heading" className="text-lg font-semibold text-white">Roller ve izinler</h2>
        <p className="mt-1 text-sm text-zinc-400">{data.permissions.length} izin anahtarını gruplayarak düzenle. Kendi seviyendeki veya üstündeki rollere müdahale edemezsin. Planlı izinler ilgili özellik yayına alınana kadar işlem sağlamaz.</p></div>
      <p role="status" className="text-sm text-accent-400">{message}</p>
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Düzenlenecek rol" className="flex flex-col gap-2">
          <button type="button" onClick={() => { setSelectedId(null); setMessage(""); }} className={`rounded-md border px-3 py-2 text-left text-sm ${selectedId === null ? "border-accent-500 text-white" : "border-line text-zinc-400"}`}>+ Özel rol oluştur</button>
          {data.roles.map((role) => <button key={role.id} type="button" onClick={() => { setSelectedId(role.id); setMessage(""); }} className={`rounded-md border px-3 py-2 text-left text-sm ${selectedId === role.id ? "border-accent-500 text-white" : "border-line text-zinc-400"}`}>{role.name}<span className="block text-xs text-zinc-500">{role.permissions.length} izin · {role.userCount} kullanıcı</span></button>)}
        </nav>
        <RoleEditor key={active?.id ?? "new"} role={active} permissions={data.permissions} actorRank={data.actorRank} onSaved={(text) => { setMessage(text); router.refresh(); }} />
      </div>
    </section>
  );
}
