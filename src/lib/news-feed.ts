import { XMLParser, XMLValidator } from "fast-xml-parser";

export type FeedItem = { title: string; url: string; summary: string };

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const fields = value as Record<string, unknown>;
    return text(fields["#text"] ?? fields["#cdata"] ?? "");
  }
  return "";
}

function clean(value: unknown, max: number): string {
  return text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function array(value: unknown): unknown[] {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function link(value: unknown): string {
  if (Array.isArray(value)) return link(value.find((entry) => entry && typeof entry === "object" &&
    (entry as Record<string, unknown>)["@_rel"] === "alternate") ?? value[0]);
  if (value && typeof value === "object") return text((value as Record<string, unknown>)["@_href"]);
  return text(value);
}

export function parseNewsFeed(body: string, baseUrl: string): FeedItem[] {
  let entries: unknown[];
  let kind: "json" | "rss" | "atom";
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    const feed: unknown = JSON.parse(trimmed);
    if (!feed || typeof feed !== "object" || !Array.isArray((feed as Record<string, unknown>).items)) {
      throw new Error("Invalid JSON feed.");
    }
    entries = (feed as { items: unknown[] }).items;
    kind = "json";
  } else {
    if (XMLValidator.validate(trimmed) !== true) throw new Error("Invalid XML feed.");
    const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_",
      processEntities: false, cdataPropName: "#cdata" }).parse(trimmed) as Record<string, unknown>;
    const channel = (doc.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
    const atom = doc.feed as Record<string, unknown> | undefined;
    if (channel) { entries = array(channel.item); kind = "rss"; }
    else if (atom) { entries = array(atom.entry); kind = "atom"; }
    else throw new Error("Unsupported feed format.");
  }
  const seen = new Set<string>();
  const results: FeedItem[] = [];
  for (const value of entries.slice(0, 50)) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const title = clean(item.title, 200);
    const address = kind === "json" ? text(item.url ?? item.external_url) : link(item.link);
    if (!title || !address) continue;
    let url: URL;
    try { url = new URL(address, baseUrl); } catch { continue; }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const summary = clean(kind === "json" ? item.summary ?? item.content_text ?? item.content_html :
      kind === "rss" ? item.description ?? item["content:encoded"] : item.summary ?? item.content, 500);
    results.push({ title, url: url.href, summary });
    if (results.length >= 10) break;
  }
  return results;
}
