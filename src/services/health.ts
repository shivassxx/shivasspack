import { sql } from "drizzle-orm";
import type { Database } from "@/db/connection";

/** Verify application tables/privileges, not just TCP connectivity. */
export async function checkDatabase(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select id from public.roles limit 1`);
    return true;
  } catch {
    return false;
  }
}
