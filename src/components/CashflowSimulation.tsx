"use client";

import type { SellCandidate } from "@/types/portfolio";
import { formatKRW, formatUSD, formatPct } from "@/lib/formatters";

interface CashflowSimulationProps {
  candidates: SellCandidate[];
  targetAmount: number;
}

const PRIORITY_COLORS = {
  high:   { bg: "bg-signal-red/10",   text: "text-signal-red",   label: "우선" },
  medium: { bg: "bg-signal-amber/10", text: "text-signal-amber", label: "검토" },
  low:    { bg: "bg-gray-500/10",     text: "text-gray-400",     label: "보류" },
} as const;

export default function CashflowSimulation({ candidates, targetAmount }: CashflowSimulationProps) {
  const totalEstimated = candidates
    .filter((c) => c.priority !== "low")
    .reduce((sum, c) => sum + c.estimatedProceeds, 0);

  const progressPct = Math.min((totalEstimated / targetAmount) * 100, 100);

  return (
    <section>
      <h2 className="card-title text-gray-500 mb-3">7월 자납 시뮬레이션</h2>
      <div className="card">
        {/* 진행 상태 */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">
              목표 <span className="num font-bold text-white">{formatKRW(targetAmount)}</span> 조달
            </span>
            <span className={`text-sm num font-bold ${progressPct >= 100 ? "text-signal-green" : "text-signal-amber"}`}>
              {progressPct.toFixed(0)}%
            </span>
          </div>
          <div className="w-full h-3 bg-navy-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                progressPct >= 100 ? "bg-signal-green" : "bg-gold"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 num mt-1">
            <span>예상 조달 {formatKRW(totalEstimated)}</span>
            <span>부족분 {formatKRW(Math.max(targetAmount - totalEstimated, 0))}</span>
          </div>
        </div>

        {/* 후보 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-border">
                <th className="text-left text-xs text-gray-500 py-2 pr-4 font-medium">종목</th>
                <th className="text-right text-xs text-gray-500 py-2 px-2 font-medium">보유</th>
                <th className="text-right text-xs text-gray-500 py-2 px-2 font-medium">수익률</th>
                <th className="text-right text-xs text-gray-500 py-2 px-2 font-medium">예상조달</th>
                <th className="text-right text-xs text-gray-500 py-2 pl-2 font-medium">우선순위</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const pc = PRIORITY_COLORS[c.priority];
                return (
                  <tr key={c.ticker} className="border-b border-navy-border/50 hover:bg-navy-sub/50 transition-colors">
                    <td className="py-2.5 pr-4">
                      <div>
                        <p className="font-semibold text-white leading-tight">{c.name}</p>
                        <p className="text-[10px] text-gray-500 num">{c.ticker}</p>
                      </div>
                    </td>
                    <td className="text-right py-2.5 px-2">
                      <span className="num text-gray-300">{c.qty}주</span>
                    </td>
                    <td className="text-right py-2.5 px-2">
                      <span className={`num font-bold ${c.profitPct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                        {formatPct(c.profitPct)}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-2">
                      <span className="num text-white font-semibold">
                        {c.currency === "KRW"
                          ? formatKRW(c.estimatedProceeds)
                          : formatUSD(c.estimatedProceeds)}
                      </span>
                    </td>
                    <td className="text-right py-2.5 pl-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pc.bg} ${pc.text}`}>
                        {pc.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy-border">
                <td colSpan={3} className="py-2.5 pr-4 text-xs text-gray-400">우선·검토 합산</td>
                <td className="text-right py-2.5 px-2">
                  <span className="num font-black text-gold text-base">{formatKRW(totalEstimated)}</span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
