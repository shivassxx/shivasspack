import { eq, sql } from "drizzle-orm";
import type { Database } from "./connection";
import * as s from "./schema";
import { siteConfig } from "@/lib/site-config";

export const permissionKeys = [
  "pack.view",
  "pack.submit",
  "pack.edit_own",
  "pack.edit_any",
  "pack.publish",
  "pack.feature",
  "pack.delete",
  "pack.manage",
  "category.manage",
  "tag.manage",
  "submission.review",
  "download.use",
  "installer.manifest.edit",
  "installer.manage",
  "forum.read",
  "forum.topic.create",
  "forum.reply.create",
  "forum.edit_own",
  "forum.moderate",
  "forum.category.manage",
  "moderation.access",
  "moderation.resolve",
  "user.ban",
  "user.manage",
  "user.delete",
  "news.write",
  "news.manage",
  "ai.manage",
  "profile.edit_own",
  "admin.dashboard",
  "admin.settings",
  "homepage.manage",
  "audit.view",
  "role.manage",
  "analytics.view",
  "notification.manage",
] as const;

const guest = ["pack.view", "download.use", "forum.read"];
const member = [
  ...guest,
  "profile.edit_own",
  "pack.submit",
  "pack.edit_own",
  "forum.topic.create",
  "forum.reply.create",
  "forum.edit_own",
];
const moderator = [
  ...member,
  "admin.dashboard",
  "forum.moderate",
  "forum.category.manage",
  "moderation.access",
  "moderation.resolve",
  "submission.review",
  "user.ban",
  "pack.feature",
];
const admin = permissionKeys.filter((key) => key !== "user.delete");
const seedRoles = [
  { key: "guest", name: "Misafir", rank: 0, quota: 0n, grants: guest },
  { key: "member", name: "Üye", rank: 10, quota: 104857600n, grants: member },
  { key: "creator", name: "Üretici", rank: 20, quota: 1073741824n, grants: member },
  {
    key: "verified_creator",
    name: "Doğrulanmış üretici",
    rank: 30,
    quota: 5368709120n,
    grants: member,
  },
  { key: "moderator", name: "Moderatör", rank: 40, quota: 1073741824n, grants: moderator },
  { key: "admin", name: "Yönetici", rank: 50, quota: 10737418240n, grants: admin },
  {
    key: "super_admin",
    name: "Sistem yöneticisi",
    rank: 60,
    quota: 10737418240n,
    grants: permissionKeys,
  },
] as const;

/** One transaction, stable IDs and insert-only conflicts; never reset edited settings. */
export async function seedDatabase(db: Pick<Database, "transaction">, includeDemo = false) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(72134, 2)`);
    await tx
      .insert(s.permissions)
      .values(
        permissionKeys.map((key) => ({
          id: `perm_${key}`,
          key,
          group: key.split(".")[0]!,
          description: key,
        })),
      )
      .onConflictDoNothing();
    const permissions = await tx.select().from(s.permissions);
    for (const role of seedRoles) {
      const inserted = await tx
        .insert(s.roles)
        .values({
          id: `role_${role.key}`,
          key: role.key,
          name: role.name,
          rank: role.rank,
          uploadQuotaBytes: role.quota,
          isSystem: true,
        })
        .onConflictDoNothing()
        .returning();
      // Preserve manually edited grants on existing roles.
      if (inserted[0]) {
        await tx
          .insert(s.rolePermissions)
          .values(
            permissions
              .filter((p) => (role.grants as readonly string[]).includes(p.key))
              .map((p) => ({ roleId: inserted[0]!.id, permissionId: p.id })),
          )
          .onConflictDoNothing();
      }
    }

    const categories = [
      ["graphics", "Grafik Paketleri"],
      ["pvp", "PvP"],
      ["reshade", "ReShade"],
      ["enb", "ENB"],
      ["performance", "Performans"],
      ["known", "Bilinen Paketler"],
      ["other", "Diğer"],
    ] as const;
    await tx
      .insert(s.packCategories)
      .values(
        categories.map(([kind, name], order) => ({
          id: `cat_${kind}`,
          slug: kind,
          kind,
          name,
          sortOrder: order,
        })),
      )
      .onConflictDoNothing();
    await tx.insert(s.forumCategories).values([
      { id: "fcat_genel", slug: "genel", name: "Genel sohbet", description: "Topluluk ve FiveM üzerine konuşmalar.", sortOrder: 0 },
      { id: "fcat_paketler", slug: "paketler", name: "Paket tartışmaları", description: "Paket deneyimleri, öneriler ve karşılaştırmalar.", sortOrder: 1 },
      { id: "fcat_yardim", slug: "yardim", name: "Yardım ve destek", description: "Kurulum, uyumluluk ve kullanım soruları.", sortOrder: 2 },
    ]).onConflictDoNothing();
    await tx
      .insert(s.featureFlags)
      .values([
        {
          key: "registrations_enabled",
          enabled: false,
          description: "Enable after the auth phase is deployed.",
        },
        { key: "ai_auto_publish", enabled: false, description: "AI auto publication is opt-in." },
        {
          key: "installer_enabled",
          enabled: false,
          description: "Enable after signed manifests and the client are available.",
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(s.siteSettings)
      .values([
        { key: "site_name", value: "SHIVASS PACK" },
        { key: "site_description", value: siteConfig.description },
        { key: "default_language", value: "tr" },
      ])
      .onConflictDoNothing();
    await tx.insert(s.aiConfigs).values({ key: "default" }).onConflictDoNothing();
    await tx
      .insert(s.homepageSections)
      .values(
        s.homepageKey.enumValues.map((key, order) => ({
          id: `section_${key}`,
          key,
          order,
          enabled: key === "hero",
          config: {},
        })),
      )
      .onConflictDoNothing();

    if (!includeDemo) return;
    const [memberRole] = await tx.select().from(s.roles).where(eq(s.roles.key, "member"));
    if (!memberRole) throw new Error("Member role is missing.");
    await tx
      .insert(s.users)
      .values({
        id: "usr_demo_author",
        username: "demo-author",
        displayName: "[DEMO] Örnek üretici",
        email: "demo-author@example.invalid",
        roleId: memberRole.id,
        status: "suspended",
        passwordHash: null,
        isDemo: true,
      })
      .onConflictDoNothing();
    await tx
      .insert(s.tags)
      .values({ id: "tag_demo", slug: "demo", name: "DEMO", usageCount: 4, isDemo: true })
      .onConflictDoNothing();
    for (const [kind, name] of categories.slice(0, 4)) {
      const [category] = await tx
        .select()
        .from(s.packCategories)
        .where(eq(s.packCategories.slug, kind));
      if (!category) throw new Error("Seed category missing.");
      await tx
        .insert(s.packs)
        .values({
          id: `pk_demo_${kind}`,
          slug: `demo-${kind}`,
          title: `[DEMO] ${name}`,
          excerpt: "Demo veri; gerçek bir indirme değildir.",
          description:
            "Yalnızca geliştirme için örnek içerik. Yayınlanmamıştır ve indirilebilir dosya içermez.",
          categoryId: category.id,
          creatorId: "usr_demo_author",
          distributionPermission: "metadata_only",
          status: "draft",
          isDemo: true,
        })
        .onConflictDoNothing();
      await tx
        .insert(s.packVersions)
        .values({
          id: `ver_demo_${kind}`,
          packId: `pk_demo_${kind}`,
          version: "0.0.0",
          isLatest: true,
          isDemo: true,
        })
        .onConflictDoNothing();
      await tx
        .insert(s.packTags)
        .values({ packId: `pk_demo_${kind}`, tagId: "tag_demo" })
        .onConflictDoNothing();
    }
    await tx
      .insert(s.forumCategories)
      .values({
        id: "fcat_demo",
        slug: "demo",
        name: "[DEMO] Örnek forum",
        enabled: false,
        topicCount: 1,
        postCount: 1,
        isDemo: true,
      })
      .onConflictDoNothing();
    await tx
      .insert(s.forumTopics)
      .values({
        id: "topic_demo",
        slug: "demo-konu",
        categoryId: "fcat_demo",
        authorId: "usr_demo_author",
        title: "[DEMO] Örnek konu",
        body: "Geliştirme verisidir.",
        status: "hidden",
        replyCount: 1,
        isDemo: true,
      })
      .onConflictDoNothing();
    await tx
      .insert(s.forumReplies)
      .values({
        id: "reply_demo",
        topicId: "topic_demo",
        authorId: "usr_demo_author",
        body: "[DEMO] Örnek yanıt.",
        status: "hidden",
        isDemo: true,
      })
      .onConflictDoNothing();
    await tx
      .insert(s.newsCategories)
      .values({ id: "ncat_demo", slug: "demo", name: "[DEMO] Haber", isDemo: true })
      .onConflictDoNothing();
    await tx
      .insert(s.newsArticles)
      .values({
        id: "news_demo",
        slug: "demo-haber",
        title: "[DEMO] Örnek haber",
        excerpt: "Geliştirme verisi.",
        content: "Yayınlanmamış demo haber.",
        categoryId: "ncat_demo",
        authorId: "usr_demo_author",
        status: "draft",
        isDemo: true,
      })
      .onConflictDoNothing();
  });
}
