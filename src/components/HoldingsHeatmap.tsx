"use client";

import { useState } from "react";
import type { DomesticHolding, OverseasHolding } from "@/types/portfolio";
import { calcProfitPct, calcCurrentValue, getHeatmapColor, getHeatmapTextColor } from "@/lib/calc";
import { formatKRW, formatUSD, formatPct } from "@/lib/formatters";

interface HoldingsHeatmapProps {
  domestic: DomesticHolding[];
  overseas: OverseasHolding[];
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  name: string;
  ticker: string;
  profitPct: number;
  currentValue: string;
  profit: string;
}

export default function HoldingsHeatmap({ domestic, overseas }: HoldingsHeatmapProps) {
  const [activeTab, setActiveTab] = useState<"domestic" | "overseas">("domestic");
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, name: "", ticker: "", profitPct: 0, currentValue: "", profit: "" });

  const domesticWithCalc = domestic.map((h) => ({
    ...h,
    profitPct: calcProfitPct(h.avgPrice, h.currentPrice),
    currentValue: calcCurrentValue(h.currentPrice, h.qty),
    profit: (h.currentPrice - h.avgPrice) * h.qty,
  }));

  const overseasWithCalc = overseas.map((h) => ({
    ...h,
    profitPct: calcProfitPct(h.avgPrice, h.currentPrice),
    currentValue: calcCurrentValue(h.currentPrice, h.qty),
    profit: (h.currentPrice - h.avgPrice) * h.qty,
  }));

  const holdings = activeTab === "domestic" ? domesticWithCalc : overseasWithCalc;
  const maxValue = Math.max(...holdings.map((h) => h.currentValue));

  const handleMouseEnter = (
    e: React.MouseEvent,
    h: typeof holdings[0]
  ) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isOverseas = activeTab === "overseas";
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      name: h.name,
      ticker: h.ticker,
      profitPct: h.profitPct,
      currentValue: isOverseas
        ? formatUSD(h.currentValue)
        : formatKRW(h.currentValue),
      profit: isOverseas
        ? `${h.profit >= 0 ? "+" : ""}${formatUSD(h.profit)}`
        : `${h.profit >= 0 ? "+" : ""}${formatKRW(h.profit)}`,
    });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="card-title text-gray-500">Holdings Heatmap</h2>
        <div className="flex gap-1 bg-navy-sub rounded-lg p-1">
          <button
            onClick={() => setActiveTab("domestic")}
            className={`text-xs px-3 py-1 rounded-md transition-all ${
              activeTab === "domestic"
                ? "bg-gold text-navy font-bold"
                : "text-gray-400 hover:text-white"
            }`}
          >
            국내 {domestic.length}
          </button>
          <button
            onClick={() => setActiveTab("overseas")}
            className={`text-xs px-3 py-1 rounded-md transition-all ${
              activeTab === "overseas"
                ? "bg-cyan-brand text-navy font-bold"
                : "text-gray-400 hover:text-white"
            }`}
          >
            해외 {overseas.length}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2">
          {holdings.map((h) => {
            const sizeFactor = Math.sqrt(h.currentValue / maxValue);
            const minW = 80;
            const maxW = 200;
            const width = minW + (maxW - minW) * sizeFactor;

            return (
              <div
                key={h.ticker}
                className="rounded-xl cursor-pointer transition-all duration-200 hover:scale-105 hover:z-10 relative flex flex-col justify-between p-2.5"
                style={{
                  width: `${width}px`,
                  minHeight: "72px",
                  backgroundColor: getHeatmapColor(h.profitPct),
                  border: `1px solid ${getHeatmapColor(h.profitPct)}88`,
                }}
                onMouseEnter={(e) => handleMouseEnter(e, h)}
                onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
              >
                <div>
                  <p className="text-xs font-bold text-white/90 leading-tight">{h.name}</p>
                  <p className="text-[10px] text-white/50 num">{h.ticker}</p>
                </div>
                <p
                  className="text-sm font-black num"
                  style={{ color: getHeatmapTextColor(h.profitPct) }}
                >
                  {formatPct(h.profitPct)}
                </p>
              </div>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-navy-border">
          <span className="text-xs text-gray-500">수익률 범례</span>
          {[
            { label: "+100%+", color: "#0D5C3A" },
            { label: "+50%", color: "#1D9E75" },
            { label: "+10%", color: "#56D9A0" },
            { label: "0%", color: "#2A4A3A" },
            { label: "-5%", color: "#4A2A2A" },
            { label: "-10%+", color: "#E24B4A" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[10px] text-gray-400 num">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 툴팁 */}
      {tooltip.visible && (
        <div
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="bg-navy-card border border-navy-border rounded-xl p-3 shadow-card text-sm min-w-[140px]">
            <p className="font-bold text-white">{tooltip.name}</p>
            <p className="text-gray-400 text-xs num">{tooltip.ticker}</p>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-gray-400 text-xs">평가금액</span>
                <span className="text-white text-xs num">{tooltip.currentValue}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400 text-xs">손익</span>
                <span className={`text-xs num font-bold ${tooltip.profitPct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                  {tooltip.profit}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400 text-xs">수익률</span>
                <span className={`text-xs num font-bold ${tooltip.profitPct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                  {formatPct(tooltip.profitPct)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
