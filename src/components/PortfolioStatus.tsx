"use client";

import type { PortfolioData } from "@/types/portfolio";
import { formatKRW, formatUSD, formatPct, getDDay } from "@/lib/formatters";

interface PortfolioStatusProps {
  data: PortfolioData;
}

export default function PortfolioStatus({ data }: PortfolioStatusProps) {
  const dDay511 = getDDay("2026-05-11");
  const dDayJuly = getDDay("2026-07-15");
  const isProfit = data.totalProfit >= 0;

  return (
    <section>
      <h2 className="card-title text-gray-500 mb-3">Portfolio Status</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 총 자산 */}
        <div className="card md:col-span-2">
          <p className="card-title">총 평가자산</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl md:text-4xl font-black text-white num">
                {formatKRW(data.totalAsset)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold num ${isProfit ? "text-signal-green" : "text-signal-red"}`}>
                {isProfit ? "+" : ""}{formatKRW(data.totalProfit)}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-sm font-bold num ${
                isProfit
                  ? "bg-signal-green/20 text-signal-green"
                  : "bg-signal-red/20 text-signal-red"
              }`}>
                {formatPct(data.totalProfitPct)}
              </span>
            </div>
            <div className="h-px bg-navy-border my-1" />
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">원화 현금</p>
                <p className="num font-semibold text-gold">{formatKRW(data.cashKRW)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">기본계좌 달러</p>
                <p className="num font-semibold text-cyan-brand">{formatUSD(data.cashUSDBase)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">RIA 달러</p>
                <p className="num font-semibold text-cyan-brand">{formatUSD(data.cashUSDRia)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 자금 일정 */}
        <div className="card flex flex-col gap-3">
          <p className="card-title">자금 일정</p>

          <div className={`rounded-xl p-3 border ${
            dDay511 <= 3
              ? "bg-signal-red/10 border-signal-red/30"
              : "bg-signal-amber/10 border-signal-amber/30"
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-300">5/11 계약금</span>
              <span className={`text-xs font-bold num px-2 py-0.5 rounded-full ${
                dDay511 <= 3
                  ? "bg-signal-red/30 text-signal-red"
                  : "bg-signal-amber/30 text-signal-amber"
              }`}>
                D-{dDay511}
              </span>
            </div>
            <p className="text-lg font-bold text-white num">
              {formatKRW(data.milestones[0]?.amount ?? 0)}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">현금으로 충당 가능</p>
          </div>

          <div className="rounded-xl p-3 bg-signal-red/10 border border-signal-red/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-300">7월 중도금</span>
              <span className="text-xs font-bold num px-2 py-0.5 rounded-full bg-signal-red/30 text-signal-red">
                D-{dDayJuly}
              </span>
            </div>
            <p className="text-lg font-bold text-white num">
              {formatKRW(data.milestones[1]?.amount ?? 0)}
            </p>
            <p className="text-[11px] text-signal-amber mt-0.5">매도 전략 수립 필요</p>
          </div>
        </div>
      </div>
    </section>
  );
}
