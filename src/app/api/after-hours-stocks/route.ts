import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STOCKS = [
  { code: "005930.KS", name: "삼성전자" },
  { code: "000660.KS", name: "SK하이닉스" },
  { code: "005380.KS", name: "현대차" },
  { code: "373220.KS", name: "LG에너지솔루션" },
  { code: "207940.KS", name: "삼성바이오로직스" },
  { code: "035420.KS", name: "NAVER" },
];

interface StockResult {
  code: string;
  name: string;
  regularPrice: number;
  extPrice: number | null;
  extChangePct: number | null;
  changePct: number;
  marketState: string;
}

let cache: { data: StockResult[]; at: number } | null = null;
const TTL = 5 * 60_000;

async function fetchStock(code: string): Promise<{
  regularPrice: number; extPrice: number | null;
  extChangePct: number | null; changePct: number; marketState: string;
} | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}?interval=1d&range=1d&includePrePost=true`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const regularPrice = meta.regularMarketPrice ?? 0;
    const prevClose    = meta.chartPreviousClose ?? meta.previousClose ?? regularPrice;
    const changePct    = prevClose ? ((regularPrice - prevClose) / prevClose) * 100 : 0;
    const extPrice     = meta.postMarketPrice ?? meta.preMarketPrice ?? null;
    const extChangePct = extPrice && regularPrice ? ((extPrice - regularPrice) / regularPrice) * 100 : null;

    return {
      regularPrice:  parseFloat(regularPrice.toFixed(0)),
      extPrice:      extPrice ? parseFloat(extPrice.toFixed(0)) : null,
      extChangePct:  extChangePct != null ? parseFloat(extChangePct.toFixed(2)) : null,
      changePct:     parseFloat(changePct.toFixed(2)),
      marketState:   meta.marketState ?? "CLOSED",
    };
  } catch { return null; }
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({ stocks: cache.data, cached: true });
  }

  const results = await Promise.all(
    STOCKS.map(async s => {
      const data = await fetchStock(s.code);
      return {
        code:         s.code,
        name:         s.name,
        regularPrice: data?.regularPrice  ?? 0,
        extPrice:     data?.extPrice      ?? null,
        extChangePct: data?.extChangePct  ?? null,
        changePct:    data?.changePct     ?? 0,
        marketState:  data?.marketState   ?? "CLOSED",
      } as StockResult;
    })
  );

  cache = { data: results, at: Date.now() };
  return NextResponse.json({ stocks: results, timestamp: new Date().toISOString() });
}
