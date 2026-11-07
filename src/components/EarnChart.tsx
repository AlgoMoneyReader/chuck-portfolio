"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// 실적 차트(매출·영업이익 막대 + 영업이익률 선) — recharts 가 커서 '정보' 탭을 열 때만 불러온다
interface Row { short: string; sales: number | null; op: number | null; opm: number | null }
export default function EarnChart({ rows, fmt, tooltip, dotFill }: { rows: Row[]; fmt: (v: number) => string; tooltip?: React.ReactElement; dotFill?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1A2545" vertical={false} />
        <XAxis dataKey="short" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
        <YAxis yAxisId="v" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} width={46} tickFormatter={v => fmt(Number(v))} />
        <YAxis yAxisId="p" orientation="right" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} width={34} tickFormatter={v => `${Math.round(Number(v))}%`} />
        {tooltip
          ? <Tooltip content={tooltip} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
          : <Tooltip formatter={(v, n) => (n === "영업이익률" ? `${Number(v).toFixed(1)}%` : fmt(Number(v)))} contentStyle={{ background: "rgb(var(--c-navy-card))", border: "1px solid rgb(var(--c-navy-border))", borderRadius: 12, fontSize: 12 }} />}
        <Bar yAxisId="v" dataKey="sales" name="매출" fill="#5B8CFF" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Bar yAxisId="v" dataKey="op" name="영업이익" fill="#1D9E75" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Line yAxisId="p" dataKey="opm" name="영업이익률" stroke="#F59E0B" strokeWidth={2} dot={dotFill ? { r: 3, fill: dotFill, stroke: "#F59E0B" } : undefined} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
