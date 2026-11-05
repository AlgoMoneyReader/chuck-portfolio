import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { yahooDaily } from "@/lib/yahooDaily";
import { extendedOne, dayMarketOne, inDaySession } from "@/lib/usExtended";
import { nasdaqQuotes, US_TICKERS } from "@/lib/usCaps";

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
  capUsd?: number | null;
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
async function withDayMarket(list: Quote[]): Promise<Quote[]> {
  if (!inDaySession() || !process.env.KIS_APP_KEY) return list;
  const out: Quote[] = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => { while (i < list.length) { const k = i++; out[k] = await dayMarketOne(list[k]); } }));
  return out;
}

const extCache = new Map<string, { at: number; q: Partial<Quote> }>();
const EXT_KEYS = ["marketState", "preMarketPrice", "preMarketChangePct", "postMarketPrice", "postMarketChangePct", "dayMarketPrice", "dayMarketChangePct"] as const;
async function withExtended(list: Quote[]): Promise<Quote[]> {
  const now = Date.now();
  const need = list.filter(q => !(extCache.get(q.code) && now - extCache.get(q.code)!.at < 15_000) && q.preMarketPrice == null && q.postMarketPrice == null);
  if (need.length) {
    // 동시에 12개씩
    const got: Quote[] = new Array(need.length);
    let i = 0;
    await Promise.all(Array.from({ length: 12 }, async () => { while (i < need.length) { const k = i++; got[k] = await extendedOne(need[k]); } }));
    const withDay = await withDayMarket(got);
    for (const q of withDay) extCache.set(q.code, { at: now, q: Object.fromEntries(EXT_KEYS.map(k => [k, q[k]])) as Partial<Quote> });
  }
  return list.map(q => ({ ...q, ...(extCache.get(q.code)?.q ?? {}) }));
}

// ── 지수 구성 종목 전체 시세 (S&P 500 · 나스닥 100 · 다우 30) — 8초 공유. 전일 종가는 일봉 5일치로 확인 ──
const uniCache = new Map<string, { at: number; rows: Quote[] }>();
async function indexUniverse(index: string): Promise<Quote[]> {
  const hit = uniCache.get(index);
  if (hit && Date.now() - hit.at < 8_000) return hit.rows;
  const tag = index === "NASDAQ" ? "QQQ" : index === "DOW" ? "DIA" : index === "SOXX" ? "SOXX" : "SPY";
  const members = index === "RUSSELL" ? [] : Object.entries(US_TICKERS).filter(([, v]) => v.idx.includes(tag)).map(([sym]) => sym)
    .filter((sym, _, all) => !(sym === "GOOG" && all.includes("GOOGL")));
  if (index === "RUSSELL") return [];
  const dq = await yahooDaily(members);
  const rows: Quote[] = members.flatMap(sym => {
    const d = dq[sym];
    if (!d || !d.price) return [];
    return [{
      rank: 0, code: sym, name: (index === "DOW" ? DOW30[sym] : undefined) ?? US_TICKERS[sym]?.n ?? sym,
      price: +d.price.toFixed(2), change: +d.change.toFixed(2), changePct: +d.changePct.toFixed(2),
      volume: d.volume, dollarVolume: d.price * d.volume, marketState: "REGULAR",
      preMarketPrice: null, preMarketChangePct: null, postMarketPrice: null, postMarketChangePct: null,
    } as Quote];
  });
  if (rows.length) uniCache.set(index, { at: Date.now(), rows });
  return rows;
}
const TOP_N = 100;

// 러셀2000 근사: 나스닥 스크리너(미국 전 종목) 시가총액 1001~3000위. 순위 후보는 스크리너 값(1분 보관), 보여줄 100개만 실시간 덧입힘
interface Scr { sym: string; name: string; price: number; pct: number; cap: number; vol: number }
const russellPool = unstable_cache(async (): Promise<Scr[]> => {
  const r = await fetch("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true", {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return [];
  const rows = ((await r.json())?.data?.rows ?? []) as Record<string, string>[];
  const v = (x: string | undefined) => parseFloat(String(x ?? "").replace(/[$,%]/g, "")) || 0;
  return rows.map(x => ({ sym: String(x.symbol ?? "").trim().replace("/", "-"), name: String(x.name ?? "").replace(/ (Common Stock|Class [A-C].*|Ordinary Shares.*|American Depositary.*)$/i, ""), price: v(x.lastsale), pct: v(x.pctchange), cap: v(x.marketCap), vol: v(x.volume) }))
    .filter(x => x.sym && !/[\^ ]/.test(x.sym) && x.cap > 0 && x.price > 1)
    .sort((a, b) => b.cap - a.cap).slice(1000, 3000);
}, ["us-russell-pool-v1"], { revalidate: 60 });

async function russellList(type: string): Promise<Quote[]> {
  const pool = await russellPool().catch(() => [] as Scr[]);
  if (!pool.length) return [];
  const pre = type === "gainers" ? pool.filter(x => x.pct > 0).sort((a, b) => b.pct - a.pct)
    : type === "losers" ? pool.filter(x => x.pct < 0).sort((a, b) => a.pct - b.pct)
    : type === "actives" ? [...pool].sort((a, b) => b.price * b.vol - a.price * a.vol)
    : pool;
  const cand = pre.slice(0, 130);
  const dq = await yahooDaily(cand.map(x => x.sym));
  const rows: Quote[] = cand.map(x => {
    const d = dq[x.sym];
    const price = d?.price ?? x.price, pct = d ? d.changePct : x.pct, vol = d?.volume || x.vol;
    return { rank: 0, code: x.sym, name: x.name.slice(0, 40), price: +price.toFixed(2), change: d ? +d.change.toFixed(2) : +(price - price / (1 + pct / 100)).toFixed(2),
      changePct: +pct.toFixed(2), volume: vol, dollarVolume: price * vol, capUsd: x.cap, marketState: "REGULAR",
      preMarketPrice: null, preMarketChangePct: null, postMarketPrice: null, postMarketChangePct: null } as Quote;
  });
  const sorted = type === "gainers" ? rows.filter(q => q.changePct > 0).sort((a, b) => b.changePct - a.changePct)
    : type === "losers" ? rows.filter(q => q.changePct < 0).sort((a, b) => a.changePct - b.changePct)
    : type === "actives" ? rows.sort((a, b) => (b.dollarVolume ?? 0) - (a.dollarVolume ?? 0))
    : rows;
  return sorted.slice(0, TOP_N).map((q, i) => ({ ...q, rank: i + 1 }));
}

const resCache = new Map<string, { at: number; body: object }>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type  = searchParams.get("type")  ?? "gainers";   // gainers|losers|actives|sector
  const index = searchParams.get("index") ?? "SP500";      // SP500|NASDAQ|DOW

  const ts = new Date().toISOString();
  const ck = `${type}:${index}`;
  const hit = resCache.get(ck);
  if (hit && Date.now() - hit.at < 5_000) return NextResponse.json(hit.body);
  const send = (body: { stocks: Quote[] } & Record<string, unknown>) => {
    if (body.stocks.length) resCache.set(ck, { at: Date.now(), body });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  };

  // ⓪-0 시가총액 TOP30 (지수 구성 종목 중, Nasdaq 시가총액 순)
  // 러셀2000(근사): 시총·상승·하락·거래대금 모두 스크리너 후보 + 실시간 덧입힘
  if (index === "RUSSELL" && ["cap", "gainers", "losers", "actives"].includes(type)) {
    const list = await russellList(type);
    return send({ stocks: await withExtended(list), timestamp: ts, basis: "russell-approx" });
  }

  if (type === "cap") {
    const tag = index === "NASDAQ" ? "QQQ" : index === "DOW" ? "DIA" : index === "SOXX" ? "SOXX" : "SPY";
    const members = Object.entries(US_TICKERS).filter(([, v]) => v.idx.includes(tag)).map(([s]) => s);
    const caps = await nasdaqQuotes().catch(() => null);
    const ranked = members
      .filter(s => !(s === "GOOG" && members.includes("GOOGL")))
      .sort((a, b) => (caps?.[b]?.cap ?? 0) - (caps?.[a]?.cap ?? 0))
      .slice(0, TOP_N);
    const quotes = await fetchSparkQuotes(ranked);
    const byCode = new Map(quotes.map(q => [q.code, q]));
    const rows = ranked.flatMap((s, i) => {
      const q = byCode.get(s);
      return q ? [{ ...q, rank: i + 1, name: US_TICKERS[s]?.n ?? q.name, capUsd: caps?.[s]?.cap ?? null }] : [];
    });
    return send({ stocks: await withExtended(rows), timestamp: ts, basis: "marketCap" });
  }

  // ⓪-1 주요 종목 TOP10(시가총액 상위 대형주, 증시 탭 요약용)
  if (type === "mega") {
    const MEGA: Record<string, string> = { NVDA: "엔비디아", MSFT: "마이크로소프트", AAPL: "애플", GOOGL: "알파벳", AMZN: "아마존", META: "메타", AVGO: "브로드컴", TSLA: "테슬라", TSM: "TSMC", "BRK-B": "버크셔해서웨이" };
    const quotes = await fetchSparkQuotes(Object.keys(MEGA));
    const order = Object.keys(MEGA);
    const sorted = quotes.map(q => ({ ...q, name: MEGA[q.code] ?? q.name }))
      .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code)).map((q, i) => ({ ...q, rank: i + 1 }));
    return send({ stocks: await withExtended(sorted), timestamp: ts });
  }

  // ⓪ 인기 ETF·레버리지: 거래대금 순
  if (type === "etf") {
    const quotes = await fetchSparkQuotes(Object.keys(POPULAR_ETFS));
    const sorted = quotes
      .map(q => ({ ...q, name: `${POPULAR_ETFS[q.code] ?? q.name}` }))
      .sort((a, b) => (b.dollarVolume ?? 0) - (a.dollarVolume ?? 0))
      .slice(0, TOP_N)
      .map((q, i) => ({ ...q, rank: i + 1 }));
    const body = { stocks: await withExtended(sorted), timestamp: ts, basis: "dollarVolume" };
    resCache.set(ck, { at: Date.now(), body });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  // ① 섹터 ETF (pre/post 불필요)
  if (type === "sector") {
    const syms   = SECTOR_ETFS.map(e => e.symbol);
    // 일봉 5일치로 전일 종가를 직접 확인 (range=1d 값이 가끔 이틀 전 종가로 잡혀 등락률이 틀어짐)
    const dq = await yahooDaily(syms);
    const sparks = Object.keys(dq).length ? [] : await fetchSpark(syms);
    const sectors = SECTOR_ETFS.map(etf => {
      const d = dq[etf.symbol], q = sparks.find(r => r.code === etf.symbol);
      return { sector: etf.name, symbol: etf.symbol, changePct: d ? +d.changePct.toFixed(2) : q?.changePct ?? 0, price: d ? +d.price.toFixed(2) : q?.price ?? 0 };
    }).sort((a, b) => b.changePct - a.changePct);
    return NextResponse.json({ sectors, timestamp: ts }, { headers: { "Cache-Control": "no-store" } });
  }

  // ①-2 상승·하락·거래대금: 지수 구성 종목 전체 기준 100위 (국내와 같은 방식)
  if (type === "gainers" || type === "losers" || type === "actives") {
    const uni = await indexUniverse(index);
    if (uni.length) {
      const list = (type === "gainers" ? uni.filter(q => q.changePct > 0).sort((a, b) => b.changePct - a.changePct)
        : type === "losers" ? uni.filter(q => q.changePct < 0).sort((a, b) => a.changePct - b.changePct)
        : [...uni].sort((a, b) => (b.dollarVolume ?? 0) - (a.dollarVolume ?? 0)))
        .slice(0, TOP_N).map((q, i) => ({ ...q, rank: i + 1 }));
      return send({ stocks: await withExtended(list), timestamp: ts, universe: uni.length, basis: type === "actives" ? "dollarVolume" : "changePct" });
    }
  }

  // ② 거래대금(가격×거래량) 순위
  if (type === "actives") {
    const stocks = await withExtended(await topByDollarVolume(index));
    return send({ stocks, timestamp: ts, basis: "dollarVolume" });
  }

  // ③ DOW 30 — v7/finance/quote로 교체 (pre/post 포함)
  if (index === "DOW") {
    const tickers = Object.keys(DOW30);
    // v7/quote 는 인증(crumb)이 필요해 비어 오므로 spark 로 시세를 받고 이름은 DOW30 표에서
    let quotes = (await fetchSparkQuotes(tickers)).map(q => ({ ...q, name: DOW30[q.code] ?? q.name }));
    if (!quotes.length) quotes = await fetchQuoteBatch(tickers, DOW30);
    const sorted  = quotes
      .filter(q => (type === "gainers" ? q.changePct > 0 : type === "losers" ? q.changePct < 0 : true)) // 상승은 +, 하락은 − 종목만
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
