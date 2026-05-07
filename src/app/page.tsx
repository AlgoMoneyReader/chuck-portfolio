import type { PortfolioData } from "@/types/portfolio";
import portfolioData from "@/data/portfolio.json";
import Header from "@/components/Header";
import MarketPulse from "@/components/MarketPulse";
import PortfolioStatus from "@/components/PortfolioStatus";
import HoldingsHeatmap from "@/components/HoldingsHeatmap";
import ActionPlan from "@/components/ActionPlan";
import CashflowSimulation from "@/components/CashflowSimulation";
import RiaStrategy from "@/components/RiaStrategy";
import FinalVerdict from "@/components/FinalVerdict";

const data = portfolioData as unknown as PortfolioData;

export default function Home() {
  return (
    <div className="min-h-screen bg-navy">
      <Header lastUpdated={data.lastUpdated} />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
        <MarketPulse data={data.marketPulse} />
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
          Chuck Portfolio v1.0 · 알읽남(알고리즘이 읽어주는 돈) · 데이터는 수동 업데이트됩니다
        </footer>
      </main>
    </div>
  );
}
