"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { RiaStrategy as RiaStrategyType } from "@/types/portfolio";
import { formatUSD, formatKRW } from "@/lib/formatters";

interface RiaStrategyProps {
  data: RiaStrategyType;
  usdKrwRate: number;
}

export default function RiaStrategy({ data, usdKrwRate }: RiaStrategyProps) {
  const [activeMode, setActiveMode] = useState<"conservative" | "aggressive">("conservative");

  const strategy = data[activeMode];
  const chartData = strategy.allocations.map((a) => ({
    name: a.name,
    ticker: a.ticker,
    value: a.pct,
    color: a.color,
  }));

  const reinvestKRW = data.targetReinvestUSD * usdKrwRate;

  return (
    <section>
      <h2 className="card-title text-gray-500 mb-3">RIA 재투자 전략</h2>
      <div className="card">
        <div className="flex flex-col md:flex-row gap-6">
          {/* 왼쪽: 정보 + 선택 */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex gap-1 bg-navy-sub rounded-lg p-1">
                <button
                  onClick={() => setActiveMode("conservative")}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all ${
                    activeMode === "conservative"
                      ? "bg-signal-green text-white font-bold"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  안정형
                </button>
                <button
                  onClick={() => setActiveMode("aggressive")}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all ${
                    activeMode === "aggressive"
                      ? "bg-signal-amber text-navy font-bold"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  공격형
                </button>
              </div>
              <span className="text-xs text-gray-400">{strategy.label}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-navy-sub rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">현재 RIA 자산</p>
                <p className="num font-bold text-cyan-brand">{formatUSD(data.currentRiaUSD)}</p>
                <p className="text-[10px] text-gray-500 num mt-0.5">≈ {formatKRW(data.currentRiaUSD * usdKrwRate)}</p>
              </div>
              <div className="bg-navy-sub rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">재투자 목표</p>
                <p className="num font-bold text-gold">{formatUSD(data.targetReinvestUSD)}</p>
                <p className="text-[10px] text-gray-500 num mt-0.5">≈ {formatKRW(reinvestKRW)}</p>
              </div>
            </div>

            <div className="space-y-2">
              {strategy.allocations.map((a) => (
                <div key={a.ticker} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: a.color }}
                  />
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <span className="text-sm text-white">{a.name}</span>
                      <span className="text-xs text-gray-500 num ml-2">{a.ticker}</span>
                    </div>
                    <span className="text-sm num font-bold text-white">{a.pct}%</span>
                  </div>
                  <div className="w-20 h-1.5 bg-navy-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${a.pct}%`, backgroundColor: a.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 오른쪽: 파이 차트 */}
          <div className="w-full md:w-48 h-48 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111F30",
                    border: "1px solid #1A2D42",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
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
