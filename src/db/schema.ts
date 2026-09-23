import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = (prefix: string) =>
  text("id")
    .primaryKey()
    .default(sql.raw(`'${prefix}_' || gen_random_uuid()::text`));
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const time = (name: string) => timestamp(name, { withTimezone: true });
const counter = (name: string) => integer(name).notNull().default(0);
const metadata = (name: string) =>
  jsonb(name).$type<Record<string, unknown>>().notNull().default({});
const demo = () => boolean("is_demo").notNull().default(false);
const slugCheck = (column: AnyPgColumn) =>
  sql`${column} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(${column}) <= 96`;
const sha256 = (column: AnyPgColumn) => sql`${column} ~ '^[a-f0-9]{64}$'`;

export const userStatus = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const packKind = pgEnum("pack_kind", [
  "graphics",
  "pvp",
  "reshade",
  "enb",
  "performance",
  "known",
  "other",
]);
export const packStatus = pgEnum("pack_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
  "changes_requested",
  "archived",
]);
export const sourceType = pgEnum("source_type", ["internal", "external", "github", "mirror_only"]);
export const distributionPermission = pgEnum("distribution_permission", [
  "granted",
  "metadata_only",
  "unknown",
]);
export const performanceImpact = pgEnum("performance_impact", ["low", "medium", "high", "extreme"]);
export const mediaKind = pgEnum("media_kind", ["image", "video", "file"]);
export const visibility = pgEnum("visibility", ["visible", "hidden", "deleted"]);
export const likeTarget = pgEnum("like_target", ["pack", "comment", "topic", "reply"]);
export const reportTarget = pgEnum("report_target", ["pack", "comment", "topic", "reply", "user"]);
export const reportStatus = pgEnum("report_status", ["open", "reviewing", "resolved", "dismissed"]);
export const downloadKind = pgEnum("download_kind", ["manual", "installer", "external"]);
export const newsStatus = pgEnum("news_status", ["draft", "review", "published", "archived"]);
export const aiProvider = pgEnum("ai_provider", ["none", "openai", "anthropic", "gemini", "local"]);
export const jobType = pgEnum("job_type", ["check_source", "draft_article"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);
export const manifestStatus = pgEnum("manifest_status", ["draft", "published"]);
export const installOp = pgEnum("install_op", [
  "download",
  "extract",
  "copy_file",
  "move_file",
  "delete_file",
  "ensure_dir",
  "backup",
  "verify",
  "write_text_file",
  "launch_hint",
]);
export const installAction = pgEnum("install_action", ["install", "update", "remove", "restore"]);
export const homepageKey = pgEnum("homepage_key", [
  "hero",
  "featured",
  "trending",
  "known",
  "community",
  "news",
  "forum",
  "discord",
]);

export const roles = pgTable(
  "roles",
  {
    id: id("role"),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    rank: integer("rank").notNull().default(10),
    uploadQuotaBytes: bigint("upload_quota_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    check("roles_rank_range", sql`${t.rank} BETWEEN 0 AND 100`),
    check("roles_quota_nonnegative", sql`${t.uploadQuotaBytes} >= 0`),
  ],
);

export const permissions = pgTable("permissions", {
  id: id("perm"),
  key: text("key").notNull().unique(),
  group: text("group").notNull(),
  description: text("description").notNull(),
});
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    index("role_permissions_permission_idx").on(t.permissionId),
  ],
);

export const users = pgTable(
  "users",
  {
    id: id("usr"),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull().unique(),
    emailVerifiedAt: time("email_verified_at"),
    passwordHash: text("password_hash"), // NULL for non-login demo accounts / future external accounts.
    avatarMediaId: text("avatar_media_id").references((): AnyPgColumn => media.id, {
      onDelete: "set null",
    }),
    bio: text("bio"),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    reputation: counter("reputation"),
    postCount: counter("post_count"),
    banUntil: time("ban_until"),
    bannedReason: text("banned_reason"),
    status: userStatus("status").notNull().default("active"),
    lastLoginAt: time("last_login_at"),
    isDemo: demo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("users_username_format", sql`${t.username} ~ '^[a-z0-9][a-z0-9_-]{2,31}$'`),
    check(
      "users_email_normalized",
      sql`${t.email} = lower(trim(${t.email})) AND position('@' in ${t.email}) > 1`,
    ),
    check("users_post_count_nonnegative", sql`${t.postCount} >= 0`),
    index("users_role_idx").on(t.roleId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id("sess"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: time("expires_at").notNull(),
    createdAt: createdAt(),
    revokedAt: time("revoked_at"),
  },
  (t) => [
    check("sessions_token_hash", sha256(t.tokenHash)),
    check("sessions_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expiry_idx").on(t.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id("reset"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: time("expires_at").notNull(),
    usedAt: time("used_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("reset_token_hash", sha256(t.tokenHash)),
    check("reset_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
    index("reset_user_idx").on(t.userId),
    index("reset_expiry_idx").on(t.expiresAt),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id("acct"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("accounts_provider_identity").on(t.provider, t.providerAccountId),
    index("accounts_user_idx").on(t.userId),
  ],
);

export const media = pgTable(
  "media",
  {
    id: id("media"),
    kind: mediaKind("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    checksum: text("checksum").notNull(),
    originalName: text("original_name").notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    isDemo: demo(),
    createdAt: createdAt(),
  },
  (t) => [
    check("media_size", sql`${t.sizeBytes} >= 0`),
    check(
      "media_dimensions",
      sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`,
    ),
    check("media_checksum", sha256(t.checksum)),
    index("media_creator_idx").on(t.createdById),
  ],
);

export const packCategories = pgTable(
  "pack_categories",
  {
    id: id("cat"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    coverMediaId: text("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    parentId: text("parent_id").references((): AnyPgColumn => packCategories.id, {
      onDelete: "restrict",
    }),
    sortOrder: counter("sort_order"),
    enabled: boolean("enabled").notNull().default(true),
    kind: packKind("kind").notNull(),
    isDemo: demo(),
  },
  (t) => [
    check("category_slug", slugCheck(t.slug)),
    check("category_parent", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    index("pack_category_parent_idx").on(t.parentId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: id("tag"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    usageCount: counter("usage_count"),
    isDemo: demo(),
  },
  (t) => [
    check("tag_slug", slugCheck(t.slug)),
    check("tag_usage_count", sql`${t.usageCount} >= 0`),
  ],
);

export const packs = pgTable(
  "packs",
  {
    id: id("pk"),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    description: text("description").notNull(),
    installGuide: text("install_guide"),
    reviewNote: text("review_note"),
    categoryId: text("category_id")
      .notNull()
      .references(() => packCategories.id, { onDelete: "restrict" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publisher: text("publisher"),
    isKnown: boolean("is_known").notNull().default(false),
    sourceType: sourceType("source_type").notNull().default("external"),
    license: text("license"),
    sourceUrl: text("source_url"),
    distributionPermission: distributionPermission("distribution_permission")
      .notNull()
      .default("unknown"),
    status: packStatus("status").notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    editorPick: boolean("editor_pick").notNull().default(false),
    recommended: boolean("recommended").notNull().default(false),
    trendingOverride: boolean("trending_override").notNull().default(false),
    performanceImpact: performanceImpact("performance_impact").notNull().default("medium"),
    compatibility: text("compatibility")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    requirements: metadata("requirements"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "bigint" }),
    fivemVersion: text("fivem_version"),
    videoUrl: text("video_url"),
    downloadCount: counter("download_count"),
    viewCount: counter("view_count"),
    likeCount: counter("like_count"),
    bookmarkCount: counter("bookmark_count"),
    commentCount: counter("comment_count"),
    ratingAvg: numeric("rating_avg", { precision: 2, scale: 1 }).notNull().default("0.0"),
    ratingCount: counter("rating_count"),
    publishedAt: time("published_at"),
    isDemo: demo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("pack_slug", slugCheck(t.slug)),
    check("pack_size", sql`${t.fileSizeBytes} IS NULL OR ${t.fileSizeBytes} >= 0`),
    check(
      "pack_install_guide",
      sql`${t.installGuide} IS NULL OR char_length(${t.installGuide}) BETWEEN 10 AND 50000`,
    ),
    check(
      "pack_review_note",
      sql`${t.reviewNote} IS NULL OR char_length(${t.reviewNote}) BETWEEN 3 AND 1000`,
    ),
    check(
      "pack_counters",
      sql`${t.downloadCount} >= 0 AND ${t.viewCount} >= 0 AND ${t.likeCount} >= 0 AND ${t.bookmarkCount} >= 0 AND ${t.commentCount} >= 0 AND ${t.ratingCount} >= 0`,
    ),
    check(
      "pack_rating",
      sql`(${t.ratingCount} = 0 AND ${t.ratingAvg} = 0) OR (${t.ratingCount} > 0 AND ${t.ratingAvg} BETWEEN 1 AND 5)`,
    ),
    check("pack_published", sql`${t.status} <> 'approved' OR ${t.publishedAt} IS NOT NULL`),
    index("packs_status_published_idx").on(t.status, t.publishedAt.desc()),
    index("packs_category_status_idx").on(t.categoryId, t.status),
    index("packs_known_status_idx").on(t.isKnown, t.status),
    index("packs_creator_idx").on(t.creatorId),
    index("packs_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.title} || ' ' || ${t.excerpt} || ' ' || ${t.description})`,
    ),
  ],
);

export const packVersions = pgTable(
  "pack_versions",
  {
    id: id("ver"),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "restrict" }),
    version: text("version").notNull(),
    changelog: text("changelog"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "bigint" }),
    checksumSha256: text("checksum_sha256"),
    downloadUrl: text("download_url"),
    isLatest: boolean("is_latest").notNull().default(false),
    publishedAt: time("published_at"),
    isDemo: demo(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("pack_version_number").on(t.packId, t.version),
    unique("pack_version_identity").on(t.packId, t.id),
    uniqueIndex("pack_one_latest_idx")
      .on(t.packId)
      .where(sql`${t.isLatest} = true`),
    check("version_size", sql`${t.fileSizeBytes} IS NULL OR ${t.fileSizeBytes} >= 0`),
    check("version_checksum", sql`${t.checksumSha256} IS NULL OR ${sha256(t.checksumSha256)}`),
  ],
);

export const downloadMirrors = pgTable(
  "download_mirrors",
  {
    id: id("mirror"),
    packVersionId: text("pack_version_id")
      .notNull()
      .references(() => packVersions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    priority: counter("priority"),
    enabled: boolean("enabled").notNull().default(true),
    isDemo: demo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("mirror_name_per_version").on(t.packVersionId, t.name),
    check("mirror_https", sql`${t.url} ~ '^https://'`),
  ],
);

export const packTags = pgTable(
  "pack_tags",
  {
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.packId, t.tagId] }), index("pack_tags_tag_idx").on(t.tagId)],
);
export const packMedia = pgTable(
  "pack_media",
  {
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    sortOrder: counter("sort_order"),
    caption: text("caption"),
  },
  (t) => [
    primaryKey({ columns: [t.packId, t.mediaId] }),
    unique("pack_media_order").on(t.packId, t.sortOrder),
    index("pack_media_media_idx").on(t.mediaId),
  ],
);

export const downloads = pgTable(
  "downloads",
  {
    id: id("dl"),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "restrict" }),
    packVersionId: text("pack_version_id"),
    userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
    ipHash: text("ip_hash").notNull(),
    mirror: text("mirror").notNull(),
    kind: downloadKind("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.packId, t.packVersionId],
      foreignColumns: [packVersions.packId, packVersions.id],
      name: "download_version_belongs_to_pack",
    }),
    check("download_ip_hash", sha256(t.ipHash)),
    index("downloads_pack_time_idx").on(t.packId, t.createdAt),
    index("downloads_user_time_idx").on(t.userId, t.createdAt),
  ],
);

export const ratings = pgTable(
  "ratings",
  {
    id: id("rating"),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    value: integer("value").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("rating_per_user_pack").on(t.packId, t.userId),
    check("rating_range", sql`${t.value} BETWEEN 1 AND 5`),
    index("ratings_user_idx").on(t.userId),
  ],
);
export const likes = pgTable(
  "likes",
  {
    id: id("like"),
    targetType: likeTarget("target_type").notNull(),
    targetId: text("target_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("like_per_user_target").on(t.targetType, t.targetId, t.userId),
    index("likes_user_idx").on(t.userId),
  ],
);
export const bookmarks = pgTable(
  "bookmarks",
  {
    id: id("bm"),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("bookmark_per_user_pack").on(t.packId, t.userId),
    index("bookmarks_user_idx").on(t.userId),
  ],
);
export const comments = pgTable(
  "comments",
  {
    id: id("cmt"),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    parentId: text("parent_id"),
    body: text("body").notNull(),
    status: visibility("status").notNull().default("visible"),
    isDemo: demo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("comment_pack_identity").on(t.packId, t.id),
    foreignKey({
      columns: [t.packId, t.parentId],
      foreignColumns: [t.packId, t.id],
      name: "comment_parent_same_pack",
    }),
    check("comment_not_own_parent", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    index("comments_pack_time_idx").on(t.packId, t.createdAt),
  ],
);

export const forumCategories = pgTable(
  "forum_categories",
  {
    id: id("fcat"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    parentId: text("parent_id").references((): AnyPgColumn => forumCategories.id, {
      onDelete: "restrict",
    }),
    sortOrder: counter("sort_order"),
    enabled: boolean("enabled").notNull().default(true),
    topicCount: counter("topic_count"),
    postCount: counter("post_count"),
    isDemo: demo(),
  },
  (t) => [
    check("forum_category_slug", slugCheck(t.slug)),
    check("forum_category_parent", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    check("forum_category_counters", sql`${t.topicCount} >= 0 AND ${t.postCount} >= 0`),
  ],
);
export const forumTopics = pgTable(
  "forum_topics",
  {
    id: id("topic"),
    slug: text("slug").notNull().unique(),
    categoryId: text("category_id")
      .notNull()
      .references(() => forumCategories.id, { onDelete: "restrict" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isPinned: boolean("is_pinned").notNull().default(false),
    isLocked: boolean("is_locked").notNull().default(false),
    viewCount: counter("view_count"),
    replyCount: counter("reply_count"),
    likeCount: counter("like_count"),
    lastReplyAt: time("last_reply_at"),
    status: visibility("status").notNull().default("visible"),
    isDemo: demo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("topic_slug", slugCheck(t.slug)),
    check(
      "topic_counters",
      sql`${t.viewCount} >= 0 AND ${t.replyCount} >= 0 AND ${t.likeCount} >= 0`,
    ),
    index("topics_category_activity_idx").on(t.categoryId, t.lastReplyAt.desc()),
    index("topics_author_idx").on(t.authorId),
  ],
);
export const forumReplies = pgTable(
  "forum_replies",
  {
    id: id("reply"),
    topicId: text("topic_id")
      .notNull()
      .references(() => forumTopics.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    parentId: text("parent_id"),
    body: text("body").notNull(),
    status: visibility("status").notNull().default("visible"),
    likeCount: counter("like_count"),
    isAcceptedAnswer: boolean("is_accepted_answer").notNull().default(false),
    isDemo: demo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("reply_topic_identity").on(t.topicId, t.id),
    foreignKey({
      columns: [t.topicId, t.parentId],
      foreignColumns: [t.topicId, t.id],
      name: "reply_parent_same_topic",
    }),
    check("reply_not_own_parent", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    check("reply_like_count", sql`${t.likeCount} >= 0`),
    index("replies_topic_time_idx").on(t.topicId, t.createdAt),
    uniqueIndex("one_accepted_answer_idx")
      .on(t.topicId)
      .where(sql`${t.isAcceptedAnswer} = true`),
  ],
);

export const newsCategories = pgTable(
  "news_categories",
  {
    id: id("ncat"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    sortOrder: counter("sort_order"),
    isDemo: demo(),
  },
  (t) => [check("news_category_slug", slugCheck(t.slug))],
);
export const aiSources = pgTable(
  "ai_sources",
  {
    id: id("aisrc"),
    name: text("name").notNull(),
    url: text("url").notNull().unique(),
    enabled: boolean("enabled").notNull().default(false),
    trusted: boolean("trusted").notNull().default(false),
    categoryIds: jsonb("category_ids").$type<string[]>().notNull().default([]),
    keywords: text("keywords")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    blockedKeywords: text("blocked_keywords")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    intervalMinutes: integer("interval_minutes").notNull().default(60),
    language: text("language").notNull().default("tr"),
    lastCheckedAt: time("last_checked_at"),
    isDemo: demo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("ai_source_interval", sql`${t.intervalMinutes} >= 1`)],
);
export const aiConfigs = pgTable(
  "ai_configs",
  {
    key: text("key").primaryKey().default("default"),
    provider: aiProvider("provider").notNull().default("none"),
    model: text("model"),
    prompt: text("prompt").notNull().default(""),
    minConfidence: numeric("min_confidence", { precision: 4, scale: 3 }).notNull().default("0.900"),
    autoPublish: boolean("auto_publish").notNull().default(false),
    language: text("language").notNull().default("tr"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ai_config_singleton", sql`${t.key} = 'default'`),
    check("ai_config_confidence", sql`${t.minConfidence} BETWEEN 0 AND 1`),
  ],
);
export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: id("job"),
    sourceId: text("source_id").references(() => aiSources.id, { onDelete: "set null" }),
    type: jobType("type").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    dedupeKey: text("dedupe_key").unique(),
    input: metadata("input"),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    attempts: counter("attempts"),
    availableAt: time("available_at").notNull().defaultNow(),
    startedAt: time("started_at"),
    finishedAt: time("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("ai_job_attempts", sql`${t.attempts} >= 0`),
    index("ai_jobs_queue_idx").on(t.status, t.availableAt),
  ],
);
export const newsArticles = pgTable(
  "news_articles",
  {
    id: id("news"),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    content: text("content").notNull(),
    coverMediaId: text("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => newsCategories.id, { onDelete: "restrict" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "restrict" }),
    aiSourceId: text("ai_source_id").references(() => aiSources.id, { onDelete: "set null" }),
    sourceUrl: text("source_url"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: newsStatus("status").notNull().default("draft"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    publishedAt: time("published_at"),
    isDemo: demo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("news_slug", slugCheck(t.slug)),
    check("news_confidence", sql`${t.confidence} IS NULL OR ${t.confidence} BETWEEN 0 AND 1`),
    check("news_published", sql`${t.status} <> 'published' OR ${t.publishedAt} IS NOT NULL`),
    index("news_published_idx").on(t.status, t.publishedAt.desc()),
  ],
);

export const installManifests = pgTable(
  "install_manifests",
  {
    id: id("manifest"),
    packId: text("pack_id")
      .notNull()
      .unique()
      .references(() => packs.id, { onDelete: "restrict" }),
    packageId: text("package_id").notNull().unique(),
    schemaVersion: integer("schema_version").notNull().default(1),
    game: text("game").notNull().default("fivem"),
    backup: boolean("backup").notNull().default(true),
    signature: text("signature"),
    checksum: text("checksum"),
    status: manifestStatus("status").notNull().default("draft"),
    updatedById: text("updated_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("manifest_package_slug", slugCheck(t.packageId)),
    check("manifest_schema_version", sql`${t.schemaVersion} >= 1`),
    check("manifest_checksum", sql`${t.checksum} IS NULL OR ${sha256(t.checksum)}`),
    check(
      "manifest_published_signature",
      sql`${t.status} <> 'published' OR (${t.signature} IS NOT NULL AND length(${t.signature}) > 0 AND ${t.checksum} IS NOT NULL)`,
    ),
  ],
);
export const installOperations = pgTable(
  "install_operations",
  {
    id: id("op"),
    manifestId: text("manifest_id")
      .notNull()
      .references(() => installManifests.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    op: installOp("op").notNull(),
    params: metadata("params"),
    targetPath: text("target_path"),
    expectedSha256: text("expected_sha256"),
  },
  (t) => [
    unique("manifest_operation_order").on(t.manifestId, t.order),
    check("operation_order", sql`${t.order} >= 0`),
    check("operation_hash", sql`${t.expectedSha256} IS NULL OR ${sha256(t.expectedSha256)}`),
  ],
);
export const installVersions = pgTable(
  "install_versions",
  {
    id: id("installver"),
    manifestId: text("manifest_id")
      .notNull()
      .references(() => installManifests.id, { onDelete: "restrict" }),
    version: text("version").notNull(),
    snapshot: metadata("snapshot"),
    signature: text("signature").notNull(),
    checksum: text("checksum").notNull(),
    publishedAt: time("published_at").notNull().defaultNow(),
    notes: text("notes"),
    rollbackToId: text("rollback_to_id"),
  },
  (t) => [
    unique("install_version_number").on(t.manifestId, t.version),
    unique("install_version_identity").on(t.manifestId, t.id),
    foreignKey({
      columns: [t.manifestId, t.rollbackToId],
      foreignColumns: [t.manifestId, t.id],
      name: "rollback_same_manifest",
    }),
    check("install_version_checksum", sha256(t.checksum)),
    check("install_version_signature", sql`length(${t.signature}) > 0`),
    check("rollback_not_self", sql`${t.rollbackToId} IS NULL OR ${t.rollbackToId} <> ${t.id}`),
  ],
);
export const installedPackLogs = pgTable(
  "installed_pack_logs",
  {
    id: id("installlog"),
    userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
    machineHash: text("machine_hash").notNull(),
    packageId: text("package_id").notNull(),
    version: text("version").notNull(),
    action: installAction("action").notNull(),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("install_log_machine_hash", sha256(t.machineHash)),
    index("installed_logs_package_time_idx").on(t.packageId, t.createdAt),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: id("report"),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetType: reportTarget("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    status: reportStatus("status").notNull().default("open"),
    resolvedById: text("resolved_by_id").references(() => users.id, { onDelete: "restrict" }),
    resolution: text("resolution"),
    createdAt: createdAt(),
    resolvedAt: time("resolved_at"),
  },
  (t) => [
    index("reports_queue_idx").on(t.status, t.createdAt),
    check(
      "report_resolution",
      sql`${t.status} NOT IN ('resolved', 'dismissed') OR (${t.resolvedById} IS NOT NULL AND ${t.resolvedAt} IS NOT NULL)`,
    ),
  ],
);
export const notifications = pgTable(
  "notifications",
  {
    id: id("notice"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: time("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_time_idx").on(t.userId, t.createdAt),
    index("notifications_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),
  ],
);
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id("audit"),
    actorId: text("actor_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_time_idx").on(t.createdAt),
    index("audit_actor_idx").on(t.actorId, t.createdAt),
  ],
);
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedById: text("updated_by_id").references(() => users.id, { onDelete: "restrict" }),
  updatedAt: updatedAt(),
});
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  updatedAt: updatedAt(),
});
export const homepageSections = pgTable(
  "homepage_sections",
  {
    id: id("section"),
    key: homepageKey("key").notNull().unique(),
    enabled: boolean("enabled").notNull().default(false),
    order: integer("order").notNull(),
    config: metadata("config"),
    updatedAt: updatedAt(),
  },
  (t) => [check("homepage_order", sql`${t.order} >= 0`)],
);
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: id("event"),
    name: text("name").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
    sessionId: text("session_id"),
    packId: text("pack_id").references(() => packs.id, { onDelete: "restrict" }),
    meta: metadata("meta"),
    createdAt: createdAt(),
  },
  (t) => [
    index("analytics_name_time_idx").on(t.name, t.createdAt),
    index("analytics_pack_time_idx").on(t.packId, t.createdAt),
  ],
);

// Ephemeral deduplication/rate-limit state is separate from append-only events.
export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: id("rate"),
    keyHash: text("key_hash").notNull(),
    createdAt: createdAt(),
    expiresAt: time("expires_at").notNull(),
  },
  (t) => [
    check("rate_key_hash", sha256(t.keyHash)),
    check("rate_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
    index("rate_key_time_idx").on(t.keyHash, t.createdAt),
    index("rate_expiry_idx").on(t.expiresAt),
  ],
);
export const eventDeduplication = pgTable(
  "event_deduplication",
  {
    keyHash: text("key_hash").primaryKey(),
    expiresAt: time("expires_at").notNull(),
  },
  (t) => [check("dedupe_key_hash", sha256(t.keyHash)), index("dedupe_expiry_idx").on(t.expiresAt)],
);
