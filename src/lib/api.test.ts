import { describe, expect, it } from "vitest";
import { MAX_SUBMISSION_BODY_BYTES, readJsonBody } from "./api";

describe("submission JSON body budget", () => {
  it("accepts a valid 50,000-character description only on submission routes", async () => {
    const payload = JSON.stringify({ description: "x".repeat(50_000) });
    expect(await readJsonBody(new Request("http://localhost/api", { method: "POST", body: payload }))).toBeNull();
    const parsed = await readJsonBody<{ description: string }>(
      new Request("http://localhost/api", { method: "POST", body: payload }), MAX_SUBMISSION_BODY_BYTES);
    expect(parsed?.description?.length).toBe(50_000);
  });

  it("enforces the byte limit for multibyte text without content-length", async () => {
    const payload = JSON.stringify({ description: "😃".repeat(80_000) });
    const request = new Request("http://localhost/api", { method: "POST", body: payload });
    request.headers.delete("content-length");
    expect(await readJsonBody(request, MAX_SUBMISSION_BODY_BYTES)).toBeNull();
  });
});
