/**
 * GET /api/dual-buy — 외국인·기관 동반 순매수(쌍끌이)
 *
 * KIS 국내기관_외국인 매매종목가집계(FHPTJ04400000)로 코스피·코스닥 각각
 * 외국인 순매수 금액 상위, 기관 순매수 금액 상위를 받아 합친 뒤
 * 둘 다 최소 금액 이상 순매수한 종목만 남긴다. 금액 단위는 백만원 → 억원.
 */
import { NextResponse } from "next/server";
import { kisGet, num } from "@/lib/kis";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

// 시장별 최소 순매수(억원). 외국인·기관 각각 이 금액 이상이어야 쌍끌이로 본다
const MIN_EOK = { KS: 10, KQ: 5 } as const;

export interface DualBuyItem {
  code: string; name: string; market: "KS" | "KQ";
  price: number; changePct: number;
  foreign: number; institution: number; combined: number;
  valueEok: number | null;      // 당일 거래대금 추정(억원)
  flowShare: number | null;     // 거래대금 대비 외국인+기관 순매수 비중(%)
}

type Row = Record<string, string>;

async function rank(market: "KS" | "KQ", investor: "1" | "2"): Promise<Row[]> {
  const j = await kisGet("/uapi/domestic-stock/v1/quotations/foreign-institution-total", "FHPTJ04400000", {
    FID_COND_MRKT_DIV_CODE: "V",
    FID_COND_SCR_DIV_CODE: "16449",
    FID_INPUT_ISCD: market === "KS" ? "0001" : "1001",
    FID_DIV_CLS_CODE: "1",        // 금액 기준
    FID_RANK_SORT_CLS_CODE: "0",  // 순매수 상위
    FID_ETC_CLS_CODE: investor,   // 1 외국인, 2 기관계
  });
  return Array.isArray(j.output) ? j.output : [];
}

function sessionLabel(): string {
  const k = new Date(Date.now() + 9 * 3_600_000);
  const hm = k.getUTCHours() * 100 + k.getUTCMinutes();
  const weekend = [0, 6].includes(k.getUTCDay());
  if (weekend || hm < 900) return "직전 거래일 집계";
  if (hm < 1540) return "장중 가집계 (확정 아님)";
  return "장 마감 후 집계";
}

let cache: { at: number; body: object } | null = null;
const TTL = 60_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body);

  const errors: string[] = [];
  const merged = new Map<string, DualBuyItem>();

  for (const market of ["KS", "KQ"] as const) {
    for (const investor of ["1", "2"] as const) {
      let rows: Row[] = [];
      try { rows = await rank(market, investor); } catch (e) { errors.push(`${market}/${investor}: ${String(e).slice(0, 80)}`); }
      for (const r of rows) {
        const code = (r.mksc_shrn_iscd ?? "").trim();
        if (!/^\d{6}$/.test(code) || merged.has(code)) continue;
        const foreign = Math.round((num(r.frgn_ntby_tr_pbmn) ?? 0) / 100);
        const institution = Math.round((num(r.orgn_ntby_tr_pbmn) ?? 0) / 100);
        const price = num(r.stck_prpr) ?? 0;
        const vol = num(r.acml_vol);
        const valueEok = vol && price ? Math.round((vol * price) / 1e8) : null;
        merged.set(code, {
          code, name: (r.hts_kor_isnm ?? "").trim(), market,
          price, changePct: num(r.prdy_ctrt) ?? 0,
          foreign, institution, combined: foreign + institution,
          valueEok,
          flowShare: valueEok ? parseFloat((((foreign + institution) / valueEok) * 100).toFixed(1)) : null,
        });
      }
    }
  }

  const stocks = Array.from(merged.values())
    .filter(s => s.foreign >= MIN_EOK[s.market] && s.institution >= MIN_EOK[s.market])
    .sort((a, b) => b.combined - a.combined)
    .slice(0, 10);

  const body = {
    stocks,
    timestamp: new Date().toISOString(),
    session: sessionLabel(),
    criteria: `외국인·기관 각각 코스피 ${MIN_EOK.KS}억 · 코스닥 ${MIN_EOK.KQ}억 이상 동반 순매수`,
    scanned: merged.size,
    threshold: MIN_EOK.KS,
    errors,
  };
  if (!errors.length || stocks.length) cache = { at: Date.now(), body };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
