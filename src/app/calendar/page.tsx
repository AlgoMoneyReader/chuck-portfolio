"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Ev {
  day: string; time: string; title: string; original: string;
  country: string; countryName: string; stars: number;
  forecast: string | null; previous: string | null; actual: string | null;
}

const COUNTRY_FILTERS = [
  { key: "ALL", label: "모든 국가" },
  { key: "USD", label: "미국" },
  { key: "EUR", label: "유로존" },
  { key: "CNY", label: "중국" },
  { key: "JPY", label: "일본" },
  { key: "GBP", label: "영국" },
];
const STAR_FILTERS = [0, 3, 2, 1];

interface MarketEvent { day: string; time: string; country: "US" | "KR"; kind: "실적" | "IR" | "잠정실적" | "실적예고"; title: string; sub?: string; url?: string; code?: string }
const KIND_STYLE: Record<MarketEvent["kind"], string> = {
  실적: "bg-cyan-brand/15 text-cyan-brand", IR: "bg-purple-500/15 text-purple-300",
  잠정실적: "bg-signal-green/15 text-signal-green", 실적예고: "bg-gold/15 text-gold",
};
const shiftDay = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function dayLabel(d: string): string {
  const dt = new Date(d + "T00:00:00Z");
  return `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일 ${WEEKDAY[dt.getUTCDay()]}요일`;
}

function Stars({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="text-[11px] tracking-tight">
      {[1, 2, 3].map(i => <span key={i} className={i <= n ? "text-gold" : "text-gray-700"}>★</span>)}
    </span>
  );
}

export default function CalendarPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [day, setDay] = useState(kstToday());
  const [minStars, setMinStars] = useState(0);
  const [country, setCountry] = useState("ALL");
  const [mode, setMode] = useState<"econ" | "events">("econ");
  const [mkt, setMkt] = useState<"ALL" | "KR" | "US">("ALL");
  const [mev, setMev] = useState<MarketEvent[]>([]);
  const [mevLoading, setMevLoading] = useState(true);
  const [mevErr, setMevErr] = useState("");

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
      .then(j => { setEvents(j.items ?? []); if (j.error) setError(j.error); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const hasEcon = events.some(e => e.day === day);
  const dayEvents = mev.filter(e => e.day === day && (mkt === "ALL" || e.country === mkt));

  const list = events.filter(e =>
    e.day === day &&
    (minStars === 0 || e.stars === minStars) &&
    (country === "ALL" || e.country === country)
  );

  return (
    <main className="max-w-3xl mx-auto px-4 py-5 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">캘린더</h1>
        <p className="text-xs text-gray-500 mt-0.5">경제지표·중앙은행 일정과 주요 기업 실적·IR (한국 시간)</p>
      </div>

      <div className="grid grid-cols-2 rounded-xl bg-navy-card border border-navy-border p-1 text-sm font-semibold">
        {([["econ", "경제지표", events.filter(e => e.day === day).length], ["events", "실적·IR", mev.filter(e => e.day === day).length]] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => setMode(k)}
            className={`py-2 rounded-lg ${mode === k ? "bg-navy-sub text-white" : "text-gray-500"}`}>
            {l}{n > 0 && <span className="ml-1 text-[11px] text-gold num">{n}</span>}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setDay(shiftDay(day, -1))}
          className="w-9 h-9 rounded-lg border border-navy-border text-gray-300">‹</button>
        <p className="flex-1 text-center text-base font-bold text-white">{dayLabel(day)}</p>
        <button onClick={() => setDay(shiftDay(day, 1))}
          className="w-9 h-9 rounded-lg border border-navy-border text-gray-300">›</button>
        <button onClick={() => setDay(kstToday())}
          className="px-3 h-9 rounded-lg border border-navy-border text-xs text-gray-300">오늘</button>
      </div>

      {mode === "events" ? (
        <>
          <div className="flex gap-2">
            {([["ALL", "전체"], ["KR", "국내"], ["US", "미국"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMkt(k)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${mkt === k ? "bg-white text-navy" : "bg-navy-card text-gray-400 border border-navy-border"}`}>{l}</button>
            ))}
          </div>
          {mevLoading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 bg-navy-card rounded-xl animate-pulse" />)}</div>
          ) : dayEvents.length === 0 ? (
            <div className="card text-center text-sm text-gray-500 py-10">
              이 날짜의 실적·IR 일정이 없습니다
              {mevErr && <p className="text-[10px] text-gray-600 mt-2 break-all">{mevErr}</p>}
            </div>
          ) : (
            <ul className="space-y-2">
              {dayEvents.map((e, i) => (
                <li key={`${e.title}-${i}`} className="card !p-4 flex gap-4">
                  <span className="w-12 shrink-0 text-sm font-semibold text-white num pt-0.5">{e.time || "—"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${KIND_STYLE[e.kind]}`}>{e.kind}</span>
                      <span className="text-[10px] text-gray-400 bg-navy-sub px-1.5 py-0.5 rounded">{e.country === "KR" ? "국내" : "미국"}</span>
                    </div>
                    {e.country === "KR" && e.code ? (
                      <Link href={`/stock/${e.code}`} className="block text-sm font-semibold text-white mt-1 hover:text-cyan-brand">{e.title}</Link>
                    ) : (
                      <p className="text-sm font-semibold text-white mt-1">{e.title}</p>
                    )}
                    {e.sub && <p className="text-xs text-gray-400 mt-0.5">{e.sub}</p>}
                    {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-block text-[11px] text-cyan-brand mt-1">공시 원문 ›</a>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-gray-600 text-center">미국: Nasdaq 실적 일정(시총 200억달러 이상, 장전=한국 밤·장후=한국 새벽) · 국내: 시가총액 상위 50종목 DART 공시</p>
        </>
      ) : (
      <>
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

      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 bg-navy-card rounded-xl animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <div className="card text-center text-sm text-gray-500 py-10">
          {error && !events.length ? `일정을 불러오지 못했습니다 (${error.slice(0, 80)})`
            : !hasEcon ? "이 날짜의 경제지표 일정이 없습니다 (이번 주·다음 주만 제공)"
            : "조건에 맞는 일정이 없습니다"}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((e, i) => (
            <li key={`${e.time}-${e.original}-${i}`} className="card !p-4 flex gap-4">
              <span className="w-12 shrink-0 text-sm font-semibold text-white num pt-0.5">{e.time}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Stars n={e.stars} />
                  <span className="text-[10px] text-gray-400 bg-navy-sub px-1.5 py-0.5 rounded">{e.countryName}</span>
                </div>
                <p className="text-sm font-semibold text-white mt-1">{e.title}</p>
                {(e.forecast || e.previous || e.actual) && (
                  <p className="text-xs text-gray-400 mt-1 num">
                    {e.actual && <span className="text-cyan-brand font-semibold mr-1">{e.actual}</span>}
                    ({e.forecast ? `예상: ${e.forecast}` : ""}{e.forecast && e.previous ? " " : ""}{e.previous ? `이전: ${e.previous}` : ""})
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-gray-600 text-center">출처: Forex Factory 주간 일정 · 30분마다 갱신</p>
      </>
      )}
    </main>
  );
}
