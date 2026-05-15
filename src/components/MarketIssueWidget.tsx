"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface IssueSector { name: string; impact: "positive" | "negative" }
interface MarketIssue {
  rank: number;
  title: string;
  summary: string;
  direction: "up" | "down" | "mixed";
  sectors: IssueSector[];
  relatedStocks: string[];
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  return `${Math.floor(mins / 60)}시간 전`;
}

const DIR_CONFIG = {
  up:    { icon: "▲", cls: "text-signal-green",  bg: "bg-signal-green/10 border-signal-green/20"  },
  down:  { icon: "▼", cls: "text-signal-red",    bg: "bg-signal-red/10 border-signal-red/20"      },
  mixed: { icon: "◆", cls: "text-gold",           bg: "bg-gold/10 border-gold/20"                  },
};

export default function MarketIssueWidget() {
  const [issues,    setIssues]    = useState<MarketIssue[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [expanded,    setExpanded]    = useState<number | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [displayTime, setDisplayTime] = useState("");
  const fetchedAtRef = useRef(""); // non-reactive, for interval callback

  const load = useCallback(async (force = false) => {
    if (force) { setRefreshing(true); } else { setLoading(true); }
    setError(false);
    try {
      const r = await fetch("/api/market-issues", { cache: "no-store" });
      const j = await r.json() as { issues?: MarketIssue[]; fetchedAt?: string };
      if (j.issues && j.issues.length > 0) {
        setIssues(j.issues);
        const ft = j.fetchedAt ?? new Date().toISOString();
        fetchedAtRef.current = ft;
        setDisplayTime(relativeTime(ft));
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const dataIv = setInterval(() => load(), 15 * 60 * 1000);
    const timeIv = setInterval(() => {
      if (fetchedAtRef.current) setDisplayTime(relativeTime(fetchedAtRef.current));
    }, 30_000);
    return () => { clearInterval(dataIv); clearInterval(timeIv); };
  }, [load]);

  // ── 스켈레톤 ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="card space-y-3 animate-pulse">
      <div className="flex items-center justify-between mb-1">
        <div className="h-4 bg-navy-border rounded w-36" />
        <div className="h-3 bg-navy-border rounded w-12" />
      </div>
      {[0,1,2,3,4].map(i => (
        <div key={i} className="h-14 bg-navy-border/60 rounded-xl" />
      ))}
    </div>
  );

  // ── 에러 ──────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="card-title">
          <span className="text-gold mr-1.5">✦</span>실시간 시장 이슈
        </h2>
        <button onClick={() => load(true)} className="text-xs text-gray-500 hover:text-cyan-brand transition-colors">
          재시도
        </button>
      </div>
      <p className="text-sm text-gray-500 text-center py-6">뉴스 수집에 실패했습니다</p>
    </div>
  );

  return (
    <div className="card">
      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="card-title flex items-center gap-1.5">
          <span className="text-gold">✦</span>
          <span>실시간 시장 이슈</span>
        </h2>
        <div className="flex items-center gap-2">
          {displayTime && (
            <span className="text-xs text-gray-600">{displayTime}</span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="text-xs text-gray-500 hover:text-white transition-colors disabled:opacity-40 px-2 py-1 rounded border border-navy-border hover:border-gray-500"
          >
            {refreshing ? "수집 중…" : "↻ 새로고침"}
          </button>
        </div>
      </div>

      {/* ── 이슈 목록 ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {issues.map(issue => {
          const dir        = DIR_CONFIG[issue.direction] ?? DIR_CONFIG.mixed;
          const isExpanded = expanded === issue.rank;

          return (
            <div key={issue.rank}
              className="rounded-xl border border-navy-border/40 overflow-hidden transition-all hover:border-navy-border">

              {/* 요약 행 — 클릭으로 펼치기 */}
              <button
                onClick={() => setExpanded(isExpanded ? null : issue.rank)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-navy-sub/30 transition-colors text-left"
              >
                <span className="text-xs font-bold text-gray-600 w-4 shrink-0 num">{issue.rank}</span>
                <span className={`text-xs font-bold shrink-0 ${dir.cls}`}>{dir.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{issue.title}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{issue.summary}</p>
                </div>
                {/* 섹터 미리보기 (접힘 상태) */}
                {!isExpanded && issue.sectors.length > 0 && (
                  <div className="hidden sm:flex gap-1 shrink-0">
                    {issue.sectors.slice(0, 2).map(s => (
                      <span key={s.name}
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold border ${
                          s.impact === "positive"
                            ? "bg-signal-green/10 text-signal-green border-signal-green/20"
                            : "bg-signal-red/10 text-signal-red border-signal-red/20"
                        }`}>
                        {s.name} {s.impact === "positive" ? "↑" : "↓"}
                      </span>
                    ))}
                  </div>
                )}
                <span className="text-[10px] text-gray-600 shrink-0">{isExpanded ? "▲" : "▼"}</span>
              </button>

              {/* 상세 (펼침 시) */}
              {isExpanded && (
                <div className={`px-4 pb-4 pt-2 space-y-2.5 border-t border-navy-border/30 ${dir.bg} border`}>
                  {/* 섹터 영향 */}
                  {issue.sectors.length > 0 && (
                    <div>
                      <p className="text-[9px] text-gray-600 mb-1.5 uppercase tracking-wider font-semibold">섹터 영향</p>
                      <div className="flex flex-wrap gap-1.5">
                        {issue.sectors.map(s => (
                          <span key={s.name}
                            className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                              s.impact === "positive"
                                ? "bg-signal-green/15 text-signal-green border-signal-green/30"
                                : "bg-signal-red/15 text-signal-red border-signal-red/30"
                            }`}>
                            {s.impact === "positive" ? "↑" : "↓"} {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 연관 종목 */}
                  {issue.relatedStocks.length > 0 && (
                    <div>
                      <p className="text-[9px] text-gray-600 mb-1.5 uppercase tracking-wider font-semibold">연관 종목</p>
                      <div className="flex flex-wrap gap-1.5">
                        {issue.relatedStocks.map(stock => (
                          <span key={stock}
                            className="text-xs px-2.5 py-1 bg-navy-card border border-navy-border rounded-full text-gray-300">
                            {stock}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-700 mt-3 text-right">
        Gemini AI · 매경·한경·전자신문 뉴스 종합
      </p>
    </div>
  );
}
