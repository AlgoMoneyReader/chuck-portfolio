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
  intraday?: boolean;
}

const RANGES = [
  { key: "1d",  label: "1일"   },
  { key: "5d",  label: "5일"   },
  { key: "1mo", label: "1개월" },
  { key: "3mo", label: "3개월" },
  { key: "6mo", label: "6개월" },
  { key: "1y",  label: "1년"   },
];

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
      <p className="text-white font-bold">{formatted}{currency === "KRW" ? "원" : ""}</p>
    </div>
  );
}

export default function ChartModal({ label, onClose }: Props) {
  const [range, setRange] = useState("3mo");
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true); setError(false);
    fetch(`/api/chart-data?label=${encodeURIComponent(label)}&range=${range}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (j.error) throw new Error(); setChartData(j); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [label, range]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const isPos = (chartData?.currentPrice ?? 0) >= (chartData?.previousClose ?? 0);
  const color  = isPos ? "#22c55e" : "#ef4444";
  const gradId = `grad_${label.replace(/[^a-zA-Z0-9]/g, "")}`;

  const fmt = (p: number | null) => {
    if (p == null) return "-";
    if (chartData?.currency === "KRW") return p.toLocaleString("ko-KR") + "원";
    return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const changePct = chartData?.currentPrice && chartData?.previousClose
    ? ((chartData.currentPrice - chartData.previousClose) / chartData.previousClose * 100)
    : null;

  const data = chartData?.data ?? [];
  const tickCount = 6;
  const step = data.length > tickCount ? Math.floor(data.length / tickCount) : 1;
  const ticks = data.filter((_, i) => i % step === 0).map(d => d.date);

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 animate-fade-in" onClick={onClose} />
      <div className="fixed z-50 bottom-0 left-0 right-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div
          className="w-full sm:max-w-3xl bg-navy-card border border-navy-border rounded-t-3xl sm:rounded-2xl shadow-2xl animate-slide-up sm:animate-fade-in flex flex-col"
          style={{ height: "min(90vh, 580px)" }}
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

          {/* 기간 선택 */}
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

          {/* 차트 */}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A2D42" vertical={false} />
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
                    activeDot={{ r: 4, fill: color, stroke: "#07111E", strokeWidth: 2 }}
                    connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
