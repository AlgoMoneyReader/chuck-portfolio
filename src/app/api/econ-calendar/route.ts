import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

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

export async function GET() {
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
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.at.localeCompare(b.at));
    return NextResponse.json({ items, errors });
  } catch (e) {
    return NextResponse.json({ items: [], error: String(e) });
  }
}
