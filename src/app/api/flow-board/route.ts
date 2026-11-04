import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kisGet, num, kstYmd } from "@/lib/kis";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 30;

/**
 * 매매동향 보드 — 한 번에:
 *  - investors: 시장(코스피·코스닥) 거래주체별 순매수 (외국인·개인·기관 + 기관 세부: 금융투자·투신·사모·은행·보험·연기금 등)
 *  - daily: 최근 거래일별 외국인·기관·개인 추이
 *  - sectors: 코스피 업종별 외국인·기관·개인 순매수
 *  - intraday: 장중 시간별 누적 순매수(서버가 1분 간격으로 모은 기록, Supabase flow_ticks)
 * KIS 시장별 투자자매매동향(일별, FHPTJ04040000) 한 API를 업종코드만 바꿔 쓴다. 금액 백만원 → 억원.
 */

type Row = Record<string, string>;
const eok = (v?: string) => Math.round((num(v) ?? 0) / 100);

// 투자자 세부 (필드명 접두어 → 이름). 응답에 없는 항목은 건너뛴다
const DETAIL: [string, string][] = [
  ["scrt", "금융투자"], ["ivtr", "투신"], ["pe_fund", "사모"], ["bank", "은행"],
  ["insu", "보험"], ["mrbn", "종금"], ["fund", "연기금"], ["etc_orgt", "기타단체"], ["etc_corp", "기타법인"],
];

// 코스피 업종 지수 코드
const SECTORS: [string, string][] = [
  ["0013", "전기·전자"], ["0015", "운송장비·부품"], ["0021", "금융"], ["0009", "제약"], ["0008", "화학"],
  ["0011", "금속"], ["0012", "기계·장비"], ["0026", "일반서비스"], ["0024", "증권"], ["0025", "보험"],
  ["0016", "유통"], ["0018", "건설"], ["0019", "운송·창고"], ["0020", "통신"], ["0017", "전기·가스"],
  ["0005", "음식료·담배"], ["0010", "비금속"], ["0014", "의료·정밀기기"], ["0006", "섬유·의류"], ["0007", "종이·목재"],
];

async function marketRows(iscd: string, isc1: "KSP" | "KSQ"): Promise<Row[]> {
  const d8 = kstYmd();
  const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-investor-daily-by-market", "FHPTJ04040000", {
    FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: iscd,
    FID_INPUT_DATE_1: d8, FID_INPUT_ISCD_1: isc1,
    FID_INPUT_DATE_2: d8, FID_INPUT_ISCD_2: iscd,
  });
  let rows = j.output ?? j.output1 ?? [];
  if (!Array.isArray(rows)) rows = [rows];
  return (rows as Row[]).filter(r => r.stck_bsop_date).sort((a, b) => b.stck_bsop_date.localeCompare(a.stck_bsop_date));
}

const nonZero = (r: Row) => Math.abs(eok(r.frgn_ntby_tr_pbmn)) + Math.abs(eok(r.prsn_ntby_tr_pbmn)) + Math.abs(eok(r.orgn_ntby_tr_pbmn)) > 0;
const core = (r: Row) => ({ foreign: eok(r.frgn_ntby_tr_pbmn), individual: eok(r.prsn_ntby_tr_pbmn), institution: eok(r.orgn_ntby_tr_pbmn) });

async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k]); } }));
  return out;
}

// ── 장중 시간별: 1분 단위 스냅샷을 Supabase 에 남기고 읽는다 (supabase/flow.sql) ──
function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}
const kstNow = () => new Date(Date.now() + 9 * 3_600_000);
function inSession() {
  const k = kstNow(), m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return ![0, 6].includes(k.getUTCDay()) && m >= 9 * 60 && m <= 15 * 60 + 35;
}

const cache: { at: number; body: object | null } = { at: 0, body: null };
const TTL = 60_000;

export async function GET() {
  if (cache.body && Date.now() - cache.at < TTL) return NextResponse.json({ ...cache.body, cached: true });
  const errors: string[] = [];
  const today8 = kstYmd();

  const investors: Record<string, object | null> = {};
  const daily: Record<string, object[]> = {};
  for (const [mk, iscd, isc1] of [["KOSPI", "0001", "KSP"], ["KOSDAQ", "1001", "KSQ"]] as const) {
    try {
      const rows = (await marketRows(iscd, isc1)).filter(nonZero);
      const r = rows[0];
      investors[mk] = r ? {
        date: r.stck_bsop_date, live: r.stck_bsop_date === today8,
        ...core(r),
        detail: DETAIL.filter(([k]) => r[`${k}_ntby_tr_pbmn`] != null).map(([k, label]) => ({ label, value: eok(r[`${k}_ntby_tr_pbmn`]) })),
      } : null;
      daily[mk] = rows.slice(0, 10).reverse().map(x => ({ date: x.stck_bsop_date, ...core(x) }));
    } catch (e) { errors.push(`${mk}: ${String(e).slice(0, 80)}`); investors[mk] = null; daily[mk] = []; }
  }

  const sectorRows = await pool(SECTORS, 5, async ([code, name]) => {
    try {
      const r = (await marketRows(code, "KSP")).filter(nonZero)[0];
      return r ? { code, name, date: r.stck_bsop_date, ...core(r) } : null;
    } catch { return null; }
  });
  const sectors = sectorRows.filter((x): x is NonNullable<typeof x> => !!x);
  if (!sectors.length) errors.push("업종별: 데이터 없음");

  // 장중 시간별 기록
  let intraday: Record<string, { hm: string; foreign: number; institution: number; individual: number }[]> = {};
  const client = sb();
  if (client) {
    const day = kstNow().toISOString().slice(0, 10);
    if (inSession()) {
      for (const mk of ["KOSPI", "KOSDAQ"] as const) {
        const v = investors[mk] as { live?: boolean; foreign: number; institution: number; individual: number } | null;
        if (v?.live) {
          const { error } = await client.rpc("record_flow_tick", { p_market: mk, p_foreign: v.foreign, p_institution: v.institution, p_individual: v.individual });
          if (error && !/does not exist|Could not find/.test(error.message)) errors.push(`기록: ${error.message.slice(0, 60)}`);
        }
      }
    }
    const { data, error } = await client.from("flow_ticks").select("market,hm,foreign_eok,institution_eok,individual_eok").eq("day", day).order("hm");
    if (!error && data) {
      intraday = { KOSPI: [], KOSDAQ: [] };
      for (const t of data as { market: string; hm: string; foreign_eok: number; institution_eok: number; individual_eok: number }[]) {
        (intraday[t.market] ??= []).push({ hm: t.hm, foreign: t.foreign_eok, institution: t.institution_eok, individual: t.individual_eok });
      }
    } else if (error && !/does not exist|Could not find|relation/.test(error.message)) errors.push(`시간별: ${error.message.slice(0, 60)}`);
  }

  const body = { investors, daily, sectors, intraday, asOf: kstNow().toISOString().slice(11, 16), errors };
  if (investors.KOSPI || sectors.length) { cache.at = Date.now(); cache.body = body; }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
