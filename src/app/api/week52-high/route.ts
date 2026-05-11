import { NextResponse } from "next/server";
import { KOSPI_SYMBOLS, KOSDAQ_SYMBOLS, koreanName } from "@/lib/stockList";

export const dynamic = "force-dynamic";

interface Week52Result {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePct: number;
  week52High: number;
  distFromHigh: number; // (price - high52) / high52 * 100, 양수 = 신고가 돌파
  isNewHigh: boolean;
}

async function fetch52WeekData(symbol: string): Promise<Week52Result | null> {
  try {
    // 1년치 주봉 데이터 (52개 포인트, 빠르게 로드됨)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=1y`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const highs: number[] = result.indicators?.quote?.[0]?.high ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    if (!highs.length || !closes.length) return null;

    const currentPrice = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prevClose = meta.chartPreviousClose ?? closes[closes.length - 2];
    if (!currentPrice || !prevClose) return null;

    // 52주 고가: 지난 52주 중 최고값 (오늘 제외)
    const pastHighs = highs.slice(0, -1).filter((v) => v && v > 0);
    if (!pastHighs.length) return null;
    const week52High = Math.max(...pastHighs);

    const distFromHigh = ((currentPrice - week52High) / week52High) * 100;
    const changePct = ((currentPrice - prevClose) / prevClose) * 100;

    return {
      rank: 0,
      code: symbol.replace(/\.(KS|KQ)$/, ""),
      name: koreanName(symbol),
      price: Math.round(currentPrice),
      changePct: parseFloat(changePct.toFixed(2)),
      week52High: Math.round(week52High),
      distFromHigh: parseFloat(distFromHigh.toFixed(1)),
      isNewHigh: distFromHigh >= 0,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";
  const symbols = market === "KOSDAQ" ? KOSDAQ_SYMBOLS : KOSPI_SYMBOLS;

  try {
    const results = await Promise.all(symbols.map(fetch52WeekData));

    // 52주 신고가 돌파 or 근접(3% 이내) 종목
    const candidates = results
      .filter((r): r is Week52Result => r !== null && r.distFromHigh >= -3)
      .sort((a, b) => b.distFromHigh - a.distFromHigh)
      .slice(0, 10)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return NextResponse.json({ market, candidates, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
