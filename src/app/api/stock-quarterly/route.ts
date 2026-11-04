import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { dartCorpMap, dartGet } from "@/lib/dart";
import { fetchPrelim } from "@/lib/prelim";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 60;

// DART 단일회사 주요계정(fnlttSinglAcnt). 분기·반기 보고서의 손익은 당기 3개월(thstrm_amount)과 누적(thstrm_add_amount)을 같이 준다.
// 4분기는 연간(사업보고서) − 3분기 누적. 금액 원 → 억원
const REPORTS = [
  { code: "11013", q: 1 }, { code: "11012", q: 2 }, { code: "11014", q: 3 }, { code: "11011", q: 4 },
] as const;
type Acc = "sales" | "op" | "net";
const ACCOUNTS: Record<Acc, RegExp> = {
  sales: /^(매출액|수익\(매출액\)|영업수익|매출)$/,
  op: /^영업이익(\(손실\))?$/,
  net: /^(당기|분기|반기)?순이익(\(손실\))?$/,
};
type Row = Record<string, string>;
const won = (s?: string) => {
  const n = parseFloat(String(s ?? "").replace(/,/g, ""));
  return isNaN(n) ? null : n;
};
const eok = (n: number | null) => (n == null ? null : Math.round(n / 1e8));

function pick(rows: Row[]): Record<Acc, Row | undefined> {
  const fs = rows.some(r => r.fs_div === "CFS") ? "CFS" : "OFS";
  const mine = rows.filter(r => r.fs_div === fs && r.sj_div !== "BS");
  const out = {} as Record<Acc, Row | undefined>;
  for (const k of Object.keys(ACCOUNTS) as Acc[]) out[k] = mine.find(r => ACCOUNTS[k].test((r.account_nm ?? "").replace(/\s/g, "")));
  return out;
}

interface Q { period: string; year: number; q: number; prelim?: boolean; sales: number | null; op: number | null; net: number | null; salesYoY: number | null; opYoY: number | null; netYoY: number | null }
const yoy = (a: number | null, b: number | null) => (a != null && b ? parseFloat((((a - b) / Math.abs(b)) * 100).toFixed(1)) : null);

// ── 잠정실적(공정공시): 분기보고서 제출 전에 나오는 최신 분기 실적 ─────────────────
// 원문 표에서 '당해실적' 행의 [당기, 전기, 전기대비%, 전년동기, 전년동기대비%] 를 읽는다
async function prelimQuarter(corp: string, after: { year: number; q: number } | undefined): Promise<Q | null> {
  const ymd = (off: number) => new Date(Date.now() + 9 * 3_600_000 - off * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const d = await dartGet("list.json", { corp_code: corp, bgn_de: ymd(150), end_de: ymd(0), page_count: "100" });
  if (d.status !== "000") return null;
  const hit = ((d.list ?? []) as Row[])
    .filter(r => /잠정\)?실적|영업\(잠정\)/.test(r.report_nm) && /실적/.test(r.report_nm))
    .sort((a, b) => b.rcept_no.localeCompare(a.rcept_no))[0];
  if (!hit) return null;
  // 공시일로 분기 추정: 10월 공시 → 3분기, 1월 → 전년 4분기
  const y = +hit.rcept_dt.slice(0, 4), m = +hit.rcept_dt.slice(4, 6);
  let q = Math.floor((m - 1) / 3), year = y;
  if (q === 0) { q = 4; year -= 1; }
  if (after && year * 10 + q <= after.year * 10 + after.q) return null;

  const p = await fetchPrelim(hit.rcept_no, 15000);
  if (!p) return null;
  return {
    period: `${year}.${q}Q`, year, q, prelim: true,
    ...p,
  };
}

const load = unstable_cache(async (code: string) => {
  const corp = (await dartCorpMap())[code];
  if (!corp) throw new Error("DART에 등록된 상장사가 아닙니다");
  const kst = new Date(Date.now() + 9 * 3_600_000);
  const Y = kst.getUTCFullYear();
  const reports: Record<string, Record<Acc, Row | undefined>> = {};
  const jobs: [number, string][] = [];
  for (const y of [Y, Y - 1]) for (const r of REPORTS) jobs.push([y, r.code]);
  await Promise.all(jobs.map(async ([y, rc]) => {
    const d = await dartGet("fnlttSinglAcnt.json", { corp_code: corp, bsns_year: String(y), reprt_code: rc });
    if (d.status === "000") reports[`${y}-${rc}`] = pick(d.list ?? []);
  }));

  const quarters: Q[] = [];
  for (const y of [Y - 1, Y]) {
    for (const r of REPORTS) {
      const rep = reports[`${y}-${r.code}`];
      if (!rep) continue;
      const val = {} as Record<Acc, { cur: number | null; prev: number | null }>;
      for (const k of Object.keys(ACCOUNTS) as Acc[]) {
        const row = rep[k];
        if (r.q < 4) {
          val[k] = { cur: won(row?.thstrm_amount), prev: won(row?.frmtrm_amount) };
        } else {
          // 4분기 = 연간 − 같은 해 3분기 누적
          const q3 = reports[`${y}-11014`]?.[k];
          const annual = won(row?.thstrm_amount), annualPrev = won(row?.frmtrm_amount);
          const cum3 = won(q3?.thstrm_add_amount), cum3Prev = won(q3?.frmtrm_add_amount);
          val[k] = { cur: annual != null && cum3 != null ? annual - cum3 : null, prev: annualPrev != null && cum3Prev != null ? annualPrev - cum3Prev : null };
        }
      }
      if (val.sales.cur == null && val.op.cur == null) continue;
      quarters.push({
        period: `${y}.${r.q}Q`, year: y, q: r.q,
        sales: eok(val.sales.cur), op: eok(val.op.cur), net: eok(val.net.cur),
        salesYoY: yoy(val.sales.cur, val.sales.prev), opYoY: yoy(val.op.cur, val.op.prev), netYoY: yoy(val.net.cur, val.net.prev),
      });
    }
  }

  try {
    const pre = await prelimQuarter(corp, quarters[quarters.length - 1]);
    if (pre) quarters.push(pre);
  } catch { /* 잠정실적 없음 */ }

  // 연간: 가장 최근 사업보고서의 당기·전기·전전기
  const annual: { year: number; sales: number | null; op: number | null; net: number | null }[] = [];
  const lastAnnualYear = [Y, Y - 1].find(y => reports[`${y}-11011`]);
  if (lastAnnualYear) {
    const rep = reports[`${lastAnnualYear}-11011`];
    const col = ["bfefrmtrm_amount", "frmtrm_amount", "thstrm_amount"] as const;
    col.forEach((c, i) => annual.push({
      year: lastAnnualYear - 2 + i,
      sales: eok(won(rep.sales?.[c])), op: eok(won(rep.op?.[c])), net: eok(won(rep.net?.[c])),
    }));
  }
  return { quarters: quarters.slice(-8), annual: annual.filter(a => a.sales != null || a.op != null) };
}, ["dart-quarterly-v2"], { revalidate: 6 * 3600 });

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "종목코드 6자리가 필요합니다" }, { status: 400 });
  try {
    const d = await load(code);
    return NextResponse.json({ ...d, latest: d.quarters[d.quarters.length - 1] ?? null, source: "DART 정기보고서 (연결 우선)" });
  } catch (e) {
    return NextResponse.json({ quarters: [], annual: [], latest: null, error: String(e).slice(0, 160) });
  }
}
