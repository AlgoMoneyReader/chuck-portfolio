import LiveMarketPulse from "@/components/LiveMarketPulse";
import AfterHoursWidget from "@/components/AfterHoursWidget";
import MarketSummary from "@/components/MarketSummary";
import StockSearchPanel from "@/components/StockSearchPanel";
import DualBuyWidget from "@/components/DualBuyWidget";

export default function Home() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 animate-fade-in space-y-6">
      <LiveMarketPulse />
      <AfterHoursWidget />
      <DualBuyWidget />
      <StockSearchPanel />
      <MarketSummary />
    </main>
  );
}
