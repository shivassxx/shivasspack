import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "./schema";

export function createDatabase(url: string, max = 5) {
  // Validate without including the credential-bearing URL in any error output.
  if (!z.url({ protocol: /^postgres(ql)?$/ }).safeParse(url).success) {
    throw new Error("A valid PostgreSQL connection URL is required.");
  }
  const client = postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 5,
    connection: { application_name: "shivasspack", statement_timeout: 10_000 },
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });
  return { client, db };
}

export type Database = ReturnType<typeof createDatabase>["db"];
