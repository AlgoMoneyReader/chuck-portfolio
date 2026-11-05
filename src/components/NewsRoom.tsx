"use client";

import { useCallback, useEffect, useState } from "react";
import { StockLink } from "./StockModal";

type Category = "거시경제" | "국내증시" | "국내기업" | "정책·이슈" | "해외증시";
interface StockTag { code: string; name: string; market: "KS" | "KQ" }
interface NewsItem {
  title: string; url: string; source: string; publishedAt: string | null;
  category: Category; stocks: StockTag[];
}
interface Disclosure { corp: string; code: string; market: "KS" | "KQ"; report: string; date: string; url: string }
interface IssueSector { name: string; impact: "positive" | "negative" }
interface MarketIssue {
  rank: number; title: string; summary: string;
  direction: "up" | "down" | "mixed";
  sectors: IssueSector[];
  sourceItems?: { title: string; url: string }[];
}

const CATEGORIES: ("모두" | Category)[] = ["모두", "국내증시", "국내기업", "거시경제", "정책·이슈", "해외증시"];
const SOURCE_COLOR: Record<string, string> = {
  "Investing.com": "#34D399",
  "매일경제": "#F472B6",
  "한국경제": "#38BDF8",
  "연합뉴스": "#A78BFA",
  "파이낸셜뉴스": "#FB923C",
  "조선비즈": "#60A5FA",
  "머니투데이": "#F87171",
  "서울경제": "#2DD4BF",
  "로이터": "#FBBF24",
};
const DIR = {
  up:    { icon: "▲", cls: "text-signal-green", label: "호재" },
  down:  { icon: "▼", cls: "text-signal-red",   label: "악재" },
  mixed: { icon: "◆", cls: "text-gold",         label: "혼재" },
} as const;

function relTime(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}시간 전`;
  return `${Math.floor(mins / 1440)}일 전`;
}

export default function NewsRoom() {
  const [items, setItems]         = useState<NewsItem[]>([]);
  const [issues, setIssues]       = useState<MarketIssue[]>([]);
  const [stats, setStats]         = useState<Record<string, number | string>>({});
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat]             = useState<"모두" | Category>("모두");
  const [limit, setLimit]         = useState(20);
  const [, setTick]               = useState(0);
  const [dart, setDart]           = useState<Disclosure[]>([]);
  const [dartErr, setDartErr]     = useState("");

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    const q = force ? "?bypass=1" : "";
    await Promise.allSettled([
      fetch(`/api/news-feed${q}`, { cache: "no-store" }).then(r => r.json()).then(j => {
        if (Array.isArray(j.items)) { setItems(j.items); setStats(j.sourceStats ?? {}); }
      }),
      fetch("/api/dart-disclosures", { cache: "no-store" }).then(r => r.json()).then(j => {
        setDart(Array.isArray(j.items) ? j.items : []);
        setDartErr(j.error ?? "");
      }),
      fetch(`/api/market-issues${q}`, { cache: "no-store" }).then(r => r.json()).then(j => {
        if (Array.isArray(j.issues)) setIssues(j.issues.slice(0, 6));
      }),
    ]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const data = setInterval(() => load(), 5 * 60 * 1000);
    const clock = setInterval(() => setTick(t => t + 1), 30_000);
    return () => { clearInterval(data); clearInterval(clock); };
  }, [load]);

  const filtered = cat === "모두" ? items : items.filter(i => i.category === cat);
  const shown = filtered.slice(0, limit);

  return (
    <section className="card space-y-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">마켓 리딩</h2>
          <p className="text-xs text-gray-500 mt-0.5">알읽남이 골라 읽어주는 오늘의 시장 뉴스 · 시장과 무관한 기사는 거릅니다</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          aria-label="새로고침"
          className="shrink-0 w-8 h-8 rounded-lg border border-navy-border text-gray-400 hover:text-white disabled:opacity-40"
        >
          <span className={refreshing ? "inline-block animate-spin" : ""}>↻</span>
        </button>
      </div>

      {/* 주요 이슈 (AI 요약) */}
      {issues.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-white">오늘의 핵심 이슈</p>
            <span className="text-[11px] text-gray-500">AI가 헤드라인을 묶어 요약</span>
          </div>
          <div className="-mx-4 px-4 md:-mx-6 md:px-6 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 scrollbar-none">
            {issues.map(iss => {
              const d = DIR[iss.direction] ?? DIR.mixed;
              const link = iss.sourceItems?.[0]?.url;
              const Card = link ? "a" : "div";
              return (
                <Card
                  key={iss.rank}
                  {...(link ? { href: link, target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="snap-start shrink-0 w-[78%] sm:w-[46%] bg-navy-sub/60 border border-navy-border rounded-xl p-4 block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[11px] font-semibold ${d.cls}`}>{d.icon} {d.label}</span>
                    <span className="text-[11px] text-gray-600 num">#{iss.rank}</span>
                  </div>
                  <p className="text-sm font-bold text-white leading-snug">{iss.title}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">{iss.summary}</p>
                  {iss.sectors?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {iss.sectors.map(s => (
                        <span key={s.name}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${s.impact === "positive" ? "bg-signal-green/10 text-signal-green" : "bg-signal-red/10 text-signal-red"}`}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 주요 공시 (DART) */}
      {(dart.length > 0 || dartErr) && (
        <div className="bg-navy-sub/40 border border-navy-border rounded-xl p-4">
          <p className="text-sm font-semibold text-white">공시 레이더</p>
          <p className="text-[11px] text-gray-500 mb-3">금융감독원 DART · 실적·증자·계약 등 주가 영향이 큰 공시</p>
          {dart.length === 0 ? (
            <p className="text-xs text-gray-500">{dartErr}</p>
          ) : (
            <ul className="space-y-2">
              {dart.slice(0, 6).map(d => (
                <li key={d.url} className="flex items-baseline gap-2 text-xs">
                  <StockLink 
                    className="shrink-0 font-semibold text-white hover:text-cyan-brand" code={d.code}>{d.corp}</StockLink>
                  <a href={d.url} target="_blank" rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-gray-400 hover:text-white">{d.report}</a>
                  <span className="shrink-0 text-gray-500 num">{d.date.slice(5)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 카테고리 */}
      <div className="-mx-4 px-4 md:-mx-6 md:px-6 flex gap-2 overflow-x-auto scrollbar-none">
        {CATEGORIES.map(c => {
          const n = c === "모두" ? items.length : items.filter(i => i.category === c).length;
          return (
            <button key={c} onClick={() => { setCat(c); setLimit(20); }}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                cat === c ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40" : "bg-navy-sub/60 text-gray-400 border border-transparent"
              }`}>
              {c}{n > 0 && <span className="ml-1 text-[10px] opacity-60 num">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* 헤드라인 */}
      <div>
        <p className="text-sm font-semibold text-white mb-1">실시간 헤드라인</p>
        {loading ? (
          <div className="space-y-3 mt-3">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-navy-border/50 rounded-lg animate-pulse" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">표시할 뉴스가 없습니다</p>
        ) : (
          <ul className="divide-y divide-navy-border/60">
            {shown.map(n => (
              <li key={n.url} className="flex gap-3 py-3">
                <span className="w-14 shrink-0 text-[11px] text-gray-500 pt-0.5">{relTime(n.publishedAt)}</span>
                <div className="min-w-0 flex-1">
                  <a href={n.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-white font-medium leading-snug hover:text-cyan-brand">
                    {n.title}
                  </a>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[11px] font-medium" style={{ color: SOURCE_COLOR[n.source] ?? "#9CA3AF" }}>
                      ● {n.source}
                    </span>
                    <span className="text-[10px] text-gray-400 bg-navy-sub px-1.5 py-0.5 rounded">{n.category}</span>
                    {n.stocks.map(s => (
                      <StockLink key={s.code} 
                        className="text-[10px] font-semibold text-cyan-brand bg-cyan-brand/10 px-1.5 py-0.5 rounded hover:bg-cyan-brand/20" code={s.code}>
                        {s.name}
                      </StockLink>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {filtered.length > limit && (
          <button onClick={() => setLimit(l => l + 20)}
            className="w-full mt-2 py-2 text-xs text-gray-400 border border-navy-border rounded-lg hover:text-white">
            더 보기 ({filtered.length - limit}건)
          </button>
        )}
      </div>

      {Object.keys(stats).length > 0 && (
        <p className="text-[10px] text-gray-600">
          출처: {Object.entries(stats).map(([k, v]) => `${k} ${typeof v === "number" ? `${v}건` : v}`).join(" · ")}
        </p>
      )}

    </section>
  );
}
