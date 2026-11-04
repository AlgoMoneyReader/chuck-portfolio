import FlowBoard from "@/components/FlowBoard";
import StockSearchPanel from "@/components/StockSearchPanel";
import MarketSummary from "@/components/MarketSummary";
import ScrollToHash from "@/components/ScrollToHash";

export const metadata = { title: "매매동향 | 알읽남 - 증시 레이더" };

export default function FlowPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">매매동향</h1>
        <p className="text-xs text-gray-500 mt-0.5">거래주체별 · 시간별 · 업종별 수급과 종목 검색·시장 동향을 한곳에서</p>
      </div>
      <ScrollToHash />
      <FlowBoard />
      <div id="search" className="scroll-mt-32"><StockSearchPanel /></div>
      <div id="market" className="scroll-mt-32"><MarketSummary /></div>
    </main>
  );
}
