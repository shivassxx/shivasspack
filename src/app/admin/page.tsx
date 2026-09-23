import Link from "next/link";
import { FolderTree, PackageOpen, Tags, LayoutTemplate } from "lucide-react";
import { getCurrentSession } from "@/lib/auth-context";
import { PageState } from "@/components/ui/page-state";

export default async function AdminPage() {
  const session = await getCurrentSession();
  if (!session?.actor.permissions.has("admin.dashboard")) {
    return <PageState code="403" title="Panel özeti için iznin yok" description="Yetkin olan yönetim bölümünü üst menüden açabilirsin." />;
  }
  const cards = [
    { href: "/admin/packs", title: "Paketler", body: "Taslakları düzenle, yayın durumunu ve öne çıkarma alanlarını yönet.", icon: PackageOpen, permission: "pack.manage" },
    { href: "/admin/categories", title: "Kategoriler", body: "Public paket taksonomisini, görünürlüğü ve sıralamayı yönet.", icon: FolderTree, permission: "category.manage" },
    { href: "/admin/tags", title: "Etiketler", body: "Paketlerde kullanılan aranabilir etiketleri yönet.", icon: Tags, permission: "tag.manage" },
    { href: "/admin/homepage", title: "Ana sayfa", body: "Yayındaki bölümleri sırala ve görünürlüklerini değiştir.", icon: LayoutTemplate, permission: "homepage.manage" },
  ] as const;
  return (
    <section aria-labelledby="admin-overview-heading">
      <h2 id="admin-overview-heading" className="text-lg font-semibold text-white">Katalog araçları</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.filter((card) => session.actor.permissions.has(card.permission)).map(({ href, title, body, icon: Icon }) => (
          <Link key={href} href={href} className="rounded-xl border border-line bg-surface-900 p-5 transition hover:border-accent-500/40">
            <Icon className="size-5 text-accent-400" aria-hidden />
            <h3 className="mt-4 font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
