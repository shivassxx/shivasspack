# SHIVASS PACK — Database ERD (V1)

PostgreSQL + Drizzle (postgres.js driver). Implemented in `src/db/schema.ts` and
`drizzle/0000_v1_schema.sql` (41 application tables). This document summarizes the model;
the schema/migrations are authoritative for exact fields and constraints.
All ids are `TEXT` (prefixed UUIDs: `pk_`, `usr_`, …) unless noted. Defaults use
PostgreSQL `gen_random_uuid()`; seed IDs are stable readable identifiers.
Timestamps are `TIMESTAMPTZ`, mapped to JavaScript `Date` values. Money-free.

## Entity overview

```
┌─────────────┐   ┌──────────────┐   ┌────────────────┐
│    Role     │──<│    User      │──<│    Session     │
└─────────────┘   │              │   └────────────────┘
┌─────────────┐   │              │──<┌────────────────┐
│ Permission  │──<│              │   │  Notification  │
└──────┬──────┘   └──────┬───────┘   └────────────────┘
       │                 │
┌──────┴──────┐   ┌──────┴──────────────────────────────────────┐
│ RolePermission│  │                 Content                    │
└─────────────┘   │  Pack > PackVersion, PackCategory, Tag,     │
                  │  PackTag, Media, Download, Rating, Like,    │
                  │  Bookmark, Comment                          │
                  └──────┬──────────────────────────────────────┘
                         │
   ┌─────────────────────┼──────────────────────┐
   │                     │                      │
┌──▼───────────┐  ┌───────▼──────┐  ┌────────────▼───────────┐
│ ForumCategory│  │ NewsArticle  │  │ InstallManifest        │
│ ForumTopic   │  │ NewsCategory │  │  └ InstallOperation    │
│ ForumReply   │  │ AISource     │  │  └ InstallVersion      │
│ Like (shared)│  │ AIJob        │  └────────────────────────┘
└──────────────┘  └──────────────┘
   Report, AuditLog, SiteSetting, HomepageSection, AnalyticsEvent,
   FeatureFlag, Media  →  cross-cutting tables
```

## Tables

### Identity & access

**Role**

- `id`, `key` (unique: `guest|member|creator|verified_creator|moderator|admin|super_admin`)
- `name`, `description`, `isSystem` (seeded, not deletable)
- `rank` (0..100), `uploadQuotaBytes` (nonnegative bigint); enforcement of system-role edits is a Phase 3 service rule
- relations: `users`, `permissions` (M2M via `RolePermission`)

**Permission**

- `id`, `key` (unique, dotted: `pack.publish`, `forum.moderate`, `admin.settings`)
- `group` (display grouping), `description`

**RolePermission** — `roleId`, `permissionId` (composite PK)

**User**

- `id`, `username` (unique, immutable), `displayName`, `email` (unique), `emailVerifiedAt`
- `passwordHash?` (scrypt in Phase 3; null accounts cannot use password login), `avatarMediaId?`, `bio?`
- `roleId`, `reputation` (int, derived), `postCount`, `banUntil?`, `bannedReason?`
- `status` (`active|suspended|deleted`), `lastLoginAt?`, `createdAt`, `updatedAt`
- relations: sessions, packs (uploaded), ratings, likes, bookmarks, comments, topics, replies, notifications

**Session**

- `id`, `userId`, `tokenHash` (sha256 of cookie value — raw token never stored),
  `userAgent?`, `ip?`, `expiresAt`, `createdAt`, `revokedAt?`

### Content

**PackCategory**

- `id`, `slug` (unique), `name`, `description?`, `icon?`, `coverMediaId?`
- `parentId?` (subcategories), `sortOrder`, `enabled`
- `kind` (`graphics|pvp|reshade|enb|performance|known|other`) — used by navbar/URL sections

**Tag** — `id`, `slug` (unique), `name`, `usageCount`

**Pack**

- `id`, `slug` (unique), `title`, `excerpt`, `description` (rich text/sanitized)
- `categoryId`, `creatorId` (User), `publisher?`, `isKnown` (Known Packs flag)
- `sourceType` (`internal|external|github|mirror_only`), `license?`, `sourceUrl?`,
  `distributionPermission` (`granted|metadata_only|unknown`) ← legal guard
- `status` (`draft|pending|approved|rejected|changes_requested|archived`)
- `featured`, `editorPick`, `recommended`, `trendingOverride`
- `performanceImpact` (`low|medium|high|extreme`), `compatibility` (text[]), `requirements` (jsonb)
- `fileSizeBytes?`, `fivemVersion?`, `videoUrl?`
- `downloadCount`, `viewCount`, `likeCount`, `bookmarkCount`, `commentCount`
- `ratingAvg` (numeric 1dp), `ratingCount` — denormalized, recomputed on write
- `publishedAt?`, `createdAt`, `updatedAt`
- relations: versions, tags, media, downloads, ratings, likes, bookmarks, comments, manifest

**PackVersion**

- `id`, `packId`, `version` (semver string), `changelog?`, `fileSizeBytes?`
- `checksumSha256?`, `downloadUrl?`
- `isLatest` (partial unique index per pack), `publishedAt?`, `createdAt`
- immutable after publish (service rejects updates)

**PackTag** — `packId`, `tagId` (composite PK)

**Media** — `id`, `kind` (`image|video|file`), `storageKey`, `mime`, `sizeBytes`,
`width?`, `height?`, `checksum`, `originalName`, `createdById`, `createdAt`

**Download** — `id`, `packId`, `packVersionId?`, `userId?`, `ipHash`, `mirror`,
`kind` (`manual|installer|external`), `createdAt` — append-only, used for counters + abuse signals

**AnalyticsEvent** — `id`, `name` (`pack_view|download_started|download_completed|…`),
`userId?`, `sessionId?`, `packId?`, `meta` (jsonb), `createdAt` — B-tree index on `name,createdAt`.
`sessionId` is an analytics correlation ID, not an auth token or FK to expiring auth sessions.

### Interaction

**Rating** — `id`, `packId`, `userId`, `value` (1–5), `updatedAt` — **unique(packId,userId)**
**Like** — `id`, `targetType` (`pack|comment|topic|reply`), `targetId`, `userId`,
`createdAt` — unique(targetType,targetId,userId)
**Bookmark** — `id`, `packId`, `userId`, `createdAt` — unique(packId,userId)
**Comment** — `id`, `packId`, `userId`, `parentId?`, `body`, `status`
(`visible|hidden|deleted`), `createdAt`, `updatedAt`

### Forum

**ForumCategory** — `id`, `slug`, `name`, `description?`, `icon?`, `parentId?`,
`sortOrder`, `enabled`, `topicCount`, `postCount`

**ForumTopic** — `id`, `slug`, `categoryId`, `authorId`, `title`, `body`,
`tags` (text[]), `isPinned`, `isLocked`, `viewCount`, `replyCount`, `likeCount`,
`lastReplyAt?`, `status` (`visible|hidden|deleted`), `createdAt`, `updatedAt`

**ForumReply** — `id`, `topicId`, `authorId`, `parentId?`, `body`,
`status`, `likeCount`, `isAcceptedAnswer`, `createdAt`, `updatedAt`

Forum likes use the shared **Like** table with `targetType IN (topic, reply)`;
there is no separate `ForumLike` table. Target existence and ownership are checked
by the service layer inside the mutation transaction.

### News & AI

**NewsCategory** — `id`, `slug`, `name`, `sortOrder`
**NewsArticle** — `id`, `slug`, `title`, `excerpt`, `content`, `coverMediaId?`,
`categoryId`, `authorId?`, `aiSourceId?`, `tags` (text[]), `status`
(`draft|review|published|archived`), `confidence?`, `seoTitle?`, `seoDescription?`,
`publishedAt?`, `createdAt`, `updatedAt`

**AISource** — `id`, `name`, `url`, `enabled`, `trusted` (auto-publish eligible),
`categoryIds` (jsonb), `keywords` (text[]), `blockedKeywords` (text[]),
`intervalMinutes`, `language`, `lastCheckedAt?`

**AIConfig** (dedicated singleton, `key=default`) — `provider`, `model`, `prompt`, `minConfidence`,
`autoPublish`, `language`

**AIJob** — `id`, `sourceId?`, `type` (`check_source|draft_article`),
`status` (`queued|running|done|failed`), `input` (jsonb), `output` (jsonb),
`error?`, `attempts`, `startedAt?`, `finishedAt?`

### Installer

**InstallManifest** — `id`, `packId` (unique), `packageId` (public slug),
`schemaVersion`, `game`, `backup` (bool), `signature?` (Ed25519),
`checksum` (manifest body sha256), `status` (`draft|published`), `updatedById`, `updatedAt`

**InstallOperation** (ordered) — `id`, `manifestId`, `order`, `op`
(`download|extract|copy_file|move_file|delete_file|ensure_dir|backup|verify|write_text_file|launch_hint`),
`params` (jsonb), `targetPath?` (validated relative), `expectedSha256?`
— whitelist only; **no shell/exec op exists by design**

**InstallVersion** — `id`, `manifestId`, `version`, `snapshot` (complete immutable JSON manifest),
`signature`, `checksum`, `publishedAt`, `notes`, `rollbackToId?` (same manifest only).
Pack versions and installer versions are linked through their pack/manifest and version
string; no mutable `manifestId` pointer is kept on a published pack version.

**InstalledPackLog** (client-reported) — `id`, `userId?`, `machineHash`, `packageId`,
`version`, `action` (`install|update|remove|restore`), `success`, `createdAt`

### System

**Report** — `id`, `reporterId`, `targetType` (`pack|topic|reply|comment|user`),
`targetId`, `reason`, `details?`, `status` (`open|reviewing|resolved|dismissed`),
`resolvedById?`, `resolution?`, `createdAt`, `resolvedAt?`

**Notification** — `id`, `userId`, `type`, `title`, `body?`, `link?`, `readAt?`, `createdAt`

**AuditLog** — `id`, `actorId?`, `action`, `targetType`, `targetId`, `before` (jsonb),
`after` (jsonb), `ip?`, `createdAt` — **no UPDATE/DELETE grants in app code**

**SiteSetting** — `key` (PK), `value` (jsonb), `updatedById`, `updatedAt`

**FeatureFlag** — `key` (PK), `enabled`, `description?`, `updatedAt`

**HomepageSection** — `id`, `key` (`hero|featured|trending|known|community|news|forum|discord`),
`enabled`, `order`, `config` (jsonb), `updatedAt`

**Media relation note:** `coverMediaId` fields point to `Media` (nullable, `SET NULL`).

### Additional implemented support tables

- `accounts`: future provider identity link; unique(provider, providerAccountId), no OAuth flow yet.
- `password_reset_tokens`: hashed single-use token, expiry, usedAt; consumption is an auth service transaction.
- `download_mirrors`: version FK, unique name/version, HTTPS URL, priority, enabled.
- `pack_media`: ordered gallery join, unique order per pack.
- `rate_limit_events`: hashed key, timestamp and expiry indexes for DB sliding windows.
- `event_deduplication`: expiring hashed primary key; separate from append-only history.

### Constraint and lifecycle boundaries

- All schema names are snake_case in SQL and camelCase in TypeScript.
- `isDemo` is present on seeded content/identity entities; junction rows inherit the
  parent content's demo classification. System reference rows are not demo data.
- Byte sizes/quotas are bigint (JavaScript bigint). APIs must serialize them explicitly.
- `updatedAt` is updated by Drizzle ORM `$onUpdate`; raw SQL writers must set it themselves.
- Email is normalized to lower(trim(email)); username is lowercase, 3..32 characters.
- Rating 1..5; nonnegative counters/sizes; hash fields use lowercase SHA-256 hex.
- Composite FKs keep download versions with their pack, reply parents with their topic,
  and comment parents with their pack. Parent cycles beyond self-parent are a service rule.
- Shared likes/reports have polymorphic targets: their existence/authorization checks
  belong to the corresponding service, not a cross-table FK.
- `audit_logs`, `downloads`, `analytics_events`, `installed_pack_logs`, `install_versions`
  are SELECT/INSERT-only for the app role. History FKs restrict physical deletion;
  user/content deletion is soft-delete. Retention/anonymization needs a privileged operation.
- Installer enum/signature presence checks are structural; cryptographic verification,
  path whitelist and semver validation belong to Phase 11 services.
- Approved packs/published news require a publication timestamp. Published pack-version
  immutability, immutable usernames, role protection and counter transactions are upcoming
  service rules; the database phase does not implement those user-facing workflows.

## Index strategy (high value)

- `Pack(status, publishedAt DESC)`, `Pack(categoryId, status)`, `Pack(isKnown, status)`
- `Pack` GIN `tsvector(title, excerpt, description)` — search
- `Download(packId, createdAt)`, `AnalyticsEvent(name, createdAt)`
- `ForumTopic(categoryId, lastReplyAt DESC)`, `ForumReply(topicId, createdAt)`
- `Rating(packId)`, `Like(targetType,targetId,userId)` unique
- `Session(tokenHash)` unique, `Session(expiresAt)`
- Partial unique: `PackVersion(packId) WHERE isLatest`

## Denormalization policy

Counters (`downloadCount`, `likeCount`, `replyCount`, `ratingAvg`) are updated in the
**same transaction** as the source write. A nightly consistency job (Phase 16) can
recompute and repair drift.
