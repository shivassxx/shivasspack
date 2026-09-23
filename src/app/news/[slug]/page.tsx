import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/db/client";
import { formatDate } from "@/lib/utils";
import { siteConfig } from "@/lib/site-config";
import { getPublishedArticle } from "@/services/news";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticle(getDatabase().db, slug);
  if (!article) return {};
  return { title: article.seoTitle ?? article.title, description: article.seoDescription ?? article.excerpt,
    alternates: { canonical: `/news/${article.slug}` },
    openGraph: { type: "article", title: article.seoTitle ?? article.title,
      description: article.seoDescription ?? article.excerpt,
      publishedTime: article.publishedAt?.toISOString() } };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getPublishedArticle(getDatabase().db, slug);
  if (!article) notFound();
  const structuredData = { "@context": "https://schema.org", "@type": "NewsArticle",
    headline: article.title, description: article.excerpt,
    datePublished: article.publishedAt?.toISOString(),
    author: { "@type": "Person", name: article.authorName ?? "Editör" },
    publisher: { "@type": "Organization", name: siteConfig.name },
    mainEntityOfPage: new URL(`/news/${article.slug}`, siteConfig.url).href };
  return <article className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <nav aria-label="İçerik yolu" className="text-xs text-zinc-400"><Link href="/news" className="hover:text-accent-300">Haberler</Link> / {article.categoryName}</nav>
    <header className="mt-5">
      <h1 className="text-3xl font-semibold text-white">{article.title}</h1>
      <p className="mt-3 text-sm text-zinc-400">{article.categoryName} · {article.authorName ?? "Editör"} · {article.publishedAt ? formatDate(article.publishedAt) : ""}</p>
      <p className="mt-5 text-lg text-zinc-300">{article.excerpt}</p>
    </header>
    <div className="mt-8 whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-900 p-6 text-sm leading-7 text-zinc-200">{article.content}</div>
    {article.sourceUrl ? <p className="mt-5 text-sm text-zinc-400">Kaynak: <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:text-accent-300">{article.sourceUrl}</a></p> : null}
  </article>;
}
