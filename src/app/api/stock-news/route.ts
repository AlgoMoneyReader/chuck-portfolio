import { NextResponse } from "next/server";
import { isOfftopic } from "@/lib/newsFilter";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}

export async function GET(request: Request) {
  const name = (new URL(request.url).searchParams.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ items: [] });

  try {
    const q = encodeURIComponent(`"${name}" when:7d`);
    const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).slice(0, 30).map(m => {
      const b = m[1];
      const rawTitle = decode(/<title>([\s\S]*?)<\/title>/.exec(b)?.[1] ?? "");
      const source = decode(/<source[^>]*>([\s\S]*?)<\/source>/.exec(b)?.[1] ?? "");
      const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
      const date = Date.parse(decode(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(b)?.[1] ?? ""));
      return {
        title,
        url: decode(/<link>([\s\S]*?)<\/link>/.exec(b)?.[1] ?? ""),
        source,
        publishedAt: isNaN(date) ? null : new Date(date).toISOString(),
      };
    }).filter(i => i.title && i.url && !isOfftopic(i.title));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: String(e) });
  }
}
