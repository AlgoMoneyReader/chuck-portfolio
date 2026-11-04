import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import universe from "@/data/us_universe.json";

export const dynamic = "force-dynamic";

type Info = { n: string; sec: string; ind: string; idx: string[] };
const TICKERS = (universe as { tickers: Record<string, Info> }).tickers;
const INDEXES = ["SPY", "QQQ", "DIA", "SOXX"] as const;
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

interface Quote { pct: number; cap: number; price: number }

// 나스닥 전 종목 스크리너: 시가총액(칸 크기)용. 등락률은 장 마감 후에도 한동안 전날 값이 남아 있어 쓰지 않는다(6시간 캐시)
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
}, ["us-heatmap-nasdaq-v1"], { revalidate: 6 * 3600 });

// 등락률: Yahoo spark (직전/현재 세션 기준, 시장 동향 목록과 같은 출처). 지수별 60초 공유 캐시
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

const yahooCached = unstable_cache(async (index: string, symbols: string[]) => yahooQuotes(symbols), ["us-heatmap-yahoo-v1"], { revalidate: 60 });

export async function GET(request: Request) {
  const index = (new URL(request.url).searchParams.get("index") ?? "SPY").toUpperCase();
  if (!INDEXES.includes(index as typeof INDEXES[number])) return NextResponse.json({ error: "index" }, { status: 400 });

  const members = Object.entries(TICKERS).filter(([, v]) => v.idx.includes(index));
  const syms = members.map(([s]) => s);
  const [yq, nq] = await Promise.all([
    yahooCached(index, syms).catch(() => ({} as Record<string, Quote>)),
    nasdaqQuotes().catch(() => null),
  ]);
  // 등락률·가격은 Yahoo(최신), 칸 크기는 Nasdaq 시가총액. Yahoo 에 없는 종목만 Nasdaq 값으로
  const quotes: Record<string, Quote> = {};
  for (const s of syms) {
    const y = yq[s], n = nq?.[s];
    if (y) quotes[s] = { pct: y.pct, price: y.price, cap: n?.cap || 1 };
    else if (n) quotes[s] = n;
  }
  const source = `등락률 Yahoo · 칸 크기 ${nq ? "Nasdaq 시가총액" : "동일(시가총액 정보 없음)"}`;

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
