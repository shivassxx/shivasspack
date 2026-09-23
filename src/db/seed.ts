import { createDatabase } from "./connection";
import { seedDatabase } from "./seed-data";
import { migrationRole } from "./access";

async function main() {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error("DATABASE_MIGRATION_URL is required.");
  const includeDemo = process.argv.includes("--demo");
  if (includeDemo && process.env.NODE_ENV === "production") {
    throw new Error("Demo seeding is not allowed in production.");
  }
  const { client, db } = createDatabase(url, 1);
  try {
    const [role] = await client`select current_user as name`;
    if (role?.name !== migrationRole) throw new Error("Seed must use the migration role.");
    await seedDatabase(db, includeDemo);
    process.stdout.write(
      `Seed completed (${includeDemo ? "reference + marked demo data" : "reference data only"}).\n`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch(() => {
  console.error(
    "Seed failed. Verify the migration URL and schema. Demo data is disabled in production; existing data was not reset.",
  );
  process.exitCode = 1;
});
