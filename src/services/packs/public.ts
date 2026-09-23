import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lte,
  ne,
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
  creatorId?: string;
  known?: boolean;
  featured?: boolean;
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
  filters: Required<Pick<PublicPackFilters, "q" | "known" | "sort">> & {
    category?: string;
    creatorId?: string;
  };
};

export type PublicCategory = {
  slug: string;
  name: string;
  description: string | null;
  kind: PackKind;
  packCount: number;
};

export type PackVersionEntry = {
  id: string;
  version: string;
  changelog: string | null;
  fileSizeBytes: string | null;
  checksumSha256: string | null;
  isLatest: boolean;
  createdAt: Date;
};

export type PackDetail = PackListItem & {
  description: string;
  installGuide: string | null;
  categoryId: string;
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
  updatedAt: Date;
  latestVersion: { version: string; changelog: string | null; publishedAt: Date | null } | null;
  versions: PackVersionEntry[];
};

function normalizeFilters(filters: PublicPackFilters) {
  const q = typeof filters.q === "string" ? filters.q.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  const category = isSafeSlug(filters.category) ? filters.category : undefined;
  const creatorId =
    typeof filters.creatorId === "string" && filters.creatorId.length > 0 && filters.creatorId.length <= 64
      ? filters.creatorId
      : undefined;
  const sort = packSortValues.includes(filters.sort as PackSort) ? filters.sort! : "newest";
  const page = Number.isInteger(filters.page) ? Math.min(1000, Math.max(1, filters.page!)) : 1;
  const pageSize = Number.isInteger(filters.pageSize)
    ? Math.min(48, Math.max(1, filters.pageSize!))
    : PACK_PAGE_SIZE;
  return { q, category, creatorId, known: filters.known === true, featured: filters.featured === true, sort, page, pageSize };
}

function publicConditions(now: Date, filters: ReturnType<typeof normalizeFilters>): SQL[] {
  const conditions: SQL[] = [
    eq(s.packs.status, "approved"),
    eq(s.packs.isDemo, false),
    eq(s.packCategories.enabled, true),
    lte(s.packs.publishedAt, now),
  ];
  if (filters.category) conditions.push(eq(s.packCategories.slug, filters.category));
  if (filters.creatorId) conditions.push(eq(s.packs.creatorId, filters.creatorId));
  if (filters.known) conditions.push(eq(s.packs.isKnown, true));
  if (filters.featured) conditions.push(eq(s.packs.featured, true));
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
    filters: {
      q: filters.q,
      category: filters.category,
      creatorId: filters.creatorId,
      known: filters.known,
      sort: filters.sort,
    },
  };
}

export async function listBookmarkedPacks(db: Database, userId: string, inputPage = 1): Promise<PackListResult> {
  const page = Number.isInteger(inputPage) ? Math.min(1000, Math.max(1, inputPage)) : 1;
  const where = and(eq(s.bookmarks.userId, userId), ...publicConditions(new Date(), normalizeFilters({})));
  const [items, totals] = await Promise.all([
    db.select(listSelection).from(s.bookmarks)
      .innerJoin(s.packs, eq(s.packs.id, s.bookmarks.packId))
      .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
      .innerJoin(s.users, eq(s.users.id, s.packs.creatorId))
      .where(where).orderBy(desc(s.bookmarks.createdAt), asc(s.bookmarks.id))
      .limit(PACK_PAGE_SIZE).offset((page - 1) * PACK_PAGE_SIZE),
    db.select({ value: count() }).from(s.bookmarks)
      .innerJoin(s.packs, eq(s.packs.id, s.bookmarks.packId))
      .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
      .where(where),
  ]);
  const total = Number(totals[0]?.value ?? 0);
  const tagsByPack = await loadTags(db, items.map((item) => item.id));
  return {
    items: items.map((item) => ({ ...item, fileSizeBytes: item.fileSizeBytes?.toString() ?? null,
      publishedAt: item.publishedAt!, tags: tagsByPack.get(item.id) ?? [] })),
    total, page, pageSize: PACK_PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PACK_PAGE_SIZE)),
    filters: { q: "", known: false, sort: "newest" },
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
      installGuide: s.packs.installGuide,
      categoryId: s.packs.categoryId,
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
      updatedAt: s.packs.updatedAt,
    })
    .from(s.packs)
    .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
    .innerJoin(s.users, eq(s.users.id, s.packs.creatorId))
    .where(and(...publicConditions(now, { ...normalizeFilters({}), category: undefined }), eq(s.packs.slug, slug)));
  if (!row || !row.publishedAt) return null;

  const [tagsByPack, versions] = await Promise.all([
    loadTags(db, [row.id]),
    db
      .select({
        id: s.packVersions.id,
        version: s.packVersions.version,
        changelog: s.packVersions.changelog,
        fileSizeBytes: s.packVersions.fileSizeBytes,
        checksumSha256: s.packVersions.checksumSha256,
        isLatest: s.packVersions.isLatest,
        createdAt: s.packVersions.createdAt,
        publishedAt: s.packVersions.publishedAt,
      })
      .from(s.packVersions)
      .where(and(eq(s.packVersions.packId, row.id), eq(s.packVersions.isDemo, false)))
      .orderBy(desc(s.packVersions.isLatest), desc(s.packVersions.createdAt), desc(s.packVersions.id)),
  ]);
  const [latest] = versions;
  return {
    ...row,
    fileSizeBytes: row.fileSizeBytes?.toString() ?? null,
    publishedAt: row.publishedAt,
    tags: tagsByPack.get(row.id) ?? [],
    latestVersion: latest
      ? { version: latest.version, changelog: latest.changelog, publishedAt: latest.publishedAt }
      : null,
    versions: versions.map((version) => ({
      id: version.id,
      version: version.version,
      changelog: version.changelog,
      fileSizeBytes: version.fileSizeBytes?.toString() ?? null,
      checksumSha256: version.checksumSha256,
      isLatest: version.isLatest,
      createdAt: version.createdAt,
    })),
  };
}

/** Same-category approved packs for the detail page, most downloaded first. */
export async function getRelatedPacks(
  db: Database,
  categoryId: string,
  excludePackId: string,
  limit = 4,
): Promise<PackListItem[]> {
  const size = Math.max(1, Math.min(12, limit));
  const where = and(
    ...publicConditions(new Date(), normalizeFilters({})),
    eq(s.packs.categoryId, categoryId),
    ne(s.packs.id, excludePackId),
  );
  const items = await db
    .select(listSelection)
    .from(s.packs)
    .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
    .innerJoin(s.users, eq(s.users.id, s.packs.creatorId))
    .where(where)
    .orderBy(desc(s.packs.downloadCount), desc(s.packs.publishedAt), asc(s.packs.id))
    .limit(size);
  const tagsByPack = await loadTags(db, items.map((item) => item.id));
  return items.map((item) => ({
    ...item,
    fileSizeBytes: item.fileSizeBytes?.toString() ?? null,
    publishedAt: item.publishedAt!,
    tags: tagsByPack.get(item.id) ?? [],
  }));
}

export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  createdAt: Date;
  packCount: number;
};

/** Same format as the DB `users_username_format` check. */
export function isProfileUsername(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{2,31}$/.test(value);
}

/** Active, non-demo member with their count of currently visible packs. */
export async function getPublicProfile(db: Database, username: string): Promise<PublicProfile | null> {
  if (!isProfileUsername(username)) return null;
  const [row] = await db
    .select({
      id: s.users.id,
      username: s.users.username,
      displayName: s.users.displayName,
      bio: s.users.bio,
      createdAt: s.users.createdAt,
      status: s.users.status,
      isDemo: s.users.isDemo,
    })
    .from(s.users)
    .where(eq(s.users.username, username))
    .limit(1);
  if (!row || row.status !== "active" || row.isDemo) return null;
  const where = and(
    ...publicConditions(new Date(), normalizeFilters({})),
    eq(s.packs.creatorId, row.id),
  );
  const [stats] = await db
    .select({ value: count() })
    .from(s.packs)
    .innerJoin(s.packCategories, eq(s.packCategories.id, s.packs.categoryId))
    .where(where);
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    bio: row.bio,
    createdAt: row.createdAt,
    packCount: Number(stats?.value ?? 0),
  };
}
