import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// SPDR ETF symbol → Yahoo Finance sector name
const ETF_TO_SECTOR: Record<string, string> = {
  XLK:  "Technology",
  XLC:  "Communication Services",
  XLY:  "Consumer Cyclical",
  XLF:  "Financial Services",
  XLI:  "Industrials",
  XLV:  "Healthcare",
  XLE:  "Energy",
  XLB:  "Basic Materials",
  XLP:  "Consumer Defensive",
  XLU:  "Utilities",
  XLRE: "Real Estate",
};

export interface USSectorStock {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  marketCap: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const etf = (searchParams.get("etf") ?? "").toUpperCase();

  const sector = ETF_TO_SECTOR[etf];
  if (!sector) {
    return NextResponse.json({ error: "Unknown ETF", etf }, { status: 400 });
  }

  try {
    // Yahoo Finance screener: top market-cap stocks in the given sector
    const body = {
      offset: 0,
      size: 10,
      sortField: "intradaymarketcap",
      sortType: "DESC",
      quoteType: "EQUITY",
      query: {
        operator: "AND",
        operands: [
          { operator: "EQ", operands: ["sector", sector] },
          { operator: "EQ", operands: ["region", "us"] },
          { operator: "GT", operands: ["intradaymarketcap", 1_000_000_000] },
        ],
      },
      userId: "",
      userIdType: "guid",
    };

    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/screener?formatted=false",
      {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Screener fetch failed", status: res.status }, { status: 502 });
    }

    const j = await res.json();
    const quotes = (j?.finance?.result?.[0]?.quotes ?? []) as Record<string, unknown>[];

    if (!quotes.length) {
      return NextResponse.json({ stocks: [], etf, sector, timestamp: new Date().toISOString() });
    }

    const stocks: USSectorStock[] = quotes.map((q, i) => ({
      rank:      i + 1,
      code:      q.symbol as string,
      name:      ((q.shortName ?? q.longName ?? q.symbol) as string).slice(0, 35),
      price:     parseFloat(((q.regularMarketPrice as number) ?? 0).toFixed(2)),
      changePct: parseFloat(((q.regularMarketChangePercent as number) ?? 0).toFixed(2)),
      volume:    (q.regularMarketVolume as number) ?? 0,
      marketCap: (q.marketCap as number) ?? 0,
    }));

    return NextResponse.json(
      { stocks, etf, sector, timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
