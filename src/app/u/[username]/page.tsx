import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Package } from "lucide-react";
import { cache } from "react";
import { getDatabase } from "@/db/client";
import { PackCard } from "@/features/packs/pack-card";
import { publicEnv } from "@/lib/public-env";
import { formatDate } from "@/lib/utils";
import { getPublicProfile, listPublishedPacks } from "@/services/packs/public";
import { serializeJsonLd } from "@/services/packs/seo";

const loadProfile = cache(getPublicProfile);

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(getDatabase().db, username);
  if (!profile) return {};
  const description = (
    profile.bio?.trim() || `${profile.displayName} (@${profile.username}) profili ve yayında olan paketleri.`
  ).slice(0, 160);
  return {
    title: `${profile.displayName} (@${profile.username})`,
    description,
    alternates: { canonical: `/u/${profile.username}` },
    openGraph: { type: "profile", title: `${profile.displayName} (@${profile.username})`, description },
  };
}

export default async function ProfilePage({ params, searchParams }: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { username } = await params;
  const profile = await loadProfile(getDatabase().db, username);
  if (!profile) notFound();
  const { page } = await searchParams;
  const packs = await listPublishedPacks(getDatabase().db, {
    creatorId: profile.id,
    page: Number(page ?? 1),
  });
  const profileUrl = (() => {
    try {
      return new URL(`/u/${encodeURIComponent(profile.username)}`, publicEnv.siteUrl).href;
    } catch {
      return `/u/${encodeURIComponent(profile.username)}`;
    }
  })();
  const jsonLd = serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: profileUrl,
    mainEntity: {
      "@type": "Person",
      name: profile.displayName,
      identifier: `@${profile.username}`,
      ...(profile.bio ? { description: profile.bio } : {}),
    },
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <header className="flex flex-wrap items-start gap-5 border-b border-line pb-8">
        <span
          aria-hidden
          className="flex size-20 shrink-0 items-center justify-center rounded-full border border-line bg-surface-900 text-3xl font-semibold text-accent-400"
        >
          {profile.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold text-white">{profile.displayName}</h1>
          <p className="mt-1 text-sm text-zinc-400">@{profile.username}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden />
              Katılım: {formatDate(profile.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Package className="size-3.5" aria-hidden />
              {profile.packCount} yayında paket
            </span>
          </div>
          {profile.bio ? (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-zinc-300">{profile.bio}</p>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="profile-packs-heading" className="pt-8">
        <h2 id="profile-packs-heading" className="text-xl font-semibold text-white">Yayında olan paketleri</h2>
        {packs.items.length ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {packs.items.map((pack) => <PackCard key={pack.id} pack={pack} />)}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-line bg-surface-900 p-6 text-sm text-zinc-400">
            {packs.total ? "Bu sayfada paket yok." : "Bu üyenin henüz yayında paketi yok."}{" "}
            <Link href="/packs" className="text-accent-400 hover:text-accent-300">Paketlere göz at</Link>
          </div>
        )}
        {packs.pageCount > 1 ? (
          <nav aria-label="Profil paket sayfaları" className="mt-8 flex items-center justify-center gap-5 text-sm text-zinc-400">
            {packs.page > 1 ? <Link href={`/u/${profile.username}?page=${packs.page - 1}`} className="text-accent-400">Önceki</Link> : null}
            <span>{packs.page} / {packs.pageCount}</span>
            {packs.page < packs.pageCount ? <Link href={`/u/${profile.username}?page=${packs.page + 1}`} className="text-accent-400">Sonraki</Link> : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
