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

// 거래대금 순위 대상: 주요 대형주 + 당일 거래량 상위(실적 등으로 갑자기 몰린 종목 포착)
const NASDAQ_LARGE = [
  "NVDA","AAPL","MSFT","AMZN","META","GOOGL","TSLA","AVGO","AMD","NFLX","COST","PLTR","MU","INTC","QCOM","ADBE",
  "CSCO","PEP","TXN","AMAT","LRCX","KLAC","ASML","ARM","MRVL","PANW","CRWD","SNPS","CDNS","INTU","ISRG","BKNG",
  "SBUX","GILD","AMGN","VRTX","PYPL","ABNB","MELI","COIN","MSTR","SMCI","HOOD","SOFI","DDOG","ZS","APP","AXON",
  "TTD","ON","CEG","FTNT","OKTA","ADI","NXPI","WDC","STX",
];
const NYSE_LARGE = [
  "JPM","V","MA","LLY","UNH","XOM","WMT","BRK-B","ORCL","JNJ","PG","HD","BAC","KO","CVX","ABBV","CRM","MRK","DIS",
  "BA","GE","CAT","IBM","NKE","UBER","SHOP","SNOW","TSM","BABA","GS","MS","C","WFC","PFE","T","VZ","NOW","ANET",
  "DELL","VST","GEV","RTX","LMT","MCD","AXP","SPOT","NET","PLD",
];
const NASDAQ_EXCH = new Set(["NMS", "NGM", "NCM"]);

type Quote = {
  rank: number; code: string; name: string;
  price: number; change: number; changePct: number; volume: number;
  dollarVolume?: number;
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

// ── Spark 로 가격·거래량 (인증 불필요). 20개씩 나눠 호출 ─────────────────────────
async function fetchSparkQuotes(symbols: string[]): Promise<Quote[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  const out = await Promise.all(chunks.map(async chunk => {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${chunk.map(encodeURIComponent).join(",")}&range=1d&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" }
      );
      if (!res.ok) return [];
      const j = await res.json();
      return ((j?.spark?.result ?? []) as Record<string, unknown>[]).flatMap(r => {
        const meta = ((r?.response as Record<string, unknown>[])?.[0]?.meta) as Record<string, unknown> | undefined;
        if (!meta) return [];
        const price = (meta.regularMarketPrice as number) ?? 0;
        const prev = (meta.chartPreviousClose as number) ?? (meta.previousClose as number) ?? price;
        const volume = (meta.regularMarketVolume as number) ?? 0;
        if (!price || !volume) return [];
        return [{
          rank: 0, code: r.symbol as string,
          name: ((meta.shortName ?? meta.longName ?? r.symbol) as string).slice(0, 30),
          price: parseFloat(price.toFixed(2)),
          change: parseFloat((price - prev).toFixed(2)),
          changePct: prev ? parseFloat((((price - prev) / prev) * 100).toFixed(2)) : 0,
          volume, dollarVolume: price * volume,
          marketState: "REGULAR",
          preMarketPrice: null, preMarketChangePct: null, postMarketPrice: null, postMarketChangePct: null,
        } as Quote];
      });
    } catch { return []; }
  }));
  return out.flat();
}

// 당일 거래량 상위(주식 수) — 거래대금 후보 보강용. 거래소·종류 포함
async function fetchMostActivesRaw(count = 50): Promise<{ symbol: string; exchange: string; quoteType: string }[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=most_actives&count=${count}`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const j = await res.json();
    return ((j?.finance?.result?.[0]?.quotes ?? []) as Record<string, string>[])
      .map(q => ({ symbol: q.symbol, exchange: q.exchange ?? "", quoteType: q.quoteType ?? "" }));
  } catch { return []; }
}

async function topByDollarVolume(index: string): Promise<Quote[]> {
  let universe: string[];
  if (index === "DOW") universe = Object.keys(DOW30);
  else {
    const extra = (await fetchMostActivesRaw(50))
      .filter(q => q.quoteType === "EQUITY" && (index !== "NASDAQ" || NASDAQ_EXCH.has(q.exchange)))
      .map(q => q.symbol);
    universe = Array.from(new Set([...(index === "NASDAQ" ? NASDAQ_LARGE : [...NASDAQ_LARGE, ...NYSE_LARGE]), ...extra]));
  }
  const quotes = await fetchSparkQuotes(universe);
  return quotes
    .map(q => (index === "DOW" ? { ...q, name: DOW30[q.code] ?? q.name } : q))
    .sort((a, b) => (b.dollarVolume ?? 0) - (a.dollarVolume ?? 0))
    .slice(0, 10)
    .map((q, i) => ({ ...q, rank: i + 1 }));
}

// ── Route ──────────────────────────────────────────────────────────────────────
// ── 프리·애프터마켓: v7/quote 가 인증(crumb)을 요구해 비는 경우가 많아 차트 API(includePrePost)로 채운다 ──
type TP = { start: number; end: number };
async function extendedOne(q: Quote): Promise<Quote> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(q.code)}?interval=5m&range=2d&includePrePost=true`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return q;
    const r = (await res.json())?.chart?.result?.[0];
    const m = r?.meta;
    const ts: number[] = r?.timestamp ?? [];
    const cl: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    const per = m?.currentTradingPeriod as { pre: TP; regular: TP; post: TP } | undefined;
    if (!m || !per || !ts.length) return q;
    const now = Date.now() / 1000;
    const state = now >= per.pre.start && now < per.pre.end ? "PRE"
      : now >= per.regular.start && now < per.regular.end ? "REGULAR"
      : now >= per.post.start && now < per.post.end ? "POST" : "CLOSED";
    // 마지막 체결가와 시각
    let lastI = -1;
    for (let i = ts.length - 1; i >= 0; i--) if (cl[i] != null) { lastI = i; break; }
    if (lastI < 0) return { ...q, marketState: state };
    const lastT = ts[lastI], last = cl[lastI] as number;
    const reg = (m.regularMarketPrice as number) ?? q.price;
    const pct = (v: number) => parseFloat((((v - reg) / reg) * 100).toFixed(2));
    const out: Quote = { ...q, marketState: state };
    if (lastT >= per.pre.start && lastT < per.regular.start) {          // 오늘 프리마켓 체결
      out.preMarketPrice = parseFloat(last.toFixed(2)); out.preMarketChangePct = pct(last);
    } else if (lastT >= per.regular.end || (lastT < per.pre.start && lastT >= per.regular.end - 86400)) { // 애프터마켓 체결
      out.postMarketPrice = parseFloat(last.toFixed(2)); out.postMarketChangePct = pct(last);
    }
    return out;
  } catch { return q; }
}
async function withExtended(list: Quote[]): Promise<Quote[]> {
  return Promise.all(list.map(q => (q.preMarketPrice != null || q.postMarketPrice != null ? q : extendedOne(q))));
}

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

  // ② 거래대금(가격×거래량) 순위
  if (type === "actives") {
    const stocks = await withExtended(await topByDollarVolume(index));
    return NextResponse.json({ stocks, timestamp: ts, basis: "dollarVolume" }, { headers: { "Cache-Control": "no-store" } });
  }

  // ③ DOW 30 — v7/finance/quote로 교체 (pre/post 포함)
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
    return NextResponse.json({ stocks: await withExtended(sorted), timestamp: ts }, { headers: { "Cache-Control": "no-store" } });
  }

  // ③ NASDAQ — custom screener, fallback to S&P500
  if (index === "NASDAQ") {
    const stocks = await fetchNasdaqScreener(type as "gainers" | "losers" | "actives", 10);
    if (stocks.length > 0)
      return NextResponse.json({ stocks: await withExtended(stocks), timestamp: ts }, { headers: { "Cache-Control": "no-store" } });
  }

  // ④ S&P500 (or NASDAQ fallback)
  const scrId =
    type === "gainers" ? "day_gainers" :
    type === "losers"  ? "day_losers"  : "most_actives";
  const stocks = await withExtended(await fetchScreener(scrId, 10));
  return NextResponse.json({ stocks, timestamp: ts }, { headers: { "Cache-Control": "no-store" } });
}
