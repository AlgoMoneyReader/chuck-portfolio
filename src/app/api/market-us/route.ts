import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── DOW 30 tickers & display names ────────────────────────────────────────────
const DOW30: Record<string, string> = {
  AAPL: "Apple",           AMGN: "Amgen",            AXP:  "American Express",
  BA:   "Boeing",          CAT:  "Caterpillar",       CRM:  "Salesforce",
  CSCO: "Cisco",           CVX:  "Chevron",           DIS:  "Disney",
  DOW:  "Dow Inc.",        GS:   "Goldman Sachs",     HD:   "Home Depot",
  HON:  "Honeywell",       IBM:  "IBM",               JNJ:  "J&J",
  JPM:  "JPMorgan",        KO:   "Coca-Cola",         MCD:  "McDonald's",
  MMM:  "3M",              MRK:  "Merck",             MSFT: "Microsoft",
  NKE:  "Nike",            PG:   "P&G",               TRV:  "Travelers",
  UNH:  "UnitedHealth",    V:    "Visa",              VZ:   "Verizon",
  WMT:  "Walmart",         AMZN: "Amazon",            SHW:  "Sherwin-Williams",
};

// ── SPDR sector ETFs ──────────────────────────────────────────────────────────
const SECTOR_ETFS = [
  { symbol: "XLK",  name: "기술"       },
  { symbol: "XLC",  name: "통신"       },
  { symbol: "XLY",  name: "임의소비재" },
  { symbol: "XLF",  name: "금융"       },
  { symbol: "XLI",  name: "산업재"     },
  { symbol: "XLV",  name: "헬스케어"   },
  { symbol: "XLE",  name: "에너지"     },
  { symbol: "XLB",  name: "소재"       },
  { symbol: "XLP",  name: "필수소비재" },
  { symbol: "XLU",  name: "유틸리티"   },
  { symbol: "XLRE", name: "부동산"     },
];

type Quote = {
  rank: number; code: string; name: string;
  price: number; change: number; changePct: number; volume: number;
  marketState: string;
  preMarketPrice:    number | null;
  preMarketChangePct: number | null;
  postMarketPrice:   number | null;
  postMarketChangePct: number | null;
};

// ── 공통: Yahoo quote 객체 → Quote 변환 ──────────────────────────────────────
function parseYahooQuote(q: Record<string, unknown>, rank: number, nameOverride?: string): Quote {
  return {
    rank,
    code:      q.symbol as string,
    name:      (nameOverride ?? (q.shortName ?? q.longName ?? q.symbol) as string).slice(0, 30),
    price:     parseFloat(((q.regularMarketPrice as number) ?? 0).toFixed(2)),
    change:    parseFloat(((q.regularMarketChange as number) ?? 0).toFixed(2)),
    changePct: parseFloat(((q.regularMarketChangePercent as number) ?? 0).toFixed(2)),
    volume:    (q.regularMarketVolume as number) ?? 0,
    marketState: (q.marketState as string) ?? "CLOSED",
    preMarketPrice:      (q.preMarketPrice     as number | null | undefined) ?? null,
    preMarketChangePct:  (q.preMarketChangePercent  as number | null | undefined) ?? null,
    postMarketPrice:     (q.postMarketPrice    as number | null | undefined) ?? null,
    postMarketChangePct: (q.postMarketChangePercent as number | null | undefined) ?? null,
  };
}

// ── Yahoo v7/finance/quote (배치, pre/post 포함) ──────────────────────────────
async function fetchQuoteBatch(symbols: string[], nameMap?: Record<string, string>): Promise<Quote[]> {
  try {
    const joined = symbols.join(",");
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(joined)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,preMarketPrice,preMarketChange,preMarketChangePercent,postMarketPrice,postMarketChange,postMarketChangePercent,marketState,shortName`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const j = await res.json();
    const quotes = (j?.quoteResponse?.result ?? []) as Record<string, unknown>[];
    return quotes.map((q, i) =>
      parseYahooQuote(q, i + 1, nameMap?.[q.symbol as string])
    );
  } catch { return []; }
}

// ── Yahoo predefined screener (S&P500) — pre/post 포함 ───────────────────────
async function fetchScreener(scrId: string, count = 10): Promise<Quote[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=${scrId}&count=${count}`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const j = await res.json();
    const quotes = (j?.finance?.result?.[0]?.quotes ?? []) as Record<string, unknown>[];
    return quotes.map((q, i) => parseYahooQuote(q, i + 1));
  } catch { return []; }
}

// ── Yahoo custom screener (NASDAQ) ────────────────────────────────────────────
async function fetchNasdaqScreener(type: "gainers" | "losers" | "actives", count = 10): Promise<Quote[]> {
  try {
    const sortField = type === "actives" ? "regularmarketvolume" : "percentchange";
    const sortType: "ASC" | "DESC" = type === "losers" ? "ASC" : "DESC";
    const body = {
      offset: 0, size: count,
      sortField, sortType,
      quoteType: "EQUITY",
      query: {
        operator: "AND",
        operands: [
          { operator: "GT", operands: ["intradaymarketcap", 500_000_000] },
          {
            operator: "or",
            operands: [
              { operator: "EQ", operands: ["exchange", "NMS"] },
              { operator: "EQ", operands: ["exchange", "NGM"] },
              { operator: "EQ", operands: ["exchange", "NCM"] },
            ],
          },
        ],
      },
      userId: "", userIdType: "guid",
    };
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/screener?formatted=false",
      {
        method: "POST",
        headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const j = await res.json();
    const quotes = (j?.finance?.result?.[0]?.quotes ?? []) as Record<string, unknown>[];
    if (!quotes.length) return [];
    return quotes.map((q, i) => parseYahooQuote(q, i + 1));
  } catch { return []; }
}

// ── Yahoo Spark (sector ETF 전용 — pre/post 불필요) ───────────────────────────
async function fetchSpark(symbols: string[]): Promise<{ code: string; changePct: number; price: number }[]> {
  try {
    const joined = symbols.map(encodeURIComponent).join(",");
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${joined}&range=1d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const j = await res.json();
    return ((j?.spark?.result ?? []) as Record<string, unknown>[]).flatMap(r => {
      const meta = ((r?.response as Record<string, unknown>[])?.[0]?.meta) as Record<string, number> | undefined;
      if (!meta) return [];
      const price = meta.regularMarketPrice ?? 0;
      const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price;
      const changePct = prev ? ((price - prev) / prev) * 100 : 0;
      return [{ code: r.symbol as string, price: parseFloat(price.toFixed(2)), changePct: parseFloat(changePct.toFixed(2)) }];
    });
  } catch { return []; }
}

// ── Route ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type  = searchParams.get("type")  ?? "gainers";   // gainers|losers|actives|sector
  const index = searchParams.get("index") ?? "SP500";      // SP500|NASDAQ|DOW

  const ts = new Date().toISOString();

  // ① 섹터 ETF (pre/post 불필요)
  if (type === "sector") {
    const syms   = SECTOR_ETFS.map(e => e.symbol);
    const sparks = await fetchSpark(syms);
    const sectors = SECTOR_ETFS.map(etf => {
      const q = sparks.find(r => r.code === etf.symbol);
      return { sector: etf.name, symbol: etf.symbol, changePct: q?.changePct ?? 0, price: q?.price ?? 0 };
    }).sort((a, b) => b.changePct - a.changePct);
    return NextResponse.json({ sectors, timestamp: ts }, { headers: { "Cache-Control": "no-store" } });
  }

  // ② DOW 30 — v7/finance/quote로 교체 (pre/post 포함)
  if (index === "DOW") {
    const tickers = Object.keys(DOW30);
    const quotes  = await fetchQuoteBatch(tickers, DOW30);
    const sorted  = quotes
      .sort((a, b) => {
        if (type === "gainers") return b.changePct - a.changePct;
        if (type === "losers")  return a.changePct - b.changePct;
        return b.volume - a.volume;
      })
      .slice(0, 10)
      .map((q, i) => ({ ...q, rank: i + 1 }));
    return NextResponse.json({ stocks: sorted, timestamp: ts }, { headers: { "Cache-Control": "no-store" } });
  }

  // ③ NASDAQ — custom screener, fallback to S&P500
  if (index === "NASDAQ") {
    const stocks = await fetchNasdaqScreener(type as "gainers" | "losers" | "actives", 10);
    if (stocks.length > 0)
      return NextResponse.json({ stocks, timestamp: ts }, { headers: { "Cache-Control": "no-store" } });
  }

  // ④ S&P500 (or NASDAQ fallback)
  const scrId =
    type === "gainers" ? "day_gainers" :
    type === "losers"  ? "day_losers"  : "most_actives";
  const stocks = await fetchScreener(scrId, 10);
  return NextResponse.json({ stocks, timestamp: ts }, { headers: { "Cache-Control": "no-store" } });
}
