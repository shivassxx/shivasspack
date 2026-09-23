import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, Download, Eye, Heart, ShieldCheck, Star } from "lucide-react";
import { getDatabase } from "@/db/client";
import { BookmarkButton } from "@/features/packs/bookmark-button";
import { CommentForm } from "@/features/packs/comment-form";
import { LikeButton } from "@/features/packs/like-button";
import { RatingControl } from "@/features/packs/rating-control";
import { ViewTracker } from "@/features/packs/view-tracker";
import { getCurrentSession } from "@/lib/auth-context";
import { getBookmarkState } from "@/services/packs/bookmarks";
import { listPackComments } from "@/services/packs/comments";
import { getPackDownloadOptions } from "@/services/packs/downloads";
import { getPackLikeState } from "@/services/packs/likes";
import { getMemberRating } from "@/services/packs/ratings";
import { getPublishedPack } from "@/services/packs/public";
import { assertActive } from "@/services/rbac";
import { formatBytes, formatCompact, formatDate } from "@/lib/utils";

const impactLabels = { low: "Düşük", medium: "Orta", high: "Yüksek", extreme: "Çok yüksek" } as const;
const permissionLabels = {
  granted: "Dağıtım izni doğrulandı",
  metadata_only: "Yalnızca bilgi ve dış kaynak",
  unknown: "Dağıtım izni doğrulanmadı",
} as const;

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pack = await getPublishedPack(getDatabase().db, slug);
  if (!pack) return {};
  return {
    title: pack.title,
    description: pack.excerpt,
    alternates: { canonical: `/packs/${pack.slug}` },
    openGraph: { type: "article", title: pack.title, description: pack.excerpt },
  };
}

export default async function PackDetailPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ commentsPage?: string }>;
}) {
  const { slug } = await params;
  const pack = await getPublishedPack(getDatabase().db, slug);
  if (!pack) notFound();
  const [session, query] = await Promise.all([getCurrentSession(), searchParams]);
  let canInteract = false;
  if (session?.actor.permissions.has("pack.view")) {
    try { assertActive(session.actor); canInteract = true; }
    catch { canInteract = false; }
  }
  const comments = await listPackComments(getDatabase().db, slug, Number(query.commentsPage ?? 1));
  const downloadOptions = await getPackDownloadOptions(getDatabase().db, slug);
  const [isSaved, isLiked, myRating] = canInteract ? await Promise.all([
    getBookmarkState(getDatabase().db, session!.actor, pack.id),
    getPackLikeState(getDatabase().db, session!.actor, pack.id),
    getMemberRating(getDatabase().db, session!.actor, pack.id),
  ]) : [false, false, null];
  const sourceUrl = safeExternalUrl(pack.sourceUrl);
  const requirements = Object.entries(pack.requirements).filter(
    ([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean",
  );

  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <ViewTracker slug={pack.slug} />
      <nav aria-label="İçerik yolu" className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <Link href="/packs" className="hover:text-accent-400">Paketler</Link>
        <span aria-hidden>/</span>
        <Link href={`/packs/category/${pack.categorySlug}`} className="hover:text-accent-400">{pack.categoryName}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="truncate text-zinc-400">{pack.title}</span>
      </nav>

      <header className="mt-6 grid gap-7 border-b border-line pb-9 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div className="flex flex-wrap gap-2">
            {pack.editorPick ? <span className="rounded-full bg-accent-600 px-2.5 py-1 text-xs font-semibold text-white">Editör seçimi</span> : null}
            {pack.isKnown ? <span className="rounded-full border border-line bg-surface-900 px-2.5 py-1 text-xs text-zinc-300">Bilinen paket</span> : null}
            <span className="rounded-full border border-line bg-surface-900 px-2.5 py-1 text-xs text-zinc-400">FPS etkisi: {impactLabels[pack.performanceImpact]}</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">{pack.title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">{pack.excerpt}</p>
          <p className="mt-4 text-sm text-zinc-500">
            <span className="text-zinc-300">{pack.creatorName}</span> (@{pack.creatorUsername})
            <span aria-hidden> · </span>{formatDate(pack.publishedAt)}
          </p>
          {pack.tags.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Etiketler">
              {pack.tags.map((tag) => <li key={tag.slug} className="rounded bg-surface-800 px-2 py-1 text-xs text-zinc-400">#{tag.name}</li>)}
            </ul>
          ) : null}
          {canInteract ? <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <BookmarkButton slug={pack.slug} initialSaved={isSaved} initialCount={pack.bookmarkCount} />
              <LikeButton slug={pack.slug} initialLiked={isLiked} initialCount={pack.likeCount} />
            </div>
            <RatingControl slug={pack.slug} initialValue={myRating} initialAverage={pack.ratingAvg} initialCount={pack.ratingCount} />
          </div> : session ? <p className="mt-5 text-sm text-zinc-500">Bu hesapla paket etkileşimleri kullanılamıyor.</p>
            : <Link href={`/login?next=${encodeURIComponent(`/packs/${pack.slug}`)}`} className="mt-5 inline-flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300"><Bookmark className="size-4" aria-hidden />Kaydetmek, beğenmek veya puan vermek için giriş yap</Link>}
        </div>

        <aside className="rounded-xl border border-line bg-surface-900 p-4" aria-label="Paket özeti">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-zinc-500">Sürüm</dt><dd className="mt-1 font-mono text-white">{pack.latestVersion?.version ?? "—"}</dd></div>
            <div><dt className="text-xs text-zinc-500">Boyut</dt><dd className="mt-1 text-white">{pack.fileSizeBytes ? formatBytes(Number(pack.fileSizeBytes)) : "—"}</dd></div>
            <div><dt className="text-xs text-zinc-500">FiveM</dt><dd className="mt-1 text-white">{pack.fivemVersion ?? "Belirtilmedi"}</dd></div>
            <div><dt className="text-xs text-zinc-500">Lisans</dt><dd className="mt-1 text-white">{pack.license ?? "Belirtilmedi"}</dd></div>
          </dl>
          <div className="mt-4 rounded-lg border border-line bg-surface-950 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-zinc-300"><ShieldCheck className="size-4 text-accent-400" aria-hidden />{permissionLabels[pack.distributionPermission]}</p>
            {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent-400 hover:text-accent-300">Kaynağı aç ↗</a> : null}
          </div>
          {downloadOptions.available ? <div className="mt-4 space-y-2">
            {downloadOptions.primary ? <a href={`/api/packs/${encodeURIComponent(pack.slug)}/download`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-500">
              <Download className="size-4" aria-hidden />İndir
            </a> : null}
            {downloadOptions.mirrors.length ? <ul className="space-y-1" aria-label="İndirme aynaları">
              {downloadOptions.mirrors.map((mirror) => <li key={mirror.id}>
                <a href={`/api/packs/${encodeURIComponent(pack.slug)}/download?mirror=${encodeURIComponent(mirror.id)}`}
                  className="text-xs text-accent-400 hover:text-accent-300">Ayna: {mirror.name}</a>
              </li>)}
            </ul> : null}
          </div> : <p className="mt-4 text-xs leading-5 text-zinc-600">İndirme bağlantısı henüz eklenmedi.</p>}
        </aside>
      </header>

      <section aria-label="Paket istatistikleri" className="grid grid-cols-2 gap-3 border-b border-line py-6 sm:grid-cols-5">
        {[
          [Star, pack.ratingCount > 0 ? pack.ratingAvg : "—", `${pack.ratingCount} oy`],
          [Download, formatCompact(pack.downloadCount), "indirme"],
          [Eye, formatCompact(pack.viewCount), "görüntülenme"],
          [Heart, formatCompact(pack.likeCount), "beğeni"],
          [Bookmark, formatCompact(pack.bookmarkCount), "kayıt"],
        ].map(([Icon, value, label]) => {
          const StatIcon = Icon as typeof Star;
          return <div key={String(label)} className="rounded-lg bg-surface-900 p-3"><StatIcon className="size-4 text-accent-400" aria-hidden /><p className="mt-2 font-semibold text-white">{String(value)}</p><p className="text-xs text-zinc-500">{String(label)}</p></div>;
        })}
      </section>

      <div className="grid gap-10 py-9 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="description-heading">
          <h2 id="description-heading" className="text-xl font-semibold text-white">Paket hakkında</h2>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-400">{pack.description}</div>
          {pack.latestVersion?.changelog ? <div className="mt-8"><h2 className="text-lg font-semibold text-white">Son sürüm notları</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-400">{pack.latestVersion.changelog}</p></div> : null}
        </section>
        <aside className="space-y-6">
          {pack.compatibility.length > 0 ? <section><h2 className="text-sm font-semibold text-white">Uyumluluk</h2><ul className="mt-3 space-y-2 text-sm text-zinc-400">{pack.compatibility.map((item) => <li key={item}>• {item}</li>)}</ul></section> : null}
          {requirements.length > 0 ? <section><h2 className="text-sm font-semibold text-white">Gereksinimler</h2><dl className="mt-3 space-y-2 text-sm">{requirements.map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt className="text-zinc-500">{key}</dt><dd className="text-right text-zinc-300">{String(value)}</dd></div>)}</dl></section> : null}
        </aside>
      </div>
      <section id="comments" aria-labelledby="comments-heading" className="border-t border-line py-9">
        <h2 id="comments-heading" className="text-xl font-semibold text-white">Yorumlar ({comments.total})</h2>
        {canInteract ? <CommentForm slug={pack.slug} /> : session
          ? <p className="mt-4 text-sm text-zinc-500">Bu hesapla yorum yazamazsın.</p>
          : <p className="mt-4 text-sm text-zinc-400"><Link href={`/login?next=${encodeURIComponent(`/packs/${pack.slug}`)}`} className="text-accent-400 hover:text-accent-300">Giriş yap</Link> ve yorum yaz.</p>}
        {comments.items.length ? <ol className="mt-6 space-y-3">
          {comments.items.map((comment) => <li key={comment.id} className="rounded-xl border border-line bg-surface-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-white">{comment.authorName} <span className="font-normal text-zinc-500">@{comment.authorUsername}</span></span>
              <time dateTime={comment.createdAt.toISOString()} className="text-xs text-zinc-500">{formatDate(comment.createdAt)}</time>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{comment.body}</p>
          </li>)}
        </ol> : <p className="mt-6 rounded-xl border border-line bg-surface-900 p-5 text-sm text-zinc-500">Henüz yorum yok.</p>}
        {comments.pageCount > 1 ? <nav aria-label="Yorum sayfaları" className="mt-6 flex items-center justify-center gap-5 text-sm text-zinc-400">
          {comments.page > 1 ? <Link href={`?commentsPage=${comments.page - 1}#comments`} className="text-accent-400">Önceki</Link> : null}
          <span>{comments.page} / {comments.pageCount}</span>
          {comments.page < comments.pageCount ? <Link href={`?commentsPage=${comments.page + 1}#comments`} className="text-accent-400">Sonraki</Link> : null}
        </nav> : null}
      </section>
    </article>
  );
}
