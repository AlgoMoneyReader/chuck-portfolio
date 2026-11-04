import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { nasdaqQuotes, US_TICKERS } from "@/lib/usCaps";

export const dynamic = "force-dynamic";

const TICKERS = US_TICKERS;
const INDEXES = ["SPY", "QQQ", "DIA", "SOXX"] as const;

interface Quote { pct: number; cap: number; price: number }



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
