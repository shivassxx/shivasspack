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
import { can, type Actor } from "../services/rbac";
import { consumeRateLimit } from "../services/rate-limit";
import {
  getPublishedPack,
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
import { defaultHero, listAdminHomepageSections, listHomepageSections, updateHomepageSections } from "../services/homepage";
import { getAdminRegistrationSetting, getAdminSiteDescription, readSiteDescription, readSiteName, registrationEnabled, updateRegistrationSetting, updateSiteDescription, updateSiteName } from "../services/admin/settings";
import { createAdminRole, listAdminRoles, updateAdminRole } from "../services/admin/roles";
import { assignUserRole, listAdminUsers } from "../services/admin/users";
import { loadActor } from "../services/rbac";
import { getBookmarkState, getMemberBookmarks, setPackBookmark } from "../services/packs/bookmarks";
import { getPackLikeState, setPackLike } from "../services/packs/likes";
import { getMemberRating, setPackRating } from "../services/packs/ratings";

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
