import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

// 알읽남 네이버 블로그 최신 글 (RSS, 30분 보관)
const BLOG_ID = "alliknam";
const dec = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();

const load = unstable_cache(async () => {
  const r = await fetch(`https://rss.blog.naver.com/${BLOG_ID}.xml`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`blog rss ${r.status}`);
  const xml = await r.text();
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).slice(0, 20).map(m => {
    const b = m[1];
    const get = (t: string) => dec(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(b)?.[1] ?? "");
    const descRaw = get("description");
    const thumb = /<img[^>]+src=["']([^"']+)["']/i.exec(descRaw)?.[1] ?? null;
    const summary = descRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
    const date = Date.parse(get("pubDate"));
    return { title: get("title"), url: get("link").split("?")[0], summary, thumb, publishedAt: isNaN(date) ? null : new Date(date).toISOString() };
  }).filter(x => x.title && x.url);
}, ["blog-feed-v1"], { revalidate: 1800 });

export async function GET() {
  try { return NextResponse.json({ items: await load(), blog: `https://blog.naver.com/${BLOG_ID}` }); }
  catch (e) { return NextResponse.json({ items: [], blog: `https://blog.naver.com/${BLOG_ID}`, error: String(e).slice(0, 80) }); }
}
