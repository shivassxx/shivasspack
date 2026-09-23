import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { TransactionSql } from "postgres";
import { createDatabase, type Database } from "./connection";
import { applicationRole, appendOnlyTables, migrationRole } from "./access";
import { checkDatabase } from "../services/health";
import { seedDatabase } from "./seed-data";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "./schema";
import {
  AuthError,
  changePassword,
  countActiveSessions,
  login,
  register,
  requestPasswordReset,
  resetPasswordWithToken,
} from "../services/auth/service";
import { listActiveSessions, resolveSession, revokeSession } from "../services/auth/session";
import { hashToken } from "../services/auth/token";
import { can, type Actor, type PermissionKey } from "../services/rbac";
import { consumeRateLimit } from "../services/rate-limit";
import {
  getPublicProfile,
  getPublishedPack,
  getRelatedPacks,
  listPublicCategories,
  listPublishedPacks,
} from "../services/packs/public";
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  listAdminCategories,
  listAdminTags,
  updateCategory,
  updateTag,
} from "../services/admin/catalog";
import {
  archiveAdminPack,
  createAdminPack,
  listAdminPacks,
  updateAdminPack,
} from "../services/admin/packs";
import {
  createPackVersion,
  createSubmission,
  getOwnSubmission,
  listSubmissionOptions,
  listSubmissionQueue,
  listSubmissions,
  listVersionablePacks,
  reviseAndResubmit,
  reviewSubmission,
  transitionSubmission,
  updateSubmission,
} from "../services/submissions";
import { defaultHero, listAdminHomepageSections, listHomepageSections, updateHomepageSections } from "../services/homepage";
import { getAdminRegistrationSetting, getAdminSiteDescription, readSiteDescription, readSiteName, registrationEnabled, updateRegistrationSetting, updateSiteDescription, updateSiteName } from "../services/admin/settings";
import { createAdminRole, listAdminRoles, updateAdminRole } from "../services/admin/roles";
import { assignUserRole, listAdminUsers } from "../services/admin/users";
import { loadActor } from "../services/rbac";
import { getBookmarkState, getMemberBookmarks, setPackBookmark } from "../services/packs/bookmarks";
import { getPackLikeState, setPackLike } from "../services/packs/likes";
import { getMemberRating, setPackRating } from "../services/packs/ratings";
import { createPackComment, listPackComments } from "../services/packs/comments";
import { recordPackView } from "../services/packs/views";
import { getMemberDownloadHistory, getPackDownloadOptions, resolvePackDownload, DownloadError } from "../services/packs/downloads";

const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.DATABASE_MIGRATION_URL;
if (!appUrl || !ownerUrl)
  throw new Error("DATABASE_URL and DATABASE_MIGRATION_URL are required for integration tests.");
const app = createDatabase(appUrl, 1);
const owner = createDatabase(ownerUrl, 1);
const concurrent = createDatabase(appUrl, 8);
after(async () => {
  await app.client.end();
  await owner.client.end();
  await concurrent.client.end();
});

test("parallel rate-limit attempts cannot exceed the shared allowance", async () => {
  const key = `parallel:${crypto.randomUUID()}`;
  try {
    const decisions = await Promise.all(
      Array.from({ length: 16 }, () => consumeRateLimit(concurrent.db, key, 3, 3600)),
    );
    assert.equal(decisions.filter((decision) => decision.allowed).length, 3);
    assert.ok(decisions.every((decision) => decision.retryAfterSeconds > 0));
  } finally {
    await app.db.delete(schema.rateLimitEvents).where(eq(schema.rateLimitEvents.keyHash, hashToken(key)));
  }
});

type Tx = TransactionSql<Record<string, never>>;
type Fixture = { userId: string; packId: string; categoryId: string; roleId: string };

async function isolated(run: (tx: Tx, fixture: Fixture) => Promise<void>) {
  const rollback = new Error("ROLLBACK_TEST_FIXTURE");
  try {
    await app.client.begin(async (tx) => {
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] =
        await tx`insert into roles (key, name) values (${`test-${suffix}`}, 'Integration') returning id`;
      const [user] =
        await tx`insert into users (username, display_name, email, role_id) values (${`test-${suffix}`}, 'Integration', ${`test-${suffix}@example.invalid`}, ${role!.id}) returning id`;
      const [category] =
        await tx`insert into pack_categories (slug, name, kind) values (${`test-${suffix}`}, 'Integration', 'graphics') returning id`;
      const [pack] =
        await tx`insert into packs (slug, title, excerpt, description, category_id, creator_id) values (${`test-${suffix}`}, 'Integration', '', '', ${category!.id}, ${user!.id}) returning id`;
      await run(tx, {
        roleId: role!.id,
        userId: user!.id,
        categoryId: category!.id,
        packId: pack!.id,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

test("readiness uses the restricted role and a migrated application table", async () => {
  assert.equal(await checkDatabase(app.db), true);
  const [role] =
    await app.client`select current_user as name, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = current_user`;
  assert.equal(role!.name, applicationRole);
  for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolbypassrls"])
    assert.equal(role![key], false);
  const [privileges] =
    await app.client`select has_schema_privilege(current_user, 'public', 'CREATE') as ddl, has_schema_privilege(current_user, 'drizzle', 'USAGE') as journal`;
  assert.deepEqual(
    { ddl: privileges!.ddl, journal: privileges!.journal },
    { ddl: false, journal: false },
  );
  const [table] =
    await owner.client`select tableowner from pg_tables where schemaname='public' and tablename='packs'`;
  assert.equal(table!.tableowner, migrationRole);
});

test("application cannot create/drop tables or access the migration journal", async () => {
  await isolated(async (tx) => {
    await assert.rejects(
      tx.savepoint((sp) => sp`create table public.forbidden_ddl (id text)`),
      { code: "42501" },
    );
    await assert.rejects(
      tx.savepoint((sp) => sp`drop table public.event_deduplication`),
      { code: "42501" },
    );
    await assert.rejects(
      tx.savepoint((sp) => sp`select * from drizzle.__drizzle_migrations`),
      { code: "42501" },
    );
  });
});

test("append-only grants block mutation and truncation", async () => {
  for (const table of appendOnlyTables) {
    const [grants] =
      await app.client`select has_table_privilege(current_user, ${`public.${table}`}, 'INSERT') as append, has_table_privilege(current_user, ${`public.${table}`}, 'UPDATE') as edit, has_table_privilege(current_user, ${`public.${table}`}, 'DELETE') as remove, has_table_privilege(current_user, ${`public.${table}`}, 'TRUNCATE') as truncate`;
    assert.equal(grants!.append, true);
    assert.equal(grants!.edit, false);
    assert.equal(grants!.remove, false);
    assert.equal(grants!.truncate, false);
  }
  await isolated(async (tx) => {
    const [audit] =
      await tx`insert into audit_logs(action,target_type,target_id) values ('test','test','test') returning id`;
    await assert.rejects(
      tx.savepoint((sp) => sp`update audit_logs set action='tampered' where id=${audit!.id}`),
      { code: "42501" },
    );
    await assert.rejects(
      tx.savepoint((sp) => sp`delete from audit_logs where id=${audit!.id}`),
      { code: "42501" },
    );
  });
});

test("ratings/bookmarks/likes enforce range, uniqueness and parent existence", async () => {
  await isolated(async (tx, f) => {
    await assert.rejects(
      tx.savepoint(
        (sp) => sp`insert into ratings(pack_id,user_id,value) values (${f.packId},${f.userId},6)`,
      ),
      { code: "23514" },
    );
    await tx`insert into ratings(pack_id,user_id,value) values (${f.packId},${f.userId},5)`;
    await assert.rejects(
      tx.savepoint(
        (sp) => sp`insert into ratings(pack_id,user_id,value) values (${f.packId},${f.userId},4)`,
      ),
      { code: "23505" },
    );
    await assert.rejects(
      tx.savepoint(
        (sp) =>
          sp`insert into ratings(pack_id,user_id,value) values ('missing-pack',${f.userId},4)`,
      ),
      { code: "23503" },
    );
    await tx`insert into bookmarks(pack_id,user_id) values (${f.packId},${f.userId})`;
    await assert.rejects(
      tx.savepoint(
        (sp) => sp`insert into bookmarks(pack_id,user_id) values (${f.packId},${f.userId})`,
      ),
      { code: "23505" },
    );
    await tx`insert into likes(target_type,target_id,user_id) values ('pack',${f.packId},${f.userId})`;
    await assert.rejects(
      tx.savepoint(
        (sp) =>
          sp`insert into likes(target_type,target_id,user_id) values ('pack',${f.packId},${f.userId})`,
      ),
      { code: "23505" },
    );
  });
});

test("only one latest version exists; download version must belong to its pack", async () => {
  await isolated(async (tx, f) => {
    const [version] =
      await tx`insert into pack_versions(pack_id,version,is_latest) values (${f.packId},'1.0.0',true) returning id`;
    await assert.rejects(
      tx.savepoint(
        (sp) =>
          sp`insert into pack_versions(pack_id,version,is_latest) values (${f.packId},'2.0.0',true)`,
      ),
      { code: "23505" },
    );
    await tx`insert into pack_versions(pack_id,version,is_latest) values (${f.packId},'2.0.0',false)`;
    const [other] =
      await tx`insert into packs(slug,title,excerpt,description,category_id,creator_id) values (${`other-${crypto.randomUUID()}`},'Other','','',${f.categoryId},${f.userId}) returning id`;
    await assert.rejects(
      tx.savepoint(
        (sp) =>
          sp`insert into downloads(pack_id,pack_version_id,ip_hash,mirror,kind) values (${other!.id},${version!.id},${"a".repeat(64)},'primary','manual')`,
      ),
      { code: "23503" },
    );
  });
});

test("comment parent cannot cross pack boundaries; invalid counters are rejected", async () => {
  await isolated(async (tx, f) => {
    const [comment] =
      await tx`insert into comments(pack_id,user_id,body) values (${f.packId},${f.userId},'Parent') returning id`;
    const [other] =
      await tx`insert into packs(slug,title,excerpt,description,category_id,creator_id) values (${`other-${crypto.randomUUID()}`},'Other','','',${f.categoryId},${f.userId}) returning id`;
    await assert.rejects(
      tx.savepoint(
        (sp) =>
          sp`insert into comments(pack_id,user_id,body,parent_id) values (${other!.id},${f.userId},'Child',${comment!.id})`,
      ),
      { code: "23503" },
    );
    await assert.rejects(
      tx.savepoint((sp) => sp`update packs set download_count=-1 where id=${f.packId}`),
      { code: "23514" },
    );
  });
});

test("session hashes/expiry and normalized identities are enforced", async () => {
  await isolated(async (tx, f) => {
    await assert.rejects(
      tx.savepoint(
        (sp) =>
          sp`insert into sessions(user_id,token_hash,expires_at) values (${f.userId},'raw-token',now()+interval '1 day')`,
      ),
      { code: "23514" },
    );
    await assert.rejects(
      tx.savepoint(
        (sp) =>
          sp`insert into sessions(user_id,token_hash,expires_at) values (${f.userId},${"a".repeat(64)},now()-interval '1 day')`,
      ),
      { code: "23514" },
    );
    await tx`insert into sessions(user_id,token_hash,expires_at) values (${f.userId},${"a".repeat(64)},now()+interval '1 day')`;
    await assert.rejects(
      tx.savepoint((sp) => sp`update users set email='Upper@Example.com' where id=${f.userId}`),
      { code: "23514" },
    );
    await assert.rejects(
      tx.savepoint((sp) => sp`update users set username='Invalid User' where id=${f.userId}`),
      { code: "23514" },
    );
  });
});

test("installer operations use a closed enum; published manifests need signatures", async () => {
  await isolated(async (tx, f) => {
    const [manifest] =
      await tx`insert into install_manifests(pack_id,package_id,updated_by_id) values (${f.packId},${`test-${crypto.randomUUID()}`},${f.userId}) returning id`;
    await assert.rejects(
      tx.savepoint(
        (sp) =>
          sp`insert into install_operations(manifest_id,"order",op) values (${manifest!.id},0,'exec')`,
      ),
      { code: "22P02" },
    );
    await assert.rejects(
      tx.savepoint(
        (sp) => sp`update install_manifests set status='published' where id=${manifest!.id}`,
      ),
      { code: "23514" },
    );
    await tx`insert into install_operations(manifest_id,"order",op,params) values (${manifest!.id},0,'backup','{}')`;
  });
});

test("FTS index exists and search expression returns inserted content", async () => {
  await isolated(async (tx, f) => {
    await tx`update packs set title='Uniquegraphicsfixture' where id=${f.packId}`;
    const found =
      await tx`select id from packs where to_tsvector('simple', title || ' ' || excerpt || ' ' || description) @@ plainto_tsquery('simple','Uniquegraphicsfixture')`;
    assert.ok(found.some((row) => row.id === f.packId));
    const [idx] =
      await tx`select indexdef from pg_indexes where schemaname='public' and indexname='packs_search_idx'`;
    assert.match(idx!.indexdef, /USING gin/);
  });
});

test("seed is idempotent and preserves edited settings, roles and permissions", async () => {
  const rollback = new Error("ROLLBACK_SEED_TEST");
  try {
    await owner.db.transaction(async (tx) => {
      await seedDatabase(tx, true);
      await tx
        .update(schema.siteSettings)
        .set({ value: "Custom name" })
        .where(eq(schema.siteSettings.key, "site_name"));
      await tx
        .update(schema.roles)
        .set({ name: "Custom member" })
        .where(eq(schema.roles.key, "member"));
      await tx.execute(
        sql`delete from role_permissions where role_id='role_member' and permission_id='perm_pack.submit'`,
      );
      const counts = () =>
        tx.execute(sql`select
        (select count(*) from users) as users, (select count(*) from packs) as packs,
        (select count(*) from pack_versions) as versions, (select count(*) from roles) as roles,
        (select count(*) from role_permissions) as grants, (select count(*) from forum_topics) as topics,
        (select count(*) from news_articles) as news`);
      const before = await counts();
      await seedDatabase(tx, true);
      await seedDatabase(tx, true);
      assert.deepEqual([...(await counts())], [...before]);
      const [setting] = await tx
        .select()
        .from(schema.siteSettings)
        .where(eq(schema.siteSettings.key, "site_name"));
      const [role] = await tx.select().from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.equal(setting!.value, "Custom name");
      assert.equal(role!.name, "Custom member");
      const [demo] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, "usr_demo_author"));
      assert.equal(demo!.isDemo, true);
      assert.equal(demo!.passwordHash, null);
      assert.equal(demo!.status, "suspended");
      const demoPacks = await tx.select().from(schema.packs).where(eq(schema.packs.isDemo, true));
      assert.equal(demoPacks.length, 4);
      assert.ok(
        demoPacks.every(
          (pack) => pack.status === "draft" && pack.distributionPermission === "metadata_only",
        ),
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

test("registration gate, login, session lifecycle and RBAC resolution", async () => {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const username = `it-${suffix}`;
  const email = `${username}@example.invalid`;
  const password = `Integration-${suffix}-42`;
  const context = { userAgent: "node-test", ip: "127.0.0.1" };
  const flagKey = schema.featureFlags.key;
  let userId: string | null = null;

  const [flag] = await app.db.select().from(schema.featureFlags).where(eq(flagKey, "registrations_enabled"));
  const originalFlag = flag?.enabled ?? false;

  try {
    // Fail-closed kontrolü: kayıt kapalıyken reddedilmeli.
    await app.db.update(schema.featureFlags).set({ enabled: originalFlag }).where(eq(flagKey, "registrations_enabled"));
    if (!originalFlag) {
      await assert.rejects(
        register(app.db, { username, email, password }, context, 7),
        (error: unknown) => error instanceof AuthError && error.code === "registrations_disabled",
      );
    }

    await app.db.update(schema.featureFlags).set({ enabled: true }).where(eq(flagKey, "registrations_enabled"));

    // User + initial session are atomic: an invalid TTL must roll the user back.
    const rollbackUsername = `rollback-${suffix}`;
    await assert.rejects(
      register(
        app.db,
        { username: rollbackUsername, email: `${rollbackUsername}@example.invalid`, password },
        context,
        0,
      ),
      /Session TTL/,
    );
    const rolledBack = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, rollbackUsername));
    assert.equal(rolledBack.length, 0);

    const created = await register(app.db, { username, email, password }, context, 7);
    userId = created.userId;

    await assert.rejects(
      register(app.db, { username, email, password }, context, 7),
      (error: unknown) => error instanceof AuthError && error.code === "username_taken",
    );

    // Token yalnızca hash'lenir; çözümlenen actor izin setini rolünden alır.
    const resolved = await resolveSession(app.db, created.token);
    assert.ok(resolved);
    assert.equal(resolved.actor.id, userId);
    assert.equal(resolved.actor.roleKey, "member");
    assert.equal(resolved.actor.status, "active");
    assert.ok(can(resolved.actor, "pack.submit"));
    assert.ok(can(resolved.actor, "forum.topic.create"));
    assert.ok(!can(resolved.actor, "admin.settings"));
    assert.ok(!can(resolved.actor, "user.manage"));
    assert.equal(await countActiveSessions(app.db, userId!), 1);

    // Kimlik veya parola hataları aynı 401 kodunu üretir (enumeration yok).
    for (const bad of [
      { identifier: username, password: "wrong-password-1" },
      { identifier: "no-such-user", password: "wrong-password-1" },
      { identifier: email.toUpperCase(), password: "wrong-password-1" },
    ]) {
      await assert.rejects(
        login(app.db, bad, context, 7),
        (error: unknown) => error instanceof AuthError && error.status === 401 && error.code === "invalid_credentials",
      );
    }

    const second = await login(app.db, { identifier: email, password }, context, 7);
    assert.equal(second.userId, userId);
    assert.equal(await countActiveSessions(app.db, userId!), 2);

    await app.db
      .update(schema.sessions)
      .set({
        createdAt: new Date(Date.now() - 2000),
        expiresAt: new Date(Date.now() - 1000),
      })
      .where(eq(schema.sessions.id, second.sessionId));
    assert.equal(await countActiveSessions(app.db, userId!), 1);
    assert.equal((await listActiveSessions(app.db, userId!)).length, 1);
    await app.db
      .update(schema.sessions)
      .set({ expiresAt: second.expiresAt })
      .where(eq(schema.sessions.id, second.sessionId));

    // Askıya alınmış hesap giriş yapamaz.
    // Doğru parola + pasif hesap 403 döner; yanlış parola her durumda 401'dir,
    // böylece varlık/parola bilgisi sızdırılmaz.
    await app.db.update(schema.users).set({ status: "suspended" }).where(eq(schema.users.id, userId!));
    await assert.rejects(
      login(app.db, { identifier: username, password }, context, 7),
      (error: unknown) =>
        error instanceof AuthError && error.code === "account_inactive" && error.status === 403,
    );
    await assert.rejects(
      login(app.db, { identifier: username, password: "wrong-password-2" }, context, 7),
      (error: unknown) =>
        error instanceof AuthError && error.code === "invalid_credentials" && error.status === 401,
    );
    assert.equal(await countActiveSessions(app.db, userId!), 2);
    await app.db.update(schema.users).set({ status: "active" }).where(eq(schema.users.id, userId!));

    // İptal edilen satır çözülemez; çerez tek başına yeterli değildir.
    assert.equal(await revokeSession(app.db, created.sessionId), true);
    assert.equal(await resolveSession(app.db, created.token), null);
    assert.equal(await revokeSession(app.db, created.sessionId), false);
    assert.equal(await resolveSession(app.db, second.token)?.then((s) => s !== null), true);
  } finally {
    await app.db.update(schema.featureFlags).set({ enabled: originalFlag }).where(eq(flagKey, "registrations_enabled"));
    if (userId) await app.db.delete(schema.users).where(eq(schema.users.id, userId));
  }
});

test("password reset is single-use and invalidates every session", async () => {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const username = `rst-${suffix}`;
  const email = `${username}@example.invalid`;
  const password = `Original-${suffix}-42`;
  const nextPassword = `Rotated-${suffix}-77`;
  const context = { userAgent: "node-test", ip: "127.0.0.1" };
  let userId: string | null = null;
  const [flag] = await app.db
    .select()
    .from(schema.featureFlags)
    .where(eq(schema.featureFlags.key, "registrations_enabled"));
  const originalFlag = flag?.enabled ?? false;

  try {
    await app.db
      .update(schema.featureFlags)
      .set({ enabled: true })
      .where(eq(schema.featureFlags.key, "registrations_enabled"));
    const created = await register(app.db, { username, email, password }, context, 7);
    userId = created.userId;
    await login(app.db, { identifier: username, password }, context, 7);
    assert.equal(await countActiveSessions(app.db, userId), 2);

    // Kayıtlı olmayan adres aynı sonucu verir ve satır üretmez.
    const missing = await requestPasswordReset(app.db, `unknown-${suffix}@example.invalid`);
    assert.equal(missing.token, null);

    const { token } = await requestPasswordReset(app.db, email);
    assert.ok(token);
    await resetPasswordWithToken(app.db, token!, nextPassword);

    // Reset tüm oturumları kapatmalı.
    assert.equal(await countActiveSessions(app.db, userId), 0);
    assert.equal(await resolveSession(app.db, created.token), null);
    assert.equal(
      await login(app.db, { identifier: username, password }, context, 7).then(
        () => false,
        (error: unknown) => error instanceof AuthError && error.status === 401,
      ),
      true,
    );
    const relogin = await login(app.db, { identifier: username, password: nextPassword }, context, 7);
    assert.equal(relogin.userId, userId);

    // Token tek kullanımlıktır.
    await assert.rejects(
      resetPasswordWithToken(app.db, token!, `Another-${suffix}-99`),
      (error: unknown) => error instanceof AuthError && error.code === "token_invalid",
    );
  } finally {
    await app.db
      .update(schema.featureFlags)
      .set({ enabled: originalFlag })
      .where(eq(schema.featureFlags.key, "registrations_enabled"));
    if (userId) await app.db.delete(schema.users).where(eq(schema.users.id, userId));
  }
});

test("changing a password revokes other devices but keeps the current one", async () => {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const username = `chg-${suffix}`;
  const email = `${username}@example.invalid`;
  const password = `Starting-${suffix}-42`;
  const context = { userAgent: "node-test", ip: "127.0.0.1" };
  let userId: string | null = null;
  const [flag] = await app.db
    .select()
    .from(schema.featureFlags)
    .where(eq(schema.featureFlags.key, "registrations_enabled"));
  const originalFlag = flag?.enabled ?? false;

  try {
    await app.db
      .update(schema.featureFlags)
      .set({ enabled: true })
      .where(eq(schema.featureFlags.key, "registrations_enabled"));
    const first = await register(app.db, { username, email, password }, context, 7);
    userId = first.userId;
    const second = await login(app.db, { identifier: username, password }, context, 7);

    await assert.rejects(
      changePassword(app.db, userId, "not-the-password", `Fresh-${suffix}-01`, {
        currentSessionId: first.sessionId,
      }),
      (error: unknown) => error instanceof AuthError && error.status === 401,
    );

    await changePassword(app.db, userId, password, `Fresh-${suffix}-01`, {
      currentSessionId: first.sessionId,
    });

    assert.equal(await resolveSession(app.db, first.token)?.then((s) => s !== null), true);
    assert.equal(await resolveSession(app.db, second.token), null);
    assert.equal(await countActiveSessions(app.db, userId), 1);
  } finally {
    await app.db
      .update(schema.featureFlags)
      .set({ enabled: originalFlag })
      .where(eq(schema.featureFlags.key, "registrations_enabled"));
    if (userId) await app.db.delete(schema.users).where(eq(schema.users.id, userId));
  }
});

test("rate-limit windows count attempts and expire", async () => {
  const key = `itest:${crypto.randomUUID()}`;
  const keyHash = hashToken(key);
  try {
    const limit = 3;
    const attempts = [];
    for (let i = 0; i < limit + 1; i += 1) {
      attempts.push(await consumeRateLimit(app.db, key, limit, 60));
    }

    // İlk `limit` deneme geçer; bir sonraki 429 olur.
    assert.deepEqual(
      attempts.slice(0, limit).map((attempt) => attempt.allowed),
      [true, true, true],
    );
    assert.equal(attempts[0]!.remaining, limit - 1);
    const blocked = attempts[limit]!;
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);

    // Anahtarlar ham haliyle saklanmaz.
    const rows = await app.client`select key_hash from rate_limit_events where key_hash = ${keyHash}`;
    assert.equal(rows.length, limit + 1);
    assert.equal(
      await app.client`select 1 from rate_limit_events where key_hash = ${key}`.then((r) => r.length),
      0,
    );

    // Farklı anahtar bağımsız sayılır.
    const other = await consumeRateLimit(app.db, `${key}:other`, limit, 60);
    assert.equal(other.allowed, true);

    await assert.rejects(consumeRateLimit(app.db, key, 0, 60));
    await assert.rejects(consumeRateLimit(app.db, key, 5, 0));
  } finally {
    await app.db.delete(schema.rateLimitEvents).where(eq(schema.rateLimitEvents.keyHash, keyHash));
    await app.db
      .delete(schema.rateLimitEvents)
      .where(eq(schema.rateLimitEvents.keyHash, hashToken(`${key}:other`)));
  }
});

test("public pack queries expose only approved non-demo content with filters", async () => {
  const rollback = new Error("ROLLBACK_PUBLIC_PACK_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const db = tx as unknown as Database;
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const [user] = await tx
        .insert(schema.users)
        .values({ username: `pack-${suffix}`, displayName: "Pack Tester", email: `pack-${suffix}@example.invalid`, roleId: role.id })
        .returning({ id: schema.users.id });
      const [category] = await tx
        .insert(schema.packCategories)
        .values({ slug: `pack-${suffix}`, name: "Test Category", kind: "graphics" })
        .returning({ id: schema.packCategories.id, slug: schema.packCategories.slug });
      assert.ok(user && category);
      const [first] = await tx
        .insert(schema.packs)
        .values({
          slug: `alpha-${suffix}`,
          title: "Alpha ReShade Visual",
          excerpt: "Sharp colors and balanced lighting",
          description: "Published alpha package for full text search.",
          categoryId: category.id,
          creatorId: user.id,
          status: "approved",
          publishedAt: new Date(Date.now() - 2 * 86400000),
          isKnown: true,
          featured: true,
          downloadCount: 10,
          ratingAvg: "4.5",
          ratingCount: 2,
        })
        .returning({ id: schema.packs.id });
      const [second] = await tx
        .insert(schema.packs)
        .values({
          slug: `beta-${suffix}`,
          title: "Beta Performance",
          excerpt: "Faster startup",
          description: "Published beta package.",
          categoryId: category.id,
          creatorId: user.id,
          status: "approved",
          publishedAt: new Date(Date.now() - 86400000),
          downloadCount: 50,
          ratingAvg: "5.0",
          ratingCount: 1,
        })
        .returning({ id: schema.packs.id, slug: schema.packs.slug });
      await tx.insert(schema.packs).values([
        {
          slug: `demo-${suffix}`,
          title: "Leaked Demo",
          excerpt: "Must stay private",
          description: "Demo.",
          categoryId: category.id,
          creatorId: user.id,
          status: "approved",
          publishedAt: new Date(),
          isDemo: true,
          featured: true,
        },
        {
          slug: `draft-${suffix}`,
          title: "Private Draft",
          excerpt: "Must stay private",
          description: "Draft.",
          categoryId: category.id,
          creatorId: user.id,
          status: "draft",
        },
      ]);
      const [tag] = await tx
        .insert(schema.tags)
        .values({ slug: `visual-${suffix}`, name: "Visual" })
        .returning({ id: schema.tags.id });
      assert.ok(first && second && tag);
      await tx.insert(schema.packTags).values({ packId: first.id, tagId: tag.id });

      const all = await listPublishedPacks(db, { category: category.slug, pageSize: 1 });
      assert.equal(all.total, 2);
      assert.equal(all.items.length, 1);
      assert.equal(all.pageCount, 2);

      const search = await listPublishedPacks(db, { category: category.slug, q: "sharp lighting", pageSize: 12 });
      assert.equal(search.total, 1);
      assert.equal(search.items[0]?.id, first.id);
      assert.equal(search.items[0]?.tags[0]?.name, "Visual");

      const known = await listPublishedPacks(db, { category: category.slug, known: true });
      assert.deepEqual(known.items.map((item) => item.id), [first.id]);
      const featured = await listPublishedPacks(db, { category: category.slug, featured: true });
      assert.deepEqual(featured.items.map((item) => item.id), [first.id]);
      const downloads = await listPublishedPacks(db, { category: category.slug, sort: "downloads" });
      assert.equal(downloads.items[0]?.id, second.id);

      const categories = await listPublicCategories(db);
      assert.equal(categories.find((item) => item.slug === category.slug)?.packCount, 2);
      assert.equal((await getPublishedPack(db, second.slug))?.title, "Beta Performance");
      assert.equal(await getPublishedPack(db, "not-a-real-pack"), null);
      await tx.update(schema.packCategories).set({ enabled: false }).where(eq(schema.packCategories.id, category.id));
      assert.equal((await listPublicCategories(db)).some((item) => item.slug === category.slug), false);
      assert.equal((await listPublishedPacks(db, { category: category.slug })).total, 0);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

test("bookmarks are idempotent, private, visibility-gated and keep counters consistent", async () => {
  const rollback = new Error("ROLLBACK_BOOKMARK_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const users = await tx.insert(schema.users).values([1, 2].map((number) => ({
        username: `bookmark-${number}-${suffix}`, displayName: `Reader ${number}`,
        email: `bookmark-${number}-${suffix}@example.invalid`, roleId: role.id,
      }))).returning({ id: schema.users.id });
      assert.equal(users.length, 2);
      const [category] = await tx.insert(schema.packCategories).values({ slug: `saved-${suffix}`, name: "Saved Category", kind: "graphics" })
        .returning({ id: schema.packCategories.id });
      assert.ok(category);
      const slug = `saved-${suffix}`;
      const [pack] = await tx.insert(schema.packs).values({ slug, title: "Saved Test Pack", excerpt: "Bookmark test",
        description: "A real public pack for bookmark checks.", categoryId: category.id, creatorId: users[0]!.id,
        status: "approved", publishedAt: new Date(Date.now() - 60000),
      }).returning({ id: schema.packs.id });
      const [draft] = await tx.insert(schema.packs).values({ slug: `private-${suffix}`, title: "Draft", excerpt: "Not public",
        description: "Not public", categoryId: category.id, creatorId: users[0]!.id, status: "draft" })
        .returning({ id: schema.packs.id });
      assert.ok(pack && draft);
      const actor: Actor = { id: users[0]!.id, displayName: "Reader 1", roleKey: "custom",
        status: "active", banUntil: null, permissions: new Set(["pack.view"]) };
      const second: Actor = { ...actor, id: users[1]!.id };
      await assert.rejects(setPackBookmark(db, { ...actor, permissions: new Set() }, slug, true), /Missing permission/);
      await assert.rejects(setPackBookmark(db, { ...actor, status: "suspended" }, slug, true));
      await assert.rejects(setPackBookmark(db, actor, `private-${suffix}`, true), /Paket bulunamadı/);
      await assert.rejects(setPackBookmark(db, actor, "invalid slug", true), /Paket bulunamadı/);
      assert.deepEqual(await setPackBookmark(db, actor, slug, true), { saved: true, bookmarkCount: 1 });
      assert.deepEqual(await setPackBookmark(db, actor, slug, true), { saved: true, bookmarkCount: 1 });
      assert.equal(await getBookmarkState(db, actor, pack.id), true);
      assert.equal(await getBookmarkState(db, second, pack.id), false);
      assert.equal((await getMemberBookmarks(db, second)).total, 0);
      assert.equal((await getMemberBookmarks(db, actor)).items[0]?.slug, slug);
      assert.deepEqual(await setPackBookmark(db, second, slug, true), { saved: true, bookmarkCount: 2 });
      assert.deepEqual(await setPackBookmark(db, actor, slug, false), { saved: false, bookmarkCount: 1 });
      assert.deepEqual(await setPackBookmark(db, actor, slug, false), { saved: false, bookmarkCount: 1 });
      assert.equal((await getMemberBookmarks(db, actor)).total, 0);
      await tx.update(schema.packCategories).set({ enabled: false }).where(eq(schema.packCategories.id, category.id));
      assert.equal((await getMemberBookmarks(db, second)).total, 0);
      await assert.rejects(setPackBookmark(db, second, slug, false), /Paket bulunamadı/);
      const [stored] = await tx.select({ count: schema.packs.bookmarkCount }).from(schema.packs).where(eq(schema.packs.id, pack.id));
      assert.equal(stored?.count, 1);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("pack likes are idempotent, isolated by target type and visibility-gated", async () => {
  const rollback = new Error("ROLLBACK_PACK_LIKE_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const users = await tx.insert(schema.users).values([1, 2].map((number) => ({
        username: `liker-${number}-${suffix}`, displayName: `Liker ${number}`,
        email: `liker-${number}-${suffix}@example.invalid`, roleId: role.id,
      }))).returning({ id: schema.users.id });
      const [category] = await tx.insert(schema.packCategories).values({ slug: `like-${suffix}`, name: "Like Category", kind: "pvp" })
        .returning({ id: schema.packCategories.id });
      assert.ok(category && users.length === 2);
      const slug = `like-${suffix}`;
      const [pack] = await tx.insert(schema.packs).values({ slug, title: "Like Test Pack", excerpt: "Like test",
        description: "A real published pack for likes.", categoryId: category.id, creatorId: users[0]!.id,
        status: "approved", publishedAt: new Date(Date.now() - 60000),
      }).returning({ id: schema.packs.id });
      assert.ok(pack);
      const actor: Actor = { id: users[0]!.id, displayName: "Liker 1", roleKey: "custom",
        status: "active", banUntil: null, permissions: new Set(["pack.view"]) };
      const second: Actor = { ...actor, id: users[1]!.id };
      await assert.rejects(setPackLike(db, { ...actor, permissions: new Set() }, slug, true), /Missing permission/);
      await assert.rejects(setPackLike(db, { ...actor, status: "suspended" }, slug, true));
      await assert.rejects(setPackLike(db, actor, "bad slug", true), /Paket bulunamadı/);
      await tx.insert(schema.likes).values({ targetType: "topic", targetId: pack.id, userId: actor.id! });
      assert.equal(await getPackLikeState(db, actor, pack.id), false);
      assert.deepEqual(await setPackLike(db, actor, slug, true), { liked: true, likeCount: 1 });
      assert.deepEqual(await setPackLike(db, actor, slug, true), { liked: true, likeCount: 1 });
      assert.equal(await getPackLikeState(db, actor, pack.id), true);
      assert.equal(await getPackLikeState(db, second, pack.id), false);
      assert.deepEqual(await setPackLike(db, second, slug, true), { liked: true, likeCount: 2 });
      assert.deepEqual(await setPackLike(db, actor, slug, false), { liked: false, likeCount: 1 });
      assert.deepEqual(await setPackLike(db, actor, slug, false), { liked: false, likeCount: 1 });
      const [topic] = await tx.select({ id: schema.likes.id }).from(schema.likes).where(and(
        eq(schema.likes.targetType, "topic"), eq(schema.likes.targetId, pack.id), eq(schema.likes.userId, actor.id!)));
      assert.ok(topic);
      await tx.update(schema.packs).set({ status: "archived" }).where(eq(schema.packs.id, pack.id));
      await assert.rejects(setPackLike(db, second, slug, false), /Paket bulunamadı/);
      const [stored] = await tx.select({ count: schema.packs.likeCount }).from(schema.packs).where(eq(schema.packs.id, pack.id));
      assert.equal(stored?.count, 1);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("ratings recalculate the aggregate for create, update and removal without duplicates", async () => {
  const rollback = new Error("ROLLBACK_PACK_RATING_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const users = await tx.insert(schema.users).values([1, 2].map((number) => ({
        username: `rater-${number}-${suffix}`, displayName: `Rater ${number}`,
        email: `rater-${number}-${suffix}@example.invalid`, roleId: role.id,
      }))).returning({ id: schema.users.id });
      const [category] = await tx.insert(schema.packCategories).values({ slug: `rate-${suffix}`, name: "Rate Category", kind: "graphics" })
        .returning({ id: schema.packCategories.id });
      assert.ok(category && users.length === 2);
      const slug = `rate-${suffix}`;
      const [pack] = await tx.insert(schema.packs).values({ slug, title: "Rating Test Pack", excerpt: "Rating test",
        description: "A published pack for rating checks.", categoryId: category.id, creatorId: users[0]!.id,
        status: "approved", publishedAt: new Date(Date.now() - 60000),
      }).returning({ id: schema.packs.id });
      assert.ok(pack);
      const actor: Actor = { id: users[0]!.id, displayName: "Rater 1", roleKey: "custom",
        status: "active", banUntil: null, permissions: new Set(["pack.view"]) };
      const second: Actor = { ...actor, id: users[1]!.id };
      await assert.rejects(setPackRating(db, { ...actor, permissions: new Set() }, slug, 5), /Missing permission/);
      await assert.rejects(setPackRating(db, { ...actor, status: "suspended" }, slug, 5));
      for (const invalid of [0, 6, 2.5, "5", undefined]) {
        await assert.rejects(setPackRating(db, actor, slug, invalid), /1-5/);
      }
      await assert.rejects(setPackRating(db, actor, "bad slug", 5), /Paket bulunamadı/);
      assert.equal(await getMemberRating(db, actor, pack.id), null);
      assert.deepEqual(await setPackRating(db, actor, slug, 5), { value: 5, ratingAvg: "5.0", ratingCount: 1 });
      assert.deepEqual(await setPackRating(db, actor, slug, 5), { value: 5, ratingAvg: "5.0", ratingCount: 1 });
      assert.deepEqual(await setPackRating(db, second, slug, 4), { value: 4, ratingAvg: "4.5", ratingCount: 2 });
      assert.equal(await getMemberRating(db, actor, pack.id), 5);
      assert.equal(await getMemberRating(db, second, pack.id), 4);
      assert.deepEqual(await setPackRating(db, actor, slug, 2), { value: 2, ratingAvg: "3.0", ratingCount: 2 });
      assert.deepEqual(await setPackRating(db, actor, slug, null), { value: null, ratingAvg: "4.0", ratingCount: 1 });
      assert.deepEqual(await setPackRating(db, actor, slug, null), { value: null, ratingAvg: "4.0", ratingCount: 1 });
      assert.deepEqual(await setPackRating(db, second, slug, null), { value: null, ratingAvg: "0.0", ratingCount: 0 });
      const [stored] = await tx.select({ average: schema.packs.ratingAvg, count: schema.packs.ratingCount })
        .from(schema.packs).where(eq(schema.packs.id, pack.id));
      assert.deepEqual(stored, { average: "0.0", count: 0 });
      await tx.update(schema.packCategories).set({ enabled: false }).where(eq(schema.packCategories.id, category.id));
      await assert.rejects(setPackRating(db, actor, slug, 3), /Paket bulunamadı/);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("pack comments enforce public visibility, member permissions and paginated reads", async () => {
  const rollback = new Error("ROLLBACK_PACK_COMMENTS_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const [user] = await tx.insert(schema.users).values({ username: `comment-${suffix}`, displayName: "Comment Author",
        email: `comment-${suffix}@example.invalid`, roleId: role.id }).returning({ id: schema.users.id });
      const [category] = await tx.insert(schema.packCategories).values({ slug: `comment-${suffix}`,
        name: "Comment Category", kind: "graphics" }).returning({ id: schema.packCategories.id });
      assert.ok(user && category);
      const slug = `comment-${suffix}`;
      const [pack] = await tx.insert(schema.packs).values({ slug, title: "Comment Test Pack",
        excerpt: "A public package", description: "A public package for comment tests.",
        categoryId: category.id, creatorId: user.id, status: "approved", publishedAt: new Date(Date.now() - 60000),
      }).returning({ id: schema.packs.id });
      assert.ok(pack);
      const actor: Actor = { id: user.id, displayName: "Comment Author", roleKey: "custom", status: "active",
        banUntil: null, permissions: new Set(["pack.view"]) };
      await assert.rejects(createPackComment(db, { ...actor, permissions: new Set() }, slug, "Güzel paket."), /Missing permission/);
      await assert.rejects(createPackComment(db, { ...actor, status: "suspended" }, slug, "Güzel paket."));
      await assert.rejects(createPackComment(db, actor, slug, "xx"), /3-2000/);
      await assert.rejects(createPackComment(db, actor, "bad slug", "Güzel paket."), /Paket bulunamadı/);
      const created = await createPackComment(db, actor, slug, "  Güzel paket.\r\nTeşekkürler!  ");
      assert.equal(created.body, "Güzel paket.\nTeşekkürler!");
      await tx.insert(schema.comments).values([
        { packId: pack.id, userId: user.id, body: "Not public", status: "hidden" },
        { packId: pack.id, userId: user.id, body: "Demo only", isDemo: true },
      ]);
      const first = await listPackComments(db, slug);
      assert.equal(first.total, 1);
      assert.equal(first.items[0]?.body, created.body);
      assert.equal(first.items[0]?.authorName, "Comment Author");
      for (let number = 0; number < 12; number += 1) await createPackComment(db, actor, slug, `Test yorum ${number}`);
      const listing = await listPackComments(db, slug);
      assert.equal(listing.total, 13);
      assert.equal(listing.items.length, 12);
      assert.equal(listing.pageCount, 2);
      const secondPage = await listPackComments(db, slug, 2);
      assert.equal(secondPage.items.length, 1);
      assert.equal(new Set([...listing.items, ...secondPage.items].map((item) => item.id)).size, 13);
      const [stored] = await tx.select({ count: schema.packs.commentCount }).from(schema.packs).where(eq(schema.packs.id, pack.id));
      assert.equal(stored?.count, 13);
      await tx.update(schema.packCategories).set({ enabled: false }).where(eq(schema.packCategories.id, category.id));
      await assert.rejects(listPackComments(db, slug), /Paket bulunamadı/);
      await assert.rejects(createPackComment(db, actor, slug, "Görünmez."), /Paket bulunamadı/);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("pack views dedupe one identity per window and stay visibility-gated", async () => {
  const rollback = new Error("ROLLBACK_PACK_VIEW_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const [user] = await tx.insert(schema.users).values({ username: `viewer-${suffix}`, displayName: "Viewer",
        email: `viewer-${suffix}@example.invalid`, roleId: role.id }).returning({ id: schema.users.id });
      const [category] = await tx.insert(schema.packCategories).values({ slug: `view-${suffix}`,
        name: "View Category", kind: "graphics" }).returning({ id: schema.packCategories.id });
      assert.ok(user && category);
      const slug = `view-${suffix}`;
      const [pack] = await tx.insert(schema.packs).values({ slug, title: "View Test Pack", excerpt: "A public package",
        description: "A public package for view tests.", categoryId: category.id, creatorId: user.id,
        status: "approved", publishedAt: new Date(Date.now() - 60000),
      }).returning({ id: schema.packs.id });
      assert.ok(pack);
      const guest = "guest:203.0.113.7|viewer-agent/1.0";
      assert.deepEqual(await recordPackView(db, slug, guest), { viewed: true, viewCount: 1 });
      assert.deepEqual(await recordPackView(db, slug, guest), { viewed: false, viewCount: 1 });
      assert.deepEqual(await recordPackView(db, slug, guest), { viewed: false, viewCount: 1 });
      assert.deepEqual(await recordPackView(db, slug, "guest:203.0.113.8|other-agent/1.0"), { viewed: true, viewCount: 2 });
      assert.deepEqual(await recordPackView(db, slug, `user:${user.id}`), { viewed: true, viewCount: 3 });
      assert.deepEqual(await recordPackView(db, slug, `user:${user.id}`), { viewed: false, viewCount: 3 });
      const [stored] = await tx.select({ count: schema.packs.viewCount }).from(schema.packs).where(eq(schema.packs.id, pack.id));
      assert.equal(stored?.count, 3);
      await assert.rejects(recordPackView(db, "bad slug", guest), /Paket bulunamadı/);
      await assert.rejects(recordPackView(db, `missing-${suffix}`, guest), /Paket bulunamadı/);
      await tx.update(schema.packCategories).set({ enabled: false }).where(eq(schema.packCategories.id, category.id));
      await assert.rejects(recordPackView(db, slug, "guest:203.0.113.9|new-agent/1.0"), /Paket bulunamadı/);
      await tx.update(schema.packCategories).set({ enabled: true }).where(eq(schema.packCategories.id, category.id));
      await tx.update(schema.packs).set({ status: "archived" }).where(eq(schema.packs.id, pack.id));
      await assert.rejects(recordPackView(db, slug, "guest:203.0.113.9|new-agent/1.0"), /Paket bulunamadı/);
      const [final] = await tx.select({ count: schema.packs.viewCount }).from(schema.packs).where(eq(schema.packs.id, pack.id));
      assert.equal(final?.count, 3);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("downloads resolve sources, rate-limit, count once per identity and keep member history", async () => {
  const rollback = new Error("ROLLBACK_PACK_DOWNLOAD_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const users = await tx.insert(schema.users).values([1, 2].map((number) => ({
        username: `dl-${number}-${suffix}`, displayName: `Downloader ${number}`,
        email: `dl-${number}-${suffix}@example.invalid`, roleId: role.id,
      }))).returning({ id: schema.users.id });
      assert.equal(users.length, 2);
      const [category] = await tx.insert(schema.packCategories).values({ slug: `dl-${suffix}`,
        name: "Download Category", kind: "graphics" }).returning({ id: schema.packCategories.id });
      assert.ok(category);
      const base = {
        excerpt: "A public package", categoryId: category.id, status: "approved" as const,
        publishedAt: new Date(Date.now() - 60000),
      };
      const [packOne, packTwo, packThree] = await tx.insert(schema.packs).values([
        { ...base, slug: `dl-one-${suffix}`, title: "Download Test Pack One", description: "First download pack.", creatorId: users[0]!.id },
        { ...base, slug: `dl-two-${suffix}`, title: "Download Test Pack Two", description: "Second download pack.", creatorId: users[0]!.id },
        { ...base, slug: `dl-three-${suffix}`, title: "Download Test Pack Three", description: "No download target.", creatorId: users[0]!.id },
      ]).returning({ id: schema.packs.id, slug: schema.packs.slug });
      assert.ok(packOne && packTwo && packThree);
      const versions = await tx.insert(schema.packVersions).values([
        { packId: packOne.id, version: "1.0.0", isLatest: true, downloadUrl: "https://files.example.invalid/one.zip" },
        { packId: packTwo.id, version: "2.1.0", isLatest: true },
        { packId: packThree.id, version: "3.0.0", isLatest: true },
      ]).returning({ id: schema.packVersions.id, packId: schema.packVersions.packId });
      assert.equal(versions.length, 3);
      const [versionOne, versionTwo] = versions;
      const mirrors = await tx.insert(schema.downloadMirrors).values([
        { packVersionId: versionOne!.id, name: "EU-Mirror", url: "https://eu.example.invalid/one.zip", priority: 2 },
        { packVersionId: versionOne!.id, name: "US-Mirror", url: "https://us.example.invalid/one.zip", priority: 1 },
        { packVersionId: versionTwo!.id, name: "Backup", url: "https://backup.example.invalid/two.zip", priority: 3 },
        { packVersionId: versionTwo!.id, name: "First", url: "https://first.example.invalid/two.zip", priority: 1 },
      ]).returning({ id: schema.downloadMirrors.id, name: schema.downloadMirrors.name });
      assert.equal(mirrors.length, 4);
      const usMirror = mirrors.find((mirror) => mirror.name === "US-Mirror");
      assert.ok(usMirror);

      const viewer = (id: string | null, extra: PermissionKey[] = []): Actor => ({
        id, displayName: id ? "Downloader" : null, roleKey: "custom", status: "active", banUntil: null,
        permissions: new Set<PermissionKey>(["pack.view", "download.use", ...extra]),
      });
      const noDownloadPermission = { ...viewer(users[0]!.id), permissions: new Set<PermissionKey>(["pack.view"]) } as Actor;
      await assert.rejects(resolvePackDownload(db, noDownloadPermission, packOne.slug,
        { ip: "198.51.100.9", userAgent: "x" }), /Missing permission: download.use/);
      await assert.rejects(resolvePackDownload(db, { ...viewer(users[0]!.id), status: "suspended" }, packOne.slug,
        { ip: "198.51.100.9", userAgent: "x" }), /Account unavailable/);

      // Guest identity: first call counts, repeat inside the window only redirects.
      const guestIp = { ip: "198.51.100.4", userAgent: "agent/1" };
      assert.deepEqual(await resolvePackDownload(db, viewer(null), packOne.slug, guestIp),
        { url: "https://files.example.invalid/one.zip", counted: true, downloadCount: 1 });
      assert.deepEqual(await resolvePackDownload(db, viewer(null), packOne.slug, guestIp),
        { url: "https://files.example.invalid/one.zip", counted: false, downloadCount: 1 });
      // Member identity is deduped by user id regardless of IP/UA.
      assert.deepEqual(await resolvePackDownload(db, viewer(users[0]!.id), packOne.slug,
        { ip: "198.51.100.5", userAgent: "agent/2" }), { url: "https://files.example.invalid/one.zip", counted: true, downloadCount: 2 });
      assert.deepEqual(await resolvePackDownload(db, viewer(users[0]!.id), packOne.slug,
        { ip: "198.51.100.6", userAgent: "agent/3" }), { url: "https://files.example.invalid/one.zip", counted: false, downloadCount: 2 });
      // Explicit mirror selection and recording.
      assert.deepEqual(await resolvePackDownload(db, viewer(users[1]!.id), packOne.slug,
        { ip: "198.51.100.7", userAgent: "agent/4" }, usMirror!.id),
        { url: "https://us.example.invalid/one.zip", counted: true, downloadCount: 3 });
      await assert.rejects(resolvePackDownload(db, viewer(users[1]!.id), packOne.slug,
        { ip: "198.51.100.7", userAgent: "agent/4" }, "mirror_missing"), /Ayna bulunamadı/);
      // No primary URL: lowest priority number wins.
      const mirrorOnly = await resolvePackDownload(db, viewer(users[1]!.id), packTwo.slug,
        { ip: "198.51.100.8", userAgent: "agent/5" });
      assert.deepEqual(mirrorOnly, { url: "https://first.example.invalid/two.zip", counted: true, downloadCount: 1 });
      assert.equal((await getPackDownloadOptions(db, packTwo.slug)).available, true);
      // No sources at all.
      await assert.rejects(resolvePackDownload(db, viewer(null), packThree.slug,
        { ip: "198.51.100.9", userAgent: "agent/6" }), /İndirme bağlantısı bulunamadı/);
      assert.deepEqual(await getPackDownloadOptions(db, packThree.slug),
        { available: false, primary: false, mirrors: [] });
      assert.deepEqual(await getPackDownloadOptions(db, "missing"), { available: false, primary: false, mirrors: [] });

      // Abuse ceiling: the eleventh attempt for one identity is rejected.
      const spamIp = { ip: "203.0.113.50", userAgent: "spam/1" };
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await resolvePackDownload(db, viewer(null), packOne.slug, spamIp);
      }
      try {
        await resolvePackDownload(db, viewer(null), packOne.slug, spamIp);
        assert.fail("Expected the abuse rate limit to reject the eleventh attempt.");
      } catch (error) {
        assert.ok(error instanceof DownloadError);
        assert.equal(error.status, 429);
        assert.match(error.message, /sıklaştı/);
      }

      // Every counted event left exactly one row; counters match.
      const rows = await tx.select().from(schema.downloads).where(eq(schema.downloads.packId, packOne.id));
      assert.equal(rows.length, 4);
      assert.deepEqual(new Set(rows.map((row) => row.mirror)), new Set(["primary", "US-Mirror"]));
      assert.ok(rows.every((row) => row.kind === "manual" && /^[a-f0-9]{64}$/.test(row.ipHash)));
      assert.deepEqual(new Set(rows.map((row) => row.userId)), new Set([null, users[0]!.id, users[1]!.id]));
      assert.ok(rows.every((row) => row.packVersionId === versionOne!.id));
      const [storedCount] = await tx.select({ count: schema.packs.downloadCount })
        .from(schema.packs).where(eq(schema.packs.id, packOne.id));
      assert.equal(storedCount?.count, 4);

      // Visibility gates.
      await tx.update(schema.packCategories).set({ enabled: false }).where(eq(schema.packCategories.id, category.id));
      await assert.rejects(resolvePackDownload(db, viewer(null), packOne.slug, spamIp), /Paket bulunamadı/);
      assert.deepEqual(await getPackDownloadOptions(db, packOne.slug), { available: false, primary: false, mirrors: [] });
      await tx.update(schema.packCategories).set({ enabled: true }).where(eq(schema.packCategories.id, category.id));
      await tx.update(schema.packs).set({ status: "archived" }).where(eq(schema.packs.id, packOne.id));
      await assert.rejects(resolvePackDownload(db, viewer(null), packOne.slug, spamIp), /Paket bulunamadı/);

      // History: own rows only, newest first, guests cannot read it.
      await assert.rejects(getMemberDownloadHistory(db, viewer(null)), /İndirme kaydı bulunamadı/);
      await assert.rejects(getMemberDownloadHistory(db, noDownloadPermission), /Missing permission: download.use/);
      const firstHistory = await getMemberDownloadHistory(db, viewer(users[0]!.id));
      assert.equal(firstHistory.total, 1);
      assert.equal(firstHistory.items[0]?.title, "Download Test Pack One");
      assert.equal(firstHistory.items[0]?.mirror, "primary");
      assert.equal(firstHistory.items[0]?.version, "1.0.0");
      const secondHistory = await getMemberDownloadHistory(db, viewer(users[1]!.id));
      assert.equal(secondHistory.total, 2);
      assert.deepEqual(new Set(secondHistory.items.map((item) => item.title)),
        new Set(["Download Test Pack One", "Download Test Pack Two"]));
      assert.deepEqual(new Set(secondHistory.items.map((item) => item.mirror)),
        new Set(["US-Mirror", "First"]));
      assert.equal((await getMemberDownloadHistory(db, viewer(users[1]!.id), 99)).page, 1);
      // One transaction shares `now()`, so recency order needs explicit timestamps
      // (the table is append-only for this role: fixtures are inserted, never updated).
      const [ordered] = await tx.insert(schema.users).values({
        username: `hist-${suffix}`, displayName: "History Order",
        email: `hist-${suffix}@example.invalid`, roleId: role.id,
      }).returning({ id: schema.users.id });
      assert.ok(ordered);
      await tx.insert(schema.downloads).values([
        { packId: packOne.id, packVersionId: versionOne!.id, userId: ordered.id, ipHash: "0".repeat(64),
          mirror: "primary", kind: "manual", createdAt: new Date(Date.now() - 60000) },
        { packId: packTwo.id, packVersionId: versionTwo!.id, userId: ordered.id, ipHash: "1".repeat(64),
          mirror: "First", kind: "manual", createdAt: new Date(Date.now() - 30000) },
      ]);
      const orderedHistory = await getMemberDownloadHistory(db, viewer(ordered.id));
      assert.equal(orderedHistory.total, 2);
      assert.equal(orderedHistory.items[0]?.title, "Download Test Pack Two");
      assert.equal(orderedHistory.items[0]?.mirror, "First");
      assert.equal(orderedHistory.items[1]?.title, "Download Test Pack One");
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("detail exposes install guide, ordered version history and related packs", async () => {
  const rollback = new Error("ROLLBACK_PACK_DETAIL_CONTENT_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const [user] = await tx.insert(schema.users).values({ username: `detail-${suffix}`, displayName: "Detail Author",
        email: `detail-${suffix}@example.invalid`, roleId: role.id }).returning({ id: schema.users.id });
      const [category] = await tx.insert(schema.packCategories).values({ slug: `detail-${suffix}`,
        name: "Detail Category", kind: "graphics" }).returning({ id: schema.packCategories.id });
      const [otherCategory] = await tx.insert(schema.packCategories).values({ slug: `detail-other-${suffix}`,
        name: "Other Category", kind: "pvp" }).returning({ id: schema.packCategories.id });
      assert.ok(user && category && otherCategory);
      const base = { excerpt: "A public package", categoryId: category.id, creatorId: user.id,
        publishedAt: new Date(Date.now() - 60000) };
      const guide = "1. Dosyayi indir\n2. Klasore kopyala\n3. Fivem'i yeniden baslat";
      const [main, relatedHigh, relatedLow, draftPack, archived, foreign] = await tx.insert(schema.packs).values([
        { ...base, slug: `detail-main-${suffix}`, title: "Detail Main Pack", description: "Main pack for detail content.",
          status: "approved", installGuide: guide, publishedAt: new Date(Date.now() - 4 * 86400000) },
        { ...base, slug: `detail-high-${suffix}`, title: "Related High", description: "Most downloaded related pack.",
          status: "approved", downloadCount: 40, publishedAt: new Date(Date.now() - 86400000) },
        { ...base, slug: `detail-low-${suffix}`, title: "Related Low", description: "Least downloaded related pack.",
          status: "approved", downloadCount: 5, publishedAt: new Date(Date.now() - 2 * 86400000) },
        { ...base, slug: `detail-draft-${suffix}`, title: "Draft Pack", description: "Draft stays hidden.",
          status: "draft", publishedAt: null },
        { ...base, slug: `detail-archived-${suffix}`, title: "Archived Pack", description: "Archived stays hidden.",
          status: "archived", publishedAt: new Date(Date.now() - 86400000) },
        { excerpt: "Another category", slug: `detail-foreign-${suffix}`, title: "Foreign Pack",
          description: "Approved but in a different category.", categoryId: otherCategory.id, creatorId: user.id,
          status: "approved", publishedAt: new Date(Date.now() - 86400000) },
      ]).returning({ id: schema.packs.id, slug: schema.packs.slug });
      assert.ok(main && relatedHigh && relatedLow && draftPack && archived && foreign);
      await tx.insert(schema.packVersions).values([
        { packId: main.id, version: "1.0.0", changelog: "Initial release", fileSizeBytes: 12345n,
          checksumSha256: "a".repeat(64) },
        { packId: main.id, version: "2.0.0", isLatest: true, changelog: "Improved lighting", fileSizeBytes: 23456n },
        { packId: main.id, version: "3.0.0-demo", isLatest: false, isDemo: true },
      ]);
      const detail = await getPublishedPack(db, main.slug);
      assert.ok(detail);
      assert.equal(detail.installGuide, guide);
      assert.equal(detail.versions.length, 2);
      assert.equal(detail.versions[0]?.version, "2.0.0");
      assert.equal(detail.versions[0]?.isLatest, true);
      assert.equal(detail.versions[1]?.fileSizeBytes, "12345");
      assert.equal(detail.versions[1]?.checksumSha256, "a".repeat(64));
      assert.equal(detail.latestVersion?.version, "2.0.0");
      assert.ok(!detail.versions.some((version) => version.version.includes("demo")));

      const related = await getRelatedPacks(db, detail.categoryId, detail.id);
      assert.deepEqual(related.map((item) => item.slug), [relatedHigh.slug, relatedLow.slug]);
      assert.ok(!related.some((item) => [main.slug, draftPack.slug, archived.slug, foreign.slug].includes(item.slug)));
      assert.equal((await getRelatedPacks(db, detail.categoryId, detail.id, 1)).length, 1);

      const adminActor = (permissions: PermissionKey[]): Actor => ({
        id: user.id, displayName: "Detail Author", roleKey: "custom", status: "active", banUntil: null,
        permissions: new Set<PermissionKey>(permissions),
      });
      await assert.rejects(updateAdminPack(db, adminActor(["pack.manage"]), main.id, { installGuide: "kisa" }),
        /Kurulum rehberi 10-50000/);
      await assert.rejects(updateAdminPack(db, adminActor(["pack.view"]), main.id, { installGuide: guide }),
        /Missing permission: pack.manage/);
      const updatedGuide = "Yeni rehber: dosyalari C:\\packs dizinine kopyala ve istemciyi yeniden baslat.";
      const updated = await updateAdminPack(db, adminActor(["pack.manage"]), main.id, { installGuide: updatedGuide });
      assert.equal(updated.installGuide, updatedGuide);
      assert.equal((await getPublishedPack(db, main.slug))?.installGuide, updatedGuide);
      const cleared = await updateAdminPack(db, adminActor(["pack.manage"]), main.id, { installGuide: "" });
      assert.equal(cleared.installGuide, null);
      assert.equal((await getPublishedPack(db, main.slug))?.installGuide, null);
      // Database-level guard matches the service validation.
      await assert.rejects(tx.insert(schema.packs).values({ slug: `detail-short-${suffix}`, title: "Short Guide",
        excerpt: "Guide check", description: "Pack with an invalid install guide value.", categoryId: category.id,
        creatorId: user.id, status: "draft", installGuide: "abcde" }));
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("public profiles expose active members and only their visible packs", async () => {
  const rollback = new Error("ROLLBACK_PUBLIC_PROFILE_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const identity = (username: string, displayName: string) => ({
        username, displayName, email: `${username}@example.invalid`, roleId: role.id,
      });
      const bio = "FiveM gorsel paketleri uretiyorum.";
      const [author] = await tx.insert(schema.users)
        .values({ ...identity(`prof-${suffix}`, "Profile Author"), bio })
        .returning({ id: schema.users.id });
      const [other] = await tx.insert(schema.users)
        .values(identity(`prof-other-${suffix}`, "Other Author"))
        .returning({ id: schema.users.id });
      const [suspended] = await tx.insert(schema.users)
        .values({ ...identity(`prof-sus-${suffix}`, "Suspended User"), status: "suspended" })
        .returning({ id: schema.users.id });
      const [demoUser] = await tx.insert(schema.users)
        .values({ ...identity(`prof-demo-${suffix}`, "Demo User"), isDemo: true })
        .returning({ id: schema.users.id });
      assert.ok(author && other && suspended && demoUser);
      const [category] = await tx.insert(schema.packCategories)
        .values({ slug: `prof-${suffix}`, name: "Profile Category", kind: "graphics" })
        .returning({ id: schema.packCategories.id });
      const [hiddenCategory] = await tx.insert(schema.packCategories)
        .values({ slug: `prof-hidden-${suffix}`, name: "Hidden Category", kind: "pvp", enabled: false })
        .returning({ id: schema.packCategories.id });
      assert.ok(category && hiddenCategory);
      const stamp = new Date(Date.now() - 60000);
      const [visible, draftPack, hiddenPack, otherPack] = await tx.insert(schema.packs).values([
        { slug: `prof-visible-${suffix}`, title: "Visible Author Pack", excerpt: "Visible author pack",
          description: "Approved pack shown on the profile.", categoryId: category.id, creatorId: author.id,
          status: "approved", publishedAt: stamp },
        { slug: `prof-draft-${suffix}`, title: "Draft Author Pack", excerpt: "Draft author pack",
          description: "Draft pack stays off the profile.", categoryId: category.id, creatorId: author.id,
          status: "draft", publishedAt: null },
        { slug: `prof-hidpkg-${suffix}`, title: "Hidden Category Pack", excerpt: "Hidden category pack",
          description: "Approved pack in a disabled category.", categoryId: hiddenCategory.id,
          creatorId: author.id, status: "approved", publishedAt: stamp },
        { slug: `prof-otherpkg-${suffix}`, title: "Other Author Pack", excerpt: "Other author pack",
          description: "Approved pack by somebody else.", categoryId: category.id, creatorId: other.id,
          status: "approved", publishedAt: stamp },
      ]).returning({ id: schema.packs.id, slug: schema.packs.slug });
      assert.ok(visible && draftPack && hiddenPack && otherPack);

      const profile = await getPublicProfile(db, `prof-${suffix}`);
      assert.ok(profile);
      assert.equal(profile.displayName, "Profile Author");
      assert.equal(profile.bio, bio);
      assert.equal(profile.packCount, 1);

      const list = await listPublishedPacks(db, { creatorId: profile.id, pageSize: 48 });
      assert.deepEqual(list.items.map((item) => item.slug), [visible.slug]);
      assert.equal(list.total, profile.packCount);
      assert.ok(!list.items.some((item) => [draftPack.slug, hiddenPack.slug, otherPack.slug].includes(item.slug)));
      // Pages past the end return no rows; unknown creators return nothing.
      assert.equal((await listPublishedPacks(db, { creatorId: profile.id, page: 99 })).items.length, 0);
      assert.equal((await listPublishedPacks(db, { creatorId: "usr_nobody" })).total, 0);

      // Suspended, demo, missing and malformed usernames have no profile.
      assert.equal(await getPublicProfile(db, `prof-sus-${suffix}`), null);
      assert.equal(await getPublicProfile(db, `prof-demo-${suffix}`), null);
      assert.equal(await getPublicProfile(db, `prof-missing-${suffix}`), null);
      assert.equal(await getPublicProfile(db, "Not A Username!"), null);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("submission flow creates drafts, gates transitions and audits review decisions", async () => {
  const rollback = new Error("ROLLBACK_SUBMISSION_FLOW_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const [author] = await tx.insert(schema.users).values({
        username: `subm-${suffix}`, displayName: "Submission Author",
        email: `subm-${suffix}@example.invalid`, roleId: role.id,
      }).returning({ id: schema.users.id });
      const [other] = await tx.insert(schema.users).values({
        username: `subo-${suffix}`, displayName: "Other Member",
        email: `subo-${suffix}@example.invalid`, roleId: role.id,
      }).returning({ id: schema.users.id });
      assert.ok(author && other);
      const [category] = await tx.insert(schema.packCategories)
        .values({ slug: `subm-${suffix}`, name: "Submit Category", kind: "graphics" })
        .returning({ id: schema.packCategories.id });
      const [hiddenCategory] = await tx.insert(schema.packCategories)
        .values({ slug: `subm-hidden-${suffix}`, name: "Closed Category", kind: "pvp", enabled: false })
        .returning({ id: schema.packCategories.id });
      const [tag] = await tx.insert(schema.tags)
        .values({ slug: `subm-${suffix}`, name: "Submit Tag" })
        .returning({ id: schema.tags.id });
      assert.ok(category && hiddenCategory && tag);

      const memberPerms = new Set<PermissionKey>(["pack.view", "pack.submit", "pack.edit_own"]);
      const authorActor: Actor = { id: author.id, displayName: "Submission Author", roleKey: "member", status: "active", banUntil: null, permissions: memberPerms };
      const otherActor: Actor = { id: other.id, displayName: "Other Member", roleKey: "member", status: "active", banUntil: null, permissions: memberPerms };
      const reviewerActor: Actor = { id: other.id, displayName: "Other Member", roleKey: "custom", status: "active", banUntil: null, permissions: new Set<PermissionKey>(["submission.review"]) };
      const selfReviewerActor: Actor = { id: author.id, displayName: "Submission Author", roleKey: "custom", status: "active", banUntil: null, permissions: new Set<PermissionKey>(["submission.review"]) };
      const noSubmitActor: Actor = { id: author.id, displayName: "Submission Author", roleKey: "custom", status: "active", banUntil: null, permissions: new Set<PermissionKey>(["pack.view"]) };

      const base = { excerpt: "A fine summary line", description: "Long enough description for the flow test.", categoryId: category.id };
      // Create drafts; duplicate titles get distinct slugs.
      const created = await createSubmission(db, authorActor, { ...base, title: `Flow Pack ${suffix}`, tagIds: [tag.id], sourceUrl: "https://example.com/src", license: "MIT" });
      assert.equal(created.status, "draft");
      assert.equal(created.slug, `flow-pack-${suffix}`);
      assert.deepEqual(created.tagIds, [tag.id]);
      assert.equal(created.sourceUrl, "https://example.com/src");
      const second = await createSubmission(db, authorActor, { ...base, title: `Flow Pack ${suffix}` });
      assert.equal(second.slug, `flow-pack-${suffix}-2`);

      // Input/reference/permission validation.
      await assert.rejects(createSubmission(db, authorActor, { ...base, title: "ab" }), /Başlık/);
      await assert.rejects(createSubmission(db, authorActor, { ...base, title: "Valid Title", categoryId: hiddenCategory.id }), /kapalı kategori/);
      await assert.rejects(createSubmission(db, authorActor, { ...base, title: "Valid Title", tagIds: ["tag_missing"] }), /etiket/i);
      await assert.rejects(createSubmission(db, noSubmitActor, { ...base, title: "Valid Title" }), /pack\.submit/);

      // Only the author sees and edits their own submissions.
      assert.equal((await listSubmissions(db, authorActor)).length, 2);
      assert.equal((await listSubmissions(db, otherActor)).length, 0);
      await assert.rejects(getOwnSubmission(db, otherActor, created.id), /bulunamadı/);
      const edited = await updateSubmission(db, authorActor, created.id, { title: `Flow Pack ${suffix} Refined`, sourceUrl: "" });
      assert.equal(edited.title, `Flow Pack ${suffix} Refined`);
      assert.equal(edited.sourceUrl, null);
      const detail = await getOwnSubmission(db, authorActor, created.id);
      assert.deepEqual(detail.tagIds, [tag.id]);
      assert.equal(await getPublishedPack(db, created.slug), null, "draft stays hidden");

      // Transitions: withdraw is pending-only, submit locks editing and clears notes.
      await assert.rejects(transitionSubmission(db, authorActor, created.id, "withdraw"), /yalnızca incelemedeki/i);
      const pending = await transitionSubmission(db, authorActor, created.id, "submit");
      assert.equal(pending.status, "pending");
      assert.equal(pending.reviewNote, null);
      await assert.rejects(transitionSubmission(db, authorActor, created.id, "submit"), /zaten incelemede/);
      await assert.rejects(updateSubmission(db, authorActor, created.id, { title: "Locked While Pending" }), /düzenlenemez/);

      // Queue shows only the author's pending item for the reviewer.
      const queue = await listSubmissionQueue(db, reviewerActor);
      assert.ok(queue.some((item) => item.id === created.id));
      assert.ok(!queue.some((item) => item.id === second.id));
      assert.equal(queue.find((item) => item.id === created.id)?.authorUsername, `subm-${suffix}`);

      // Review gates: permission, self-review, decision and note validation.
      await assert.rejects(reviewSubmission(db, authorActor, created.id, "approved", null), /submission\.review/);
      await assert.rejects(reviewSubmission(db, selfReviewerActor, created.id, "approved", null), /kendi gönderinizi/i);
      await assert.rejects(reviewSubmission(db, reviewerActor, created.id, "bogus", null), /Geçersiz inceleme/);
      await assert.rejects(reviewSubmission(db, reviewerActor, created.id, "rejected", null), /3-1000/);

      // Withdraw removes it from the queue; a rejection carries the note.
      const withdrawn = await transitionSubmission(db, authorActor, created.id, "withdraw");
      assert.equal(withdrawn.status, "draft");
      assert.ok(!(await listSubmissionQueue(db, reviewerActor)).some((item) => item.id === created.id));
      await transitionSubmission(db, authorActor, created.id, "submit");
      const rejected = await reviewSubmission(db, reviewerActor, created.id, "rejected", "Ekran gorseli eksik.");
      assert.equal(rejected.status, "rejected");
      assert.equal(rejected.reviewNote, "Ekran gorseli eksik.");
      assert.equal(await getPublishedPack(db, created.slug), null, "rejected stays hidden");

      // The list's edit-and-resend action must be atomic, even on invalid fields.
      const revision = { title: `Flow Pack ${suffix} Refined`, excerpt: "Updated summary in one action",
        description: "Revised description after review feedback.", categoryId: category.id, tagIds: [tag.id] };
      await assert.rejects(reviseAndResubmit(db, authorActor, created.id,
        { ...revision, categoryId: hiddenCategory.id }), /kapalı kategori/);
      await assert.rejects(reviseAndResubmit(db, authorActor, created.id,
        { ...revision, excerpt: "short" }), /Özet/);
      await assert.rejects(reviseAndResubmit(db, noSubmitActor, created.id, revision), /pack\.edit_own/);
      await assert.rejects(reviseAndResubmit(db, otherActor, created.id, revision), /bulunamadı/);
      const unchanged = await getOwnSubmission(db, authorActor, created.id);
      assert.equal(unchanged.status, "rejected");
      assert.equal(unchanged.reviewNote, "Ekran gorseli eksik.");
      assert.equal(unchanged.excerpt, "A fine summary line");
      const revised = await reviseAndResubmit(db, authorActor, created.id, revision);
      assert.equal(revised.status, "pending");
      assert.equal(revised.reviewNote, null);
      assert.equal(revised.excerpt, revision.excerpt);
      assert.deepEqual(revised.tagIds, [tag.id]);
      assert.ok((await listSubmissionQueue(db, reviewerActor)).some((item) => item.id === created.id));
      await assert.rejects(reviseAndResubmit(db, authorActor, created.id, revision), /Yalnızca değişiklik istenen/);
      const requested = await reviewSubmission(db, reviewerActor, created.id, "changes_requested", "Yeni düzeltme gerekli.");
      assert.equal(requested.status, "changes_requested");

      // The existing detail-page save + submit flow also works for changes requested.
      await updateSubmission(db, authorActor, created.id, { excerpt: "Updated summary after feedback" });
      const resubmitted = await transitionSubmission(db, authorActor, created.id, "submit");
      assert.equal(resubmitted.status, "pending");
      assert.equal(resubmitted.reviewNote, null);

      // Approval publishes, locks editing and blocks a second decision.
      const approved = await reviewSubmission(db, reviewerActor, created.id, "approved", "not stored");
      assert.equal(approved.status, "approved");
      assert.equal(approved.reviewNote, null);
      assert.ok(approved.publishedAt);
      const visible = await getPublishedPack(db, created.slug);
      assert.ok(visible);
      assert.equal(visible.title, `Flow Pack ${suffix} Refined`);
      await assert.rejects(updateSubmission(db, authorActor, created.id, { title: "Nope" }), /düzenlenemez/);
      await assert.rejects(reviewSubmission(db, reviewerActor, created.id, "approved", null), /yalnızca incelemedeki/i);
      await assert.rejects(reviewSubmission(db, reviewerActor, second.id, "approved", null), /yalnızca incelemedeki/i);

      // Author listing reflects both statuses; every stage is audited.
      const mine = await listSubmissions(db, authorActor);
      assert.equal(mine.find((item) => item.id === created.id)?.status, "approved");
      assert.equal(mine.find((item) => item.id === second.id)?.status, "draft");
      // The list carries full detail fields so inline editing can repopulate the form.
      const detailed = mine.find((item) => item.id === created.id);
      assert.equal(detailed?.excerpt, "Updated summary after feedback");
      assert.equal(detailed?.categoryId, category.id);
      assert.equal(detailed?.sourceUrl, null);
      assert.deepEqual(detailed?.tagIds, [tag.id]);
      const audits = await tx.select({ action: schema.auditLogs.action })
        .from(schema.auditLogs).where(eq(schema.auditLogs.targetId, created.id));
      const actions = audits.map((row) => row.action);
      for (const expected of ["submission.create", "submission.update", "submission.submit", "submission.withdraw", "submission.review", "submission.resubmit"]) {
        assert.ok(actions.includes(expected), `audit ${expected}`);
      }
      assert.equal(actions.filter((action) => action === "submission.resubmit").length, 1);

      // Form options expose enabled categories and non-demo tags only.
      const options = await listSubmissionOptions(db);
      assert.ok(options.categories.some((item) => item.id === category.id));
      assert.ok(!options.categories.some((item) => item.id === hiddenCategory.id));
      assert.ok(options.tags.some((item) => item.id === tag.id));
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("authors add versions to approved packs with a single moving latest", async () => {
  const rollback = new Error("ROLLBACK_PACK_VERSION_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(role);
      const users = await tx.insert(schema.users).values([1, 2].map((number) => ({
        username: `ver${number}-${suffix}`, displayName: `Author ${number}`,
        email: `ver${number}-${suffix}@example.invalid`, roleId: role.id,
      }))).returning({ id: schema.users.id });
      assert.equal(users.length, 2);
      const [category] = await tx.insert(schema.packCategories).values({ slug: `ver-${suffix}`,
        name: "Version Category", kind: "graphics" }).returning({ id: schema.packCategories.id });
      assert.ok(category);
      const base = {
        excerpt: "A versioned package", categoryId: category.id, status: "approved" as const,
        publishedAt: new Date(Date.now() - 60000),
      };
      const [mine, draft, foreign] = await tx.insert(schema.packs).values([
        { ...base, slug: `ver-mine-${suffix}`, title: "Versioned Pack", description: "Own approved pack.", creatorId: users[0]!.id },
        { ...base, slug: `ver-draft-${suffix}`, title: "Draft Pack", description: "Not approved yet.",
          creatorId: users[0]!.id, status: "draft" as const, publishedAt: null },
        { ...base, slug: `ver-foreign-${suffix}`, title: "Foreign Pack", description: "Someone else's pack.", creatorId: users[1]!.id },
      ]).returning({ id: schema.packs.id, slug: schema.packs.slug });
      assert.ok(mine && draft && foreign);

      const authorPerms = new Set<PermissionKey>(["pack.view", "pack.edit_own", "pack.submit", "download.use"]);
      const author: Actor = { id: users[0]!.id, displayName: "Author 1", roleKey: "member", status: "active", banUntil: null, permissions: authorPerms };
      const other: Actor = { id: users[1]!.id, displayName: "Author 2", roleKey: "member", status: "active", banUntil: null, permissions: authorPerms };
      const noEdit: Actor = { ...author, permissions: new Set<PermissionKey>(["pack.view", "pack.submit"]) };
      const versionOnly: Actor = { ...author, permissions: new Set<PermissionKey>(["pack.edit_own"]) };
      const viewer: Actor = { id: null, displayName: null, roleKey: "custom", status: "active", banUntil: null,
        permissions: new Set<PermissionKey>(["pack.view", "download.use"]) };

      // Downloads expose no target until the first version exists.
      await assert.rejects(resolvePackDownload(db, viewer, mine.slug, { ip: "203.0.113.21", userAgent: "v1" }),
        /İndirme bağlantısı bulunamadı/);
      assert.deepEqual((await listVersionablePacks(db, versionOnly)).map((item) => item.id), [mine.id]);
      await assert.rejects(listVersionablePacks(db, noEdit), /pack\.edit_own/);

      // First version becomes the single latest; values are normalized on the way in.
      const v1 = await createPackVersion(db, author, mine.id, {
        version: " 1.0.0 ", downloadUrl: "https://files.example.invalid/v1.zip",
        fileSizeBytes: "2048", checksumSha256: "A".repeat(64), changelog: "  First drop  ",
      });
      assert.equal(v1.version, "1.0.0");
      assert.equal(v1.isLatest, true);
      assert.equal(v1.packSlug, mine.slug);
      const [stored] = await tx.select().from(schema.packVersions).where(eq(schema.packVersions.id, v1.id));
      assert.equal(stored?.checksumSha256, "a".repeat(64));
      assert.equal(stored?.changelog, "First drop");
      assert.equal(stored?.fileSizeBytes, 2048n);
      assert.deepEqual(await resolvePackDownload(db, viewer, mine.slug, { ip: "203.0.113.21", userAgent: "v1" }),
        { url: "https://files.example.invalid/v1.zip", counted: true, downloadCount: 1 });

      // A newer version demotes the previous one; exactly one latest survives.
      const v2 = await createPackVersion(db, author, mine.id,
        { version: "1.1.0", downloadUrl: "https://files.example.invalid/v2.zip" });
      assert.equal(v2.isLatest, true);
      const detail = await getPublishedPack(db, mine.slug);
      assert.ok(detail);
      assert.equal(detail.versions.length, 2);
      assert.equal(detail.versions[0]?.version, "1.1.0");
      assert.equal(detail.versions[0]?.isLatest, true);
      assert.equal(detail.versions[1]?.version, "1.0.0");
      assert.equal(detail.versions[1]?.isLatest, false);
      assert.equal(detail.latestVersion?.version, "1.1.0");
      assert.deepEqual(await resolvePackDownload(db, viewer, mine.slug, { ip: "203.0.113.22", userAgent: "v2" }),
        { url: "https://files.example.invalid/v2.zip", counted: true, downloadCount: 2 });

      // Duplicates and malformed input are rejected without touching state.
      await assert.rejects(createPackVersion(db, author, mine.id,
        { version: "1.1.0", downloadUrl: "https://files.example.invalid/dup.zip" }), /zaten kayıtlı/);
      await assert.rejects(createPackVersion(db, author, mine.id,
        { version: "abc", downloadUrl: "https://files.example.invalid/x.zip" }), /biçim hatalı/);
      await assert.rejects(createPackVersion(db, author, mine.id, { version: "2.0.0" }), /İndirme adresi zorunlu/);
      await assert.rejects(createPackVersion(db, author, mine.id,
        { version: "2.0.0", downloadUrl: "javascript:alert(1)" }), /http/);
      await assert.rejects(createPackVersion(db, author, mine.id,
        { version: "2.0.0", downloadUrl: "https://files.example.invalid/x.zip", fileSizeBytes: "-1" }), /1 TiB|arasında/);
      await assert.rejects(createPackVersion(db, author, mine.id,
        { version: "2.0.0", downloadUrl: "https://files.example.invalid/x.zip", checksumSha256: "beef" }), /64 hexadecimal/);

      // Gates: only the own approved pack; owner scope and permission are enforced.
      await assert.rejects(createPackVersion(db, author, draft.id,
        { version: "1.0.0", downloadUrl: "https://files.example.invalid/d.zip" }), /yayındaki/);
      await assert.rejects(createPackVersion(db, author, foreign.id,
        { version: "1.0.0", downloadUrl: "https://files.example.invalid/f.zip" }), /bulunamadı/);
      await assert.rejects(createPackVersion(db, author, `pk_missing_${suffix.slice(0, 6)}`,
        { version: "1.0.0", downloadUrl: "https://files.example.invalid/m.zip" }), /bulunamadı/);
      await assert.rejects(createPackVersion(db, noEdit, mine.id,
        { version: "1.0.0", downloadUrl: "https://files.example.invalid/n.zip" }), /pack\.edit_own/);
      await assert.rejects(createPackVersion(db, other, mine.id,
        { version: "1.0.0", downloadUrl: "https://files.example.invalid/o.zip" }), /bulunamadı/);

      // Failures left the latest pointer on v2 and audited exactly the two adds.
      const finalLatest = await tx.select({ id: schema.packVersions.id }).from(schema.packVersions)
        .where(and(eq(schema.packVersions.packId, mine.id), eq(schema.packVersions.isLatest, true)));
      assert.equal(finalLatest.length, 1);
      assert.equal(finalLatest[0]?.id, v2.id);
      const audits = await tx.select({ action: schema.auditLogs.action }).from(schema.auditLogs)
        .where(eq(schema.auditLogs.targetId, mine.id));
      assert.equal(audits.filter((row) => row.action === "pack.version_add").length, 2);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("catalog admin mutations enforce permissions and append audit records", async () => {
  const rollback = new Error("ROLLBACK_CATALOG_ADMIN_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const db = tx as unknown as Database;
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "admin"));
      assert.ok(role);
      const [user] = await tx
        .insert(schema.users)
        .values({ username: `catalog-${suffix}`, displayName: "Catalog Admin", email: `catalog-${suffix}@example.invalid`, roleId: role.id })
        .returning({ id: schema.users.id });
      assert.ok(user);
      const actor: Actor = {
        id: user.id,
        displayName: "Catalog Admin",
        roleKey: "custom-catalog-role",
        permissions: new Set(["category.manage", "tag.manage"]),
        status: "active",
        banUntil: null,
      };
      const denied: Actor = { ...actor, permissions: new Set() };
      await assert.rejects(createTag(db, denied, { slug: `denied-${suffix}`, name: "Denied" }), /Missing permission/);

      const category = await createCategory(db, actor, {
        slug: `catalog-${suffix}`,
        name: "Catalog Category",
        description: "Integration category",
        kind: "graphics",
      });
      const tag = await createTag(db, actor, { slug: `catalog-${suffix}`, name: "Catalog Tag" });
      const changedCategory = await updateCategory(db, actor, category.id, { name: "Updated Category", enabled: false });
      const changedTag = await updateTag(db, actor, tag.id, { name: "Updated Tag" });
      assert.equal(changedCategory.enabled, false);
      assert.equal(changedTag.name, "Updated Tag");
      assert.ok((await listAdminCategories(db, actor)).some((item) => item.id === category.id));
      assert.ok((await listAdminTags(db, actor)).some((item) => item.id === tag.id));

      await deleteTag(db, actor, tag.id);
      await deleteCategory(db, actor, category.id);
      const audits = await tx
        .select({ action: schema.auditLogs.action })
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.actorId, user.id));
      assert.deepEqual(
        audits.map((row) => row.action).sort(),
        ["category.create", "category.delete", "category.update", "tag.create", "tag.delete", "tag.update"],
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

test("pack admin CRUD enforces publish/feature/archive gates and audits changes", async () => {
  const rollback = new Error("ROLLBACK_PACK_ADMIN_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const db = tx as unknown as Database;
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "admin"));
      const [user] = await tx
        .insert(schema.users)
        .values({
          username: `packadmin-${suffix}`,
          displayName: "Pack Admin",
          email: `packadmin-${suffix}@example.invalid`,
          roleId: role!.id,
        })
        .returning({ id: schema.users.id });
      const [category] = await tx
        .insert(schema.packCategories)
        .values({ slug: `packadmin-${suffix}`, name: "Pack Admin Category", kind: "pvp" })
        .returning({ id: schema.packCategories.id });
      const [tag] = await tx
        .insert(schema.tags)
        .values({ slug: `packadmin-${suffix}`, name: "Pack Admin Tag" })
        .returning({ id: schema.tags.id });
      assert.ok(user && category && tag);

      const base: Actor = {
        id: user.id,
        displayName: "Pack Admin",
        roleKey: "custom-pack-role",
        permissions: new Set(),
        status: "active",
        banUntil: null,
      };
      const editor: Actor = { ...base, permissions: new Set(["pack.manage"]) };
      const full: Actor = {
        ...base,
        permissions: new Set(["pack.manage", "pack.publish", "pack.feature", "pack.delete"]),
      };
      const input = {
        slug: `packadmin-${suffix}`,
        title: "Admin Created Pack",
        excerpt: "Created through the authoritative admin service.",
        description: "A sufficiently long admin-created package description for validation.",
        categoryId: category.id,
        tagIds: [tag.id],
        status: "draft",
      };

      await assert.rejects(createAdminPack(db, base, input), /Missing permission/);
      const created = await createAdminPack(db, editor, input);
      assert.equal(created.status, "draft");

      // Publishing, featuring and archiving are separate capabilities.
      await assert.rejects(
        updateAdminPack(db, editor, created.id, { status: "approved" }),
        /Missing permission: pack.publish/,
      );
      await assert.rejects(
        updateAdminPack(db, editor, created.id, { featured: true }),
        /Missing permission: pack.feature/,
      );
      await assert.rejects(
        archiveAdminPack(db, editor, created.id),
        /Missing permission: pack.delete/,
      );
      await assert.rejects(
        createAdminPack(db, editor, { ...input, slug: `${input.slug}-approved`, status: "approved" }),
        /Missing permission: pack.publish/,
      );

      const published = await updateAdminPack(db, full, created.id, { status: "approved", featured: true });
      assert.equal(published.status, "approved");
      assert.equal(published.featured, true);
      assert.ok(published.publishedAt);

      const listed = await listAdminPacks(db, full);
      const listedPack = listed.find((item) => item.id === created.id);
      assert.deepEqual(listedPack?.tagIds, [tag.id]);

      const archived = await archiveAdminPack(db, full, created.id);
      assert.equal(archived.status, "archived");
      assert.equal(archived.featured, false);

      // Demo seed rows are not manageable through the admin surface.
      const [demoPack] = await tx
        .select({ id: schema.packs.id })
        .from(schema.packs)
        .where(eq(schema.packs.isDemo, true))
        .limit(1);
      if (demoPack) {
        await assert.rejects(
          updateAdminPack(db, full, demoPack.id, { title: "Should not change demo" }),
          /Paket bulunamad/,
        );
      }

      const audits = await tx
        .select({ action: schema.auditLogs.action })
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.actorId, user.id));
      assert.deepEqual(
        audits.map((row) => row.action).sort(),
        ["pack.archive", "pack.create", "pack.update"],
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

test("homepage builder enforces permissions, order, visibility and transaction audit", async () => {
  const rollback = new Error("ROLLBACK_HOMEPAGE_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "admin"));
      assert.ok(role);
      const [user] = await tx.insert(schema.users).values({
        username: `homepage-${suffix}`, displayName: "Homepage Editor",
        email: `homepage-${suffix}@example.invalid`, roleId: role.id,
      }).returning({ id: schema.users.id });
      assert.ok(user);
      const actor: Actor = { id: user.id, displayName: "Homepage Editor", roleKey: "custom",
        permissions: new Set(["homepage.manage"]), status: "active", banUntil: null };
      const denied: Actor = { ...actor, permissions: new Set() };
      const sections = [
        { key: "known", enabled: true, maxItems: 3, title: "Sevilen paketler" }, { key: "trending", enabled: true },
        { key: "hero", enabled: false, hero: { eyebrow: "Seçilmiş içerik", headline: "En yeni paketler burada.",
          description: "Paketleri ve uyumluluk bilgilerini inceleyin.", primaryLabel: "Paketleri aç", secondaryLabel: "Kuralları oku" } },
        { key: "featured", enabled: true },
      ];
      await assert.rejects(listAdminHomepageSections(db, denied), /Missing permission/);
      await assert.rejects(updateHomepageSections(db, denied, sections), /Missing permission/);
      const updated = await updateHomepageSections(db, actor, sections);
      assert.deepEqual(updated.map((section) => section.key), ["known", "trending", "hero", "featured"]);
      const publicRows = await listHomepageSections(db);
      assert.deepEqual(publicRows.map((section) => section.key), updated.map((section) => section.key));
      assert.equal(publicRows[0]?.maxItems, 3);
      assert.equal(publicRows[0]?.title, "Sevilen paketler");
      assert.equal(publicRows[2]?.enabled, false);
      assert.equal(publicRows[2]?.hero?.headline, "En yeni paketler burada.");
      const [config] = await tx.select({ value: schema.homepageSections.config }).from(schema.homepageSections)
        .where(eq(schema.homepageSections.key, "known"));
      assert.equal(config?.value.maxItems, 3);
      assert.equal(config?.value.title, "Sevilen paketler");
      await updateHomepageSections(db, actor, sections.map(({ key, enabled }) => ({ key, enabled })));
      const legacy = await listHomepageSections(db);
      assert.equal(legacy[0]?.title, "Sevilen paketler");
      assert.equal(legacy[0]?.maxItems, 3);
      assert.equal(legacy[2]?.hero?.headline, "En yeni paketler burada.");
      const audit = await tx.select({ action: schema.auditLogs.action, after: schema.auditLogs.after })
        .from(schema.auditLogs).where(eq(schema.auditLogs.actorId, user.id));
      assert.equal(audit.length, 2);
      assert.equal(audit[0]?.action, "homepage.update");
      assert.deepEqual((audit[0]?.after as { sections: typeof updated }).sections, updated);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("registration switch is live, permission-gated and audit-logged", async () => {
  const rollback = new Error("ROLLBACK_REGISTRATION_SETTING_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "admin"));
      assert.ok(role);
      const [user] = await tx.insert(schema.users).values({
        username: `flag-${suffix}`, displayName: "Flag Editor", email: `flag-${suffix}@example.invalid`, roleId: role.id,
      }).returning({ id: schema.users.id });
      assert.ok(user);
      const actor: Actor = { id: user.id, displayName: "Flag Editor", roleKey: "custom", status: "active",
        banUntil: null, permissions: new Set(["admin.settings"]) };
      const denied: Actor = { ...actor, permissions: new Set() };
      await assert.rejects(getAdminRegistrationSetting(db, denied), /Missing permission/);
      await assert.rejects(updateRegistrationSetting(db, denied, true), /Missing permission/);
      await assert.rejects(updateRegistrationSetting(db, actor, "yes"), /boolean/);
      const before = await registrationEnabled(db);
      const after = await updateRegistrationSetting(db, actor, !before);
      assert.equal(after?.enabled, !before);
      assert.equal(await registrationEnabled(db), !before);
      const audit = await tx.select({ action: schema.auditLogs.action, targetId: schema.auditLogs.targetId })
        .from(schema.auditLogs).where(eq(schema.auditLogs.actorId, user.id));
      assert.deepEqual(audit, [{ action: "feature_flag.update", targetId: "registrations_enabled" }]);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("site name changes are permission-gated, visible and audited", async () => {
  const rollback = new Error("ROLLBACK_SITE_NAME_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "admin"));
      assert.ok(role);
      const [user] = await tx.insert(schema.users).values({
        username: `sitename-${suffix}`, displayName: "Site Editor", email: `sitename-${suffix}@example.invalid`, roleId: role.id,
      }).returning({ id: schema.users.id });
      assert.ok(user);
      const actor: Actor = { id: user.id, displayName: "Site Editor", roleKey: "custom", status: "active",
        banUntil: null, permissions: new Set(["admin.settings"]) };
      await assert.rejects(updateSiteName(db, { ...actor, permissions: new Set() }, "New Name"), /Missing permission/);
      await assert.rejects(updateSiteName(db, actor, "a"), /3-64/);
      await assert.rejects(updateSiteName(db, actor, "Bad\u0000Name"), /3-64/);
      const result = await updateSiteName(db, actor, "  Test   Hub  ");
      assert.equal(result.name, "Test Hub");
      assert.equal(await readSiteName(db), "Test Hub");
      const [audit] = await tx.select({ action: schema.auditLogs.action, targetId: schema.auditLogs.targetId, before: schema.auditLogs.before, after: schema.auditLogs.after })
        .from(schema.auditLogs).where(eq(schema.auditLogs.actorId, user.id));
      assert.equal(audit?.action, "site_setting.update");
      assert.equal(audit.targetId, "site_name");
      assert.equal(audit.after?.value, "Test Hub");
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("site description is live, validates content and audits changes", async () => {
  const rollback = new Error("ROLLBACK_SITE_DESCRIPTION_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
      const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "admin"));
      assert.ok(role);
      const [user] = await tx.insert(schema.users).values({
        username: `sitedesc-${suffix}`, displayName: "Description Editor",
        email: `sitedesc-${suffix}@example.invalid`, roleId: role.id,
      }).returning({ id: schema.users.id });
      assert.ok(user);
      const actor: Actor = { id: user.id, displayName: "Description Editor", roleKey: "custom", status: "active",
        banUntil: null, permissions: new Set(["admin.settings"]) };
      const denied: Actor = { ...actor, permissions: new Set() };
      await assert.rejects(getAdminSiteDescription(db, denied), /Missing permission/);
      await assert.rejects(updateSiteDescription(db, denied, "Uzun bir açıklama olmalı ve kimse güncelleyememeli."), /Missing permission/);
      await assert.rejects(updateSiteDescription(db, actor, "kısa"), /20-320/);
      await assert.rejects(updateSiteDescription(db, actor, "Görünmez\u0000 karakter içeren açıklama metni"), /20-320/);
      const before = await readSiteDescription(db);
      const [heroRow] = await tx.select({ config: schema.homepageSections.config }).from(schema.homepageSections)
        .where(eq(schema.homepageSections.key, "hero"));
      assert.ok(heroRow);
      await tx.update(schema.homepageSections).set({ config: { ...heroRow.config,
        hero: { ...defaultHero, description: defaultHero.description } } }).where(eq(schema.homepageSections.key, "hero"));
      const result = await updateSiteDescription(db, actor, "  Yeni   grafik paketleri ve uyumluluk rehberi burada.  ");
      assert.equal(result.description, "Yeni grafik paketleri ve uyumluluk rehberi burada.");
      assert.equal(await readSiteDescription(db), result.description);
      assert.equal(await getAdminSiteDescription(db, actor), result.description);
      assert.equal((await listHomepageSections(db)).find((section) => section.key === "hero")?.hero?.description, result.description);
      await tx.update(schema.homepageSections).set({ config: { ...heroRow.config,
        hero: { ...defaultHero, description: "Özel karşılama açıklaması saklanır." } } }).where(eq(schema.homepageSections.key, "hero"));
      assert.equal((await listHomepageSections(db)).find((section) => section.key === "hero")?.hero?.description,
        "Özel karşılama açıklaması saklanır.");
      assert.notEqual(before, result.description);
      assert.deepEqual(await updateSiteDescription(db, actor, result.description), result);
      const audit = await tx.select({ action: schema.auditLogs.action, targetId: schema.auditLogs.targetId,
        before: schema.auditLogs.before, after: schema.auditLogs.after })
        .from(schema.auditLogs).where(eq(schema.auditLogs.actorId, user.id));
      assert.equal(audit.length, 1);
      assert.equal(audit[0]?.action, "site_setting.update");
      assert.equal(audit[0]?.targetId, "site_description");
      assert.equal(audit[0]?.before?.value, before);
      assert.equal(audit[0]?.after?.value, result.description);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("role grants and user assignment obey rank/permission boundaries with immediate effect", async () => {
  const rollback = new Error("ROLLBACK_ADMIN_RBAC_TEST");
  try {
    await app.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
      const [superRole] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "super_admin"));
      const [adminRole] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "admin"));
      const [memberRole] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, "member"));
      assert.ok(superRole && adminRole && memberRole);
      const [manager] = await tx.insert(schema.users).values({
        username: `rbacmanager-${suffix}`, displayName: "Role Manager", email: `rbacmanager-${suffix}@example.invalid`, roleId: superRole.id,
      }).returning({ id: schema.users.id });
      const [editor] = await tx.insert(schema.users).values({
        username: `rbaceditor-${suffix}`, displayName: "Role Editor", email: `rbaceditor-${suffix}@example.invalid`, roleId: adminRole.id,
      }).returning({ id: schema.users.id });
      const [member] = await tx.insert(schema.users).values({
        username: `rbacmember-${suffix}`, displayName: "Role Member", email: `rbacmember-${suffix}@example.invalid`, roleId: memberRole.id,
      }).returning({ id: schema.users.id });
      assert.ok(manager && editor && member);
      // Permissions are loaded from the seed role; roleKey is not used in rank checks.
      const managerActor = (await loadActor(db, manager.id))!;
      const adminActor = (await loadActor(db, editor.id))!;
      const denied: Actor = { ...managerActor, permissions: new Set() };
      const input = { key: `event_team_${suffix}`, name: "Etkinlik Ekibi", description: "Sınırlı katalog yetkileri",
        rank: 25, permissions: ["pack.view", "category.manage"] };

      await assert.rejects(createAdminRole(db, denied, input), /Missing permission/);
      const created = await createAdminRole(db, managerActor, input);
      assert.equal(created.rank, 25);
      await assert.rejects(createAdminRole(db, managerActor, input), /zaten kullanılıyor/);
      const listing = await listAdminRoles(db, managerActor);
      assert.equal(listing.roles.find((role) => role.id === adminRole.id)?.editable, true);
      assert.equal(listing.roles.find((role) => role.id === superRole.id)?.editable, false);
      assert.equal(listing.roles.find((role) => role.key === "guest")?.editable, false);
      const currentAdmin = listing.roles.find((role) => role.id === adminRole.id);
      assert.ok(currentAdmin);
      await updateAdminRole(db, managerActor, adminRole.id, {
        permissions: currentAdmin.permissions.filter((key) => key !== "tag.manage"),
      });
      assert.equal((await loadActor(db, editor.id))?.permissions.has("tag.manage"), false);
      await assert.rejects(updateAdminRole(db, adminActor, adminRole.id, { name: "Cannot rename own rank" }), /düzenleme yetkin yok/);
      await assert.rejects(updateAdminRole(db, adminActor, created.id, { permissions: ["user.delete"] }), /Sahip olmadığın izni/);
      await assert.rejects(updateAdminRole(db, managerActor, superRole.id, { name: "Cannot rename top role" }), /düzenleme yetkin yok/);
      await assert.rejects(assignUserRole(db, managerActor, manager.id, created.id), /Kendi rolünü/);
      await assert.rejects(assignUserRole(db, adminActor, member.id, adminRole.id), /altındaki/);
      await assert.rejects(assignUserRole(db, denied, member.id, created.id), /Missing permission/);

      const assigned = await assignUserRole(db, managerActor, member.id, created.id);
      assert.equal(assigned.roleKey, input.key);
      assert.equal((await loadActor(db, member.id))?.permissions.has("category.manage"), true);
      const result = await listAdminUsers(db, managerActor, { q: `rbacmember-${suffix}` });
      assert.equal(result.total, 1);
      assert.equal(result.items[0]?.roleKey, input.key);
      const updated = await updateAdminRole(db, managerActor, created.id, {
        name: "Etkinlik Yetkilisi", permissions: ["pack.view", "tag.manage"],
      });
      assert.equal(updated.name, "Etkinlik Yetkilisi");
      assert.equal((await loadActor(db, member.id))?.permissions.has("category.manage"), false);
      assert.equal((await loadActor(db, member.id))?.permissions.has("tag.manage"), true);
      const audits = await tx.select({ action: schema.auditLogs.action }).from(schema.auditLogs)
        .where(eq(schema.auditLogs.actorId, manager.id));
      assert.deepEqual(audits.map((row) => row.action).sort(), ["role.create", "role.update", "role.update", "user.role.assign"]);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});
