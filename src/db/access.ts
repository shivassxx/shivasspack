import type { Sql } from "postgres";

// These names are deployment contracts, not application-level RBAC roles.
export const applicationRole = "shivass_app";
export const migrationRole = "shivass_migrator";
export const appendOnlyTables = [
  "audit_logs",
  "downloads",
  "analytics_events",
  "installed_pack_logs",
  "install_versions",
] as const;

export async function applyApplicationGrants(client: Sql) {
  // No default write grant: new tables remain inaccessible until migrations finish.
  // This function runs as the table-owning migrator after each migration.
  const [role] = await client`select 1 from pg_roles where rolname = ${applicationRole}`;
  if (!role) throw new Error("Application role missing; run db:provision first.");
  await client.unsafe(`GRANT USAGE ON SCHEMA public TO ${applicationRole}`);
  await client.unsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${applicationRole}`);
  await client.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${applicationRole}`,
  );
  for (const table of appendOnlyTables) {
    await client.unsafe(`REVOKE UPDATE, DELETE ON TABLE public.${table} FROM ${applicationRole}`);
  }
  // Schema creation and access to the migration journal are not application privileges.
  await client.unsafe(`REVOKE ALL ON SCHEMA drizzle FROM ${applicationRole}`);
}
