import { runMigrations } from "./migrations";

async function main() {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error("DATABASE_MIGRATION_URL is required (use .env.migrations).");
  await runMigrations(url);
  process.stdout.write("Migrations and application grants completed.\n");
}

main().catch(() => {
  console.error(
    "Database migration failed. Check migration credentials, schema and SQL files; no changes were reset.",
  );
  process.exitCode = 1;
});
