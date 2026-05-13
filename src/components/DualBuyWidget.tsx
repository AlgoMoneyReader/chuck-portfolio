"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DualBuyItem {
  code: string;
  name: string;
  market: "KS" | "KQ";
  price: number;
  changePct: number;
  foreign: number;
  institution: number;
  combined: number;
}

interface ApiResponse {
  stocks: DualBuyItem[];
  timestamp: string;
  threshold: number;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonTable() {
  return (
    <div className="animate-pulse space-y-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid items-center gap-3 py-3 border-b border-navy-border/30"
          style={{ gridTemplateColumns: "2rem 1fr 5rem 6rem 5.5rem 6rem 6rem 1fr" }}>
          <div className="h-3 w-4 bg-navy-border rounded mx-auto" />
          <div className="space-y-1.5">
            <div className="h-3 bg-navy-border rounded w-3/4" />
            <div className="h-2.5 bg-navy-border/60 rounded w-1/2" />
          </div>
          <div className="h-3 bg-navy-border rounded" />
          <div className="h-3 bg-navy-border rounded" />
          <div className="h-3 bg-navy-border rounded w-2/3 ml-auto" />
          <div className="h-3 bg-navy-border rounded w-2/3 ml-auto" />
          <div className="h-3 bg-navy-border rounded w-3/4 ml-auto" />
          <div className="h-2 bg-navy-border rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Ratio Bar ─────────────────────────────────────────────────────────────────

function RatioBar({ foreign, institution }: { foreign: number; institution: number }) {
  const total = foreign + institution;
  if (total === 0) return <div className="h-2 bg-navy-border/30 rounded w-full" />;
  const fPct = Math.round((foreign / total) * 100);
  const oPct = 100 - fPct;
  return (
    <div className="flex w-full h-2 rounded-full overflow-hidden gap-px">
      <div
        className="bg-cyan-brand/80 rounded-l transition-all duration-500"
        style={{ width: `${fPct}%` }}
        title={`외국인 ${fPct}%`}
      />
      <div
        className="bg-signal-green/80 rounded-r transition-all duration-500"
        style={{ width: `${oPct}%` }}
        title={`기관 ${oPct}%`}
      />
    </div>
  );
}

// ── 억원 포맷 ─────────────────────────────────────────────────────────────────
function fmtUk(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}조`;
  return `${n.toLocaleString("ko-KR")}억`;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DualBuyWidget() {
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setApiError(false);
    if (silent) setRefreshing(true);
    try {
      const res = await fetch("/api/dual-buy", { cache: "no-store" });
      if (!res.ok) { setApiError(true); return; }
      const json: ApiResponse = await res.json();
      if ((json as { error?: string })?.error) { setApiError(true); return; }
      setData(json);
      setApiError(false);
    } catch { setApiError(true); }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  /** 종목 클릭 → /analyze?ticker=005930.KS&name=삼성전자 */
  function goAnalyze(stock: DualBuyItem) {
    router.push(
      `/analyze?ticker=${stock.code}.${stock.market}&name=${encodeURIComponent(stock.name)}`
    );
  }

  const ts = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString("ko-KR", {
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  // 컬럼 레이아웃: 순위 | 종목명+코드 | 시장 | 현재가 | 등락률 | 외국인 | 기관 | 비율바
  const COLS = "2.5rem 1fr 4rem 7rem 5.5rem 6.5rem 6.5rem 8rem";

  return (
    <div className="bg-navy-card border border-navy-border rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-navy-border/50">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🎯</span>
          <h2 className="text-sm font-bold text-white tracking-tight">실시간 쌍끌이 포착</h2>
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-signal-green/15 text-signal-green border border-signal-green/30 rounded font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
            LIVE
          </span>
          {refreshing && (
            <span className="w-3.5 h-3.5 border border-gray-600 border-t-cyan-brand/70 rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-1.5 rounded-sm bg-cyan-brand/80 inline-block" />외국인
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-1.5 rounded-sm bg-signal-green/80 inline-block" />기관
            </span>
          </div>
          {ts && (
            <span className="text-xs text-gray-600">{ts} 기준</span>
          )}
        </div>
      </div>

      {/* ── Table Header ── */}
      {!loading && !apiError && data && data.stocks.length > 0 && (
        <div
          className="grid items-center gap-3 px-5 py-2 bg-navy-sub/40 border-b border-navy-border/30"
          style={{ gridTemplateColumns: COLS }}
        >
          <span className="text-xs text-gray-600 text-center">#</span>
          <span className="text-xs text-gray-600">종목명</span>
          <span className="text-xs text-gray-600 text-center">시장</span>
          <span className="text-xs text-gray-600 text-right">현재가</span>
          <span className="text-xs text-gray-600 text-right">등락률</span>
          <span className="text-xs text-gray-600 text-right">외국인 순매수</span>
          <span className="text-xs text-gray-600 text-right">기관 순매수</span>
          <span className="text-xs text-gray-600 text-center">매수 비율</span>
        </div>
      )}

      {/* ── Body ── */}
      <div className="px-5 py-2">
        {loading ? (
          <SkeletonTable />
        ) : apiError ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm text-orange-400/80 font-medium">⚠️ KIS API 연결 실패</p>
            <p className="text-xs text-gray-600 leading-relaxed">
              KIS 인증정보를 확인하세요.<br />
              Vercel → Settings → Environment Variables
            </p>
          </div>
        ) : !data || data.stocks.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-500">현재 외국인·기관 동반 순매수 종목이 없습니다.</p>
            <p className="text-xs text-gray-600 mt-1">장 마감 후 또는 수급 신호 미발생 상태입니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-navy-border/20">
            {data.stocks.map((stock, idx) => {
              const isPos = stock.changePct >= 0;
              const totalFlow = stock.foreign + stock.institution;
              const fPct = totalFlow > 0 ? Math.round((stock.foreign / totalFlow) * 100) : 50;

              return (
                <button
                  key={stock.code}
                  onClick={() => goAnalyze(stock)}
                  className="w-full grid items-center gap-3 py-3 px-0
                    hover:bg-navy-sub/70 rounded-lg -mx-0 transition-all duration-150
                    cursor-pointer group text-left"
                  style={{ gridTemplateColumns: COLS }}
                  title={`${stock.name} AI 분석 →`}
                >
                  {/* 순위 */}
                  <span className="text-xs font-bold text-gray-500 text-center">
                    {idx + 1}
                  </span>

                  {/* 종목명 + 코드 */}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate group-hover:text-cyan-brand transition-colors duration-150">
                      {stock.name}
                    </p>
                    <p className="text-xs text-gray-600 font-mono mt-0.5">
                      {stock.code}
                    </p>
                  </div>

                  {/* 시장 */}
                  <span className={`text-xs font-medium text-center px-1.5 py-0.5 rounded
                    ${stock.market === "KS"
                      ? "text-blue-400 bg-blue-400/10"
                      : "text-purple-400 bg-purple-400/10"
                    }`}>
                    {stock.market === "KS" ? "KOSPI" : "KOSDAQ"}
                  </span>

                  {/* 현재가 */}
                  <span className="text-sm font-semibold text-white text-right num tabular-nums">
                    {stock.price > 0
                      ? stock.price.toLocaleString("ko-KR") + "원"
                      : "—"
                    }
                  </span>

                  {/* 등락률 */}
                  <span className={`text-sm font-bold text-right num tabular-nums ${
                    isPos ? "text-signal-green" : "text-signal-red"
                  }`}>
                    {isPos ? "▲" : "▼"}{Math.abs(stock.changePct).toFixed(2)}%
                  </span>

                  {/* 외국인 순매수 */}
                  <div className="text-right">
                    <span className="text-sm font-semibold text-cyan-brand num tabular-nums">
                      +{fmtUk(stock.foreign)}
                    </span>
                  </div>

                  {/* 기관 순매수 */}
                  <div className="text-right">
                    <span className="text-sm font-semibold text-signal-green num tabular-nums">
                      +{fmtUk(stock.institution)}
                    </span>
                  </div>

                  {/* 비율 바 + 퍼센트 */}
                  <div className="flex flex-col gap-1 min-w-0">
                    <RatioBar foreign={stock.foreign} institution={stock.institution} />
                    <div className="flex justify-between text-[10px] text-gray-600 tabular-nums">
                      <span className="text-cyan-brand/70">{fPct}%</span>
                      <span className="text-signal-green/70">{100 - fPct}%</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      {!loading && !apiError && data && data.stocks.length > 0 && (
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-navy-border/40 bg-navy-sub/20">
          <p className="text-xs text-gray-600">
            클릭 시 AI 종목 분석 페이지로 이동
          </p>
          <p className="text-xs text-gray-600">
            외국인·기관 동반 순매수 <span className="text-white font-medium">{data.stocks.length}</span>개 포착
          </p>
        </div>
      )}
    </div>
  );
}
