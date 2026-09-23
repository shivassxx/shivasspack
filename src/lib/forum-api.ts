import { jsonError } from "@/lib/api";
import { ForumError } from "@/services/forum";
import { AuthorizationError } from "@/services/rbac";

export function forumErrorResponse(error: unknown): Response {
  if (error instanceof ForumError || error instanceof AuthorizationError) {
    return jsonError(error.status, error.code, error.message);
  }
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(`[forum] unexpected error (${kind})`);
  return jsonError(500, "internal_error", "Beklenmeyen bir hata oluştu.");
}
