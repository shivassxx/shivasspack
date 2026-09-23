CREATE TYPE "public"."ai_provider" AS ENUM('none', 'openai', 'anthropic', 'gemini', 'local');--> statement-breakpoint
CREATE TYPE "public"."distribution_permission" AS ENUM('granted', 'metadata_only', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."download_kind" AS ENUM('manual', 'installer', 'external');--> statement-breakpoint
CREATE TYPE "public"."homepage_key" AS ENUM('hero', 'featured', 'trending', 'known', 'community', 'news', 'forum', 'discord');--> statement-breakpoint
CREATE TYPE "public"."install_action" AS ENUM('install', 'update', 'remove', 'restore');--> statement-breakpoint
CREATE TYPE "public"."install_op" AS ENUM('download', 'extract', 'copy_file', 'move_file', 'delete_file', 'ensure_dir', 'backup', 'verify', 'write_text_file', 'launch_hint');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('check_source', 'draft_article');--> statement-breakpoint
CREATE TYPE "public"."like_target" AS ENUM('pack', 'comment', 'topic', 'reply');--> statement-breakpoint
CREATE TYPE "public"."manifest_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'file');--> statement-breakpoint
CREATE TYPE "public"."news_status" AS ENUM('draft', 'review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pack_kind" AS ENUM('graphics', 'pvp', 'reshade', 'enb', 'performance', 'known', 'other');--> statement-breakpoint
CREATE TYPE "public"."pack_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'changes_requested', 'archived');--> statement-breakpoint
CREATE TYPE "public"."performance_impact" AS ENUM('low', 'medium', 'high', 'extreme');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('pack', 'comment', 'topic', 'reply', 'user');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('internal', 'external', 'github', 'mirror_only');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('visible', 'hidden', 'deleted');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY DEFAULT 'acct_' || gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_identity" UNIQUE("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "ai_configs" (
	"key" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"provider" "ai_provider" DEFAULT 'none' NOT NULL,
	"model" text,
	"prompt" text DEFAULT '' NOT NULL,
	"min_confidence" numeric(4, 3) DEFAULT '0.900' NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'tr' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_config_singleton" CHECK ("ai_configs"."key" = 'default'),
	CONSTRAINT "ai_config_confidence" CHECK ("ai_configs"."min_confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" text PRIMARY KEY DEFAULT 'job_' || gen_random_uuid()::text NOT NULL,
	"source_id" text,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"dedupe_key" text,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_jobs_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "ai_job_attempts" CHECK ("ai_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_sources" (
	"id" text PRIMARY KEY DEFAULT 'aisrc_' || gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"trusted" boolean DEFAULT false NOT NULL,
	"category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"blocked_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"interval_minutes" integer DEFAULT 60 NOT NULL,
	"language" text DEFAULT 'tr' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_sources_url_unique" UNIQUE("url"),
	CONSTRAINT "ai_source_interval" CHECK ("ai_sources"."interval_minutes" >= 1)
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" text PRIMARY KEY DEFAULT 'event_' || gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"session_id" text,
	"pack_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY DEFAULT 'audit_' || gen_random_uuid()::text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" text PRIMARY KEY DEFAULT 'bm_' || gen_random_uuid()::text NOT NULL,
	"pack_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmark_per_user_pack" UNIQUE("pack_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY DEFAULT 'cmt_' || gen_random_uuid()::text NOT NULL,
	"pack_id" text NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text,
	"body" text NOT NULL,
	"status" "visibility" DEFAULT 'visible' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_pack_identity" UNIQUE("pack_id","id"),
	CONSTRAINT "comment_not_own_parent" CHECK ("comments"."parent_id" IS NULL OR "comments"."parent_id" <> "comments"."id")
);
--> statement-breakpoint
CREATE TABLE "download_mirrors" (
	"id" text PRIMARY KEY DEFAULT 'mirror_' || gen_random_uuid()::text NOT NULL,
	"pack_version_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mirror_name_per_version" UNIQUE("pack_version_id","name"),
	CONSTRAINT "mirror_https" CHECK ("download_mirrors"."url" ~ '^https://')
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"id" text PRIMARY KEY DEFAULT 'dl_' || gen_random_uuid()::text NOT NULL,
	"pack_id" text NOT NULL,
	"pack_version_id" text,
	"user_id" text,
	"ip_hash" text NOT NULL,
	"mirror" text NOT NULL,
	"kind" "download_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "download_ip_hash" CHECK ("downloads"."ip_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "event_deduplication" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dedupe_key_hash" CHECK ("event_deduplication"."key_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_categories" (
	"id" text PRIMARY KEY DEFAULT 'fcat_' || gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"topic_count" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "forum_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "forum_category_slug" CHECK ("forum_categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("forum_categories"."slug") <= 96),
	CONSTRAINT "forum_category_parent" CHECK ("forum_categories"."parent_id" IS NULL OR "forum_categories"."parent_id" <> "forum_categories"."id"),
	CONSTRAINT "forum_category_counters" CHECK ("forum_categories"."topic_count" >= 0 AND "forum_categories"."post_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "forum_replies" (
	"id" text PRIMARY KEY DEFAULT 'reply_' || gen_random_uuid()::text NOT NULL,
	"topic_id" text NOT NULL,
	"author_id" text NOT NULL,
	"parent_id" text,
	"body" text NOT NULL,
	"status" "visibility" DEFAULT 'visible' NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"is_accepted_answer" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reply_topic_identity" UNIQUE("topic_id","id"),
	CONSTRAINT "reply_not_own_parent" CHECK ("forum_replies"."parent_id" IS NULL OR "forum_replies"."parent_id" <> "forum_replies"."id"),
	CONSTRAINT "reply_like_count" CHECK ("forum_replies"."like_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "forum_topics" (
	"id" text PRIMARY KEY DEFAULT 'topic_' || gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"category_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"last_reply_at" timestamp with time zone,
	"status" "visibility" DEFAULT 'visible' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_topics_slug_unique" UNIQUE("slug"),
	CONSTRAINT "topic_slug" CHECK ("forum_topics"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("forum_topics"."slug") <= 96),
	CONSTRAINT "topic_counters" CHECK ("forum_topics"."view_count" >= 0 AND "forum_topics"."reply_count" >= 0 AND "forum_topics"."like_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "homepage_sections" (
	"id" text PRIMARY KEY DEFAULT 'section_' || gen_random_uuid()::text NOT NULL,
	"key" "homepage_key" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"order" integer NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homepage_sections_key_unique" UNIQUE("key"),
	CONSTRAINT "homepage_order" CHECK ("homepage_sections"."order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "install_manifests" (
	"id" text PRIMARY KEY DEFAULT 'manifest_' || gen_random_uuid()::text NOT NULL,
	"pack_id" text NOT NULL,
	"package_id" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"game" text DEFAULT 'fivem' NOT NULL,
	"backup" boolean DEFAULT true NOT NULL,
	"signature" text,
	"checksum" text,
	"status" "manifest_status" DEFAULT 'draft' NOT NULL,
	"updated_by_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "install_manifests_pack_id_unique" UNIQUE("pack_id"),
	CONSTRAINT "install_manifests_package_id_unique" UNIQUE("package_id"),
	CONSTRAINT "manifest_package_slug" CHECK ("install_manifests"."package_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("install_manifests"."package_id") <= 96),
	CONSTRAINT "manifest_schema_version" CHECK ("install_manifests"."schema_version" >= 1),
	CONSTRAINT "manifest_checksum" CHECK ("install_manifests"."checksum" IS NULL OR "install_manifests"."checksum" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "manifest_published_signature" CHECK ("install_manifests"."status" <> 'published' OR ("install_manifests"."signature" IS NOT NULL AND length("install_manifests"."signature") > 0 AND "install_manifests"."checksum" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "install_operations" (
	"id" text PRIMARY KEY DEFAULT 'op_' || gen_random_uuid()::text NOT NULL,
	"manifest_id" text NOT NULL,
	"order" integer NOT NULL,
	"op" "install_op" NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_path" text,
	"expected_sha256" text,
	CONSTRAINT "manifest_operation_order" UNIQUE("manifest_id","order"),
	CONSTRAINT "operation_order" CHECK ("install_operations"."order" >= 0),
	CONSTRAINT "operation_hash" CHECK ("install_operations"."expected_sha256" IS NULL OR "install_operations"."expected_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "install_versions" (
	"id" text PRIMARY KEY DEFAULT 'installver_' || gen_random_uuid()::text NOT NULL,
	"manifest_id" text NOT NULL,
	"version" text NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature" text NOT NULL,
	"checksum" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"rollback_to_id" text,
	CONSTRAINT "install_version_number" UNIQUE("manifest_id","version"),
	CONSTRAINT "install_version_identity" UNIQUE("manifest_id","id"),
	CONSTRAINT "install_version_checksum" CHECK ("install_versions"."checksum" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "install_version_signature" CHECK (length("install_versions"."signature") > 0),
	CONSTRAINT "rollback_not_self" CHECK ("install_versions"."rollback_to_id" IS NULL OR "install_versions"."rollback_to_id" <> "install_versions"."id")
);
--> statement-breakpoint
CREATE TABLE "installed_pack_logs" (
	"id" text PRIMARY KEY DEFAULT 'installlog_' || gen_random_uuid()::text NOT NULL,
	"user_id" text,
	"machine_hash" text NOT NULL,
	"package_id" text NOT NULL,
	"version" text NOT NULL,
	"action" "install_action" NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "install_log_machine_hash" CHECK ("installed_pack_logs"."machine_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"id" text PRIMARY KEY DEFAULT 'like_' || gen_random_uuid()::text NOT NULL,
	"target_type" "like_target" NOT NULL,
	"target_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "like_per_user_target" UNIQUE("target_type","target_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY DEFAULT 'media_' || gen_random_uuid()::text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"checksum" text NOT NULL,
	"original_name" text NOT NULL,
	"created_by_id" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_size" CHECK ("media"."size_bytes" >= 0),
	CONSTRAINT "media_dimensions" CHECK (("media"."width" IS NULL OR "media"."width" > 0) AND ("media"."height" IS NULL OR "media"."height" > 0)),
	CONSTRAINT "media_checksum" CHECK ("media"."checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" text PRIMARY KEY DEFAULT 'news_' || gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"cover_media_id" text,
	"category_id" text NOT NULL,
	"author_id" text,
	"ai_source_id" text,
	"source_url" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "news_status" DEFAULT 'draft' NOT NULL,
	"confidence" numeric(4, 3),
	"seo_title" text,
	"seo_description" text,
	"published_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_articles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "news_slug" CHECK ("news_articles"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("news_articles"."slug") <= 96),
	CONSTRAINT "news_confidence" CHECK ("news_articles"."confidence" IS NULL OR "news_articles"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "news_published" CHECK ("news_articles"."status" <> 'published' OR "news_articles"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "news_categories" (
	"id" text PRIMARY KEY DEFAULT 'ncat_' || gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "news_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "news_category_slug" CHECK ("news_categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("news_categories"."slug") <= 96)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY DEFAULT 'notice_' || gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_categories" (
	"id" text PRIMARY KEY DEFAULT 'cat_' || gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"cover_media_id" text,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"kind" "pack_kind" NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pack_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "category_slug" CHECK ("pack_categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("pack_categories"."slug") <= 96),
	CONSTRAINT "category_parent" CHECK ("pack_categories"."parent_id" IS NULL OR "pack_categories"."parent_id" <> "pack_categories"."id")
);
--> statement-breakpoint
CREATE TABLE "pack_media" (
	"pack_id" text NOT NULL,
	"media_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"caption" text,
	CONSTRAINT "pack_media_pack_id_media_id_pk" PRIMARY KEY("pack_id","media_id"),
	CONSTRAINT "pack_media_order" UNIQUE("pack_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "pack_tags" (
	"pack_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "pack_tags_pack_id_tag_id_pk" PRIMARY KEY("pack_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "pack_versions" (
	"id" text PRIMARY KEY DEFAULT 'ver_' || gen_random_uuid()::text NOT NULL,
	"pack_id" text NOT NULL,
	"version" text NOT NULL,
	"changelog" text,
	"file_size_bytes" bigint,
	"checksum_sha256" text,
	"download_url" text,
	"is_latest" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_version_number" UNIQUE("pack_id","version"),
	CONSTRAINT "pack_version_identity" UNIQUE("pack_id","id"),
	CONSTRAINT "version_size" CHECK ("pack_versions"."file_size_bytes" IS NULL OR "pack_versions"."file_size_bytes" >= 0),
	CONSTRAINT "version_checksum" CHECK ("pack_versions"."checksum_sha256" IS NULL OR "pack_versions"."checksum_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "packs" (
	"id" text PRIMARY KEY DEFAULT 'pk_' || gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"description" text NOT NULL,
	"category_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"publisher" text,
	"is_known" boolean DEFAULT false NOT NULL,
	"source_type" "source_type" DEFAULT 'external' NOT NULL,
	"license" text,
	"source_url" text,
	"distribution_permission" "distribution_permission" DEFAULT 'unknown' NOT NULL,
	"status" "pack_status" DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"editor_pick" boolean DEFAULT false NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"trending_override" boolean DEFAULT false NOT NULL,
	"performance_impact" "performance_impact" DEFAULT 'medium' NOT NULL,
	"compatibility" text[] DEFAULT '{}'::text[] NOT NULL,
	"requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"file_size_bytes" bigint,
	"fivem_version" text,
	"video_url" text,
	"download_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"bookmark_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"rating_avg" numeric(2, 1) DEFAULT '0.0' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "pack_slug" CHECK ("packs"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("packs"."slug") <= 96),
	CONSTRAINT "pack_size" CHECK ("packs"."file_size_bytes" IS NULL OR "packs"."file_size_bytes" >= 0),
	CONSTRAINT "pack_counters" CHECK ("packs"."download_count" >= 0 AND "packs"."view_count" >= 0 AND "packs"."like_count" >= 0 AND "packs"."bookmark_count" >= 0 AND "packs"."comment_count" >= 0 AND "packs"."rating_count" >= 0),
	CONSTRAINT "pack_rating" CHECK (("packs"."rating_count" = 0 AND "packs"."rating_avg" = 0) OR ("packs"."rating_count" > 0 AND "packs"."rating_avg" BETWEEN 1 AND 5)),
	CONSTRAINT "pack_published" CHECK ("packs"."status" <> 'approved' OR "packs"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY DEFAULT 'reset_' || gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "reset_token_hash" CHECK ("password_reset_tokens"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "reset_expiry" CHECK ("password_reset_tokens"."expires_at" > "password_reset_tokens"."created_at")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY DEFAULT 'perm_' || gen_random_uuid()::text NOT NULL,
	"key" text NOT NULL,
	"group" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" text PRIMARY KEY DEFAULT 'rate_' || gen_random_uuid()::text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_key_hash" CHECK ("rate_limit_events"."key_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "rate_expiry" CHECK ("rate_limit_events"."expires_at" > "rate_limit_events"."created_at")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" text PRIMARY KEY DEFAULT 'rating_' || gen_random_uuid()::text NOT NULL,
	"pack_id" text NOT NULL,
	"user_id" text NOT NULL,
	"value" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_per_user_pack" UNIQUE("pack_id","user_id"),
	CONSTRAINT "rating_range" CHECK ("ratings"."value" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY DEFAULT 'report_' || gen_random_uuid()::text NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by_id" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "report_resolution" CHECK ("reports"."status" NOT IN ('resolved', 'dismissed') OR ("reports"."resolved_by_id" IS NOT NULL AND "reports"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY DEFAULT 'role_' || gen_random_uuid()::text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"rank" integer DEFAULT 10 NOT NULL,
	"upload_quota_bytes" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key"),
	CONSTRAINT "roles_rank_range" CHECK ("roles"."rank" BETWEEN 0 AND 100),
	CONSTRAINT "roles_quota_nonnegative" CHECK ("roles"."upload_quota_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY DEFAULT 'sess_' || gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_token_hash" CHECK ("sessions"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "sessions_expiry" CHECK ("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY DEFAULT 'tag_' || gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tag_slug" CHECK ("tags"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("tags"."slug") <= 96),
	CONSTRAINT "tag_usage_count" CHECK ("tags"."usage_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT 'usr_' || gen_random_uuid()::text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"avatar_media_id" text,
	"bio" text,
	"role_id" text NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"ban_until" timestamp with time zone,
	"banned_reason" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_format" CHECK ("users"."username" ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower(trim("users"."email")) AND position('@' in "users"."email") > 1),
	CONSTRAINT "users_post_count_nonnegative" CHECK ("users"."post_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_source_id_ai_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ai_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comment_parent_same_pack" FOREIGN KEY ("pack_id","parent_id") REFERENCES "public"."comments"("pack_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_mirrors" ADD CONSTRAINT "download_mirrors_pack_version_id_pack_versions_id_fk" FOREIGN KEY ("pack_version_id") REFERENCES "public"."pack_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "download_version_belongs_to_pack" FOREIGN KEY ("pack_id","pack_version_id") REFERENCES "public"."pack_versions"("pack_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_categories" ADD CONSTRAINT "forum_categories_parent_id_forum_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."forum_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_topic_id_forum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "reply_parent_same_topic" FOREIGN KEY ("topic_id","parent_id") REFERENCES "public"."forum_replies"("topic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_category_id_forum_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."forum_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_manifests" ADD CONSTRAINT "install_manifests_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_manifests" ADD CONSTRAINT "install_manifests_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_operations" ADD CONSTRAINT "install_operations_manifest_id_install_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."install_manifests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_versions" ADD CONSTRAINT "install_versions_manifest_id_install_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."install_manifests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_versions" ADD CONSTRAINT "rollback_same_manifest" FOREIGN KEY ("manifest_id","rollback_to_id") REFERENCES "public"."install_versions"("manifest_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_pack_logs" ADD CONSTRAINT "installed_pack_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_category_id_news_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."news_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_ai_source_id_ai_sources_id_fk" FOREIGN KEY ("ai_source_id") REFERENCES "public"."ai_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_categories" ADD CONSTRAINT "pack_categories_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_categories" ADD CONSTRAINT "pack_categories_parent_id_pack_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pack_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_media" ADD CONSTRAINT "pack_media_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_media" ADD CONSTRAINT "pack_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_tags" ADD CONSTRAINT "pack_tags_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_tags" ADD CONSTRAINT "pack_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_versions" ADD CONSTRAINT "pack_versions_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packs" ADD CONSTRAINT "packs_category_id_pack_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."pack_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packs" ADD CONSTRAINT "packs_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_jobs_queue_idx" ON "ai_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "analytics_name_time_idx" ON "analytics_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "analytics_pack_time_idx" ON "analytics_events" USING btree ("pack_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_time_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "bookmarks_user_idx" ON "bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_pack_time_idx" ON "comments" USING btree ("pack_id","created_at");--> statement-breakpoint
CREATE INDEX "downloads_pack_time_idx" ON "downloads" USING btree ("pack_id","created_at");--> statement-breakpoint
CREATE INDEX "downloads_user_time_idx" ON "downloads" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "dedupe_expiry_idx" ON "event_deduplication" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "replies_topic_time_idx" ON "forum_replies" USING btree ("topic_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_accepted_answer_idx" ON "forum_replies" USING btree ("topic_id") WHERE "forum_replies"."is_accepted_answer" = true;--> statement-breakpoint
CREATE INDEX "topics_category_activity_idx" ON "forum_topics" USING btree ("category_id","last_reply_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "topics_author_idx" ON "forum_topics" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "installed_logs_package_time_idx" ON "installed_pack_logs" USING btree ("package_id","created_at");--> statement-breakpoint
CREATE INDEX "likes_user_idx" ON "likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_creator_idx" ON "media" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news_articles" USING btree ("status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_time_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "pack_category_parent_idx" ON "pack_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "pack_media_media_idx" ON "pack_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "pack_tags_tag_idx" ON "pack_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pack_one_latest_idx" ON "pack_versions" USING btree ("pack_id") WHERE "pack_versions"."is_latest" = true;--> statement-breakpoint
CREATE INDEX "packs_status_published_idx" ON "packs" USING btree ("status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "packs_category_status_idx" ON "packs" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "packs_known_status_idx" ON "packs" USING btree ("is_known","status");--> statement-breakpoint
CREATE INDEX "packs_creator_idx" ON "packs" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "packs_search_idx" ON "packs" USING gin (to_tsvector('simple', "title" || ' ' || "excerpt" || ' ' || "description"));--> statement-breakpoint
CREATE INDEX "reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reset_expiry_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rate_key_time_idx" ON "rate_limit_events" USING btree ("key_hash","created_at");--> statement-breakpoint
CREATE INDEX "rate_expiry_idx" ON "rate_limit_events" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ratings_user_idx" ON "ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");