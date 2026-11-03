"use client";

import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    fetch("/api/econ-calendar", { cache: "no-store" })
      .then(r => r.json())
      .then(j => { setEvents(j.items ?? []); if (j.error) setError(j.error); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo(() => Array.from(new Set(events.map(e => e.day))).sort(), [events]);
  const idx = days.indexOf(day);

  const list = events.filter(e =>
    e.day === day &&
    (minStars === 0 || e.stars === minStars) &&
    (country === "ALL" || e.country === country)
  );

  return (
    <main className="max-w-3xl mx-auto px-4 py-5 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">경제 캘린더</h1>
        <p className="text-xs text-gray-500 mt-0.5">주요국 경제지표·중앙은행 일정 (한국 시간)</p>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => idx > 0 && setDay(days[idx - 1])} disabled={idx <= 0}
          className="w-9 h-9 rounded-lg border border-navy-border text-gray-300 disabled:opacity-30">‹</button>
        <p className="flex-1 text-center text-base font-bold text-white">{dayLabel(day)}</p>
        <button onClick={() => idx >= 0 && idx < days.length - 1 && setDay(days[idx + 1])} disabled={idx < 0 || idx >= days.length - 1}
          className="w-9 h-9 rounded-lg border border-navy-border text-gray-300 disabled:opacity-30">›</button>
        <button onClick={() => setDay(kstToday())}
          className="px-3 h-9 rounded-lg border border-navy-border text-xs text-gray-300">오늘</button>
      </div>

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
            : idx < 0 ? "이 날짜의 일정 데이터가 없습니다 (이번 주·다음 주만 제공)"
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
    </main>
  );
}
