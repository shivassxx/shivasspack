import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("coarse session guard", () => {
  it("rejects cross-origin mutations before route handlers", () => {
    const response = proxy(new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "https://external.example" },
    }));
    expect(response.status).toBe(403);
  });

  it("allows same-origin mutations", () => {
    const response = proxy(new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost" },
    }));
    expect(response.status).toBe(200);
  });

  it("uses the browser-facing host when Next normalizes the URL", () => {
    const response = proxy(new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    }));
    expect(response.status).toBe(200);
  });
  it("leaves login accessible with an expired or forged cookie", () => {
    const response = proxy(new NextRequest("http://localhost/login?next=/settings", {
      headers: { cookie: "shivass_session=invalid" },
    }));
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects anonymous settings requests with a local return path", () => {
    const response = proxy(new NextRequest("http://localhost/settings/profile"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/settings/profile");
  });
});
