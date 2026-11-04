// 한국 경제지표 일정.
// 1) Investing.com 임베드 위젯(국가 11=한국, 시간대 88=서울)을 시도하고
// 2) 실패하거나 비어 있으면 아래 일정표(공식 공표일정에서 확인한 날짜 + 관행 규칙으로 추정한 날짜)로 채운다.
// 규칙으로 만든 항목은 tentative=true("예정")로 표시하고 수치는 넣지 않는다.

export interface KrEcon {
  day: string;          // KST YYYY-MM-DD
  time: string;         // HH:MM (KST)
  at: string;           // ISO (정렬용)
  title: string;
  original: string;
  country: "KRW";
  countryName: "한국";
  stars: number;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  url: string;
  tentative: boolean;   // 규칙 기반 추정 일정
  source: "investing" | "official" | "rule";
}

const WIDGET = "https://sslecal2.investing.com/?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&features=datepicker,timezone&countries=11&calType=week&timeZone=88&lang=18";

const pad = (n: number | string) => String(n).padStart(2, "0");
const toAt = (day: string, time: string) => new Date(Date.parse(`${day}T${time || "23:59"}:00+09:00`)).toISOString();
const clean = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ── 1) Investing.com 위젯 파싱 (마크업이 바뀌어도 죽지 않도록 느슨하게) ─────────────
export function parseInvesting(html: string): KrEcon[] {
  const out: KrEcon[] = [];
  let curDay = "";
  // 날짜 머리행(theDay)과 이벤트 행(eventRowId_)을 문서 순서대로 훑는다
  const re = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/g;
  for (const m of Array.from(html.matchAll(re))) {
    const attrs = m[1], body = m[2];
    if (/theDay/.test(body) && !/eventRowId_/.test(attrs)) {
      const t = clean(body);
      const d = /(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})/.exec(t);
      if (d) curDay = `${d[1]}-${pad(d[2])}-${pad(d[3])}`;
      else {
        const e = /([A-Z][a-z]+)\s+(\d{1,2}),\s*(20\d{2})/.exec(t);
        if (e) { const p = Date.parse(`${e[1]} ${e[2]}, ${e[3]} 00:00:00 UTC`); if (!isNaN(p)) curDay = new Date(p).toISOString().slice(0, 10); }
      }
      continue;
    }
    if (!/eventRowId_/.test(attrs)) continue;
    const dt = /data-event-datetime="(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/.exec(attrs);
    let day = curDay, time = "";
    if (dt) { day = `${dt[1]}-${dt[2]}-${dt[3]}`; time = `${dt[4]}:${dt[5]}`; }
    else {
      const tm = /class="[^"]*\btime\b[^"]*"[^>]*>\s*(\d{1,2}):(\d{2})/.exec(body);
      if (tm) time = `${pad(tm[1])}:${tm[2]}`;
    }
    if (!day) continue;
    if (/\bcurrency\b|flagCur/.test(body) && !/KRW|South_Korea|대한민국|한국/.test(body)) continue;
    const ev = /<td[^>]*class="[^"]*\bevent\b[^"]*"[^>]*>([\s\S]*?)<\/td>/.exec(body);
    const title = ev ? clean(ev[1]) : "";
    if (!title) continue;
    const href = ev ? /href="([^"]+)"/.exec(ev[1])?.[1] : undefined;
    const bulls = (body.match(/FullBullishIcon/g) ?? []).length || Number(/bull(\d)/.exec(body)?.[1] ?? 0);
    const cell = (k: "Actual" | "Forecast" | "Previous") => {
      const cls = { Actual: "act", Forecast: "fore", Previous: "prev" }[k];
      const c = new RegExp(`<td[^>]*(?:id="event${k}_\\d+"|class="[^"]*\\b${cls}\\b[^"]*")[^>]*>([\\s\\S]*?)</td>`).exec(body);
      const v = c ? clean(c[1]) : "";
      return v && v !== "-" ? v : null;
    };
    out.push({
      day, time, at: toAt(day, time), title, original: title,
      country: "KRW", countryName: "한국", stars: Math.min(3, bulls),
      actual: cell("Actual"), forecast: cell("Forecast"), previous: cell("Previous"),
      url: href ? (href.startsWith("http") ? href : `https://kr.investing.com${href}`) : "https://kr.investing.com/economic-calendar/",
      tentative: false, source: "investing",
    });
  }
  return out;
}

export async function fetchInvestingKR(): Promise<KrEcon[]> {
  const res = await fetch(WIDGET, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36",
      Accept: "text/html", "Accept-Language": "ko-KR,ko;q=0.9", Referer: "https://kr.investing.com/",
    },
    signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  if (!res.ok) throw new Error(`investing HTTP ${res.status}`);
  return parseInvesting(await res.text());
}

// ── 2) 일정표 ─────────────────────────────────────────────────────────────
const BOK = "https://www.bok.or.kr/portal/main/main.do";
const MODS = "https://mods.go.kr/";
const MOTIE = "https://www.motie.go.kr/";
const CUSTOMS = "https://www.customs.go.kr/";

// 공식 공표일정에서 확인한 날짜 (한국은행 회의일정·월간통계 공표일정, 국가데이터처 월간 공표일정)
const CONFIRMED: { key: string; day: string; time: string; title: string; stars: number; url: string }[] = [
  { key: "mpc", day: "2026-10-22", time: "10:00", title: "한국은행 금통위 기준금리 결정", stars: 3, url: BOK },
  { key: "mpc", day: "2026-11-26", time: "10:00", title: "한국은행 금통위 기준금리 결정", stars: 3, url: BOK },
  { key: "cpi", day: "2026-11-03", time: "08:00", title: "10월 소비자물가동향", stars: 3, url: MODS },
  { key: "emp", day: "2026-11-11", time: "08:00", title: "10월 고용동향", stars: 2, url: MODS },
  { key: "ccsi", day: "2026-11-24", time: "06:00", title: "11월 소비자동향조사 (소비자심리지수)", stars: 1, url: BOK },
  { key: "bsi", day: "2026-11-25", time: "06:00", title: "11월 기업경기조사·경제심리지수(ESI)", stars: 1, url: BOK },
];

// 주말 외 공휴일(영업일 계산용, 대체공휴일 포함 일부만)
const HOLIDAYS = new Set([
  "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-01",
]);
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const dow = (s: string) => new Date(s + "T00:00:00Z").getUTCDay();
const isBiz = (s: string) => ![0, 6].includes(dow(s)) && !HOLIDAYS.has(s);
const nextBiz = (s: string) => { let d = s; while (!isBiz(d)) d = iso(+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10) + 1); return d; };
const nthBiz = (y: number, m: number, n: number) => { let k = 0; for (let d = 1; d <= 31; d++) { const s = iso(y, m, d); if (+s.slice(5, 7) !== m) break; if (isBiz(s) && ++k === n) return s; } return iso(y, m, n); };
const lastBiz = (y: number, m: number) => { for (let d = 31; d >= 1; d--) { const s = iso(y, m, d); if (+s.slice(5, 7) === m && isBiz(s)) return s; } return iso(y, m, 28); };
const nthWeekday = (y: number, m: number, wd: number, n: number) => { let k = 0; for (let d = 1; d <= 31; d++) { const s = iso(y, m, d); if (dow(s) === wd && ++k === n) return s; } return iso(y, m, 28); };
const prevMonth = (m: number) => (m === 1 ? 12 : m - 1);

// 관행 규칙(예정). 날짜는 기관 사정에 따라 바뀔 수 있다
function ruleItems(y: number, m: number) {
  const pm = prevMonth(m);
  const items: { key: string; day: string; time: string; title: string; stars: number; url: string }[] = [
    { key: "trade", day: iso(y, m, 1), time: "09:00", title: `${pm}월 수출입동향`, stars: 3, url: MOTIE },
    { key: "exp10", day: nextBiz(iso(y, m, 11)), time: "09:00", title: `${m}월 1~10일 수출입 현황`, stars: 1, url: CUSTOMS },
    { key: "exp20", day: nextBiz(iso(y, m, 21)), time: "09:00", title: `${m}월 1~20일 수출입 현황 (20일 수출)`, stars: 2, url: CUSTOMS },
    { key: "cpi", day: nthBiz(y, m, 2), time: "08:00", title: `${pm}월 소비자물가동향`, stars: 3, url: MODS },
    { key: "emp", day: nthWeekday(y, m, 3, 2), time: "08:00", title: `${pm}월 고용동향`, stars: 2, url: MODS },
    { key: "ip", day: lastBiz(y, m), time: "08:00", title: `${pm}월 산업활동동향`, stars: 2, url: MODS },
  ];
  // GDP: 속보치는 1·4·7·10월 넷째 목요일 무렵, 잠정치는 3·6·9·12월 첫째 목요일 무렵 (한국은행)
  const q = ({ 1: 4, 4: 1, 7: 2, 10: 3, 3: 4, 6: 1, 9: 2, 12: 3 } as Record<number, number>)[m];
  if ([1, 4, 7, 10].includes(m)) items.push({ key: "gdp", day: nthWeekday(y, m, 4, 4), time: "08:00", title: `${q}분기 실질 GDP 속보치`, stars: 3, url: BOK });
  if ([3, 6, 9, 12].includes(m)) items.push({ key: "gdp", day: nthWeekday(y, m, 4, 1), time: "08:00", title: `${q}분기 실질 GDP 잠정치`, stars: 2, url: BOK });
  return items;
}

// from~to(포함, KST 날짜) 범위의 일정표 항목. 공식 확인 날짜가 있는 달의 같은 지표는 규칙 항목을 뺀다
export function curatedKR(from: string, to: string): KrEcon[] {
  const out: KrEcon[] = [];
  const confirmedMonths = new Set(CONFIRMED.map(c => `${c.key}|${c.day.slice(0, 7)}`));
  for (const c of CONFIRMED) {
    if (c.day < from || c.day > to) continue;
    out.push({ ...mk(c), tentative: false, source: "official" });
  }
  let y = +from.slice(0, 4), m = +from.slice(5, 7);
  const endKey = to.slice(0, 7);
  for (let guard = 0; guard < 12; guard++) {
    const ym = `${y}-${pad(m)}`;
    if (ym > endKey) break;
    for (const r of ruleItems(y, m)) {
      if (r.day < from || r.day > to) continue;
      if (confirmedMonths.has(`${r.key}|${r.day.slice(0, 7)}`)) continue;
      out.push({ ...mk(r), tentative: true, source: "rule" });
    }
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

function mk(c: { day: string; time: string; title: string; stars: number; url: string }) {
  return {
    day: c.day, time: c.time, at: toAt(c.day, c.time), title: c.title, original: c.title,
    country: "KRW" as const, countryName: "한국" as const, stars: c.stars,
    forecast: null, previous: null, actual: null, url: c.url,
  };
}
