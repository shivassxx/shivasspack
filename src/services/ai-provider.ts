export type Provider = "openai" | "anthropic" | "gemini";
export type DraftInput = { title: string; url: string; summary: string };
export type GeneratedDraft = { title: string; excerpt: string; content: string; confidence: number };

export class AiProviderError extends Error {
  constructor(message: string) { super(message); this.name = "AiProviderError"; }
}

function generatedText(provider: Provider, body: unknown): string {
  const value = body as Record<string, unknown>;
  if (provider === "openai") {
    const choices = value.choices as Array<{ message?: { content?: unknown } }> | undefined;
    if (typeof choices?.[0]?.message?.content === "string") return choices[0].message.content;
  } else if (provider === "anthropic") {
    const content = value.content as Array<{ type?: string; text?: unknown }> | undefined;
    const text = content?.filter((part) => part.type === "text").map((part) => part.text);
    if (text?.length && text.every((part) => typeof part === "string")) return text.join("");
  } else {
    const candidates = value.candidates as Array<{ content?: { parts?: Array<{ text?: unknown }> } }> | undefined;
    const parts = candidates?.[0]?.content?.parts?.map((part) => part.text);
    if (parts?.length && parts.every((part) => typeof part === "string")) return parts.join("");
  }
  throw new AiProviderError("Sağlayıcı geçerli metin döndürmedi.");
}

function validateDraft(text: string): GeneratedDraft {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new AiProviderError("Sağlayıcı geçerli JSON döndürmedi."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiProviderError("Taslak biçimi geçersiz.");
  const draft = value as Record<string, unknown>;
  const title = typeof draft.title === "string" ? draft.title.trim() : "";
  const excerpt = typeof draft.excerpt === "string" ? draft.excerpt.trim() : "";
  const content = typeof draft.content === "string" ? draft.content.trim() : "";
  const confidence = draft.confidence;
  if (title.length < 8 || title.length > 160 || excerpt.length < 20 || excerpt.length > 500 ||
      content.length < 50 || content.length > 50_000 || typeof confidence !== "number" ||
      !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new AiProviderError("Sağlayıcı taslağı içerik kurallarını karşılamıyor.");
  }
  return { title, excerpt, content, confidence };
}

export async function generateDraft(provider: Provider, model: string, apiKey: string,
  prompt: string, input: DraftInput, fetcher: typeof fetch = fetch): Promise<GeneratedDraft> {
  if (!apiKey || !model || !["openai", "anthropic", "gemini"].includes(provider)) {
    throw new AiProviderError("AI sağlayıcısı yapılandırılmamış.");
  }
  const system = `Write a factual Turkish news draft based only on the supplied headline and summary. Do not invent facts. Return ONLY a JSON object with title (8-160 characters), excerpt (20-500), content (50-50000) and confidence (number 0-1). This is a draft for human review. ${prompt}`;
  const user = JSON.stringify({ title: input.title, summary: input.summary, sourceUrl: input.url });
  const endpoint = provider === "openai" ? "https://api.openai.com/v1/chat/completions" :
    provider === "anthropic" ? "https://api.anthropic.com/v1/messages" :
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let body: unknown;
  if (provider === "openai") {
    headers.Authorization = `Bearer ${apiKey}`;
    body = { model, max_completion_tokens: 1800, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  } else if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = { model, max_tokens: 1800, system, messages: [{ role: "user", content: user }] };
  } else {
    headers["x-goog-api-key"] = apiKey;
    body = { systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1800 } };
  }
  let response: Response;
  try {
    response = await fetcher(endpoint, { method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000), redirect: "error" });
  } catch { throw new AiProviderError("AI sağlayıcısına ulaşılamadı."); }
  if (!response.ok) throw new AiProviderError(`AI sağlayıcısı HTTP ${response.status} döndürdü.`);
  const reader = response.body?.getReader();
  if (!reader) throw new AiProviderError("AI sağlayıcısı boş yanıt döndürdü.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 256 * 1024) throw new AiProviderError("AI yanıtı çok büyük.");
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError("AI yanıtı okunamadı.");
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let json: unknown;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new AiProviderError("AI sağlayıcısı geçerli yanıt döndürmedi."); }
  return validateDraft(generatedText(provider, json));
}
