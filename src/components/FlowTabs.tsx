"use client";

import { defaultRegion } from "@/lib/krSession";
import StockSearchPanel from "./StockSearchPanel";
import MarketSummary from "./MarketSummary";
import DualBuyWidget from "./DualBuyWidget";
import AsiaMarketList from "./AsiaMarketList";
import { US_INDEX_TABS, type USIndexType } from "./MarketSummary";
import { Pills, RegionTabs, useQueryTab } from "./Segmented";

// 매매동향 탭: AI 레이더 분석(맨 위) → 국내(코스피/코스닥/섹터 흐름) / 미국
export default function FlowTabs() {
  const [m, setM] = useQueryTab("m", ["kr", "us", "asia"] as const, defaultRegion());
  const [k, setK] = useQueryTab("k", ["kospi", "kosdaq", "hot"] as const, "kospi");
  const [h, setH] = useQueryTab("h", ["sector", "dual"] as const, "sector");
  const [ui, setUi] = useQueryTab<USIndexType>("i", ["SP500", "NASDAQ", "DOW", "RUSSELL", "SOXX"] as const, "SP500");

  return (
    <div className="space-y-5">
      <div data-tour="flow-region"><RegionTabs value={m} onChange={setM} items={[["kr", "🇰🇷 국내"], ["us", "🇺🇸 미국"], ["asia", "🌏 아시아"]]} /></div>
      <StockSearchPanel />
      {m === "kr" ? (
        <>
          <Pills value={k} onChange={setK} items={[["kospi", "코스피"], ["kosdaq", "코스닥"], ["hot", "HOT🔥"]]} />
          {k === "hot" ? (
            <>
              <Pills value={h} onChange={setH} items={[["sector", "섹터 흐름"], ["dual", "쌍끌이 포착"]]} />
              {h === "sector" ? <MarketSummary key="sector" region="KR" krSectorOnly /> : <DualBuyWidget />}
            </>
          ) : (
            <MarketSummary key={k} region="KR" krMarket={k === "kosdaq" ? "KOSDAQ" : "KOSPI"} />
          )}
        </>
      ) : m === "us" ? (
        <>
          <Pills fill value={ui} onChange={setUi} items={US_INDEX_TABS.map(t => [t.id, t.label] as [USIndexType, string])} />
          <MarketSummary key={`us-${ui}`} region="US" usIndex={ui} />
        </>
      ) : (
        <AsiaMarketList />
      )}
    </div>
  );
}
