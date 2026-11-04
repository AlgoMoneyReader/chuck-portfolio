import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { curatedKR, fetchInvestingKR, fetchInvestingActuals, titleOverlap, type KrEcon, type GlobalActual } from "@/lib/krEcon";

export const dynamic = "force-dynamic";

// Forex Factory 공개 주간 일정. 자주 부르면 막히므로 30분 공유 캐시
const FEEDS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
];

interface FFEvent { title: string; country: string; date: string; impact: string; forecast?: string; previous?: string; actual?: string }

const COUNTRY: Record<string, string> = {
  USD: "미국", EUR: "유로존", GBP: "영국", JPY: "일본", CNY: "중국", AUD: "호주",
  CAD: "캐나다", CHF: "스위스", NZD: "뉴질랜드", KRW: "한국", ALL: "전체",
};

const EXACT: Record<string, string> = {
  "Non-Farm Employment Change": "비농업 고용",
  "ADP Non-Farm Employment Change": "ADP 비농업 고용",
  "Unemployment Rate": "실업률",
  "Unemployment Claims": "신규 실업수당 청구",
  "Average Hourly Earnings m/m": "평균 시간당 임금 (전월비)",
  "JOLTS Job Openings": "JOLTS 구인건수",
  "CPI m/m": "CPI (전월비)", "CPI y/y": "CPI (전년비)",
  "Core CPI m/m": "근원 CPI (전월비)", "Core CPI y/y": "근원 CPI (전년비)",
  "PPI m/m": "PPI (전월비)", "Core PPI m/m": "근원 PPI (전월비)",
  "Core PCE Price Index m/m": "근원 PCE 물가 (전월비)",
  "Federal Funds Rate": "연준 기준금리 결정",
  "FOMC Statement": "FOMC 성명",
  "FOMC Press Conference": "FOMC 기자회견",
  "FOMC Meeting Minutes": "FOMC 의사록",
  "Advance GDP q/q": "GDP 속보치 (전기비)",
  "Prelim GDP q/q": "GDP 잠정치 (전기비)",
  "Final GDP q/q": "GDP 확정치 (전기비)",
  "Retail Sales m/m": "소매판매 (전월비)",
  "Core Retail Sales m/m": "근원 소매판매 (전월비)",
  "ISM Manufacturing PMI": "ISM 제조업 PMI",
  "ISM Services PMI": "ISM 서비스업 PMI",
  "Flash Manufacturing PMI": "제조업 PMI (예비)",
  "Flash Services PMI": "서비스업 PMI (예비)",
  "Final Manufacturing PMI": "제조업 PMI (확정)",
  "Final Services PMI": "서비스업 PMI (확정)",
  "Crude Oil Inventories": "원유 재고",
  "Natural Gas Storage": "천연가스 재고",
  "Trade Balance": "무역수지",
  "Durable Goods Orders m/m": "내구재 주문 (전월비)",
  "Core Durable Goods Orders m/m": "근원 내구재 주문 (전월비)",
  "Factory Orders m/m": "제조업 수주 (전월비)",
  "Prelim UoM Consumer Sentiment": "미시간대 소비자심리 (예비)",
  "Revised UoM Consumer Sentiment": "미시간대 소비자심리 (확정)",
  "CB Consumer Confidence": "CB 소비자신뢰지수",
  "Pending Home Sales m/m": "잠정주택판매 (전월비)",
  "Existing Home Sales": "기존주택판매",
  "New Home Sales": "신규주택판매",
  "Building Permits": "건축허가",
  "Housing Starts": "주택착공",
  "Empire State Manufacturing Index": "뉴욕 제조업지수",
  "Philly Fed Manufacturing Index": "필라델피아 제조업지수",
  "Industrial Production m/m": "산업생산 (전월비)",
  "Main Refinancing Rate": "ECB 기준금리 결정",
  "Monetary Policy Statement": "통화정책 성명",
  "Official Bank Rate": "영란은행 기준금리 결정",
  "BOJ Policy Rate": "일본은행 기준금리 결정",
  "Cash Rate": "호주 기준금리 결정",
  "Overnight Rate": "캐나다 기준금리 결정",
  "Bank Holiday": "휴장",
};

function toKorean(title: string): string {
  if (EXACT[title]) return EXACT[title];
  let t = title;
  if (/Speaks$/.test(t)) {
    t = t.replace(/^Fed Chair .*Speaks$/, "연준 의장 연설").replace(/^FOMC Member .*Speaks$/, "FOMC 위원 연설").replace(/ Speaks$/, " 연설");
  }
  return t.replace(/ m\/m$/, " (전월비)").replace(/ y\/y$/, " (전년비)").replace(/ q\/q$/, " (전기비)");
}

const IMPACT: Record<string, number> = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

const load = unstable_cache(async () => {
  const all: FFEvent[] = [];
  const errors: string[] = [];
  for (const url of FEEDS) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      all.push(...((await res.json()) as FFEvent[]));
    } catch (e) {
      errors.push(`${url.split("/").pop()}: ${String(e).slice(0, 60)}`);
    }
  }
  if (!all.length) throw new Error(errors.join(" | ") || "no data");
  return { events: all, errors };
}, ["ff-calendar-v1"], { revalidate: 30 * 60 });

// Forex Factory 는 미국 동부 시간 기준 날짜로 일별 페이지를 연다
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function ffDayUrl(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return `https://www.forexfactory.com/calendar?day=${MON[m - 1]}${d}.${y}`;
}

// 한국 지표: Investing.com 위젯(이번 주) → 실패하면 일정표. 위젯이 덮는 날짜 구간은 위젯 결과를 우선
const KST = 9 * 3_600_000;
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const loadKR = unstable_cache(async (today: string) => {
  const from = addDays(today, -40), to = addDays(today, 60);
  let live: KrEcon[] = [];
  let note = "";
  try { live = await fetchInvestingKR(); } catch (e) { note = `한국(Investing): ${String(e).slice(0, 60)}`; }
  const curated = curatedKR(from, to);
  if (!live.length) return { items: curated, note: note || "한국(Investing): 파싱 결과 없음 → 일정표 사용", live: false };
  const lo = live.reduce((a, b) => (a < b.day ? a : b.day), live[0].day);
  const hi = live.reduce((a, b) => (a > b.day ? a : b.day), live[0].day);
  return { items: [...live, ...curated.filter(c => c.day < lo || c.day > hi)], note: "", live: true };
}, ["kr-econ-v1"], { revalidate: 3 * 3600 });

// 발표가 끝난 해외 지표의 결과값: Investing.com 에서 같은 통화·같은 시각 지표를 찾아 채운다 (10분 보관)
// 인자는 10분 단위 캐시 키로만 쓴다
// Nasdaq 경제지표 일정(결과값 포함). 국가명 → 통화 코드
const NQ_CUR: Record<string, string> = {
  "United States": "USD", "Euro Zone": "EUR", "Eurozone": "EUR", "Germany": "EUR", "France": "EUR", "Italy": "EUR", "Spain": "EUR",
  "Japan": "JPY", "China": "CNY", "United Kingdom": "GBP", "South Korea": "KRW", "Korea": "KRW",
  "Canada": "CAD", "Australia": "AUD", "New Zealand": "NZD", "Switzerland": "CHF",
};
async function nasdaqActuals(today: string): Promise<GlobalActual[]> {
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, -i + 1)); // 내일(미국 날짜 차이)~7일 전
  const all = await Promise.all(days.map(async date => {
    try {
      const res = await fetch(`https://api.nasdaq.com/api/calendar/economicevents?date=${date}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36", Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
        signal: AbortSignal.timeout(8000), cache: "no-store",
      });
      if (!res.ok) return [];
      const rows = ((await res.json())?.data?.rows ?? []) as Record<string, string>[];
      return rows.flatMap(r => {
        const actual = String(r.actual ?? "").replace(/&nbsp;/g, "").trim();
        const cur = NQ_CUR[String(r.country ?? "").trim()];
        const hm = /^(\d{1,2}):(\d{2})/.exec(String(r.gmt ?? ""));
        if (!actual || actual === "-" || !cur || !hm) return [];
        const k = new Date(Date.parse(`${date}T${hm[1].padStart(2, "0")}:${hm[2]}:00Z`) + KST).toISOString();
        return [{ day: k.slice(0, 10), time: k.slice(11, 16), currency: cur, title: String(r.eventName ?? ""), actual }];
      });
    } catch { return []; }
  }));
  return all.flat();
}

// 결과값: Nasdaq + Investing.com 을 합쳐 10분 보관 (인자는 캐시 키)
const loadActuals = unstable_cache(async (bucket: string, today: string): Promise<GlobalActual[]> => {
  if (!bucket) return [];
  const [nq, inv] = await Promise.all([nasdaqActuals(today), fetchInvestingActuals().catch(() => [] as GlobalActual[])]);
  return [...nq, ...inv];
}, ["global-actuals-v2"], { revalidate: 600 });

function fillActual<T extends { day: string; time: string; country: string; original: string; actual: string | null; at: string }>(e: T, acts: GlobalActual[]): T {
  if (e.actual || Date.parse(e.at) > Date.now()) return e;
  // 같은 통화, 발표 시각 ±10분 안의 지표 중 제목이 가장 비슷한 것
  const t0 = Date.parse(`${e.day}T${e.time || "00:00"}:00+09:00`);
  const cands = acts.filter(a => a.currency === e.country && Math.abs(Date.parse(`${a.day}T${a.time}:00+09:00`) - t0) <= 10 * 60_000);
  if (!cands.length) return e;
  const best = cands.map(a => ({ a, s: titleOverlap(a.title, e.original) })).sort((x, y) => y.s - x.s)[0];
  return best && (cands.length === 1 || best.s >= 0.34) ? { ...e, actual: best.a.actual } : e;
}

export async function GET() {
  const today = new Date(Date.now() + KST).toISOString().slice(0, 10);
  const kr = await loadKR(today).catch(e => ({ items: curatedKR(addDays(today, -40), addDays(today, 60)), note: `한국: ${String(e).slice(0, 60)}`, live: false }));
  try {
    const { events, errors } = await load();
    const seen = new Set<string>();
    const items = events
      .map(e => {
        const t = Date.parse(e.date);
        const key = `${e.date}|${e.country}|${e.title}`;
        if (isNaN(t) || seen.has(key)) return null;
        seen.add(key);
        const kst = new Date(t + 9 * 3_600_000).toISOString();
        return {
          day: kst.slice(0, 10),
          time: kst.slice(11, 16),
          at: new Date(t).toISOString(),
          title: toKorean(e.title),
          original: e.title,
          country: e.country,
          countryName: COUNTRY[e.country] ?? e.country,
          stars: IMPACT[e.impact] ?? 0,
          forecast: e.forecast || null,
          previous: e.previous || null,
          actual: e.actual || null,
          url: ffDayUrl(e.date),
          tentative: false,
          source: "forexfactory",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const acts = await loadActuals(String(Math.floor(Date.now() / 600_000)), today).catch(() => [] as GlobalActual[]);
    const filled = acts.length ? items.map(e => fillActual(e, acts)) : items;
    // 한국 지표도 같은 방식으로 (시각이 맞는 한국 지표가 하나뿐일 때 채워진다)
    const krFilled = acts.length ? kr.items.map(e => fillActual({ ...e, original: e.original ?? e.title }, acts)) : kr.items;
    const all = [...filled.filter(e => e.country !== "KRW"), ...krFilled].sort((a, b) => a.at.localeCompare(b.at));
    const days = items.map(e => e.day).sort();
    return NextResponse.json({
      items: all, errors: kr.note ? [...errors, kr.note] : errors,
      coverage: { global: days.length ? { from: days[0], to: days[days.length - 1] } : null, krLive: kr.live },
    });
  } catch (e) {
    // 해외 일정이 막혀도 한국 일정은 보여준다
    return NextResponse.json({ items: [...kr.items].sort((a, b) => a.at.localeCompare(b.at)), error: String(e), errors: kr.note ? [kr.note] : [], coverage: { global: null, krLive: kr.live } });
  }
}
