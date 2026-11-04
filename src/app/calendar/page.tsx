"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Ev {
  day: string; time: string; title: string; original: string;
  country: string; countryName: string; stars: number;
  forecast: string | null; previous: string | null; actual: string | null;
  url?: string; tentative?: boolean; source?: string;
}

const COUNTRY_FILTERS = [
  { key: "ALL", label: "모든 국가" },
  { key: "KRW", label: "한국" },
  { key: "USD", label: "미국" },
  { key: "EUR", label: "유로존" },
  { key: "CNY", label: "중국" },
  { key: "JPY", label: "일본" },
  { key: "GBP", label: "영국" },
];
const STAR_FILTERS = [0, 3, 2, 1];

interface MarketEvent {
  day: string; time: string; country: "US" | "KR"; kind: "실적" | "IR" | "잠정실적" | "실적예고";
  title: string; sub?: string; url?: string; code?: string; name?: string; market?: "KOSPI" | "KOSDAQ" | "US";
}
const KIND_STYLE: Record<MarketEvent["kind"], string> = {
  실적: "bg-cyan-brand/15 text-cyan-brand", IR: "bg-purple-500/15 text-purple-300",
  잠정실적: "bg-signal-green/15 text-signal-green", 실적예고: "bg-gold/15 text-gold",
};
const KIND_DOT: Record<MarketEvent["kind"], string> = {
  실적: "bg-cyan-brand", IR: "bg-purple-400", 잠정실적: "bg-signal-green", 실적예고: "bg-gold",
};
const KIND_SHORT: Record<MarketEvent["kind"], string> = { 잠정실적: "잠정", 실적예고: "예고", IR: "IR", 실적: "미국" };
const KIND_ORDER: MarketEvent["kind"][] = ["잠정실적", "실적예고", "IR", "실적"];
const STAR_DOT = ["bg-gray-600", "bg-gray-400", "bg-gold", "bg-signal-red"];
const MARKET_RANK = { KOSPI: 0, US: 1, KOSDAQ: 2 } as const;
const PAGE = 15;

const shiftDay = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function dayLabel(d: string): string {
  const dt = new Date(d + "T00:00:00Z");
  return `${dt.getUTCFullYear()}년 ${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일 ${WEEKDAY[dt.getUTCDay()]}요일`;
}
const shortDay = (d: string) => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}
// 그 달을 덮는 주 단위 날짜 배열(앞뒤 빈칸은 null)
function monthCells(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function Stars({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="text-[11px] tracking-tight">
      {[1, 2, 3].map(i => <span key={i} className={i <= n ? "text-gold" : "text-gray-700"}>★</span>)}
    </span>
  );
}

function groupBy<T extends { day: string }>(xs: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) { const a = m.get(x.day); if (a) a.push(x); else m.set(x.day, [x]); }
  return m;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coverage, setCoverage] = useState<{ from: string; to: string } | null>(null);
  const [day, setDay] = useState(kstToday());
  const [ym, setYm] = useState(kstToday().slice(0, 7));
  const [view, setView] = useState<"day" | "month">("month");
  const [minStars, setMinStars] = useState(0);
  const [country, setCountry] = useState("ALL");
  const [mode, setMode] = useState<"econ" | "events">("econ");
  const [mkt, setMkt] = useState<"ALL" | "KR" | "US">("ALL");
  const [mev, setMev] = useState<MarketEvent[]>([]);
  const [mevLoading, setMevLoading] = useState(true);
  const [mevErr, setMevErr] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try { const v = localStorage.getItem("calendar-view"); if (v === "day" || v === "month") setView(v); } catch { /* 무시 */ }
  }, []);
  const changeView = (v: "day" | "month") => {
    setView(v);
    if (v === "month") setYm(day.slice(0, 7));
    try { localStorage.setItem("calendar-view", v); } catch { /* 무시 */ }
  };

  useEffect(() => {
    fetch("/api/market-events", { cache: "no-store" })
      .then(r => r.json())
      .then(j => { setMev(j.items ?? []); if (j.errors?.length) setMevErr(j.errors.join(" | ")); })
      .catch(e => setMevErr(String(e)))
      .finally(() => setMevLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/econ-calendar", { cache: "no-store" })
      .then(r => r.json())
      .then(j => { setEvents(j.items ?? []); setCoverage(j.coverage?.global ?? null); if (j.error) setError(j.error); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setExpanded(false); }, [day, mode, mkt]);

  const pickDay = (d: string) => { setDay(d); setYm(d.slice(0, 7)); };

  const econFiltered = useMemo(() => events.filter(e =>
    (minStars === 0 || e.stars === minStars) && (country === "ALL" || e.country === country)), [events, minStars, country]);
  const mevFiltered = useMemo(() => mev.filter(e => mkt === "ALL" || e.country === mkt), [mev, mkt]);
  const econByDay = useMemo(() => groupBy(econFiltered), [econFiltered]);
  const mevByDay = useMemo(() => groupBy(mevFiltered), [mevFiltered]);

  const hasEcon = events.some(e => e.day === day);
  const list = econByDay.get(day) ?? [];
  // 하루 안에서는 유가증권 → 미국 → 코스닥, 같은 시장은 시각순
  const dayEvents = useMemo(() => [...(mevByDay.get(day) ?? [])].sort((a, b) =>
    (MARKET_RANK[a.market ?? (a.country === "US" ? "US" : "KOSDAQ")] - MARKET_RANK[b.market ?? (b.country === "US" ? "US" : "KOSDAQ")])
    || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    || (a.time || "99").localeCompare(b.time || "99")), [mevByDay, day]);
  const shownEvents = expanded ? dayEvents : dayEvents.slice(0, PAGE);
  const today = kstToday();

  return (
    <main className="max-w-3xl mx-auto px-4 py-5 space-y-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">캘린더</h1>
          <p className="text-xs text-gray-500 mt-0.5">국내외 경제지표·중앙은행 일정과 기업 실적·IR (한국 시간)</p>
        </div>
      <div className="flex shrink-0 rounded-lg border border-navy-border p-0.5 text-xs font-semibold">
        {([["day", "일별"], ["month", "월별"]] as const).map(([k, l]) => (
        <button key={k} onClick={() => changeView(k)}
          className={`px-2.5 h-8 rounded-md ${view === k ? "bg-navy-sub text-white" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>
      </div>

      <div className="grid grid-cols-2 rounded-xl bg-navy-card border border-navy-border p-1 text-sm font-semibold">
        {([["econ", "경제지표", (econByDay.get(day) ?? []).length], ["events", "실적·IR", (mevByDay.get(day) ?? []).length]] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => setMode(k)}
            className={`py-2 rounded-lg ${mode === k ? "bg-navy-sub text-white" : "text-gray-500"}`}>
            {l}{n > 0 && <span className="ml-1 text-[11px] text-gold num">{n}</span>}
          </button>
        ))}
      </div>

      {mode === "events" ? (
        <div className="flex gap-2">
          {([["ALL", "전체"], ["KR", "국내"], ["US", "미국"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMkt(k)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${mkt === k ? "bg-white text-navy" : "bg-navy-card text-gray-400 border border-navy-border"}`}>{l}</button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {STAR_FILTERS.map(s => (
            <button key={s} onClick={() => setMinStars(s)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                minStars === s ? "bg-white text-navy" : "bg-navy-card text-gray-400 border border-navy-border"
              }`}>
              {s === 0 ? "전체" : <Stars n={s} />}
            </button>
          ))}
          <span className="w-px bg-navy-border shrink-0 mx-1" />
          {COUNTRY_FILTERS.map(c => (
            <button key={c.key} onClick={() => setCountry(c.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
                country === c.key ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40" : "bg-navy-card text-gray-400 border border-navy-border"
              }`}>{c.label}</button>
          ))}
        </div>
      )}

      {/* 날짜/월 이동 */}
      <div className="flex items-center gap-2">
        <button onClick={() => (view === "day" ? pickDay(shiftDay(day, -1)) : setYm(shiftMonth(ym, -1)))}
          aria-label={view === "day" ? "이전 날" : "이전 달"}
          className="w-9 h-9 shrink-0 rounded-lg border border-navy-border text-gray-300">‹</button>
        <p className="flex-1 min-w-0 text-center text-sm sm:text-base font-bold text-white truncate">
          {view === "day" ? dayLabel(day) : `${ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`}
        </p>
        <button onClick={() => (view === "day" ? pickDay(shiftDay(day, 1)) : setYm(shiftMonth(ym, 1)))}
          aria-label={view === "day" ? "다음 날" : "다음 달"}
          className="w-9 h-9 shrink-0 rounded-lg border border-navy-border text-gray-300">›</button>
        <button onClick={() => pickDay(today)}
          className="px-3 h-9 shrink-0 rounded-lg border border-navy-border text-xs text-gray-300">오늘</button>
      </div>

      {view === "month" && (
        <div className="card !p-2 sm:!p-3">
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold mb-1">
            {WEEKDAY.map((w, i) => (
              <span key={w} className={i === 0 ? "text-signal-red/80" : i === 6 ? "text-cyan-light" : "text-gray-500"}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {monthCells(ym).map((d, i) => {
              if (!d) return <div key={`b${i}`} />;
              const wd = i % 7, sel = d === day, isToday = d === today;
              return (
                <button key={d} onClick={() => setDay(d)} aria-pressed={sel} aria-label={dayLabel(d)}
                  className={`min-h-[3.4rem] sm:min-h-[5.5rem] rounded-lg p-1 sm:p-1.5 text-left flex flex-col gap-0.5 overflow-hidden border ${
                    sel ? "bg-navy-sub border-cyan-brand/60" : "border-transparent hover:bg-navy-sub/60"}`}>
                  <span className={`text-[11px] sm:text-xs font-semibold num leading-none ${
                    isToday ? "text-navy bg-gold rounded-full w-5 h-5 inline-flex items-center justify-center -ml-0.5 -mt-0.5"
                      : wd === 0 ? "text-signal-red/80" : wd === 6 ? "text-cyan-light" : "text-gray-300"}`}>{+d.slice(8)}</span>
                  {mode === "econ"
                    ? <EconCell items={econByDay.get(d) ?? []} />
                    : <EventCell items={mevByDay.get(d) ?? []} />}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2 text-[10px] text-gray-500">
            {mode === "econ" ? (
              <>
                <Legend dot={STAR_DOT[3]} label="★★★" /><Legend dot={STAR_DOT[2]} label="★★" /><Legend dot={STAR_DOT[1]} label="★" />
              </>
            ) : KIND_ORDER.map(k => <Legend key={k} dot={KIND_DOT[k]} label={k === "실적" ? "미국 실적" : k} />)}
          </div>
        </div>
      )}

      {view === "month" && <p className="text-sm font-bold text-white pt-1">{dayLabel(day)}</p>}

      {mode === "events" ? (
        <>
          {mevLoading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 bg-navy-card rounded-xl animate-pulse" />)}</div>
          ) : dayEvents.length === 0 ? (
            <div className="card text-center text-sm text-gray-500 py-10">
              이 날짜의 실적·IR 일정이 없습니다
              {mevErr && <p className="text-[10px] text-gray-600 mt-2 break-all">{mevErr}</p>}
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {shownEvents.map((e, i) => <EventItem key={`${e.title}-${e.kind}-${i}`} e={e} />)}
              </ul>
              {dayEvents.length > PAGE && (
                <button onClick={() => setExpanded(x => !x)}
                  className="w-full py-2.5 rounded-xl border border-navy-border text-xs font-semibold text-gray-300 hover:bg-navy-card">
                  {expanded ? "접기" : `더보기 (${dayEvents.length - PAGE}건)`}
                </button>
              )}
            </>
          )}
          <p className="text-[10px] text-gray-600 text-center">
            국내: DART 전체 상장사 공시(잠정실적·결산실적 예고·IR, 최근 45일, 유가증권 우선) · 미국: Nasdaq 실적 일정(시총 200억달러 이상, 장전=한국 밤·장후=한국 새벽) · 항목을 누르면 원문으로 이동
          </p>
        </>
      ) : (
        <>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 bg-navy-card rounded-xl animate-pulse" />)}</div>
          ) : list.length === 0 ? (
            <div className="card text-center text-sm text-gray-500 py-10">
              {error && !events.length ? `일정을 불러오지 못했습니다 (${error.slice(0, 80)})`
                : !hasEcon ? "이 날짜의 경제지표 일정이 없습니다"
                : "조건에 맞는 일정이 없습니다"}
              {coverage && (day < coverage.from || day > coverage.to) && (
                <p className="text-[11px] text-gray-600 mt-2">해외 지표는 {shortDay(coverage.from)}~{shortDay(coverage.to)}(이번 주·다음 주)만 제공됩니다</p>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((e, i) => <EconItem key={`${e.time}-${e.original}-${i}`} e={e} />)}
            </ul>
          )}

          <p className="text-[10px] text-gray-600 text-center">
            해외: Forex Factory 주간 일정{coverage ? `(${shortDay(coverage.from)}~${shortDay(coverage.to)})` : "(이번 주·다음 주)"} · 30분마다 갱신
            {" "}· 한국: 한국은행·국가데이터처 공표일정 + 관행 기준 추정(‘예정’ 표시, 변동 가능)
          </p>
        </>
      )}
    </main>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}</span>;
}

function EconCell({ items }: { items: Ev[] }) {
  if (!items.length) return null;
  const byStars = [3, 2, 1].map(s => items.filter(e => e.stars === s).length);
  const top = [...items].sort((a, b) => b.stars - a.stars || (a.country === "KRW" ? -1 : 0)).slice(0, 2);
  return (
    <>
      {/* 모바일: 중요도별 점 + 개수 */}
      <span className="sm:hidden flex flex-col gap-px">
        {byStars.map((n, k) => n > 0 && (
          <span key={k} className="flex items-center gap-0.5 text-[9px] leading-tight text-gray-400 num">
            <span className={`w-1.5 h-1.5 rounded-full ${STAR_DOT[3 - k]}`} />{n}
          </span>
        ))}
      </span>
      {/* 데스크톱: 주요 일정 1~2개 */}
      <span className="hidden sm:flex flex-col gap-0.5 min-w-0">
        {top.map((e, k) => (
          <span key={k} className="flex items-center gap-1 text-[10px] leading-tight text-gray-300 min-w-0">
            <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${STAR_DOT[e.stars]}`} />
            <span className="truncate">{e.title}</span>
          </span>
        ))}
        {items.length > 2 && <span className="text-[10px] text-gray-500 num">+{items.length - 2}</span>}
      </span>
    </>
  );
}

function EventCell({ items }: { items: MarketEvent[] }) {
  if (!items.length) return null;
  const counts = KIND_ORDER.map(k => [k, items.filter(e => e.kind === k).length] as const).filter(([, n]) => n > 0);
  const key = items.find(e => e.market === "KOSPI") ?? items.find(e => e.country === "US") ?? items[0];
  return (
    <span className="flex flex-col gap-px min-w-0">
      {counts.map(([k, n]) => (
        <span key={k} className="flex items-center gap-0.5 text-[9px] sm:text-[10px] leading-tight text-gray-400 num min-w-0">
          <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${KIND_DOT[k]}`} />
          <span className="hidden sm:inline">{KIND_SHORT[k]}</span>{n}
        </span>
      ))}
      <span className="hidden sm:block text-[10px] leading-tight text-gray-300 truncate">{key.name ?? key.title.replace(/\s*\(.*$/, "")}</span>
    </span>
  );
}

function EconItem({ e }: { e: Ev }) {
  return (
    <li className="card !p-4 flex gap-4 relative hover:border-cyan-brand/40">
      {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 rounded-2xl" aria-label={`${e.title} 출처 열기`} />}
      <span className="w-12 shrink-0 text-sm font-semibold text-white num pt-0.5">{e.time || "—"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Stars n={e.stars} />
          <span className="text-[10px] text-gray-400 bg-navy-sub px-1.5 py-0.5 rounded">{e.countryName}</span>
          {e.tentative && <span className="text-[10px] text-gold bg-gold/10 px-1.5 py-0.5 rounded">{e.day < kstToday() ? "추정" : "예정"}</span>}
        </div>
        <p className="text-sm font-semibold text-white mt-1">{e.title}</p>
        {(e.forecast || e.previous || e.actual) && (
          <p className="text-xs text-gray-400 mt-1 num">
            {e.actual && <span className="text-cyan-brand font-semibold mr-1">{e.actual}</span>}
            ({e.forecast ? `예상: ${e.forecast}` : ""}{e.forecast && e.previous ? " " : ""}{e.previous ? `이전: ${e.previous}` : ""})
          </p>
        )}
        {e.tentative && <p className="text-[11px] text-gray-500 mt-0.5">발표 관행 기준 추정일 · 실제 일정은 기관 공지 확인</p>}
      </div>
      {e.url && <span className="text-gray-600 self-center text-sm" aria-hidden>›</span>}
    </li>
  );
}

function EventItem({ e }: { e: MarketEvent }) {
  const name = e.country === "KR" && e.code && e.name && e.title.startsWith(e.name) ? e.name : null;
  return (
    <li className="card !p-4 flex gap-4 relative hover:border-cyan-brand/40">
      {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 rounded-2xl" aria-label={`${e.title} 원문 열기`} />}
      <span className="w-12 shrink-0 text-sm font-semibold text-white num pt-0.5">{e.time || "—"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${KIND_STYLE[e.kind]}`}>{e.kind}</span>
          <span className="text-[10px] text-gray-400 bg-navy-sub px-1.5 py-0.5 rounded">
            {e.country === "KR" ? (e.market === "KOSDAQ" ? "코스닥" : e.market === "KOSPI" ? "유가증권" : "국내") : "미국"}
          </span>
        </div>
        <p className="text-sm font-semibold text-white mt-1">
          {name ? (
            <>
              <Link href={`/stock/${e.code}`} className="relative z-10 hover:text-cyan-brand underline-offset-2 hover:underline">{name}</Link>
              {e.title.slice(name.length)}
            </>
          ) : e.title}
        </p>
        {e.sub && <p className="text-xs text-gray-400 mt-0.5">{e.sub}</p>}
        {e.url && <span className="inline-block text-[11px] text-cyan-brand mt-1">{e.country === "KR" ? "DART 공시 원문 ›" : "Nasdaq 실적 페이지 ›"}</span>}
      </div>
    </li>
  );
}
