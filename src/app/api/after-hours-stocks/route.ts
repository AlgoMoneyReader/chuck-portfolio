import { NextResponse } from "next/server";
import { kisGet, num } from "@/lib/kis";
import { krSession } from "@/lib/krSession";
import { nxtQuotes } from "@/lib/nxtPrice";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

const STOCKS = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
  { code: "005380", name: "현대차" },
  { code: "373220", name: "LG에너지솔루션" },
  { code: "207940", name: "삼성바이오로직스" },
  { code: "035420", name: "NAVER" },
];

interface StockResult {
  code: string; name: string;
  regularPrice: number; extPrice: number | null; extChangePct: number | null;
  changePct: number; marketState: string;
}

let cache: { data: StockResult[]; at: number } | null = null;
const TTL = 15_000;

// KIS 주식 현재가 (실시간). Yahoo 국내 시세는 약 20분 늦어 장 초반엔 전날 값이 보였다
async function kisPrice(code: string): Promise<{ price: number; pct: number } | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100",
      { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code });
    const o = j.output ?? {};
    const price = num(o.stck_prpr), pct = num(o.prdy_ctrt);
    return price ? { price, pct: pct ?? 0 } : null;
  } catch { return null; }
}

function marketState(): string {
  const k = new Date(Date.now() + 9 * 3_600_000);
  const hm = k.getUTCHours() * 100 + k.getUTCMinutes();
  if ([0, 6].includes(k.getUTCDay())) return "CLOSED";
  return hm >= 900 && hm < 1530 ? "REGULAR" : "CLOSED";
}

// 코스피 시가총액 상위 10 (1시간마다 다시 확인, 실패하면 기본 목록)
let topCache: { list: { code: string; name: string }[]; at: number } | null = null;
async function topByCap(): Promise<{ code: string; name: string }[]> {
  if (topCache && Date.now() - topCache.at < 3_600_000) return topCache.list;
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/ranking/market-cap", "FHPST01740000", {
      fid_cond_mrkt_div_code: "J", fid_cond_scr_div_code: "20174", fid_div_cls_code: "1", fid_input_iscd: "0001",
      fid_trgt_cls_code: "0", fid_trgt_exls_cls_code: "0", fid_input_price_1: "", fid_input_price_2: "", fid_vol_cnt: "",
    });
    const list = ((j.output ?? []) as Record<string, string>[])
      .map(r => ({ code: (r.mksc_shrn_iscd ?? "").trim(), name: (r.hts_kor_isnm ?? "").trim() }))
      .filter(x => /^\d{6}$/.test(x.code) && !/우$|우B$|\(전환\)/.test(x.name))   // 우선주 제외
      .slice(0, 10);
    if (list.length >= 5) { topCache = { list, at: Date.now() }; return list; }
  } catch { /* 기본 목록 */ }
  return STOCKS;
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json({ stocks: cache.data, cached: true });

  const STOCKS_NOW = await topByCap();
  const sess = krSession();
  const [quotes, nx] = await Promise.all([
    Promise.all(STOCKS_NOW.map(s => kisPrice(s.code))),
    sess.key === "regular" ? Promise.resolve({} as Awaited<ReturnType<typeof nxtQuotes>>) : nxtQuotes(STOCKS_NOW.map(s => s.code)),
  ]);
  const state = marketState();
  const data: StockResult[] = STOCKS_NOW.map((s, i) => ({
    code: `${s.code}.KS`, name: s.name,
    regularPrice: quotes[i]?.price ?? 0,
    extPrice: nx[s.code]?.price ?? null, extChangePct: nx[s.code] ? parseFloat(nx[s.code].pct.toFixed(2)) : null,
    changePct: parseFloat((quotes[i]?.pct ?? 0).toFixed(2)),
    marketState: state,
  }));

  if (quotes.some(Boolean)) cache = { data, at: Date.now() };
  return NextResponse.json({ stocks: data, marketState: state, timestamp: new Date().toISOString() });
}
