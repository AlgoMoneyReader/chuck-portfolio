import { NextRequest, NextResponse } from "next/server";

// Korean stock tickers use .KS suffix on Yahoo Finance
// e.g. 삼성전자 = 005930.KS
function toYahooTicker(ticker: string): string {
  // Already has suffix
  if (ticker.includes(".")) return ticker;
  // 6-digit Korean stock code
  if (/^\d{6}$/.test(ticker)) return `${ticker}.KS`;
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
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
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
    return NextResponse.json({ data, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "종목 데이터 조회 실패" }, { status: 500 });
  }
}
