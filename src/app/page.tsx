import LiveMarketPulse from "@/components/LiveMarketPulse";
import AfterHoursWidget from "@/components/AfterHoursWidget";
import DualBuyWidget from "@/components/DualBuyWidget";
import MarketMap from "@/components/MarketMap";

export default function Home() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 animate-fade-in space-y-6">
      <LiveMarketPulse />
      <AfterHoursWidget />
      <MarketMap />
      <DualBuyWidget />
    </main>
  );
}
