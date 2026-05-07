import type { PortfolioData } from "@/types/portfolio";
import portfolioData from "@/data/portfolio.json";
import PortfolioStatus from "@/components/PortfolioStatus";
import HoldingsHeatmap from "@/components/HoldingsHeatmap";
import ActionPlan from "@/components/ActionPlan";
import CashflowSimulation from "@/components/CashflowSimulation";
import RiaStrategy from "@/components/RiaStrategy";
import FinalVerdict from "@/components/FinalVerdict";
import LiveMarketPulse from "@/components/LiveMarketPulse";

const data = portfolioData as unknown as PortfolioData;

export default function Home() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <LiveMarketPulse />
      <PortfolioStatus data={data} />
      <HoldingsHeatmap
        domestic={data.domesticHoldings}
        overseas={data.overseasHoldings}
      />
      <ActionPlan actions={data.actions} />
      <CashflowSimulation
        candidates={data.sellCandidates}
        targetAmount={data.milestones[1]?.amount ?? 150000000}
      />
      <RiaStrategy data={data.riaStrategy} usdKrwRate={data.usdKrwRate} />
      <FinalVerdict
        summary={data.finalVerdict.summary}
        badges={data.finalVerdict.badges}
      />

      <footer className="text-center text-xs text-gray-600 py-4 border-t border-navy-border">
        알읽남 Investment Dashboard v2.0 · 실시간 시장 데이터 · Yahoo Finance API
      </footer>
    </main>
  );
}
