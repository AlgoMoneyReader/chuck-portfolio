import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { kisGet } from "@/lib/kis";
import { dartCorpMap, dartGet } from "@/lib/dart";
import { unzipFirst } from "@/lib/zip";

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
          return {
            day: after ? addDays(date, 1) : date,
            time: pre ? "장전" : after ? "장후" : "",
            country: "US", kind: "실적",
            title: `${r.name} (${r.symbol})`,
            sub: [r.fiscalQuarterEnding && `${r.fiscalQuarterEnding} 분기`, r.epsForecast && `EPS 예상 ${r.epsForecast}`, `시총 $${(cap / 1e9).toFixed(0)}B`].filter(Boolean).join(" · "),
            code: r.symbol,
          };
        });
    } catch { return []; }
  });
  return perDay.flat();
}, ["us-earnings-v1"], { revalidate: 3 * 3600 });

// ── 국내: 시가총액 상위 종목의 DART 공시에서 IR 개최·결산실적 예고·잠정실적 ───────────
async function topKR(): Promise<{ code: string; name: string }[]> {
  const out: { code: string; name: string }[] = [];
  for (const [isc, n] of [["0001", 30], ["1001", 20]] as const) {
    try {
      const j = await kisGet("/uapi/domestic-stock/v1/ranking/market-cap", "FHPST01740000", {
        fid_cond_mrkt_div_code: "J", fid_cond_scr_div_code: "20174", fid_div_cls_code: "0", fid_input_iscd: isc,
        fid_trgt_cls_code: "0", fid_trgt_exls_cls_code: "0", fid_input_price_1: "", fid_input_price_2: "", fid_vol_cnt: "",
      });
      out.push(...((j.output ?? []) as Record<string, string>[]).slice(0, n).map(r => ({ code: r.mksc_shrn_iscd, name: (r.hts_kor_isnm ?? "").trim() })));
    } catch { /* 건너뜀 */ }
  }
  return out;
}

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

const krEvents = unstable_cache(async (today: string): Promise<MarketEvent[]> => {
  const [top, corpMap] = await Promise.all([topKR(), dartCorpMap()]);
  const bgn = addDays(today, -45).replace(/-/g, ""), end = today.replace(/-/g, "");
  type Filing = Record<string, string> & { _name: string; _code: string };
  const filings = await pool(top, 8, async (s): Promise<Filing[]> => {
    const corp = corpMap[s.code];
    if (!corp) return [];
    try {
      const d = await dartGet("list.json", { corp_code: corp, bgn_de: bgn, end_de: end, page_count: "40" });
      return d.status === "000" ? ((d.list ?? []) as Record<string, string>[]).map(r => ({ ...r, _name: s.name, _code: s.code }) as Filing) : [];
    } catch { return []; }
  });
  const all = filings.flat();
  const out: MarketEvent[] = [];
  const url = (no: string) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${no}`;
  const day8 = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

  for (const r of all.filter(r => /잠정\)?실적|영업\(잠정\)/.test(r.report_nm) && !/정정/.test(r.report_nm))) {
    out.push({ day: day8(r.rcept_dt), time: "", country: "KR", kind: "잠정실적", title: `${r._name} 잠정실적 발표`, sub: r.report_nm.trim(), url: url(r.rcept_no), code: r._code });
  }
  const needDoc = all.filter(r => /기업설명회|결산실적공시\s*예고/.test(r.report_nm)).slice(0, 30);
  const key = process.env.DART_API_KEY!;
  const parsed = await pool(needDoc, 5, async r => {
    try {
      const res = await fetch(`https://opendart.fss.or.kr/api/document.xml?crtfc_key=${key}&rcept_no=${r.rcept_no}`, { signal: AbortSignal.timeout(12000) });
      const xml = unzipFirst(Buffer.from(await res.arrayBuffer())).toString("utf-8");
      return { r, at: eventDate(xml), earnings: /실적/.test(xml.replace(/<[^>]+>/g, "")) };
    } catch { return { r, at: null, earnings: false }; }
  });
  for (const { r, at, earnings } of parsed) {
    if (!at) continue;
    const ir = /기업설명회/.test(r.report_nm);
    out.push({
      day: at.day, time: at.time, country: "KR", kind: ir ? "IR" : "실적예고",
      title: ir ? `${r._name} 기업설명회${earnings ? "(실적 발표)" : ""}` : `${r._name} 결산실적 공시 예정`,
      sub: r.report_nm.trim(), url: url(r.rcept_no), code: r._code,
    });
  }
  return out;
}, ["kr-market-events-v1"], { revalidate: 6 * 3600 });

// 한국 시간 기준: 미국 장 마감 후 발표는 새벽(~06시), 장 시작 전 발표는 밤(~22시), 시각 모름은 맨 뒤
const sortTime = (t: string) => (t === "장후" ? "06:00" : t === "장전" ? "22:00" : t || "99:99");

export async function GET() {
  const today = kstDate();
  const errors: string[] = [];
  const [us, kr] = await Promise.all([
    usEarnings(addDays(today, -3), 14).catch(e => { errors.push(`미국: ${String(e).slice(0, 80)}`); return [] as MarketEvent[]; }),
    krEvents(today).catch(e => { errors.push(`국내: ${String(e).slice(0, 80)}`); return [] as MarketEvent[]; }),
  ]);
  const seen = new Set<string>();
  const items = [...kr, ...us]
    .filter(e => e.day >= addDays(today, -7) && e.day <= addDays(today, 30))
    .filter(e => { const k = `${e.day}|${e.title}|${e.kind}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.day + sortTime(a.time)).localeCompare(b.day + sortTime(b.time)));
  return NextResponse.json({ items, counts: { us: us.length, kr: kr.length }, errors }, { headers: { "Cache-Control": "no-store" } });
}
