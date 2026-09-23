import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDatabase } from "@/db/client";
import { parsePackSearchParams } from "@/lib/pack-query";
import { PackListing } from "@/features/packs/pack-listing";
import { getPublicCategory, listPublicCategories, listPublishedPacks } from "@/services/packs/public";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getPublicCategory(getDatabase().db, slug);
  if (!category) return {};
  const description = category.description ?? `${category.name} kategorisindeki yayınlanmış FiveM paketleri.`;
  return { title: category.name, description, alternates: { canonical: `/packs/category/${category.slug}` } };
}

export default async function PackCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const db = getDatabase().db;
  const [category, categories] = await Promise.all([
    getPublicCategory(db, slug),
    listPublicCategories(db),
  ]);
  if (!category) notFound();
  const filters = { ...parsePackSearchParams(await searchParams), category: category.slug };
  const result = await listPublishedPacks(db, filters);
  return (
    <PackListing
      title={category.name}
      description={category.description ?? `${category.name} kategorisinde yayınlanmış paketleri keşfet.`}
      basePath={`/packs/category/${category.slug}`}
      result={result}
      categories={categories}
      showCategories={false}
    />
  );
}
