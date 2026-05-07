import { NextResponse } from "next/server";

// Yahoo Finance tickers
const INDICES = {
  kospi: "^KS11",
  kosdaq: "^KQ11",
  sp500: "^GSPC",
  nasdaq: "^IXIC",
  usdKrw: "KRW=X",
};

async function fetchQuote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
    next: { revalidate: 60 }, // cache 60 seconds
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
    price: parseFloat(price.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePct: parseFloat(changePct.toFixed(2)),
    marketState: meta.marketState,
  };
}

export async function GET() {
  try {
    const [kospi, kosdaq, sp500, nasdaq, usdKrw] = await Promise.all([
      fetchQuote(INDICES.kospi),
      fetchQuote(INDICES.kosdaq),
      fetchQuote(INDICES.sp500),
      fetchQuote(INDICES.nasdaq),
      fetchQuote(INDICES.usdKrw),
    ]);

    return NextResponse.json({
      kospi,
      kosdaq,
      sp500,
      nasdaq,
      usdKrw: usdKrw ? { ...usdKrw, price: usdKrw.price } : null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "시장 데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
