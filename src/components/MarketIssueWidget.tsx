"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface IssueSector { name: string; impact: "positive" | "negative" }
interface SourceItem  { title: string; url: string }
interface MarketIssue {
  rank: number; title: string; summary: string;
  direction: "up" | "down" | "mixed";
  sectors: IssueSector[];
  relatedStocks: string[];
  sourceItems?: SourceItem[];
}

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  return `${Math.floor(mins / 60)}시간 전`;
}

const DIR = {
  up:    { icon: "▲", cls: "text-signal-green" },
  down:  { icon: "▼", cls: "text-signal-red"   },
  mixed: { icon: "◆", cls: "text-gold"          },
} as const;

export default function MarketIssueWidget() {
  const [issues,      setIssues]      = useState<MarketIssue[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [expanded,    setExpanded]    = useState<number | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [displayTime, setDisplayTime] = useState("");
  const fetchedRef = useRef("");

  const load = useCallback(async (force = false) => {
    if (force) { setRefreshing(true); } else { setLoading(true); }
    setError(false);
    try {
      const url = force ? "/api/market-issues?bypass=1" : "/api/market-issues";
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json() as { issues?: MarketIssue[]; fetchedAt?: string; error?: string };
      if (j.issues && j.issues.length > 0) {
        setIssues(j.issues);
        const ft = j.fetchedAt ?? new Date().toISOString();
        fetchedRef.current = ft;
        setDisplayTime(relTime(ft));
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
      if (fetchedRef.current) setDisplayTime(relTime(fetchedRef.current));
    }, 30_000);
    return () => { clearInterval(dataIv); clearInterval(timeIv); };
  }, [load]);

  // ── 스켈레톤 ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="card space-y-2 animate-pulse">
      <div className="flex items-center justify-between mb-2">
        <div className="h-4 bg-navy-border rounded w-32" />
        <div className="h-3 bg-navy-border rounded w-12" />
      </div>
      {[0,1,2,3,4].map(i => <div key={i} className="h-12 bg-navy-border/60 rounded-xl" />)}
    </div>
  );

  if (error) return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="card-title"><span className="text-gold mr-1">✦</span>실시간 시장 이슈</h2>
        <button onClick={() => load(true)} className="text-xs text-gray-500 hover:text-white transition-colors">재시도</button>
      </div>
      <p className="text-sm text-gray-500 text-center py-6">뉴스 수집 실패</p>
    </div>
  );

  return (
    <div className="card">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="card-title flex items-center gap-1.5">
          <span className="text-gold">✦</span>실시간 시장 이슈
        </h2>
        <div className="flex items-center gap-2">
          {displayTime && <span className="text-xs text-gray-600">{displayTime}</span>}
          <button
            onClick={() => load(true)} disabled={refreshing}
            className="text-xs text-gray-500 hover:text-white disabled:opacity-40 px-2 py-1 rounded border border-navy-border hover:border-gray-500 transition-all"
          >
            {refreshing ? "수집 중…" : "↻"}
          </button>
        </div>
      </div>

      {/* 이슈 목록 */}
      <div className="space-y-1.5">
        {issues.map(issue => {
          const dir        = DIR[issue.direction] ?? DIR.mixed;
          const isOpen     = expanded === issue.rank;

          return (
            <div key={issue.rank} className="rounded-xl border border-navy-border/40 overflow-hidden">
              {/* 요약 행 */}
              <button
                onClick={() => setExpanded(isOpen ? null : issue.rank)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-navy-sub/30 transition-colors text-left"
              >
                <span className="text-xs text-gray-600 font-bold w-4 shrink-0 num">{issue.rank}</span>
                <span className={`text-xs font-bold shrink-0 ${dir.cls}`}>{dir.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight">{issue.title}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{issue.summary}</p>
                </div>
                {/* 섹터 미리보기 (접힘 상태) */}
                {!isOpen && issue.sectors.slice(0, 2).map(s => (
                  <span key={s.name}
                    className={`hidden sm:inline text-[9px] px-1.5 py-0.5 rounded-full font-semibold border shrink-0 ${
                      s.impact === "positive"
                        ? "bg-signal-green/10 text-signal-green border-signal-green/20"
                        : "bg-signal-red/10 text-signal-red border-signal-red/20"
                    }`}>
                    {s.name}{s.impact === "positive" ? "↑" : "↓"}
                  </span>
                ))}
                <span className="text-[10px] text-gray-600 shrink-0">{isOpen ? "▲" : "▼"}</span>
              </button>

              {/* 펼침 상세 */}
              {isOpen && (
                <div className="px-4 pb-4 pt-2 space-y-3 border-t border-navy-border/30 bg-navy-sub/20">

                  {/* 섹터 영향 */}
                  {issue.sectors.length > 0 && (
                    <div>
                      <p className="text-[9px] text-gray-600 mb-1.5 font-semibold uppercase tracking-wider">섹터 영향</p>
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
                      <p className="text-[9px] text-gray-600 mb-1.5 font-semibold uppercase tracking-wider">연관 종목</p>
                      <div className="flex flex-wrap gap-1.5">
                        {issue.relatedStocks.map(s => (
                          <span key={s}
                            className="text-xs px-2.5 py-1 bg-navy-card border border-navy-border rounded-full text-gray-300">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 관련 기사 원문 링크 */}
                  {issue.sourceItems && issue.sourceItems.length > 0 && (
                    <div>
                      <p className="text-[9px] text-gray-600 mb-1.5 font-semibold uppercase tracking-wider">관련 기사</p>
                      <div className="space-y-1">
                        {issue.sourceItems.map((src, i) => (
                          <a key={i}
                            href={src.url || "#"}
                            target={src.url ? "_blank" : undefined}
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg transition-colors ${
                              src.url
                                ? "text-cyan-brand/80 hover:text-cyan-brand hover:bg-navy-sub/50 cursor-pointer"
                                : "text-gray-500 cursor-default"
                            }`}
                          >
                            <span className="shrink-0 text-[9px] text-gray-600">▸</span>
                            <span className="truncate">{src.title}</span>
                            {src.url && <span className="shrink-0 text-[9px] text-gray-600">↗</span>}
                          </a>
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
        Gemini AI · 매경·한경·연합뉴스 종합
      </p>
    </div>
  );
}
