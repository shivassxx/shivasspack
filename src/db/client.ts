import "server-only";
import { getServerEnv } from "@/lib/env";
import { createDatabase } from "./connection";

const globalDb = globalThis as typeof globalThis & {
  shivassDatabase?: ReturnType<typeof createDatabase>;
};

/** Lazy initialization keeps builds independent of a live database. */
export function getDatabase() {
  globalDb.shivassDatabase ??= createDatabase(getServerEnv().DATABASE_URL);
  return globalDb.shivassDatabase;
}
