import postgres from "postgres";
import { applicationRole, migrationRole } from "../src/db/access";

function urlFromEnv(key: string) {
  const raw = process.env[key];
  if (!raw) throw new Error(`${key} is required.`);
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("PostgreSQL URLs required.");
  return url;
}

async function main() {
  const admin = urlFromEnv("DATABASE_ADMIN_URL");
  const app = urlFromEnv("DATABASE_URL");
  const migrator = urlFromEnv("DATABASE_MIGRATION_URL");
  for (const [url, expected] of [
    [app, applicationRole],
    [migrator, migrationRole],
  ] as const) {
    if (
      url.host !== admin.host ||
      url.pathname !== admin.pathname ||
      decodeURIComponent(url.username) !== expected
    ) {
      throw new Error("All URLs must target the same database with the documented role names.");
    }
    if (decodeURIComponent(url.password).length < 32)
      throw new Error("Use generated passwords with at least 32 characters.");
  }
  const client = postgres(admin.toString(), { max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    await client.begin(async (tx) => {
      for (const [name, url] of [
        [migrationRole, migrator],
        [applicationRole, app],
      ] as const) {
        const [existing] =
          await tx`select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls from pg_roles where rolname = ${name}`;
        if (existing) {
          if (Object.values(existing).some(Boolean))
            throw new Error(
              "Existing role has elevated privileges; review it before provisioning.",
            );
          const memberships =
            await tx`select 1 from pg_auth_members where member = (select oid from pg_roles where rolname = ${name})`;
          if (memberships.length)
            throw new Error("Existing deployment roles must not inherit other roles.");
          // Never rotate an existing user's password implicitly.
        } else {
          const password = decodeURIComponent(url.password).replaceAll("'", "''");
          await tx.unsafe(
            `CREATE ROLE ${name} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
          );
        }
      }
      const databaseName = decodeURIComponent(admin.pathname.slice(1));
      await tx`grant connect on database ${tx(databaseName)} to ${tx(applicationRole)}, ${tx(migrationRole)}`;
      await tx`grant create on database ${tx(databaseName)} to ${tx(migrationRole)}`;
      await tx`revoke create on schema public from public`;
      await tx`grant usage, create on schema public to ${tx(migrationRole)}`;
      await tx`grant usage on schema public to ${tx(applicationRole)}`;
      await tx`revoke create on schema public from ${tx(applicationRole)}`;
    });
    for (const url of [app, migrator]) {
      const verify = postgres(url.toString(), { max: 1, connect_timeout: 5, onnotice: () => {} });
      try {
        await verify`select 1`;
      } finally {
        await verify.end({ timeout: 5 });
      }
    }
    process.stdout.write("Deployment roles provisioned and credentials verified.\n");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch(() => {
  console.error(
    "DB provisioning failed. Check the three URLs and existing role privileges. Existing passwords were not changed.",
  );
  process.exitCode = 1;
});
