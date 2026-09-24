import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { parseNewsFeed } from "@/lib/news-feed";
import { AiSourceError } from "@/services/ai-sources";
import { assertActive, requirePermission, type Actor } from "@/services/rbac";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4");
blocked.addSubnet("::", 128, "ipv6");
blocked.addSubnet("::1", 128, "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");

async function defaultAddresses(host: string): Promise<string[]> {
  const results = await lookup(host, { all: true });
  return results.map((item) => item.address);
}

export async function previewAiSource(db: Database, actor: Actor, id: string,
  fetcher: typeof fetch = fetch, addresses: (host: string) => Promise<string[]> = defaultAddresses) {
  assertActive(actor);
  requirePermission(actor, "ai.manage");
  const [source] = await db.select({ url: s.aiSources.url, isDemo: s.aiSources.isDemo })
    .from(s.aiSources).where(eq(s.aiSources.id, id)).limit(1);
  if (!source || source.isDemo) throw new AiSourceError("not_found", "Kaynak bulunamadı.", 404);
  const url = new URL(source.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.hostname.toLowerCase() === "localhost" || url.hostname.toLowerCase().endsWith(".localhost")) {
    throw new AiSourceError("validation", "Kaynak adresi uygun değil.", 400);
  }
  try {
    const resolved = await addresses(url.hostname);
    if (!resolved.length || resolved.some((address) => address.toLowerCase().startsWith("::ffff:") ||
      blocked.check(address, address.includes(":") ? "ipv6" : "ipv4"))) {
      throw new AiSourceError("validation", "Özel ağdaki kaynaklar önizlenemez.", 400);
    }
  } catch (error) {
    if (error instanceof AiSourceError) throw error;
    throw new AiSourceError("validation", "Kaynak adresi çözümlenemedi.", 400);
  }
  let response: Response;
  try {
    response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/rss+xml, application/atom+xml, application/feed+json, application/xml, application/json" } });
  } catch { throw new AiSourceError("validation", "Kaynak alınamadı.", 422); }
  if (!response.ok) throw new AiSourceError("validation", "Kaynak yanıtı başarılı değil.", 422);
  const reader = response.body?.getReader();
  if (!reader) throw new AiSourceError("validation", "Kaynak boş.", 422);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 512 * 1024) throw new AiSourceError("validation", "Kaynak çok büyük.", 422);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return { items: parseNewsFeed(new TextDecoder().decode(bytes), url.href) }; }
  catch { throw new AiSourceError("validation", "Kaynak RSS, Atom veya JSON Feed değil.", 422); }
}
