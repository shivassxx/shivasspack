import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getDatabase } from "@/db/client";
import { readSiteName } from "@/services/admin/settings";

// Request-scoped: the admin editor takes effect on the very next request.
// connection() prevents CI builds without database credentials from prerendering this read.
export const getSiteName = cache(async () => {
  await connection();
  return readSiteName(getDatabase().db);
});
