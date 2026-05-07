"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

import type { RiaStrategy as RiaStrategyType } from "@/types/portfolio";

function krw(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`;
  return n.toLocaleString() + "원";
}

export default function RiaStrategy({ data }: { data: RiaStrategyType }) {
  const [mode, setMode] = useState<"conservative" | "aggressive">("conservative");
  const strategy = data[mode];

  const chartData = strategy.allocations.map((a) => ({
    name: a.name,
    value: a.pct,
    color: a.color,
  }));

  return (
    <section>
      <h2 className="card-title text-gray-500 mb-3">RIA 국내주식 재투자 전략</h2>
      <div className="card">
        {/* 상단 안내 */}
        <div className="bg-cyan-brand/10 border border-cyan-brand/20 rounded-xl p-3 mb-5 text-xs text-cyan-brand leading-relaxed">
          💡 {data.note}
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* 왼쪽 */}
          <div className="flex-1">
            {/* 총 재투자 금액 */}
            <div className="bg-navy-sub rounded-xl p-4 mb-4">
              <p className="text-xs text-gray-500 mb-1">RIA 재투자 가용금액</p>
              <p className="num text-2xl font-bold text-gold">{krw(data.currentRiaKRW)}</p>
              <p className="text-xs text-gray-500 mt-1">1년 보유 시 해외주식 양도세 22% 면제</p>
            </div>

            {/* 모드 선택 */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex gap-1 bg-navy-sub rounded-lg p-1">
                <button onClick={() => setMode("conservative")}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all ${mode === "conservative" ? "bg-signal-green text-white font-bold" : "text-gray-400 hover:text-white"}`}>
                  안정형
                </button>
                <button onClick={() => setMode("aggressive")}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all ${mode === "aggressive" ? "bg-signal-amber text-navy font-bold" : "text-gray-400 hover:text-white"}`}>
                  공격형
                </button>
              </div>
              <span className="text-xs text-gray-400">{strategy.label}</span>
            </div>

            {/* 종목 리스트 */}
            <div className="space-y-3">
              {strategy.allocations.map((a) => (
                <div key={a.ticker} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm text-white font-medium">{a.name}</span>
                        <span className="text-xs text-gray-500 num ml-2">{a.ticker}</span>
                      </div>
                      <span className="text-sm num font-bold text-white">{a.pct}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 num">
                      <span>현재가 {a.currentPrice.toLocaleString()}원 × {a.shares}주</span>
                      <span className="text-gray-400">{krw(a.amount)}</span>
                    </div>
                    <div className="w-full h-1 bg-navy-border rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${a.pct}%`, backgroundColor: a.color }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 합계 */}
            <div className="mt-4 pt-4 border-t border-navy-border flex justify-between text-sm">
              <span className="text-gray-400">총 투자금액</span>
              <span className="num font-bold text-white">
                {krw(strategy.allocations.reduce((s, a) => s + a.amount, 0))}
              </span>
            </div>
          </div>

          {/* 오른쪽: 파이차트 */}
          <div className="w-full md:w-48 h-48 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#111F30", border: "1px solid #1A2D42", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(value) => [`${value}%`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
