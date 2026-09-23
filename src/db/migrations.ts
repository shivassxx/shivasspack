import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "./connection";
import { applyApplicationGrants, migrationRole } from "./access";

export async function runMigrations(url: string) {
  const { client, db } = createDatabase(url, 1);
  try {
    const [role] =
      await client`select current_user as name, rolsuper from pg_roles where rolname = current_user`;
    if (role?.name !== migrationRole || role.rolsuper) {
      throw new Error("Migrations must use the non-superuser shivass_migrator role.");
    }
    // max: 1 keeps the advisory lock and migrations on the same connection.
    await client`select pg_advisory_lock(72134, 1)`;
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await client.begin(async (tx) => applyApplicationGrants(tx as unknown as typeof client));
    } finally {
      await client`select pg_advisory_unlock(72134, 1)`;
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
