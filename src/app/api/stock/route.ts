import { NextRequest, NextResponse } from "next/server";
import { naverRealtime } from "@/lib/krLive";

// Korean stock tickers use .KS suffix on Yahoo Finance
// e.g. 삼성전자 = 005930.KS
function toYahooTicker(ticker: string): string {
  // Already has suffix
  if (ticker.includes(".")) return ticker;
  // 6-digit Korean stock code
  if (/^[0-9][0-9A-Z]{5}$/.test(ticker)) return `${ticker}.KS`;
  // US ticker
  return ticker.toUpperCase();
}

async function fetchStockQuote(rawTicker: string) {
  const symbol = toYahooTicker(rawTicker);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    next: { revalidate: 30 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  const price = meta.regularMarketPrice;
  // 전일 종가: range=5d 의 chartPreviousClose 는 '5일 전' 종가라 틀린다 → 일봉으로 직접 (마지막 봉이 오늘이면 그 앞 봉)
  const ts: number[] = result.timestamp ?? [];
  const cl: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const bars = ts.map((t, i) => ({ t, c: cl[i] })).filter(b => b.c != null) as { t: number; c: number }[];
  const day = (t: number) => new Date((t + (meta.gmtoffset ?? 0)) * 1000).toISOString().slice(0, 10);
  const lastIsToday = meta.regularMarketTime && bars.length ? day(bars[bars.length - 1].t) === day(meta.regularMarketTime) : true;
  const prevBar = lastIsToday ? bars[bars.length - 2] : bars[bars.length - 1];
  const prevClose = prevBar?.c ?? meta.previousClose ?? meta.chartPreviousClose;
  const change = price - prevClose;
  const changePct = (change / prevClose) * 100;

  return {
    ticker: rawTicker,
    yahooTicker: symbol,
    name: meta.longName ?? meta.shortName ?? rawTicker,
    currency: meta.currency,
    price: parseFloat(price.toFixed(2)),
    prevClose: parseFloat(prevClose.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePct: parseFloat(changePct.toFixed(2)),
    marketState: meta.marketState,
    volume: meta.regularMarketVolume,
    marketCap: meta.marketCap,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
  };
}

// GET /api/stock?tickers=005930,000660,AAPL
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawTickers = searchParams.get("tickers") ?? "";

  if (!rawTickers) {
    return NextResponse.json({ error: "tickers 파라미터가 필요합니다" }, { status: 400 });
  }

  const tickerList = rawTickers.split(",").map((t) => t.trim()).filter(Boolean);

  try {
    const results = await Promise.all(tickerList.map(fetchStockQuote));
    const data: Record<string, ReturnType<typeof fetchStockQuote> extends Promise<infer T> ? T : never> = {};
    tickerList.forEach((ticker, i) => {
      if (results[i]) data[ticker] = results[i] as NonNullable<typeof results[typeof i]>;
    });
    // 국내 종목은 네이버 실시간 시세로 덮어쓴다 (Yahoo 국내 시세는 지연)
    const kr = tickerList.map(t => [t, t.split(".")[0]] as const).filter(([t, c]) => /^[0-9][0-9A-Z]{5}$/.test(c) && (!t.includes(".") || /\.(KS|KQ)$/i.test(t)));
    if (kr.length) {
      const live = await naverRealtime(kr.map(([, c]) => c)).catch(() => ({} as Awaited<ReturnType<typeof naverRealtime>>));
      for (const [t, c] of kr) {
        const l = live[c], d = data[t];
        if (!l) continue;
        const prev = l.price - l.change;
        data[t] = { ...(d ?? { ticker: t, yahooTicker: t, name: t, currency: "KRW", marketState: "", volume: 0, marketCap: undefined, fiftyTwoWeekHigh: undefined, fiftyTwoWeekLow: undefined }),
          price: l.price, prevClose: prev, change: l.change, changePct: l.changePct, volume: l.volume } as typeof data[string];
      }
    }
    return NextResponse.json({ data, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "종목 데이터 조회 실패" }, { status: 500 });
  }
}
