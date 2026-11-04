import { NextResponse } from "next/server";
import { kisGet, num } from "@/lib/kis";

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

// ── 인기 ETF·레버리지 (국내 투자자 거래 많은 종목) ─────────────────────────────
const POPULAR_ETFS: Record<string, string> = {
  SOXL: "반도체 3배", SOXS: "반도체 -3배", TQQQ: "나스닥100 3배", SQQQ: "나스닥100 -3배", TSLL: "테슬라 2배",
  NVDL: "엔비디아 2배", NVDU: "엔비디아 2배(Direxion)", CONL: "코인베이스 2배", MSTU: "마이크로스트래티지 2배",
  AMDL: "AMD 2배", PLTU: "팔란티어 2배", TSLQ: "테슬라 -1배", QLD: "나스닥100 2배", SSO: "S&P500 2배",
  UPRO: "S&P500 3배", SPXL: "S&P500 3배(Direxion)", TECL: "기술주 3배", FNGU: "FANG+ 3배", TMF: "미국채20년 3배",
  LABU: "바이오 3배", YINN: "중국 3배", BITX: "비트코인 2배", ETHU: "이더리움 2배",
  QQQ: "나스닥100", SPY: "S&P500", VOO: "S&P500(뱅가드)", SCHD: "배당성장", JEPI: "커버드콜 S&P", JEPQ: "커버드콜 나스닥",
  TLT: "미국채20년", IBIT: "비트코인 현물", SMH: "반도체", SOXX: "반도체(iShares)", GLD: "금",
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
  dayMarketPrice?: number | null;
  dayMarketChangePct?: number | null;
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
    .slice(0, 30)
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
// ── 데이마켓(미국 주간거래, 한국 낮 시간): KIS 해외주식 현재가의 주간거래 거래소 코드(BAQ 나스닥·BAY 뉴욕·BAA 아멕스) ──
const dayExcd = new Map<string, string>(); // 종목 → 맞았던 거래소 코드
function inDaySession(): boolean {
  const k = new Date(Date.now() + 9 * 3_600_000);
  const wd = k.getUTCDay(), m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return wd >= 1 && wd <= 5 && m >= 9 * 60 && m <= 18 * 60;   // 서머타임에 따라 09~17시 / 10~18시
}
async function dayMarketOne(q: Quote): Promise<Quote> {
  const tries = dayExcd.get(q.code) ? [dayExcd.get(q.code)!] : ["BAQ", "BAY", "BAA"];
  for (const excd of tries) {
    try {
      const j = await kisGet("/uapi/overseas-price/v1/quotations/price", "HHDFS00000300", { AUTH: "", EXCD: excd, SYMB: q.code.replace("-", ".") });
      const o = j.output as Record<string, string> | undefined;
      const last = num(o?.last);
      if (!last) continue;
      dayExcd.set(q.code, excd);
      return { ...q, dayMarketPrice: last, dayMarketChangePct: parseFloat((((last - q.price) / q.price) * 100).toFixed(2)) };
    } catch { /* 다음 거래소 */ }
  }
  return q;
}
async function withDayMarket(list: Quote[]): Promise<Quote[]> {
  if (!inDaySession() || !process.env.KIS_APP_KEY) return list;
  const out: Quote[] = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => { while (i < list.length) { const k = i++; out[k] = await dayMarketOne(list[k]); } }));
  return out;
}

async function withExtended(list: Quote[]): Promise<Quote[]> {
  const ext = await Promise.all(list.map(q => (q.preMarketPrice != null || q.postMarketPrice != null ? q : extendedOne(q))));
  return withDayMarket(ext);
}

const resCache = new Map<string, { at: number; body: object }>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type  = searchParams.get("type")  ?? "gainers";   // gainers|losers|actives|sector
  const index = searchParams.get("index") ?? "SP500";      // SP500|NASDAQ|DOW

  const ts = new Date().toISOString();
  const ck = `${type}:${index}`;
  const hit = resCache.get(ck);
  if (hit && Date.now() - hit.at < 30_000) return NextResponse.json(hit.body);
  const send = (body: { stocks: Quote[] } & Record<string, unknown>) => {
    if (body.stocks.length) resCache.set(ck, { at: Date.now(), body });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  };

  // ⓪ 인기 ETF·레버리지: 거래대금 순
  if (type === "etf") {
    const quotes = await fetchSparkQuotes(Object.keys(POPULAR_ETFS));
    const sorted = quotes
      .map(q => ({ ...q, name: `${POPULAR_ETFS[q.code] ?? q.name}` }))
      .sort((a, b) => (b.dollarVolume ?? 0) - (a.dollarVolume ?? 0))
      .slice(0, 30)
      .map((q, i) => ({ ...q, rank: i + 1 }));
    const body = { stocks: await withExtended(sorted), timestamp: ts, basis: "dollarVolume" };
    resCache.set(ck, { at: Date.now(), body });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }

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
    return send({ stocks, timestamp: ts, basis: "dollarVolume" });
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
      .slice(0, 30)
      .map((q, i) => ({ ...q, rank: i + 1 }));
    return send({ stocks: await withExtended(sorted), timestamp: ts });
  }

  // ③ NASDAQ — custom screener, fallback to S&P500
  if (index === "NASDAQ") {
    const stocks = await fetchNasdaqScreener(type as "gainers" | "losers" | "actives", 30);
    if (stocks.length > 0)
      return send({ stocks: await withExtended(stocks), timestamp: ts });
  }

  // ④ S&P500 (or NASDAQ fallback)
  const scrId =
    type === "gainers" ? "day_gainers" :
    type === "losers"  ? "day_losers"  : "most_actives";
  const stocks = await withExtended(await fetchScreener(scrId, 30));
  return send({ stocks, timestamp: ts });
}
