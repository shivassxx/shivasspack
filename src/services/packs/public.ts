import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { isSafeSlug } from "@/lib/utils";

export const PACK_PAGE_SIZE = 12;
export const packSortValues = ["newest", "trending", "rating", "downloads"] as const;
export type PackSort = (typeof packSortValues)[number];
export type PackKind = (typeof s.packKind.enumValues)[number];

export type PublicPackFilters = {
  q?: string;
  category?: string;
  known?: boolean;
  sort?: PackSort;
  page?: number;
  pageSize?: number;
};

export type PackListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  categorySlug: string;
  categoryName: string;
  kind: PackKind;
  creatorUsername: string;
  creatorName: string;
  isKnown: boolean;
  featured: boolean;
  editorPick: boolean;
  recommended: boolean;
  performanceImpact: (typeof s.performanceImpact.enumValues)[number];
  compatibility: string[];
  fileSizeBytes: string | null;
  downloadCount: number;
  viewCount: number;
  likeCount: number;
  ratingAvg: string;
  ratingCount: number;
  publishedAt: Date;
  tags: Array<{ slug: string; name: string }>;
};

export type PackListResult = {
  items: PackListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  filters: Required<Pick<PublicPackFilters, "q" | "known" | "sort">> & { category?: string };
};

export type PublicCategory = {
  slug: string;
  name: string;
  description: string | null;
  kind: PackKind;
  packCount: number;
};

export type PackDetail = PackListItem & {
  description: string;
  publisher: string | null;
  sourceType: (typeof s.sourceType.enumValues)[number];
  sourceUrl: string | null;
  license: string | null;
  distributionPermission: (typeof s.distributionPermission.enumValues)[number];
  requirements: Record<string, unknown>;
  fivemVersion: string | null;
  videoUrl: string | null;
  bookmarkCount: number;
  commentCount: number;
  latestVersion: { version: string; changelog: string | null; publishedAt: Date | null } | null;
};

function normalizeFilters(filters: PublicPackFilters) {
  const q = typeof filters.q === "string" ? filters.q.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  const category = isSafeSlug(filters.category) ? filters.category : undefined;
  const sort = packSortValues.includes(filters.sort as PackSort) ? filters.sort! : "newest";
  const page = Number.isInteger(filters.page) ? Math.min(1000, Math.max(1, filters.page!)) : 1;
  const pageSize = Number.isInteger(filters.pageSize)
    ? Math.min(48, Math.max(1, filters.pageSize!))
    : PACK_PAGE_SIZE;
  return { q, category, known: filters.known === true, sort, page, pageSize };
}

function publicConditions(now: Date, filters: ReturnType<typeof normalizeFilters>): SQL[] {
  const conditions: SQL[] = [
    eq(s.packs.status, "approved"),
    eq(s.packs.isDemo, false),
    eq(s.packCategories.enabled, true),
    lte(s.packs.publishedAt, now),
  ];
  if (filters.category) conditions.push(eq(s.packCategories.slug, filters.category));
  if (filters.known) conditions.push(eq(s.packs.isKnown, true));
  if (filters.q) {
    conditions.push(sql`
      to_tsvector('simple', ${s.packs.title} || ' ' || ${s.packs.excerpt} || ' ' || ${s.packs.description})
      @@ websearch_to_tsquery('simple', ${filters.q})
    `);
  }
  return conditions;
}

function sortOrder(sort: PackSort) {
  switch (sort) {
    case "trending":
      return [desc(s.packs.trendingOverride), desc(s.packs.downloadCount), desc(s.packs.publishedAt), asc(s.packs.id)];
    case "rating":
      return [desc(s.packs.ratingAvg), desc(s.packs.ratingCount), desc(s.packs.publishedAt), asc(s.packs.id)];
    case "downloads":
      return [desc(s.packs.downloadCount), desc(s.packs.publishedAt), asc(s.packs.id)];
    case "newest":
      return [desc(s.packs.publishedAt), asc(s.packs.id)];
  }
}

async function loadTags(db: Database, packIds: string[]) {
  const tagsByPack = new Map<string, Array<{ slug: string; name: string }>>();
  if (packIds.length === 0) return tagsByPack;
  const rows = await db
    .select({ packId: s.packTags.packId, slug: s.tags.slug, name: s.tags.name })
    .from(s.packTags)
    .innerJoin(s.tags, eq(s.tags.id, s.packTags.tagId))
    .where(inArray(s.packTags.packId, packIds))
    .orderBy(asc(s.tags.name));
  for (const row of rows) {
    const current = tagsByPack.get(row.packId) ?? [];
    current.push({ slug: row.slug, name: row.name });
    tagsByPack.set(row.packId, current);
  }
  return tagsByPack;
}

const listSelection = {
  id: s.packs.id,
  slug: s.packs.slug,
  title: s.packs.title,
  excerpt: s.packs.excerpt,
  categorySlug: s.packCategories.slug,
  categoryName: s.packCategories.name,
  kind: s.packCategories.kind,
  creatorUsername: s.users.username,
  creatorName: s.users.displayName,
  isKnown: s.packs.isKnown,
  featured: s.packs.featured,
  editorPick: s.packs.editorPick,
  recommended: s.packs.recommended,
  performanceImpact: s.packs.performanceImpact,
  compatibility: s.packs.compatibility,
  fileSizeBytes: s.packs.fileSizeBytes,
  downloadCount: s.packs.downloadCount,
  viewCount: s.packs.viewCount,
  likeCount: s.packs.likeCount,
  ratingAvg: s.packs.ratingAvg,
  ratingCount: s.packs.ratingCount,
  publishedAt: s.packs.publishedAt,
} as const;

export async function listPublishedPacks(db: Database, input: PublicPackFilters = {}): Promise<PackListResult> {
  const filters = normalizeFilters(input);
  const now = new Date();
  const conditions = publicConditions(now, filters);
  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db
      .select(listSelection)
      .from(s.packs)
      .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
      .innerJoin(s.users, eq(s.users.id, s.packs.creatorId))
      .where(where)
      .orderBy(...sortOrder(filters.sort))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db
      .select({ value: count() })
      .from(s.packs)
      .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
      .where(where),
  ]);
  const total = Number(totalRows[0]?.value ?? 0);
  const tagsByPack = await loadTags(db, items.map((item) => item.id));

  return {
    items: items.map((item) => ({
      ...item,
      fileSizeBytes: item.fileSizeBytes?.toString() ?? null,
      // `approved` rows are constrained to have publishedAt.
      publishedAt: item.publishedAt!,
      tags: tagsByPack.get(item.id) ?? [],
    })),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
    filters: { q: filters.q, category: filters.category, known: filters.known, sort: filters.sort },
  };
}

export async function listPublicCategories(db: Database): Promise<PublicCategory[]> {
  const now = new Date();
  const rows = await db
    .select({
      slug: s.packCategories.slug,
      name: s.packCategories.name,
      description: s.packCategories.description,
      kind: s.packCategories.kind,
      packCount: sql<number>`count(${s.packs.id})::int`,
    })
    .from(s.packCategories)
    .leftJoin(
      s.packs,
      and(
        eq(s.packs.categoryId, s.packCategories.id),
        eq(s.packs.status, "approved"),
        eq(s.packs.isDemo, false),
        lte(s.packs.publishedAt, now),
      ),
    )
    .where(eq(s.packCategories.enabled, true))
    .groupBy(s.packCategories.id)
    .orderBy(asc(s.packCategories.sortOrder), asc(s.packCategories.name));
  return rows.map((row) => ({ ...row, packCount: Number(row.packCount) }));
}

export async function getPublicCategory(db: Database, slug: string): Promise<PublicCategory | null> {
  if (!isSafeSlug(slug)) return null;
  const categories = await listPublicCategories(db);
  return categories.find((category) => category.slug === slug) ?? null;
}

export async function getPublishedPack(db: Database, slug: string): Promise<PackDetail | null> {
  if (!isSafeSlug(slug)) return null;
  const now = new Date();
  const [row] = await db
    .select({
      ...listSelection,
      description: s.packs.description,
      publisher: s.packs.publisher,
      sourceType: s.packs.sourceType,
      sourceUrl: s.packs.sourceUrl,
      license: s.packs.license,
      distributionPermission: s.packs.distributionPermission,
      requirements: s.packs.requirements,
      fivemVersion: s.packs.fivemVersion,
      videoUrl: s.packs.videoUrl,
      bookmarkCount: s.packs.bookmarkCount,
      commentCount: s.packs.commentCount,
    })
    .from(s.packs)
    .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
    .innerJoin(s.users, eq(s.users.id, s.packs.creatorId))
    .where(and(...publicConditions(now, { ...normalizeFilters({}), category: undefined }), eq(s.packs.slug, slug)));
  if (!row || !row.publishedAt) return null;

  const [tagsByPack, versions] = await Promise.all([
    loadTags(db, [row.id]),
    db
      .select({ version: s.packVersions.version, changelog: s.packVersions.changelog, publishedAt: s.packVersions.publishedAt })
      .from(s.packVersions)
      .where(and(eq(s.packVersions.packId, row.id), eq(s.packVersions.isLatest, true)))
      .limit(1),
  ]);
  return {
    ...row,
    fileSizeBytes: row.fileSizeBytes?.toString() ?? null,
    publishedAt: row.publishedAt,
    tags: tagsByPack.get(row.id) ?? [],
    latestVersion: versions[0] ?? null,
  };
}
