import { describe, expect, it, vi } from "vitest";
import { generateDraft } from "./ai-provider";

const input = { title: "Source headline", summary: "A summary of the source news.", url: "https://example.org/story" };
const draft = { title: "Habere ilişkin uzun başlık", excerpt: "Kaynağa dayalı en az yirmi karakterlik özet.",
  content: "Bu taslak yalnızca kaynak metnine dayanan en az elli karakter uzunluğundaki bir haber içeriğidir.", confidence: 0.8 };

describe("AI provider adapters", () => {
  it.each(["openai", "anthropic", "gemini"] as const)("extracts a validated %s draft without leaking the API key into the prompt", async (provider) => {
    const content = JSON.stringify(draft);
    const payload = provider === "openai" ? { choices: [{ message: { content } }] } :
      provider === "anthropic" ? { content: [{ type: "text", text: content }] } :
        { candidates: [{ content: { parts: [{ text: content }] } }] };
    const fetcher = vi.fn(async () => Response.json(payload));
    expect(await generateDraft(provider, "example-model", "secret-key", "Editorial rule", input, fetcher as typeof fetch)).toEqual(draft);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(provider === "gemini" ? "generativelanguage" : provider === "openai" ? "openai" : "anthropic");
    expect(options.method).toBe("POST");
    expect(options.body).toContain("https://example.org/story");
    expect(options.body).not.toContain("secret-key");
  });

  it("rejects invalid drafts and provider failures", async () => {
    const bad = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ ...draft, confidence: 2 }) } }] });
    await expect(generateDraft("openai", "model", "key", "", input, bad as typeof fetch)).rejects.toThrow("içerik kurallarını");
    const failed = async () => new Response("unauthorized", { status: 401 });
    await expect(generateDraft("openai", "model", "key", "", input, failed as typeof fetch)).rejects.toThrow("HTTP 401");
  });
});
