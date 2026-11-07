"use client";

import { defaultRegion } from "@/lib/krSession";
import LiveMarketPulse from "./LiveMarketPulse";
import AfterHoursWidget, { AsiaTopWidget } from "./AfterHoursWidget";
import MarketMap from "./MarketMap";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OPEN_CHART_EVENT } from "./MarketTicker";
import { Pills, RegionTabs, useQueryTab } from "./Segmented";
import { MarketClockStrip } from "./MarketClock";
import dynamic from "next/dynamic";
// 수급 보드(차트 라이브러리 포함)는 '수급' 탭을 열 때만 불러온다 — 첫 화면을 가볍게
const FlowBoard = dynamic(() => import("./FlowBoard"), { ssr: false, loading: () => <div className="card h-64 animate-pulse" /> });

// 증시 탭: 국내/미국 → (국내) 증시/수급 → (수급) 코스피/코스닥/코스피200
export default function HomeTabs() {
  const [m, setM] = useQueryTab("m", ["kr", "us", "asia"] as const, defaultRegion());
  const [v, setV] = useQueryTab("v", ["market", "flow"] as const, "market");
  const [k, setK] = useQueryTab("k", ["kospi", "kosdaq", "k200"] as const, "kospi");
  const view = m !== "kr" ? "market" : v;
  const router = useRouter();

  // 수급 화면에서 상단 티커 지표를 누르면: 증시 화면으로 바꾸고 그 차트를 연다
  useEffect(() => {
    if (view === "market") return;
    const h = (e: Event) => router.replace(`/?m=${m}&v=market&chart=${encodeURIComponent((e as CustomEvent<string>).detail)}`, { scroll: false });
    window.addEventListener(OPEN_CHART_EVENT, h);
    return () => window.removeEventListener(OPEN_CHART_EVENT, h);
  }, [view, m, router]);

  return (
    <div className="space-y-5">
      <MarketClockStrip />
      <div data-tour="region"><RegionTabs value={m} onChange={setM} items={[["kr", "🇰🇷 국내"], ["us", "🇺🇸 미국"], ["asia", "🌏 아시아"]]} /></div>
      {m === "kr" && <Pills value={v} onChange={setV} items={[["market", "증시"], ["flow", "수급"]]} />}

      {view === "market" ? (
        <>
          <LiveMarketPulse key={m} region={m === "kr" ? "KR" : m === "us" ? "US" : "ASIA"} />
          {m !== "asia" && <MarketMap fixedRegion={m === "kr" ? "KR" : "US"} />}
          {m !== "asia" ? <AfterHoursWidget key={`top-${m}`} region={m === "kr" ? "KR" : "US"} /> : <AsiaTopWidget />}
        </>
      ) : (
        <>
          <Pills value={k} onChange={setK} items={[["kospi", "코스피"], ["kosdaq", "코스닥"], ["k200", "코스피200 선물"]]} />
          <FlowBoard market={k === "kosdaq" ? "KOSDAQ" : k === "k200" ? "K200" : "KOSPI"} />
        </>
      )}
    </div>
  );
}
