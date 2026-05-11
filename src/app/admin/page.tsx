import type { PortfolioData } from "@/types/portfolio";
import portfolioData from "@/data/portfolio.json";
import PortfolioStatus from "@/components/PortfolioStatus";
import HoldingsHeatmap from "@/components/HoldingsHeatmap";
import ActionPlan from "@/components/ActionPlan";
import CashflowSimulation from "@/components/CashflowSimulation";
import RiaStrategy from "@/components/RiaStrategy";
import FinalVerdict from "@/components/FinalVerdict";
import LiveMarketPulse from "@/components/LiveMarketPulse";
import AdminLogout from "@/components/AdminLogout";

const data = portfolioData as unknown as PortfolioData;

export default function AdminPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      {/* 운영자 전용 배지 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-gold/20 border border-gold/40 text-gold text-xs font-bold rounded-full">
            🔒 운영자 전용 대시보드
          </span>
          <span className="text-xs text-gray-500">래미안 엘라비네 자금 조달 현황</span>
        </div>
        <AdminLogout />
      </div>

      <LiveMarketPulse />
      <PortfolioStatus data={data} />
      <HoldingsHeatmap domestic={data.domesticHoldings} overseas={data.overseasHoldings} />
      <ActionPlan actions={data.actions} />
      <CashflowSimulation
        candidates={data.sellCandidates}
        targetAmount={data.milestones[1]?.amount ?? 180000000}
      />
      <RiaStrategy data={data.riaStrategy} />
      <FinalVerdict summary={data.finalVerdict.summary} badges={data.finalVerdict.badges} />

      <footer className="text-center text-xs text-gray-600 py-4 border-t border-navy-border">
        알읽남 Investment Dashboard · Admin View · 데이터 마지막 업데이트: {new Date(data.lastUpdated).toLocaleDateString("ko-KR")}
      </footer>
    </main>
  );
}
