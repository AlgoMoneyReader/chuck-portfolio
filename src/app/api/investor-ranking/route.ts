import { NextResponse } from "next/server";
import { kisGet, num } from "@/lib/kis";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

export interface RankItem {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePct: number;
  netBuyAmount: number; // 억원 (양수=순매수, 음수=순매도)
  netBuyQty: number;    // 천주
}

/**
 * 투자자별 순매수·순매도 상위 종목.
 * KIS 국내기관_외국인 매매종목가집계(FHPTJ04400000): 외국인·기관계 순위를 장중 가집계로 준다.
 * 개인은 KIS가 순위를 주지 않아, 외국인·기관 상위 종목에서 개인 ≈ -(외국인+기관)으로 추정한다.
 * (기존 네이버 스크래핑은 410으로 막혀 교체)
 */
type Row = Record<string, string>;

async function rank(isc: string, investor: "1" | "2", sort: "0" | "1"): Promise<Row[]> {
  const j = await kisGet("/uapi/domestic-stock/v1/quotations/foreign-institution-total", "FHPTJ04400000", {
    FID_COND_MRKT_DIV_CODE: "V",
    FID_COND_SCR_DIV_CODE: "16449",
    FID_INPUT_ISCD: isc,          // 0001 코스피, 1001 코스닥
    FID_DIV_CLS_CODE: "1",        // 금액 기준
    FID_RANK_SORT_CLS_CODE: sort, // 0 순매수 상위, 1 순매도 상위
    FID_ETC_CLS_CODE: investor,   // 1 외국인, 2 기관계
  });
  return Array.isArray(j.output) ? j.output : [];
}

interface Parsed { code: string; name: string; price: number; changePct: number; f: number; o: number; fq: number; oq: number }
const parse = (r: Row): Parsed | null => {
  const code = (r.mksc_shrn_iscd ?? "").trim();
  if (!/^\d{6}$/.test(code)) return null;
  return {
    code, name: (r.hts_kor_isnm ?? "").trim(),
    price: num(r.stck_prpr) ?? 0, changePct: num(r.prdy_ctrt) ?? 0,
    f: Math.round((num(r.frgn_ntby_tr_pbmn) ?? 0) / 100), o: Math.round((num(r.orgn_ntby_tr_pbmn) ?? 0) / 100), // 백만원 → 억원
    fq: Math.round((num(r.frgn_ntby_qty) ?? 0) / 1000), oq: Math.round((num(r.orgn_ntby_qty) ?? 0) / 1000),       // 주 → 천주
  };
};
const toItems = (list: { p: Parsed; amt: number; qty: number }[]): RankItem[] =>
  list.slice(0, 20).map((x, i) => ({ rank: i + 1, code: x.p.code, name: x.p.name, price: x.p.price, changePct: x.p.changePct, netBuyAmount: x.amt, netBuyQty: x.qty }));

const cache: Record<string, { at: number; body: object }> = {};
const TTL = 60_000;

export async function GET(request: Request) {
  const market = new URL(request.url).searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const hit = cache[market];
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ ...hit.body, cached: true });

  const isc = market === "KOSDAQ" ? "1001" : "0001";
  try {
    const [fb, fs, ob, os] = await Promise.all([rank(isc, "1", "0"), rank(isc, "1", "1"), rank(isc, "2", "0"), rank(isc, "2", "1")]);
    const P = (rows: Row[]) => rows.map(parse).filter((x): x is Parsed => !!x);
    const [FB, FS, OB, OS] = [P(fb), P(fs), P(ob), P(os)];
    if (!FB.length && !OB.length) throw new Error("KIS 순위 데이터 없음");

    // 개인 추정: 네 목록 종목을 합쳐 -(외국인+기관)
    const all = new Map<string, Parsed>();
    for (const p of [...FB, ...FS, ...OB, ...OS]) if (!all.has(p.code)) all.set(p.code, p);
    const indiv = Array.from(all.values()).map(p => ({ p, amt: -(p.f + p.o), qty: -(p.fq + p.oq) }));

    const k = new Date(Date.now() + 9 * 3_600_000);
    const hm = k.getUTCHours() * 100 + k.getUTCMinutes();
    const weekend = [0, 6].includes(k.getUTCDay());
    const dataDateLabel = weekend || hm < 900 ? "직전 거래일" : hm < 1540 ? `오늘 ${k.toISOString().slice(11, 16)} 가집계` : "오늘 장 마감";

    const body = {
      market,
      buy: {
        foreign: toItems(FB.map(p => ({ p, amt: p.f, qty: p.fq })).filter(x => x.amt > 0)),
        institution: toItems(OB.map(p => ({ p, amt: p.o, qty: p.oq })).filter(x => x.amt > 0)),
        individual: toItems(indiv.filter(x => x.amt > 0).sort((a, b) => b.amt - a.amt)),
      },
      sell: {
        foreign: toItems(FS.map(p => ({ p, amt: p.f, qty: p.fq })).filter(x => x.amt < 0)),
        institution: toItems(OS.map(p => ({ p, amt: p.o, qty: p.oq })).filter(x => x.amt < 0)),
        individual: toItems(indiv.filter(x => x.amt < 0).sort((a, b) => a.amt - b.amt)),
      },
      dataDateLabel,
      note: "개인은 외국인·기관 상위 종목 기준 추정치",
      source: "KIS",
    };
    cache[market] = { at: Date.now(), body };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 500 });
  }
}
