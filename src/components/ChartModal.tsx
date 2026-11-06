"use client";

import { useEffect, useRef, useState } from "react";
import { useMarketPoll } from "@/lib/useMarketPoll";
import CandleChart, { TIMEFRAMES, type Timeframe } from "./CandleChart";

interface Props { label: string; onClose: () => void; initialTab?: "chart" | "flow" | "day" | "night" }
interface ChartPoint { date: string; close: number | null; }
interface ChartData {
  label: string; symbol: string;
  data: ChartPoint[];
  currentPrice: number | null;
  previousClose: number | null;
  currency: string;
  marketState: string;
  intraday?: boolean;
  stats?: { open: number | null; high: number | null; low: number | null; volume: number | null; amountEok: number | null; high52: number | null; low52: number | null };
}
interface FlowItem { type: string; label: string; netBuy: number; }
interface Commentary { title: string; subtitle: string; summary?: string; reasons?: { title: string; body: string; sources: { title: string; url: string; source: string }[] }[]; bullets: string[]; updatedAt: string; }
interface BreadthData { advance: number; decline: number; unchanged: number; total: number; upLimit?: number; downLimit?: number; asOf?: string; }
interface NightFuturesPoint { time: string; price: number; full?: string; }
interface NightFuturesData {
  label?: string;
  candles?: { time: number }[];
  debug?: string[];
  currentPrice: number;
  previousClose: number;
  changePct: number;
  change: number;
  marketState: string;
  points: NightFuturesPoint[];
}

const RANGES = [
  { key: "1d",  label: "1일"   },
  { key: "5d",  label: "5일"   },
  { key: "1mo", label: "1개월" },
  { key: "3mo", label: "3개월" },
  { key: "6mo", label: "6개월" },
  { key: "1y",  label: "1년"   },
];

function fmtFlow(n: number): string {
  const abs  = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 10000) return `${sign}${(abs / 10000).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}조`;
  return `${sign}${abs.toLocaleString("ko-KR")}억`;
}

const kstHM = (iso?: string) => new Date((iso ? Date.parse(iso) : Date.now()) + 9 * 3_600_000).toISOString().slice(11, 16);

export default function ChartModal({ label, onClose, initialTab }: Props) {
  const isIndex = label === "KOSPI" || label === "KOSDAQ";
  // 코스피200 선물 전용 창: 주간선물·야간선물 탭만
  const isFut = label === "코스피200 선물";

  const range = "1d";  // 머리글 등락률은 항상 전일 대비
  const [tf, setTf]                             = useState<Timeframe>("1m");
  const [futTf, setFutTf]                       = useState<Timeframe>("1m");
  const [activeTab, setActiveTab]               = useState<"chart" | "flow" | "day" | "night">(initialTab ?? (label === "코스피200 선물" ? "day" : "chart"));
  const [chartData, setChartData]               = useState<ChartData | null>(null);
  const [, setLoading]                     = useState(true);
  const [, setError]                         = useState(false);
  const [flow, setFlow]                         = useState<FlowItem[] | null>(null);
  const [flowAt, setFlowAt]                     = useState<string>("");
  const [flowLoading, setFlowLoading]           = useState(false);
  const [flowErr, setFlowErr]                   = useState("");
  const [commentary, setCommentary]             = useState<Commentary | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const [breadth, setBreadth]                   = useState<BreadthData | null>(null);
  const [breadthLoading, setBreadthLoading]     = useState(false);
  const [nightFutures, setNightFutures]         = useState<NightFuturesData | null>(null);
  const [nightLoading, setNightLoading]         = useState(false);
  const [nightError, setNightError]             = useState(false);

  // ── 차트 데이터 ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (label === "코스피200 선물") { setLoading(false); return; } // 선물 창은 선물 데이터만
    setLoading(true); setError(false);
    fetch(`/api/chart-data?label=${encodeURIComponent(label)}&range=${range}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (j.error) throw new Error(); setChartData(j); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [label, range]);

  // ── 수급 데이터 ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "flow" || !isIndex || flow !== null) return;
    setFlowLoading(true);
    fetch(`/api/investor-flow?market=${label}`, { cache: "no-store" })
      .then(r => r.json().catch(() => null))
      .then(j => {
        if (j?.flow) { setFlow(j.flow); setFlowAt(kstHM(j.timestamp)); }
        else setFlowErr(Array.isArray(j?.debug) ? j.debug.join(" | ") : String(j?.debug ?? j?.error ?? "응답 없음"));
      })
      .catch(e => setFlowErr(String(e)))
      .finally(() => setFlowLoading(false));
  }, [activeTab, isIndex, label, flow]);

  // ── 등락 현황 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "flow" || !isIndex || breadth !== null) return;
    setBreadthLoading(true);
    fetch(`/api/market-breadth?market=${label}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.advance != null) setBreadth(j); })
      .finally(() => setBreadthLoading(false));
  }, [activeTab, isIndex, label, breadth]);

  // ── AI 시황 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "flow" || !isIndex || commentary !== null || !chartData) return;
    const cp  = chartData.currentPrice;
    const pc  = chartData.previousClose;
    const pct = cp && pc ? ((cp - pc) / pc * 100) : 0;
    setCommentaryLoading(true);
    fetch(
      `/api/market-commentary?market=${label}&price=${cp ?? 0}&changePct=${pct.toFixed(2)}`,
      { cache: "no-store" }
    )
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setCommentary(j); })
      .finally(() => setCommentaryLoading(false));
  }, [activeTab, isIndex, label, commentary, chartData]);

  // ── 야간선물 데이터 ────────────────────────────────────────────────────────
  useEffect(() => {
    if ((activeTab !== "night" && activeTab !== "day") || !isFut) return;
    setNightLoading(true); setNightError(false); setNightFutures(null);
    let stale = false; // 주간↔야간을 빨리 바꿀 때 예전 응답이 덮지 않게
    fetch(`/api/night-futures?session=${activeTab}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (j.error) throw new Error(); if (!stale) setNightFutures(j); })
      .catch(() => { if (!stale) setNightError(true); })
      .finally(() => { if (!stale) setNightLoading(false); });
    return () => { stale = true; };
  }, [activeTab, isFut]);

  // ── 창이 열려 있는 동안 자동 갱신 (로딩 표시 없이 값만 교체) ───────────────
  useMarketPoll(() => {
    if (isFut) return;
    fetch(`/api/chart-data?label=${encodeURIComponent(label)}&range=${range}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && !j.error) setChartData(j); })
      .catch(() => {});
  }, 15_000, { krxOnly: false });
  useMarketPoll(() => {
    fetch(`/api/investor-flow?market=${label}`, { cache: "no-store" })
      .then(r => r.json()).then(j => { if (j?.flow) { setFlow(j.flow); setFlowAt(kstHM(j.timestamp)); } }).catch(() => {});
  }, 60_000, { enabled: activeTab === "flow" && isIndex });
  useMarketPoll(() => {
    fetch(`/api/market-breadth?market=${label}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null).then(j => { if (j?.advance != null) setBreadth(j); }).catch(() => {});
  }, 20_000, { enabled: activeTab === "flow" && isIndex });
  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;
  useMarketPoll(() => {
    const tab = activeTab;
    fetch(`/api/night-futures?session=${tab}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null).then(j => { if (j && !j.error && tabRef.current === tab) setNightFutures(j); }).catch(() => {});
  }, 20_000, { krxOnly: false, enabled: (activeTab === "night" || activeTab === "day") && isFut });

  // AI 시황은 10분마다 새로 (서버도 10분 캐시)
  useMarketPoll(() => {
    const cp = chartData?.currentPrice, pc = chartData?.previousClose;
    const pct = cp && pc ? ((cp - pc) / pc * 100) : 0;
    fetch(`/api/market-commentary?market=${label}&price=${cp ?? 0}&changePct=${pct.toFixed(2)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null).then(j => { if (j?.bullets) setCommentary(j); }).catch(() => {});
  }, 600_000, { enabled: activeTab === "flow" && isIndex });

  // ── ESC 닫기 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // ── 파생값 ────────────────────────────────────────────────────────────────
  const isPos    = (chartData?.currentPrice ?? 0) >= (chartData?.previousClose ?? 0);

  // 선택 기간 등락: 1일은 전일 종가, 그 외는 차트 첫 종가 대비
  const firstClose  = chartData?.data?.find(d => d.close != null)?.close ?? null;
  const rangeBase   = range === "1d" ? chartData?.previousClose ?? null : firstClose;
  const rangePct    = chartData?.currentPrice && rangeBase
    ? (chartData.currentPrice - rangeBase) / rangeBase * 100
    : null;
  const rangeIsPos  = (rangePct ?? 0) >= 0;
  const rangeLabel  = RANGES.find(r => r.key === range)?.label ?? "";
  const showRange   = activeTab === "chart" && range !== "1d" && rangePct != null;
  const color       = (showRange ? rangeIsPos : isPos) ? "#22c55e" : "#ef4444";
  const dayColor    = isPos ? "#22c55e" : "#ef4444";
  const changePct = chartData?.currentPrice && chartData?.previousClose
    ? ((chartData.currentPrice - chartData.previousClose) / chartData.previousClose * 100)
    : null;

  const fmt = (p: number | null) => {
    if (p == null) return "-";
    if (chartData?.currency === "KRW") return p.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + (isIndex ? "" : "원");
    return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const maxFlowAbs = flow ? Math.max(...flow.map(f => Math.abs(f.netBuy)), 1) : 1;

  const nightIsPos  = (nightFutures?.changePct ?? 0) >= 0;
  const nightColor  = nightIsPos ? "#1D9E75" : "#E24B4A";

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 animate-fade-in" onClick={onClose} />
      <div className="fixed z-50 bottom-0 left-0 right-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
        <div
          className="w-full sm:max-w-3xl bg-navy-card border border-navy-border rounded-t-3xl sm:rounded-2xl shadow-2xl animate-slide-up sm:animate-fade-in flex flex-col h-[min(80vh,660px)] sm:h-[min(92vh,720px)]"
          onClick={e => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-navy-border/60 shrink-0">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-white">{label}</h3>
                {chartData?.marketState === "REGULAR" && (
                  <span className="text-signal-green text-xs">● 장중</span>
                )}
              </div>
              {isFut && nightFutures && (
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold num" style={{ color: nightFutures.changePct >= 0 ? "#1D9E75" : "#E24B4A" }}>{nightFutures.currentPrice.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</span>
                  <span className="text-sm font-semibold num" style={{ color: nightFutures.changePct >= 0 ? "#1D9E75" : "#E24B4A" }}>
                    {nightFutures.changePct >= 0 ? "▲" : "▼"} {Math.abs(nightFutures.changePct).toFixed(2)}%
                  </span>
                  <span className="text-xs text-gray-500">{activeTab === "night" ? "야간" : "주간"}</span>
                </div>
              )}
              {!isFut && chartData && (
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold num" style={{ color }}>{fmt(chartData.currentPrice)}</span>
                  {showRange ? (
                    <>
                      <span className="text-sm font-semibold num" style={{ color }}>
                        {rangeLabel} {rangeIsPos ? "▲" : "▼"} {Math.abs(rangePct!).toFixed(2)}%
                      </span>
                      {changePct != null && (
                        <span className="text-xs num" style={{ color: dayColor }}>
                          (전일 {isPos ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%)
                        </span>
                      )}
                    </>
                  ) : changePct != null && (
                    <span className="text-sm font-semibold num" style={{ color }}>
                      {isPos ? "▲" : "▼"} {chartData.previousClose && chartData.currentPrice != null ? Math.abs(chartData.currentPrice - chartData.previousClose).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""} ({isPos ? "+" : "-"}{Math.abs(changePct).toFixed(2)}%)
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none px-1 mt-1 transition-colors">×</button>
          </div>

          {/* 탭 (지수만) */}
          {(isIndex || isFut) && (
            <div className="flex gap-1 px-5 pt-3 pb-0 shrink-0">
              {(isFut ? [
                { key: "day"   as const, label: "주간선물" },
                { key: "night" as const, label: "야간선물" },
              ] : [
                { key: "chart" as const, label: "차트" },
                { key: "flow"  as const, label: "수급·시황" },
              ]).map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-1.5 text-xs rounded-full transition-all font-semibold ${
                    activeTab === t.key
                      ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40"
                      : "text-gray-500 hover:text-gray-300"
                  }`}>{t.label}</button>
              ))}
            </div>
          )}

          {/* 차트 탭 */}
          {activeTab === "chart" && (
            <>
              {chartData?.stats && <IndexStats s={chartData.stats} price={chartData.currentPrice} fmt={fmt} />}
              <div className="flex gap-1 px-5 pt-3 pb-1 shrink-0 overflow-x-auto scrollbar-none">
                {TIMEFRAMES.map(([k, l]) => (
                  <button key={k} onClick={() => setTf(k)}
                    className={`px-3 py-1 text-xs rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                      tf === k ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40 font-semibold" : "text-gray-500 hover:text-gray-300"
                    }`}>{l}</button>
                ))}
              </div>
              <div className="flex-1 min-h-0 px-3 pb-3 overflow-hidden">
                <CandleChart label={label} tf={tf} height={400} digits={2} fill />
              </div>
            </>
          )}

          {/* 수급·시황 탭 */}
          {activeTab === "flow" && isIndex && (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* 당일 등락 현황 */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">당일 등락 현황{breadth?.asOf && <span className="ml-2 normal-case tracking-normal text-gray-600 num">{breadth.asOf} 기준 · 실시간</span>}</p>
                {breadthLoading ? (
                  <div className="h-16 bg-navy-border/40 rounded-xl animate-pulse" />
                ) : breadth ? (
                  <div className="bg-navy-sub/50 rounded-xl p-3 border border-navy-border/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-signal-green text-sm font-semibold num">
                        ▲ {breadth.advance.toLocaleString("ko-KR")}종목 상승
                      </span>
                      <span className="text-gray-500 text-xs num">
                        {breadth.total > 0 ? `전체 ${breadth.total.toLocaleString("ko-KR")}종목` : ""}
                      </span>
                      <span className="text-signal-red text-sm font-semibold num">
                        ▼ {breadth.decline.toLocaleString("ko-KR")}종목 하락
                      </span>
                    </div>
                    <div className="h-3 bg-navy-border rounded-full overflow-hidden flex">
                      {breadth.total > 0 && (
                        <>
                          <div className="h-full rounded-l-full transition-all"
                            style={{ width: `${(breadth.advance / breadth.total) * 100}%`, backgroundColor: "#1D9E75" }} />
                          {breadth.unchanged > 0 && (
                            <div className="h-full transition-all"
                              style={{ width: `${(breadth.unchanged / breadth.total) * 100}%`, backgroundColor: "#4B5563" }} />
                          )}
                          <div className="h-full rounded-r-full transition-all"
                            style={{ width: `${(breadth.decline / breadth.total) * 100}%`, backgroundColor: "#E24B4A" }} />
                        </>
                      )}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-signal-green/70">
                        {breadth.upLimit ? `상한 ${breadth.upLimit} · ` : ""}
                        {breadth.total > 0 ? `${((breadth.advance / breadth.total) * 100).toFixed(1)}%` : "-"}
                      </span>
                      <span className="text-xs text-signal-red/70">
                        {breadth.total > 0 ? `${((breadth.decline / breadth.total) * 100).toFixed(1)}%` : "-"}
                        {breadth.downLimit ? ` · 하한 ${breadth.downLimit}` : ""}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">등락 데이터를 불러올 수 없습니다</p>
                )}
              </div>

              {/* 투자자별 순매수 */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">투자자별 순매수 (당일){flowAt && <span className="ml-2 normal-case tracking-normal text-gray-600 num">{flowAt} 기준 · 1분마다 갱신</span>}</p>
                {flowLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map(i => <div key={i} className="h-16 bg-navy-border/40 rounded-xl animate-pulse" />)}
                  </div>
                ) : flow ? (
                  <div className="space-y-2">
                    {flow.map(f => {
                      const pos      = f.netBuy >= 0;
                      const barColor = pos ? "#1D9E75" : "#E24B4A";
                      const barPct   = Math.abs(f.netBuy) / maxFlowAbs * 100;
                      const icon     = f.label === "외국인" ? "🌐" : f.label === "기관" ? "🏦" : "👤";
                      return (
                        <div key={f.type} className="bg-navy-sub/50 rounded-xl p-3 border border-navy-border/30">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              <span>{icon}</span>
                              <span className="text-sm font-semibold text-white">{f.label}</span>
                            </div>
                            <span className={`text-sm font-bold num ${pos ? "text-signal-green" : "text-signal-red"}`}>
                              {fmtFlow(f.netBuy)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-navy-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${barPct}%`, backgroundColor: barColor }} />
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{pos ? "순매수" : "순매도"}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-gray-500">수급 데이터를 불러올 수 없습니다</p>
                    {flowErr && <p className="text-[10px] text-gray-600 mt-1 break-all">{flowErr}</p>}
                  </div>
                )}
              </div>

              {/* AI 시황 분석 */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">AI 시황 분석</p>
                {commentaryLoading ? (
                  <div className="bg-navy-sub/50 rounded-xl p-4 border border-navy-border/30 space-y-2 animate-pulse">
                    {[0, 1, 2].map(i => <div key={i} className="h-3 bg-navy-border rounded w-full" />)}
                  </div>
                ) : commentary ? (
                  <div className="bg-navy-sub/50 rounded-xl p-4 border border-cyan-brand/20">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold text-white">{commentary.title}</p>
                      <span className={`text-xs font-semibold num ${isPos ? "text-signal-green" : "text-signal-red"}`}>
                        {changePct != null ? `${label} ${Math.abs(changePct).toFixed(2)}% ${changePct >= 0 ? "▲" : "▼"}` : commentary.subtitle}
                      </span>
                    </div>
                    {commentary.summary && <p className="text-sm text-white leading-relaxed mb-3">{commentary.summary}</p>}
                    {commentary.reasons?.length ? (
                      <ol className="space-y-3">
                        {commentary.reasons.map((r, i) => (
                          <li key={i} className="flex gap-2.5">
                            <span className="w-5 h-5 shrink-0 rounded-full bg-cyan-brand/15 text-cyan-brand text-[11px] font-bold flex items-center justify-center num">{i + 1}</span>
                            <div className="min-w-0">
                              {r.title && <p className="text-xs font-semibold text-white">{r.title}</p>}
                              <p className="text-xs text-gray-300 leading-relaxed mt-0.5">{r.body}</p>
                              {r.sources.map(s => (
                                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                                  className="block text-[11px] text-gray-500 hover:text-cyan-brand truncate mt-1">↗ {s.source} · {s.title}</a>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <ul className="space-y-2.5">
                        {commentary.bullets.map((b, i) => (
                          <li key={i} className="flex gap-2 text-xs text-gray-300 leading-relaxed">
                            <span className="text-cyan-brand shrink-0 mt-0.5">*</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-gray-600 mt-3 text-right">{commentary.updatedAt} · 10분마다 재분석</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">시황 분석을 불러올 수 없습니다</p>
                )}
              </div>
            </div>
          )}

          {/* 야간선물 탭 */}
          {(activeTab === "night" || activeTab === "day") && isFut && (
            <div className="flex-1 flex flex-col min-h-0 px-5 py-4">
              {nightLoading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-cyan-brand/30 border-t-cyan-brand rounded-full animate-spin" />
                </div>
              ) : nightError || !nightFutures ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <p className="text-sm text-gray-500">야간선물 데이터를 불러올 수 없습니다</p>
                  <p className="text-xs text-gray-600">{activeTab === "day" ? "주간 세션(08:45~15:45)" : "야간 세션(18:00~06:00)"} 데이터를 받지 못했습니다</p>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-3 mb-4 shrink-0">
                    <span className="text-xl font-bold num" style={{ color: nightColor }}>
                      {nightFutures.currentPrice.toLocaleString("ko-KR")}
                    </span>
                    <span className="text-sm font-semibold num" style={{ color: nightColor }}>
                      {nightIsPos ? "▲" : "▼"} {Math.abs(nightFutures.changePct).toFixed(2)}%
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">{nightFutures.label ?? "미니 코스피200 야간선물"}</span>
                  </div>
                  {nightFutures.debug?.length ? (
                    <p className="text-[10px] text-gray-600 -mt-2 mb-3 break-all shrink-0">{nightFutures.debug.join(" | ")}</p>
                  ) : null}
                  {(nightFutures.candles?.length ?? 0) > 0 ? (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="flex gap-1 pb-1 shrink-0 overflow-x-auto scrollbar-none">
                        {TIMEFRAMES.filter(([k]) => k !== "M").map(([k, l]) => (
                          <button key={k} onClick={() => setFutTf(k)}
                            className={`px-3 py-1 text-xs rounded-lg whitespace-nowrap ${futTf === k ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40 font-semibold" : "text-gray-500 hover:text-gray-300"}`}>{l}</button>
                        ))}
                      </div>
                      <CandleChart label={`fut-${activeTab}`} tf={futTf} height={340} digits={2} url={`/api/night-futures?session=${activeTab}`} />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-2xl font-bold num mb-1" style={{ color: nightColor }}>
                          {nightFutures.currentPrice.toLocaleString("ko-KR")}
                        </p>
                        <p className="text-xs text-gray-500">현재가 (차트 데이터 없음)</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// 지수 시세 요약: 시가·고가·저가·거래량(거래대금) + 52주 범위 막대
function IndexStats({ s, price, fmt }: { s: NonNullable<ChartData["stats"]>; price: number | null; fmt: (p: number | null) => string }) {
  const vol = (v: number) => v >= 1e8 ? `${(v / 1e8).toFixed(2)}억주` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만주` : v.toLocaleString("ko-KR");
  const amt = (e: number) => e >= 10000 ? `${(e / 10000).toFixed(1)}조원` : `${e.toLocaleString("ko-KR")}억원`;
  const cells: [string, string][] = [
    ["시가", fmt(s.open)], ["고가", fmt(s.high)], ["저가", fmt(s.low)],
    s.amountEok != null ? ["거래대금", amt(s.amountEok)] : ["거래량", s.volume != null ? vol(s.volume) : "-"],
  ];
  const lo = s.low52, hi = s.high52;
  const pos = lo != null && hi != null && price != null && hi > lo ? Math.min(100, Math.max(0, (price - lo) / (hi - lo) * 100)) : null;
  return (
    <div className="px-5 pt-3 shrink-0 space-y-2.5">
      <div className="grid grid-cols-4 gap-1.5">
        {cells.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-navy-sub px-2 py-1.5 min-w-0">
            <p className="text-[10px] text-gray-500">{k}</p>
            <p key={v} className="text-[12px] sm:text-sm font-semibold text-white num truncate rounded animate-tick">{v}</p>
          </div>
        ))}
      </div>
      {pos != null && (
        <div>
          <div className="flex justify-between text-[10px] text-gray-500 num mb-1"><span>52주 저 {fmt(lo)}</span><span>52주 고 {fmt(hi)}</span></div>
          <div className="relative h-1.5 rounded-full" style={{ background: "linear-gradient(90deg,#ef4444,#d4a017,#22c55e)" }}>
            <span className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-navy" style={{ left: `${pos}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
