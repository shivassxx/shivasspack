import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: false,
  ...(process.env.DATABASE_MIGRATION_URL
    ? { dbCredentials: { url: process.env.DATABASE_MIGRATION_URL } }
    : {}),
});
