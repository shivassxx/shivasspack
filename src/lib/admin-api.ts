import { jsonError } from "@/lib/api";
import { CatalogError } from "@/services/admin/catalog";
import { PackAdminError } from "@/services/admin/packs";
import { HomepageError } from "@/services/homepage";
import { AuthorizationError } from "@/services/rbac";

export function adminErrorResponse(error: unknown): Response {
  if (error instanceof CatalogError || error instanceof PackAdminError || error instanceof HomepageError || error instanceof AuthorizationError) {
    return jsonError(error.status, error.code, error.message);
  }
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(`[admin] unexpected error (${kind})`);
  return jsonError(500, "internal_error", "Beklenmeyen bir hata oluştu.");
}
