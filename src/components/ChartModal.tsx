"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

interface Props { label: string; onClose: () => void; }
interface ChartPoint { date: string; close: number | null; }
interface ChartData {
  label: string; symbol: string;
  data: ChartPoint[];
  currentPrice: number | null;
  previousClose: number | null;
  currency: string;
  marketState: string;
}
interface FlowItem { type: string; label: string; netBuy: number; }
interface Commentary { title: string; subtitle: string; bullets: string[]; updatedAt: string; }

const RANGES = [
  { key: "1d",  label: "1일"   },
  { key: "5d",  label: "5일"   },
  { key: "1mo", label: "1개월" },
  { key: "3mo", label: "3개월" },
  { key: "6mo", label: "6개월" },
  { key: "1y",  label: "1년"   },
];

function fmtFlow(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}조`;
  return `${sign}${abs.toLocaleString("ko-KR")}억`;
}

function CustomTooltip({ active, payload, label: dateStr, currency }: {
  active?: boolean; payload?: { value: number }[]; label?: string; currency: string;
}) {
  if (!active || !payload?.length || !dateStr) return null;
  const val = payload[0].value;
  const formatted = currency === "KRW"
    ? val.toLocaleString("ko-KR")
    : val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="bg-navy-card border border-navy-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-0.5">{dateStr}</p>
      <p className="text-white font-bold">{formatted}</p>
    </div>
  );
}

export default function ChartModal({ label, onClose }: Props) {
  const isIndex = label === "KOSPI" || label === "KOSDAQ";

  const [range, setRange]           = useState("3mo");
  const [activeTab, setActiveTab]   = useState<"chart" | "flow">("chart");
  const [chartData, setChartData]   = useState<ChartData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [flow, setFlow]             = useState<FlowItem[] | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);
  const [commentary, setCommentary]   = useState<Commentary | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(false);

  // ── 차트 데이터 ───────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true); setError(false);
    fetch(`/api/chart-data?label=${encodeURIComponent(label)}&range=${range}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (j.error) throw new Error(); setChartData(j); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [label, range]);

  // ── 수급 데이터 (수급·시황 탭, 지수만) ────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "flow" || !isIndex || flow !== null) return;
    setFlowLoading(true);
    fetch(`/api/investor-flow?market=${label}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.flow) setFlow(j.flow); })
      .finally(() => setFlowLoading(false));
  }, [activeTab, isIndex, label, flow]);

  // ── AI 시황 (수급·시황 탭, 지수만, 차트 데이터 준비 후) ───────────────────
  useEffect(() => {
    if (activeTab !== "flow" || !isIndex || commentary !== null || !chartData) return;
    const cp = chartData.currentPrice;
    const pc = chartData.previousClose;
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

  // ── ESC 닫기 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // ── 파생값 ────────────────────────────────────────────────────────────────
  const isPos   = (chartData?.currentPrice ?? 0) >= (chartData?.previousClose ?? 0);
  const color   = isPos ? "#22c55e" : "#ef4444";
  const gradId  = `grad_${label.replace(/[^a-zA-Z0-9]/g, "")}`;
  const changePct = chartData?.currentPrice && chartData?.previousClose
    ? ((chartData.currentPrice - chartData.previousClose) / chartData.previousClose * 100)
    : null;

  const fmt = (p: number | null) => {
    if (p == null) return "-";
    if (chartData?.currency === "KRW") return p.toLocaleString("ko-KR");
    return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const data = chartData?.data ?? [];
  const tickCount = 6;
  const step = data.length > tickCount ? Math.floor(data.length / tickCount) : 1;
  const ticks = data.filter((_, i) => i % step === 0).map(d => d.date);
  const maxFlowAbs = flow ? Math.max(...flow.map(f => Math.abs(f.netBuy)), 1) : 1;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 animate-fade-in" onClick={onClose} />
      <div className="fixed z-50 bottom-0 left-0 right-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div
          className="w-full sm:max-w-3xl bg-navy-card border border-navy-border rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col"
          style={{ height: "min(92vh, 640px)" }}
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
              {chartData && (
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold num" style={{ color }}>{fmt(chartData.currentPrice)}</span>
                  {changePct != null && (
                    <span className="text-sm font-semibold num" style={{ color }}>
                      {isPos ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none px-1 mt-1 transition-colors">×</button>
          </div>

          {/* 탭 (지수만) */}
          {isIndex && (
            <div className="flex gap-1 px-5 pt-3 pb-0 shrink-0">
              {([{ key: "chart", label: "차트" }, { key: "flow", label: "수급·시황" }] as const).map(t => (
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
              <div className="flex gap-1 px-5 pt-3 pb-2 shrink-0 overflow-x-auto">
                {RANGES.map(r => (
                  <button key={r.key} onClick={() => setRange(r.key)}
                    className={`px-3 py-1 text-xs rounded-full transition-all whitespace-nowrap flex-shrink-0 ${
                      range === r.key
                        ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40 font-semibold"
                        : "text-gray-500 hover:text-gray-300"
                    }`}>{r.label}</button>
                ))}
              </div>
              <div className="flex-1 min-h-0 px-2 pb-4">
                {loading ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-cyan-brand/30 border-t-cyan-brand rounded-full animate-spin" />
                  </div>
                ) : error || !data.length ? (
                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                    차트 데이터를 불러올 수 없습니다
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A2545" vertical={false} />
                      <XAxis dataKey="date" ticks={ticks}
                        tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={["auto", "auto"]}
                        tick={{ fill: "#6B7280", fontSize: 10 }}
                        tickFormatter={v =>
                          chartData?.currency === "KRW"
                            ? v >= 1000 ? (v / 1000).toFixed(0) + "K" : String(v)
                            : v.toLocaleString("en-US", { maximumFractionDigits: 0 })
                        }
                        axisLine={false} tickLine={false} width={52} />
                      <Tooltip content={<CustomTooltip currency={chartData?.currency ?? ""} />} />
                      <Area type="monotone" dataKey="close"
                        stroke={color} strokeWidth={2} fill={`url(#${gradId})`}
                        dot={false}
                        activeDot={{ r: 4, fill: color, stroke: "#04091A", strokeWidth: 2 }}
                        connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}

          {/* 수급·시황 탭 */}
          {activeTab === "flow" && isIndex && (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* 투자자별 순매수 */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">투자자별 순매수 (당일)</p>
                {flowLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map(i => <div key={i} className="h-16 bg-navy-border/40 rounded-xl animate-pulse" />)}
                  </div>
                ) : flow ? (
                  <div className="space-y-2">
                    {flow.map(f => {
                      const pos = f.netBuy >= 0;
                      const barColor = pos ? "#1D9E75" : "#E24B4A";
                      const barPct = Math.abs(f.netBuy) / maxFlowAbs * 100;
                      const icon = f.label === "외국인" ? "🌐" : f.label === "기관" ? "🏦" : "👤";
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
                  <p className="text-xs text-gray-500">수급 데이터를 불러올 수 없습니다</p>
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
                        {commentary.subtitle}
                      </span>
                    </div>
                    <ul className="space-y-2.5">
                      {commentary.bullets.map((b, i) => (
                        <li key={i} className="flex gap-2 text-xs text-gray-300 leading-relaxed">
                          <span className="text-cyan-brand shrink-0 mt-0.5">*</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-gray-600 mt-3 text-right">{commentary.updatedAt}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">시황 분석을 불러올 수 없습니다</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
