import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 미국 종목 '정보' 탭 — 국내 종목 정보(개요)와 같은 구성
 *  - summary: 거래소·섹터·업종·시가총액·PER·선행PER·EPS·배당·52주 범위 (Nasdaq quote summary)
 *  - target: 애널리스트 목표가·투자의견 (Nasdaq analyst target price)
 *  - quarters: 분기 매출·영업이익·순이익 (Nasdaq company financials, 분기)
 *  - profile: 회사 소개
 * 각 항목은 따로 실패할 수 있어 받은 것만 돌려준다. 1시간 캐시.
 */

const H = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
};

type Obj = Record<string, unknown>;
async function nq(path: string): Promise<Obj | null> {
  try {
    const r = await fetch(`https://api.nasdaq.com/api/${path}`, { headers: H, signal: AbortSignal.timeout(9000), cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json() as Obj;
    return (j?.data as Obj) ?? null;
  } catch { return null; }
}

// "$1,234.5" / "4,123,456,789" / "N/A" → number
const n = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).replace(/[$,%\s]/g, "");
  if (!s || /^(N\/A|NA|--|-)$/i.test(s)) return null;
  const neg = /^\(.*\)$/.test(s);
  const x = parseFloat(s.replace(/[()]/g, ""));
  return isNaN(x) ? null : neg ? -x : x;
};

async function load(sym: string) {
  const [sum, tgt, fin, prof] = await Promise.all([
    nq(`quote/${sym}/summary?assetclass=stocks`),
    nq(`analyst/${sym}/targetprice`),
    nq(`company/${sym}/financials?frequency=2`),
    nq(`company/${sym}/company-profile`),
  ]);

  // ── summary ──
  const sd = (sum?.summaryData ?? {}) as Record<string, { label?: string; value?: string }>;
  const v = (k: string) => sd[k]?.value ?? null;
  const hl52 = (v("FiftTwoWeekHighLow") ?? v("FiftyTwoWeekHighLow") ?? "").split("/").map(n);
  const summary = Object.keys(sd).length ? {
    exchange: v("Exchange"), sector: v("Sector"), industry: v("Industry"),
    marketCap: n(v("MarketCap")), pe: n(v("PERatio")), forwardPe: n(v("ForwardPE1Yr")), eps: n(v("EarningsPerShare")),
    dividend: n(v("AnnualizedDividend")), yieldPct: n(v("Yield")), exDividend: v("ExDividendDate"),
    avgVolume: n(v("AverageVolume")), oneYrTarget: n(v("OneYrTarget")),
    high52: hl52[0] ?? null, low52: hl52[1] ?? null,
  } : null;

  // ── target ──
  const co = (tgt?.consensusOverview ?? null) as Obj | null;
  const target = co ? {
    avg: n(co.priceTarget), high: n(co.highPriceTarget), low: n(co.lowPriceTarget),
    buy: n(co.buy) ?? 0, hold: n(co.hold) ?? 0, sell: n(co.sell) ?? 0,
  } : null;

  // ── quarterly income statement ──
  // incomeStatementTable: headers {value1:"Period Ending:", value2:"9/30/2026", ...}, rows [{value1:"Total Revenue", value2:"$123,456", ...}] (천 달러)
  const ist = (fin?.incomeStatementTable ?? null) as { headers?: Record<string, string>; rows?: Record<string, string>[] } | null;
  let quarters: { period: string; sales: number | null; op: number | null; net: number | null }[] = [];
  if (ist?.headers && Array.isArray(ist.rows)) {
    const cols = Object.keys(ist.headers).filter(k => k !== "value1");
    const row = (re: RegExp) => ist.rows!.find(r => re.test(String(r.value1 ?? "")));
    const rev = row(/^total revenue/i), op = row(/^operating income/i), net = row(/^net income$/i) ?? row(/^net income/i);
    quarters = cols.map(c => ({
      period: String(ist.headers![c] ?? ""),
      sales: rev ? n(rev[c]) : null, op: op ? n(op[c]) : null, net: net ? n(net[c]) : null,
    })).filter(q => q.period && (q.sales != null || q.net != null)).reverse(); // 오래된 → 최근
  }

  const description = typeof (prof?.CompanyDescription as Obj | undefined)?.value === "string"
    ? String((prof!.CompanyDescription as Obj).value) : null;

  return { summary, target, quarters, description };
}

const cached = unstable_cache(load, ["us-info-v1"], { revalidate: 3600 });

export async function GET(request: Request) {
  const sym = (new URL(request.url).searchParams.get("ticker") ?? "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!sym) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  try {
    const d = await cached(sym);
    if (!d.summary && !d.target && !d.quarters.length) return NextResponse.json({ ...d, error: "정보를 불러오지 못했습니다" });
    return NextResponse.json(d);
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 120) }, { status: 500 });
  }
}
