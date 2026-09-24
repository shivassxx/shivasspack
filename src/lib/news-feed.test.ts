import { describe, expect, it } from "vitest";
import { parseNewsFeed } from "./news-feed";

describe("AI news feed parsing", () => {
  it("reads RSS titles and descriptions without returning markup or repeated links", () => {
    const rss = `<rss version="2.0"><channel><title>News</title><item><title>First update</title><link>https://news.example/a#part</link><description><![CDATA[<p>Pack <strong>news</strong></p><script>bad()</script>]]></description></item><item><title>Repeated update</title><link>https://news.example/a</link></item><item><title>Bad link</title><link>javascript:alert(1)</link></item></channel></rss>`;
    expect(parseNewsFeed(rss, "https://news.example/feed")).toEqual([
      { title: "First update", url: "https://news.example/a", summary: "Pack news" },
    ]);
  });

  it("reads Atom alternate links and JSON Feed relative URLs", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Second update</title><link rel="alternate" href="/articles/2"/><summary>Quick note</summary></entry></feed>`;
    expect(parseNewsFeed(atom, "https://news.example/feed.xml")[0]).toEqual({
      title: "Second update", url: "https://news.example/articles/2", summary: "Quick note",
    });
    const json = JSON.stringify({ version: "https://jsonfeed.org/version/1.1", items: [
      { title: "Third update", url: "/articles/3", content_html: "<p>Update details</p>" },
    ] });
    expect(parseNewsFeed(json, "https://news.example/feed.json")[0]).toEqual({
      title: "Third update", url: "https://news.example/articles/3", summary: "Update details",
    });
  });

  it("rejects malformed or unsupported documents", () => {
    expect(() => parseNewsFeed("<rss><channel>", "https://news.example/feed")).toThrow();
    expect(() => parseNewsFeed("{}", "https://news.example/feed")).toThrow();
  });
});
