import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "@/db/client";
import { checkDatabase } from "@/services/health";
import { GET } from "./route";

vi.mock("@/db/client", () => ({ getDatabase: vi.fn() }));
vi.mock("@/services/health", () => ({ checkDatabase: vi.fn() }));

describe("health HTTP contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("liveness does not open a DB connection", async () => {
    const response = await GET(new Request("http://localhost/api/health?mode=live"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(getDatabase).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("readiness returns 200 only after the DB check succeeds", async () => {
    vi.mocked(getDatabase).mockReturnValue({ db: {} } as ReturnType<typeof getDatabase>);
    vi.mocked(checkDatabase).mockResolvedValue(true);
    const response = await GET(new Request("http://localhost/api/health"));
    expect(checkDatabase).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "up" });
  });

  it("returns 503 when the database cannot be queried", async () => {
    vi.mocked(getDatabase).mockReturnValue({ db: {} } as ReturnType<typeof getDatabase>);
    vi.mocked(checkDatabase).mockResolvedValue(false);
    const response = await GET(new Request("http://localhost/api/health?mode=ready"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable", database: "down" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not leak credentials or configuration failures", async () => {
    vi.mocked(getDatabase).mockImplementation(() => {
      throw new Error("postgresql://admin:private-secret@internal/db");
    });
    const response = await GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private-secret|admin|internal|postgresql/);
  });

  it("rejects unknown health modes without checking the DB", async () => {
    const response = await GET(new Request("http://localhost/api/health?mode=debug"));
    expect(response.status).toBe(400);
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
