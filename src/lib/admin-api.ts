import { jsonError } from "@/lib/api";
import { CatalogError } from "@/services/admin/catalog";
import { PackAdminError } from "@/services/admin/packs";
import { HomepageError } from "@/services/homepage";
import { SettingsError } from "@/services/admin/settings";
import { RoleAdminError } from "@/services/admin/roles";
import { UserAdminError } from "@/services/admin/users";
import { SubmissionError } from "@/lib/submission-state";
import { AuthorizationError } from "@/services/rbac";
import { NewsError } from "@/services/news";
import { AiSourceError } from "@/services/ai-sources";

export function adminErrorResponse(error: unknown): Response {
  if (error instanceof CatalogError || error instanceof PackAdminError || error instanceof HomepageError || error instanceof SettingsError || error instanceof RoleAdminError || error instanceof UserAdminError || error instanceof SubmissionError || error instanceof AuthorizationError || error instanceof NewsError || error instanceof AiSourceError) {
    return jsonError(error.status, error.code, error.message);
  }
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(`[admin] unexpected error (${kind})`);
  return jsonError(500, "internal_error", "Beklenmeyen bir hata oluştu.");
}
