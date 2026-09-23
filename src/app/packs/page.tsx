import type { Metadata } from "next";
import { getDatabase } from "@/db/client";
import { parsePackSearchParams } from "@/lib/pack-query";
import { PackListing } from "@/features/packs/pack-listing";
import { listPublicCategories, listPublishedPacks } from "@/services/packs/public";

export const metadata: Metadata = {
  title: "Paketler",
  description: "Yayınlanmış FiveM grafik, PvP, ReShade, ENB ve performans paketlerini ara ve karşılaştır.",
  alternates: { canonical: "/packs" },
};

export default async function PacksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parsePackSearchParams(await searchParams);
  const db = getDatabase().db;
  const [result, categories] = await Promise.all([
    listPublishedPacks(db, filters),
    listPublicCategories(db),
  ]);
  return (
    <PackListing
      title="Tüm paketler"
      description="Topluluk ve editörler tarafından incelenmiş, dağıtım durumu açıkça belirtilen FiveM paketleri."
      basePath="/packs"
      result={result}
      categories={categories}
    />
  );
}
