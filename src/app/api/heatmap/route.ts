import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import universe from "@/data/us_universe.json";

export const dynamic = "force-dynamic";

type Info = { n: string; sec: string; ind: string; idx: string[] };
const TICKERS = (universe as { tickers: Record<string, Info> }).tickers;
const INDEXES = ["SPY", "QQQ", "DIA", "SOXX"] as const;
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

interface Quote { pct: number; cap: number; price: number }

// 1순위: 나스닥 공식 사이트 전 종목 시세(등락률·시가총액). 유니버스 종목만 남겨 3분 공유 캐시
const nasdaqQuotes = unstable_cache(async (): Promise<Record<string, Quote>> => {
  const res = await fetch("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`nasdaq HTTP ${res.status}`);
  const j = await res.json();
  const rows = (j?.data?.rows ?? []) as Record<string, string>[];
  const want = new Map(Object.keys(TICKERS).map(s => [norm(s), s]));
  const out: Record<string, Quote> = {};
  for (const r of rows) {
    const sym = want.get(norm(r.symbol ?? ""));
    if (!sym) continue;
    const pct = parseFloat(String(r.pctchange ?? "").replace(/[%,]/g, ""));
    const cap = parseFloat(String(r.marketCap ?? "").replace(/[$,]/g, ""));
    const price = parseFloat(String(r.lastsale ?? "").replace(/[$,]/g, ""));
    if (!isNaN(pct)) out[sym] = { pct, cap: isNaN(cap) ? 0 : cap, price: isNaN(price) ? 0 : price };
  }
  if (Object.keys(out).length < 100) throw new Error(`nasdaq rows ${rows.length}, matched ${Object.keys(out).length}`);
  return out;
}, ["us-heatmap-nasdaq-v1"], { revalidate: 180 });

// 2순위: Yahoo spark 로 등락률만 (시가총액 없음 → 같은 크기)
async function yahooQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  await Promise.all(chunks.map(async c => {
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${c.map(encodeURIComponent).join(",")}&range=1d&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const j = await res.json();
      for (const r of (j?.spark?.result ?? []) as Record<string, unknown>[]) {
        const m = ((r.response as Record<string, unknown>[])?.[0]?.meta ?? {}) as Record<string, number>;
        const p = m.regularMarketPrice, prev = m.chartPreviousClose ?? m.previousClose;
        if (p && prev) out[r.symbol as string] = { pct: ((p - prev) / prev) * 100, cap: 1, price: p };
      }
    } catch { /* 건너뜀 */ }
  }));
  return out;
}

export async function GET(request: Request) {
  const index = (new URL(request.url).searchParams.get("index") ?? "SPY").toUpperCase();
  if (!INDEXES.includes(index as typeof INDEXES[number])) return NextResponse.json({ error: "index" }, { status: 400 });

  const members = Object.entries(TICKERS).filter(([, v]) => v.idx.includes(index));
  let quotes: Record<string, Quote> = {};
  let source = "Nasdaq.com (시가총액 가중)";
  try {
    quotes = await nasdaqQuotes();
  } catch (e) {
    quotes = await yahooQuotes(members.map(([s]) => s));
    source = `Yahoo (시가총액 정보 없음, 같은 크기) · nasdaq 실패: ${String(e).slice(0, 60)}`;
  }

  const items = members
    .map(([s, v]) => {
      const q = quotes[s];
      return q ? { s, n: v.n, sec: v.sec, ind: v.ind, cap: q.cap || 1, pct: parseFloat(q.pct.toFixed(2)), price: q.price } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // GOOGL·GOOG 처럼 같은 회사 두 종류는 히트맵에서 하나만
  const dedup = items.filter(i => !(i.s === "GOOG" && items.some(j => j.s === "GOOGL")));

  const up = dedup.filter(i => i.pct > 0).length, down = dedup.filter(i => i.pct < 0).length;
  return NextResponse.json({
    index, source, asOf: new Date().toISOString(),
    total: members.length, items: dedup,
    breadth: { up, down, flat: dedup.length - up - down },
  }, { headers: { "Cache-Control": "no-store" } });
}
