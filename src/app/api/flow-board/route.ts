import { NextResponse } from "next/server";
import { kisGet, num, kstYmd } from "@/lib/kis";
import { unzipFirst } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 45;

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

// 코스닥 업종 목록: KIS 국내업종 구분별 전체시세(FHPUP02140000)로 코드·이름을 받아온다(12시간 보관)
let kqSectorCache: { at: number; list: [string, string][] } | null = null;
const SKIP_KQ = /^코스닥$|코스닥\s*(대형|중형|소형|우량|벤처|기술|글로벌|150)|^KRX|지수$|^\s*$/;
// KIS 업종코드 마스터(idxcode.mst): 줄마다 [구분 1자리][업종코드 4자리][업종명]. 코스닥 업종은 1xxx
async function kosdaqFromMaster(): Promise<[string, string][]> {
  const res = await fetch("https://new.real.download.dws.co.kr/common/master/idxcode.mst.zip", { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`idx master ${res.status}`);
  const text = new TextDecoder("euc-kr").decode(unzipFirst(Buffer.from(await res.arrayBuffer())));
  const out: [string, string][] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d)(\d{4})\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    // 코드가 1xxx 이거나, 구분이 1(코스닥)이면서 코드가 0xxx 로 적힌 경우 모두 1xxx 로 맞춘다
    const code = m[2].startsWith("1") ? m[2] : m[1] === "1" ? `1${m[2].slice(1)}` : "";
    const name = m[3].replace(/\s{2,}.*/, "").trim();
    if (/^1\d{3}$/.test(code) && code !== "1001" && name && !SKIP_KQ.test(name)) out.push([code, name.replace(/^코스닥\s*/, "")]);
  }
  const seen = new Set<string>();
  return out.filter(([c]) => (seen.has(c) ? false : (seen.add(c), true))).slice(0, 30);
}

async function kosdaqSectors(): Promise<[string, string][]> {
  if (kqSectorCache && Date.now() - kqSectorCache.at < 12 * 3_600_000) return kqSectorCache.list;
  try {
    const list = await kosdaqFromMaster();
    if (list.length) { kqSectorCache = { at: Date.now(), list }; return list; }
  } catch { /* 업종 시세 API 로 */ }
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-index-category-price", "FHPUP02140000", {
      FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: "1001", FID_COND_SCR_DIV_CODE: "20214",
      FID_MRKT_CLS_CODE: "Q", FID_BLNG_CLS_CODE: "0",
    });
    const rows = (Array.isArray(j.output2) ? j.output2 : Array.isArray(j.output) ? j.output : []) as Row[];
    const list = rows
      .map(r => [String(r.bstp_cls_code ?? "").trim(), String(r.hts_kor_isnm ?? "").trim()] as [string, string])
      .filter(([c, n]) => /^1\d{3}$/.test(c) && c !== "1001" && n && !SKIP_KQ.test(n))
      .slice(0, 24);
    if (list.length) kqSectorCache = { at: Date.now(), list };
    return list;
  } catch { return []; }
}

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
const kstNow = () => new Date(Date.now() + 9 * 3_600_000);

// ── 코스피200 선물 투자자별 (KIS 시장별 투자자매매동향(시세) FHPTJ04030000) ──
// 공식 문서에서 선물용 코드값을 확인하지 못해 후보를 차례로 시도하고 처음 맞는 조합을 기억한다
const FUT_CANDIDATES: [string, string][] = [["K2I", "F001"], ["999", "S001"], ["KSP", "F001"], ["K2I", "S001"], ["999", "F001"]];
let futWorking: [string, string] | null = null;
async function futuresFlow(): Promise<{ foreign: number; institution: number; individual: number; foreignQty: number; institutionQty: number; individualQty: number; params: string } | null> {
  const list = futWorking ? [futWorking, ...FUT_CANDIDATES.filter(c => c !== futWorking)] : FUT_CANDIDATES;
  for (const [a, b] of list) {
    try {
      const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-investor-time-by-market", "FHPTJ04030000", { FID_INPUT_ISCD: a, FID_INPUT_ISCD_2: b });
      const r = (Array.isArray(j.output) ? j.output[0] : j.output) as Row | undefined;
      if (!r || r.frgn_ntby_tr_pbmn == null) continue;
      const v = { foreign: eok(r.frgn_ntby_tr_pbmn), institution: eok(r.orgn_ntby_tr_pbmn), individual: eok(r.prsn_ntby_tr_pbmn),
        foreignQty: num(r.frgn_ntby_qty) ?? 0, institutionQty: num(r.orgn_ntby_qty) ?? 0, individualQty: num(r.prsn_ntby_qty) ?? 0, params: `${a}/${b}` };
      if (Math.abs(v.foreign) + Math.abs(v.individual) + Math.abs(v.institution) === 0) continue;
      futWorking = [a, b];
      return v;
    } catch { /* 다음 후보 */ }
  }
  return null;
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

  const futures = await futuresFlow().catch(() => null);
  if (!futures) errors.push("선물: 코드 확인 필요");

  const sectorRows = await pool(SECTORS, 5, async ([code, name]) => {
    try {
      const r = (await marketRows(code, "KSP")).filter(nonZero)[0];
      return r ? { code, name, date: r.stck_bsop_date, ...core(r) } : null;
    } catch { return null; }
  });
  const sectors = sectorRows.filter((x): x is NonNullable<typeof x> => !!x);
  if (!sectors.length) errors.push("업종별: 데이터 없음");

  // 코스닥 업종별
  const kqList = await kosdaqSectors();
  const kqRows = await pool(kqList, 5, async ([code, name]) => {
    try {
      const r = (await marketRows(code, "KSQ")).filter(nonZero)[0];
      return r ? { code, name, date: r.stck_bsop_date, ...core(r) } : null;
    } catch { return null; }
  });
  const sectorsKQ = kqRows.filter((x): x is NonNullable<typeof x> => !!x);
  if (!sectorsKQ.length) errors.push(`코스닥 업종: ${kqList.length ? "수급 없음" : "업종 목록 없음"}`);

  const intraday = {};

  const body = { investors, daily, sectors, sectorsKQ, intraday, futures, asOf: kstNow().toISOString().slice(11, 16), errors };
  if (investors.KOSPI || sectors.length) { cache.at = Date.now(); cache.body = body; }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
