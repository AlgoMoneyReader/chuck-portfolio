import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { dartGet } from "@/lib/dart";
import { unzipFirst } from "@/lib/zip";
import { fetchPrelim } from "@/lib/prelim";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 60;

export interface MarketEvent {
  day: string;            // 한국 날짜 YYYY-MM-DD
  time: string;           // HH:MM 또는 "장전"/"장후"/""
  country: "US" | "KR";
  kind: "실적" | "IR" | "잠정실적" | "실적예고";
  title: string;
  sub?: string;
  url?: string;
  code?: string;
  name?: string;          // 종목명(국내) — 제목 앞부분을 종목 페이지로 연결
  market?: "KOSPI" | "KOSDAQ" | "US";
  rcept?: string;         // 국내 잠정실적 접수번호 (결과 파싱용)
  // 발표된 실적 결과
  result?: {
    eps?: string | null; epsForecast?: string | null; surprisePct?: number | null;   // 미국
    sales?: number | null; op?: number | null; net?: number | null;                  // 국내(억원)
    salesYoY?: number | null; opYoY?: number | null;
  };
}

const KST = 9 * 3_600_000;
const kstDate = (offDays = 0) => new Date(Date.now() + KST + offDays * 86_400_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k]); } }));
  return out;
}

// ── 미국: 나스닥 실적 발표 일정. 날짜별 시가총액 상위만 ─────────────────────────
const usEarnings = unstable_cache(async (from: string, days: number): Promise<MarketEvent[]> => {
  const dates = Array.from({ length: days }, (_, k) => addDays(from, k))
    .filter(d => ![0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay()));
  const perDay = await pool(dates, 5, async date => {
    try {
      const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36", Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const rows = ((await res.json())?.data?.rows ?? []) as Record<string, string>[];
      return rows
        .map(r => ({ r, cap: parseFloat(String(r.marketCap ?? "").replace(/[$,]/g, "")) || 0 }))
        .filter(x => x.cap >= 2e10)
        .sort((a, b) => b.cap - a.cap)
        .slice(0, 15)
        .map(({ r, cap }): MarketEvent => {
          // 미국 장 시작 전 발표 → 한국 그날 밤, 장 마감 후 → 한국 다음 날 새벽
          const after = r.time === "time-after-hours", pre = r.time === "time-pre-market";
          // 발표가 끝난 날은 Nasdaq 이 실제 EPS·서프라이즈(%)를 함께 준다
          const eps = String(r.eps ?? "").trim();
          const sp = parseFloat(String(r.surprise ?? "").replace(/[^0-9.\-]/g, ""));
          const reported = !!eps && eps !== "N/A" && eps !== "-";
          return {
            day: after ? addDays(date, 1) : date,
            time: pre ? "장전" : after ? "장후" : "",
            country: "US", kind: "실적",
            title: `${r.name} (${r.symbol})`,
            sub: [r.fiscalQuarterEnding && `${r.fiscalQuarterEnding} 분기`, r.epsForecast && `EPS 예상 ${r.epsForecast}`, `시총 $${(cap / 1e9).toFixed(0)}B`].filter(Boolean).join(" · "),
            code: r.symbol,
            market: "US",
            url: `https://www.nasdaq.com/market-activity/stocks/${String(r.symbol).toLowerCase()}/earnings`,
            ...(reported ? { result: { eps, epsForecast: r.epsForecast || null, surprisePct: isNaN(sp) ? null : sp } } : {}),
          };
        });
    } catch { return []; }
  });
  return perDay.flat();
}, ["us-earnings-v3"], { revalidate: 3600 });

// 공시 원문에서 '일시/예정일' 뒤 첫 날짜와 시각
function eventDate(xml: string): { day: string; time: string } | null {
  const text = xml.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");
  const at = text.search(/(개최\s*일시|일\s*시|예정\s*일|공시\s*예정)/);
  const seg = at >= 0 ? text.slice(at, at + 200) : text;
  const d = /(20\d{2})\s*[-.년]\s*(\d{1,2})\s*[-.월]\s*(\d{1,2})/.exec(seg);
  if (!d) return null;
  const t = /(\d{1,2})\s*[:시]\s*(\d{2})?/.exec(seg.slice(d.index + d[0].length, d.index + d[0].length + 40));
  return {
    day: `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`,
    time: t ? `${t[1].padStart(2, "0")}:${(t[2] ?? "00").padStart(2, "0")}` : "",
  };
}

// ── 국내: DART 전체 공시 검색(회사 지정 없음)에서 상장사의 잠정실적·결산실적 예고·IR ─────────
// 공정공시(I002)에 잠정실적, 시장조치/안내(I003)에 IR 개최·결산실적공시 예고가 섞여 있어 둘 다 훑는다.
// 회사 미지정 검색은 3개월 이내만 허용된다
type Filing = { corp_cls: string; corp_name: string; stock_code: string; report_nm: string; rcept_no: string; rcept_dt: string };
const MARKET: Record<string, "KOSPI" | "KOSDAQ"> = { Y: "KOSPI", K: "KOSDAQ" };

async function dartPages(params: Record<string, string>, deadline: number): Promise<{ list: Filing[]; partial: boolean }> {
  const first = await dartGet("list.json", { ...params, page_no: "1", page_count: "100" });
  if (first.status === "013") return { list: [], partial: false }; // 조회 결과 없음
  if (first.status !== "000") throw new Error(`DART ${first.status} ${first.message ?? ""}`);
  const total = Math.min(Number(first.total_page) || 1, 60);
  let partial = false;
  const rest = await pool(Array.from({ length: total - 1 }, (_, k) => k + 2), 3, async p => {
    if (Date.now() > deadline) { partial = true; return [] as Filing[]; }
    try {
      const d = await dartGet("list.json", { ...params, page_no: String(p), page_count: "100" });
      return d.status === "000" ? (d.list ?? []) as Filing[] : [];
    } catch { partial = true; return [] as Filing[]; }
  });
  return { list: [...((first.list ?? []) as Filing[]), ...rest.flat()], partial };
}

const krEvents = unstable_cache(async (today: string): Promise<{ items: MarketEvent[]; partial: boolean }> => {
  const t0 = Date.now();
  const end = today.replace(/-/g, "");
  const bgn45 = addDays(today, -45).replace(/-/g, ""), bgn30 = addDays(today, -30).replace(/-/g, "");
  // 회사 구분(Y 유가, K 코스닥)별로 나눠 받아 상장사만 남긴다
  const queries = (["Y", "K"] as const).flatMap(cls => [
    { pblntf_detail_ty: "I002", corp_cls: cls, bgn_de: bgn45, end_de: end },
    { pblntf_detail_ty: "I003", corp_cls: cls, bgn_de: bgn30, end_de: end },
  ]);
  const fails: string[] = [];
  const results = await Promise.all(queries.map(q => dartPages(q, t0 + 25_000)
    .catch(e => { fails.push((e instanceof Error ? e.message : String(e)).slice(0, 60)); return { list: [] as Filing[], partial: true }; })));
  // 전부 실패하면 빈 결과를 캐시하지 않도록 던진다
  if (fails.length === queries.length) throw new Error(fails[0]);
  let partial = results.some(r => r.partial);
  const all = results.flatMap(r => r.list).filter(r => MARKET[r.corp_cls] && /^\d{6}$/.test((r.stock_code ?? "").trim()) && !/정정|취소|철회/.test(r.report_nm));
  const byNo = new Map(all.map(r => [r.rcept_no, r]));
  const filings = Array.from(byNo.values());

  const out: MarketEvent[] = [];
  const url = (no: string) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${no}`;
  const day8 = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const base = (r: Filing) => ({ country: "KR" as const, name: r.corp_name.trim(), code: r.stock_code.trim(), market: MARKET[r.corp_cls], sub: r.report_nm.trim().replace(/\s+/g, " "), url: url(r.rcept_no) });

  // 잠정실적: 연결·별도 등 같은 날 여러 건이면 하나만
  const seen = new Set<string>();
  for (const r of filings.filter(r => /잠정/.test(r.report_nm) && /실적/.test(r.report_nm))) {
    const k = `${r.stock_code}|${r.rcept_dt}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const b = base(r);
    out.push({ ...b, day: day8(r.rcept_dt), time: "", kind: "잠정실적", title: `${b.name} 잠정실적 발표`, rcept: r.rcept_no });
  }

  // IR·실적 예고는 원문에서 개최일/예정일을 읽는다. 유가증권 우선, 최근 공시 우선으로 최대 40건
  const needDoc = filings
    .filter(r => /기업설명회|결산실적공시\s*예고/.test(r.report_nm))
    .sort((a, b) => (a.corp_cls === b.corp_cls ? b.rcept_no.localeCompare(a.rcept_no) : a.corp_cls === "Y" ? -1 : 1))
    .slice(0, 40);
  const key = process.env.DART_API_KEY!;
  const parsed = await pool(needDoc, 6, async r => {
    if (Date.now() - t0 > 42_000) { partial = true; return { r, at: null, earnings: false }; }
    try {
      const res = await fetch(`https://opendart.fss.or.kr/api/document.xml?crtfc_key=${key}&rcept_no=${r.rcept_no}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      const xml = unzipFirst(Buffer.from(await res.arrayBuffer())).toString("utf-8");
      return { r, at: eventDate(xml), earnings: /실적/.test(xml.replace(/<[^>]+>/g, "")) };
    } catch { return { r, at: null, earnings: false }; }
  });
  for (const { r, at, earnings } of parsed) {
    if (!at) continue;
    const ir = /기업설명회/.test(r.report_nm);
    const b = base(r);
    out.push({
      ...b, day: at.day, time: at.time, kind: ir ? "IR" : "실적예고",
      title: ir ? `${b.name} 기업설명회${earnings ? "(실적 발표)" : ""}` : `${b.name} 결산실적 공시 예정`,
    });
  }
  return { items: out, partial };
}, ["kr-market-events-v2"], { revalidate: 4 * 3600 });

// 잠정실적 원문 결과(공시는 바뀌지 않으므로 오래 보관)
const prelimOf = unstable_cache(async (rcept: string) => {
  try { return await fetchPrelim(rcept, 8000); } catch { return null; }
}, ["prelim-result-v1"], { revalidate: 30 * 86400 });

// 한국 시간 기준: 미국 장 마감 후 발표는 새벽(~06시), 장 시작 전 발표는 밤(~22시), 시각 모름은 맨 뒤
const sortTime = (t: string) => (t === "장후" ? "06:00" : t === "장전" ? "22:00" : t || "99:99");

export async function GET() {
  const reqStart = Date.now();
  const today = kstDate();
  const errors: string[] = [];
  const [us, krRes] = await Promise.all([
    usEarnings(addDays(today, -10), 35).catch(e => { errors.push(`미국: ${String(e).slice(0, 80)}`); return [] as MarketEvent[]; }),
    krEvents(today).catch(e => { errors.push(`국내: ${String(e).slice(0, 80)}`); return { items: [] as MarketEvent[], partial: false }; }),
  ]);
  // 최근 21일 잠정실적에 매출·영업이익 결과 붙이기 (유가증권 우선, 최대 60건, 20초 안에서)
  const targets = krRes.items
    .filter(e => e.kind === "잠정실적" && e.rcept && e.day >= addDays(today, -21))
    .sort((a, b) => (a.market === b.market ? b.day.localeCompare(a.day) : a.market === "KOSPI" ? -1 : 1))
    .slice(0, 60);
  await pool(targets, 8, async e => {
    if (Date.now() - reqStart > 48_000) return;   // 60초 제한 안에서만
    const p = await prelimOf(e.rcept!);
    if (p && (p.sales != null || p.op != null)) e.result = { sales: p.sales, op: p.op, net: p.net, salesYoY: p.salesYoY, opYoY: p.opYoY };
  });
  const kr = krRes.items;
  if (krRes.partial) errors.push("국내: 시간 제한으로 일부 공시만 반영");
  const seen = new Set<string>();
  const items = [...kr, ...us]
    .filter(e => e.day >= addDays(today, -45) && e.day <= addDays(today, 60))
    .filter(e => { const k = `${e.day}|${e.title}|${e.kind}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.day + sortTime(a.time)).localeCompare(b.day + sortTime(b.time)));
  return NextResponse.json({ items, counts: { us: us.length, kr: kr.length }, coverage: { from: addDays(today, -45), to: addDays(today, 60) }, errors }, { headers: { "Cache-Control": "no-store" } });
}
