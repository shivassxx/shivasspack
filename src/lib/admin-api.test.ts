import { describe, expect, it } from "vitest";
import { adminErrorResponse } from "./admin-api";
import { CatalogError } from "@/services/admin/catalog";
import { PackAdminError } from "@/services/admin/packs";
import { RoleAdminError } from "@/services/admin/roles";
import { UserAdminError } from "@/services/admin/users";
import { AuthorizationError } from "@/services/rbac";

async function body(response: Response) {
  return (await response.json()) as { error: { code: string; message: string } };
}

describe("admin error mapping", () => {
  it("maps catalog conflicts to 409 with a safe message", async () => {
    const response = adminErrorResponse(new CatalogError("conflict", "Bu slug zaten kullanılıyor.", 409));
    expect(response.status).toBe(409);
    expect((await body(response)).error.code).toBe("conflict");
  });

  it("maps pack validation and not-found errors", async () => {
    const invalid = adminErrorResponse(new PackAdminError("validation", "Geçersiz durum.", 400));
    expect(invalid.status).toBe(400);
    expect((await body(invalid)).error.code).toBe("validation");

    const missing = adminErrorResponse(new PackAdminError("not_found", "Paket bulunamadı.", 404));
    expect(missing.status).toBe(404);
    expect((await body(missing)).error.code).toBe("not_found");
  });

  it("maps role and user administration errors without exposing database details", async () => {
    const duplicate = adminErrorResponse(new RoleAdminError("conflict", "Rol anahtarı kullanılıyor.", 409));
    expect(duplicate.status).toBe(409);
    expect((await body(duplicate)).error.code).toBe("conflict");
    const missing = adminErrorResponse(new UserAdminError("not_found", "Kullanıcı bulunamadı.", 404));
    expect(missing.status).toBe(404);
    expect((await body(missing)).error.code).toBe("not_found");
  });

  it("preserves authorization status and code", async () => {
    const response = adminErrorResponse(new AuthorizationError("Missing permission: pack.manage"));
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe("forbidden");
  });

  it("never leaks internals from unexpected failures", async () => {
    const response = adminErrorResponse(new Error("postgresql://user:secret@internal/db"));
    expect(response.status).toBe(500);
    const parsed = await body(response);
    expect(parsed.error.code).toBe("internal_error");
    expect(parsed.error.message).not.toMatch(/secret|internal|postgresql/);
  });
});
