"use client";

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
const ChartModal = lazy(() => import("./ChartModal"));

interface IndexData {
  price: number;
  change: number;
  changePct: number;
  marketState: string;
}

interface MarketData {
  kospi:   IndexData | null;
  kosdaq:  IndexData | null;
  sp500:   IndexData | null;
  nasdaq:  IndexData | null;
  usdKrw:  IndexData | null;
  esFut:   IndexData | null;
  nqFut:   IndexData | null;
  gold:    IndexData | null;
  oil:     IndexData | null;
  timestamp: string;
}

// Labels that the chart modal supports
const CHART_LABELS = new Set([
  "KOSPI", "KOSDAQ", "S&P 500", "NASDAQ",
  "S&P500 선물", "나스닥 선물", "금", "WTI 원유", "USD/KRW",
]);

function IndexCard({
  label,
  data,
  format = "number",
  unit,
  onSelect,
}: {
  label: string;
  data: IndexData | null;
  format?: "number" | "currency" | "usd";
  unit?: string;
  onSelect: (label: string) => void;
}) {
  if (!data) {
    return (
      <div className="card flex flex-col gap-2 animate-pulse">
        <p className="card-title">{label}</p>
        <div className="h-7 bg-navy-border rounded w-24" />
        <div className="h-4 bg-navy-border rounded w-16" />
      </div>
    );
  }

  const isPositive = data.changePct >= 0;
  const colorClass = isPositive ? "text-signal-green" : "text-signal-red";
  const arrow = isPositive ? "▲" : "▼";

  const formatPrice = (p: number) => {
    if (format === "currency") return `${p.toLocaleString("ko-KR")}원`;
    if (format === "usd") return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (p >= 1000) return p.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    return p.toFixed(2);
  };

  const hasChart = CHART_LABELS.has(label);

  return (
    <button
      onClick={() => hasChart && onSelect(label)}
      className={`card flex flex-col gap-1 text-left transition-all
        ${hasChart ? "cursor-pointer hover:border-cyan-brand/40 hover:bg-navy-card/80 active:scale-[0.98]" : ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="card-title mb-0">{label}</p>
        {hasChart && <span className="text-gray-600 text-xs opacity-60">📈</span>}
      </div>
      <p className="num text-xl font-bold text-white mt-1">
        {formatPrice(data.price)}{unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
      </p>
      <div className="flex items-center gap-2">
        <span className={`num text-sm font-medium ${colorClass}`}>
          {arrow} {Math.abs(data.changePct).toFixed(2)}%
        </span>
        {data.marketState === "REGULAR" && (
          <span className="text-signal-green text-xs">● 장중</span>
        )}
      </div>
    </button>
  );
}

function SmallCard({
  label,
  data,
  format = "usd",
  unit,
  emoji,
  onSelect,
}: {
  label: string;
  data: IndexData | null;
  format?: "number" | "usd";
  unit?: string;
  emoji?: string;
  onSelect: (label: string) => void;
}) {
  if (!data) {
    return (
      <div className="flex items-center justify-between py-2 px-3 bg-navy-card/40 rounded-lg border border-navy-border/30 animate-pulse">
        <div className="h-3 bg-navy-border rounded w-16" />
        <div className="h-3 bg-navy-border rounded w-12" />
      </div>
    );
  }

  const isPositive = data.changePct >= 0;
  const colorClass = isPositive ? "text-signal-green" : "text-signal-red";
  const arrow = isPositive ? "▲" : "▼";

  const formatPrice = (p: number) => {
    if (format === "usd") return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    return p.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  };

  const hasChart = CHART_LABELS.has(label);

  return (
    <button
      onClick={() => hasChart && onSelect(label)}
      className={`w-full flex items-center justify-between py-2 px-3
        bg-navy-card/40 rounded-lg border border-navy-border/30 text-left
        transition-all
        ${hasChart ? "cursor-pointer hover:border-cyan-brand/30 hover:bg-navy-card/60 active:scale-[0.98]" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        {emoji && <span className="text-sm">{emoji}</span>}
        <span className="text-xs text-gray-400">{label}</span>
        {hasChart && <span className="text-gray-600 text-xs opacity-50">↗</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="num text-xs text-gray-300">
          {formatPrice(data.price)}{unit && <span className="text-gray-600 ml-0.5">{unit}</span>}
        </span>
        <span className={`num text-xs font-semibold ${colorClass}`}>
          {arrow}{Math.abs(data.changePct).toFixed(2)}%
        </span>
      </div>
    </button>
  );
}

export default function LiveMarketPulse() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [chart, setChart] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      if (!res.ok) return;
      const json: MarketData = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString("ko-KR"));
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // 장중(KST 09:00~15:30) 15초, 장외 60초 폴링
    function getInterval() {
      const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const day  = kst.getUTCDay();
      const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes();
      const open = day >= 1 && day <= 5 && mins >= 540 && mins < 930;
      return open ? 15_000 : 60_000;
    }
    let interval = setInterval(fetchData, getInterval());
    // 1분마다 인터벌 재계산 (장 개폐 전환 대응)
    const reschedule = setInterval(() => {
      clearInterval(interval);
      interval = setInterval(fetchData, getInterval());
    }, 60_000);
    return () => { clearInterval(interval); clearInterval(reschedule); };
  }, [fetchData]);

  return (
    <>
      <section className="space-y-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">실시간 시장 현황</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600 hidden sm:block">클릭하면 차트 보기</span>
            {lastUpdated && (
              <span className="text-xs text-gray-600">
                {loading ? "갱신 중..." : `${lastUpdated} 기준`}
              </span>
            )}
          </div>
        </div>

        {/* 국내·미국 지수 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <IndexCard label="KOSPI"   data={data?.kospi  ?? null} onSelect={setChart} />
          <IndexCard label="KOSDAQ"  data={data?.kosdaq ?? null} onSelect={setChart} />
          <IndexCard label="S&P 500" data={data?.sp500  ?? null} onSelect={setChart} />
          <IndexCard label="NASDAQ"  data={data?.nasdaq ?? null} onSelect={setChart} />
        </div>

        {/* 선물·원자재 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <SmallCard label="S&P500 선물" data={data?.esFut ?? null} emoji="📈" onSelect={setChart} />
          <SmallCard label="나스닥 선물" data={data?.nqFut ?? null} emoji="📊" onSelect={setChart} />
          <SmallCard label="금"          data={data?.gold  ?? null} emoji="🥇" unit="/oz" onSelect={setChart} />
          <SmallCard label="WTI 원유"    data={data?.oil   ?? null} emoji="🛢" unit="/bbl" onSelect={setChart} />
        </div>

        {/* 환율 */}
        <div className="grid grid-cols-1 gap-2">
          <SmallCard label="USD/KRW" data={data?.usdKrw ?? null} emoji="💱"
            format="number" unit="원" onSelect={setChart} />
        </div>
      </section>

      {/* 차트 모달 */}
      {chart && (
        <Suspense fallback={null}>
          <ChartModal
            label={chart}
            onClose={() => setChart(null)}
          />
        </Suspense>
      )}
    </>
  );
}
