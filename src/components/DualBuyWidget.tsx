"use client";

import { useEffect, useState, useCallback } from "react";
import { useStockModal } from "./StockModal";

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
  valueEok: number | null;
  flowShare: number | null;
}

interface ApiResponse {
  stocks: DualBuyItem[];
  timestamp: string;
  threshold: number;
  session?: string;
  criteria?: string;
  scanned?: number;
  errors?: string[];
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
  if (n >= 10000) return `${(n / 10000).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}조`;
  return `${n.toLocaleString("ko-KR")}억`;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DualBuyWidget() {
  const stockModal = useStockModal();
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
      if ((json as { error?: string })?.error || (!json.stocks?.length && json.errors?.length)) { setApiError(true); setData(json); return; }
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

  function goAnalyze(stock: DualBuyItem) {
    stockModal({ code: stock.code, name: stock.name });
  }

  const ts = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString("ko-KR", {
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  // 컬럼 레이아웃: 순위 | 종목명+코드 | 시장 | 현재가 | 등락률 | 외국인 | 기관 | 비율바
  const COLS = "2.5rem 1fr 4rem 7rem 5.5rem 6.5rem 6.5rem 8rem";

  return (
    <div className="bg-navy-card border border-navy-border rounded-xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-navy-border/50">
        <div className="flex items-center gap-2.5">
          <span className="text-sm">🎯</span>
          <h2 className="text-xs font-bold text-white tracking-tight">쌍끌이 포착</h2>
          {data?.session?.startsWith("장중") && (
            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-signal-green/15 text-signal-green border border-signal-green/30 rounded font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
              LIVE
            </span>
          )}
          {refreshing && (
            <span className="w-3.5 h-3.5 border border-gray-600 border-t-cyan-brand/70 rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-1.5 rounded-sm bg-cyan-brand/80 inline-block" />외국인
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-1.5 rounded-sm bg-signal-green/80 inline-block" />기관
            </span>
          </div>
          {ts && (
            <span className="text-[11px] text-gray-600">{ts} 기준</span>
          )}
        </div>
      </div>

      {data?.criteria && (
        <div className="px-4 py-2 border-b border-navy-border/40 text-[11px] text-gray-500 leading-relaxed">
          {data.criteria}{data.session ? ` · ${data.session}` : ""}
        </div>
      )}

      {/* ── Table Header (desktop only) ── */}
      {!loading && !apiError && data && data.stocks.length > 0 && (
        <div
          className="hidden sm:grid items-center gap-3 px-4 py-2 bg-navy-sub/40 border-b border-navy-border/30"
          style={{ gridTemplateColumns: COLS }}
        >
          <span className="text-[11px] text-gray-600 text-center">#</span>
          <span className="text-[11px] text-gray-600">종목명</span>
          <span className="text-[11px] text-gray-600 text-center">시장</span>
          <span className="text-[11px] text-gray-600 text-right">현재가</span>
          <span className="text-[11px] text-gray-600 text-right">등락률</span>
          <span className="text-[11px] text-gray-600 text-right">외국인 순매수</span>
          <span className="text-[11px] text-gray-600 text-right">기관 순매수</span>
          <span className="text-[11px] text-gray-600 text-center">매수 비율</span>
        </div>
      )}

      {/* ── Body ── */}
      <div className="px-4 py-2">
        {loading ? (
          <SkeletonTable />
        ) : apiError ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-xs text-orange-400/80 font-medium">⚠️ 수급 데이터를 불러오지 못했습니다</p>
            {data?.errors?.length ? <p className="text-[10px] text-gray-600 break-all">{data.errors.join(" | ")}</p> : null}
          </div>
        ) : !data || data.stocks.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-xs text-gray-500">기준을 넘는 외국인·기관 동반 순매수 종목이 없습니다.</p>
            <p className="text-[11px] text-gray-600 mt-1">작은 금액의 동반 매수는 신호로 보지 않습니다.</p>
          </div>
        ) : (
          <>
            {/* ── 모바일 카드형 (sm 미만) ── */}
            <div className="sm:hidden divide-y divide-navy-border/20">
              {data.stocks.map((stock, idx) => {
                const isPos    = stock.changePct >= 0;
                const totalFlow = stock.foreign + stock.institution;
                const fPct     = totalFlow > 0 ? Math.round((stock.foreign / totalFlow) * 100) : 50;
                return (
                  <button key={stock.code} onClick={() => goAnalyze(stock)}
                    className="w-full py-2 text-left hover:bg-navy-sub/70 active:bg-navy-sub/90 transition-colors rounded-lg group">
                    {/* 상단: 순위+종목명 / 시장뱃지  |  가격+등락률 */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="text-[11px] font-bold text-gray-500 pt-0.5 shrink-0 w-4 text-center">{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate group-hover:text-cyan-brand transition-colors">
                            {stock.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
                              stock.market === "KS" ? "text-blue-400 bg-blue-400/10" : "text-purple-400 bg-purple-400/10"
                            }`}>
                              {stock.market === "KS" ? "KOSPI" : "KOSDAQ"}
                            </span>
                            <span className="text-[11px] text-gray-600 font-mono">{stock.code}</span>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-white num whitespace-nowrap">
                          {stock.price > 0 ? stock.price.toLocaleString("ko-KR") + "원" : "—"}
                        </p>
                        <p className={`text-xs font-bold num whitespace-nowrap ${isPos ? "text-signal-green" : "text-signal-red"}`}>
                          {isPos ? "▲" : "▼"}{Math.abs(stock.changePct).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    {/* 하단: 비율바 + 순매수 금액 */}
                    <div className="flex items-center gap-2 pl-6">
                      <div className="flex-1">
                        <RatioBar foreign={stock.foreign} institution={stock.institution} />
                        <div className="flex justify-between text-[10px] mt-0.5 tabular-nums">
                          <span className="text-cyan-brand/70">{fPct}%</span>
                          <span className="text-signal-green/70">{100 - fPct}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[11px] tabular-nums">
                        <span className="text-cyan-brand">외 <span className="font-semibold">+{fmtUk(stock.foreign)}</span></span>
                        <span className="text-signal-green">기 <span className="font-semibold">+{fmtUk(stock.institution)}</span></span>
                      </div>
                    </div>
                    {stock.flowShare != null && (
                      <p className="pl-6 mt-1.5 text-[11px] text-gray-500 num">
                        거래대금 {stock.valueEok != null ? fmtUk(stock.valueEok) : "—"} 중 외국인+기관 순매수 <span className="text-white font-semibold">{stock.flowShare}%</span>
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── 데스크탑 테이블형 (sm 이상) ── */}
            <div className="hidden sm:block divide-y divide-navy-border/20">
              {data.stocks.map((stock, idx) => {
                const isPos    = stock.changePct >= 0;
                const totalFlow = stock.foreign + stock.institution;
                const fPct     = totalFlow > 0 ? Math.round((stock.foreign / totalFlow) * 100) : 50;
                return (
                  <button
                    key={stock.code}
                    onClick={() => goAnalyze(stock)}
                    className="w-full grid items-center gap-3 py-2 px-0
                      hover:bg-navy-sub/70 rounded-lg transition-all duration-150
                      cursor-pointer group text-left"
                    style={{ gridTemplateColumns: COLS }}
                    title={`${stock.name} AI 분석 →`}
                  >
                    <span className="text-[11px] font-bold text-gray-500 text-center">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate group-hover:text-cyan-brand transition-colors duration-150">{stock.name}</p>
                      <p className="text-[11px] text-gray-600 font-mono mt-0.5">{stock.code}</p>
                    </div>
                    <span className={`text-[11px] font-medium text-center px-1.5 py-0.5 rounded ${
                      stock.market === "KS" ? "text-blue-400 bg-blue-400/10" : "text-purple-400 bg-purple-400/10"
                    }`}>
                      {stock.market === "KS" ? "KOSPI" : "KOSDAQ"}
                    </span>
                    <span className="text-xs font-semibold text-white text-right num tabular-nums">
                      {stock.price > 0 ? stock.price.toLocaleString("ko-KR") + "원" : "—"}
                    </span>
                    <span className={`text-xs font-bold text-right num tabular-nums ${isPos ? "text-signal-green" : "text-signal-red"}`}>
                      {isPos ? "▲" : "▼"}{Math.abs(stock.changePct).toFixed(2)}%
                    </span>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-cyan-brand num tabular-nums">+{fmtUk(stock.foreign)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-signal-green num tabular-nums">+{fmtUk(stock.institution)}</span>
                    </div>
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
          </>
        )}
      </div>

      {/* ── Footer ── */}
      {!loading && !apiError && data && data.stocks.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-navy-border/40 bg-navy-sub/20">
          <p className="text-[11px] text-gray-600">
            클릭 시 종목 상세로 이동
          </p>
          <p className="text-[11px] text-gray-600">
            외국인·기관 동반 순매수 <span className="text-white font-medium">{data.stocks.length}</span>개 포착
          </p>
        </div>
      )}
    </div>
  );
}
