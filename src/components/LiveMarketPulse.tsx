"use client";

import { useEffect, useState, useCallback } from "react";

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

function IndexCard({
  label,
  data,
  format = "number",
  unit,
}: {
  label: string;
  data: IndexData | null;
  format?: "number" | "currency" | "usd";
  unit?: string;
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

  return (
    <div className="card flex flex-col gap-1">
      <p className="card-title">{label}</p>
      <p className="num text-xl font-bold text-white">
        {formatPrice(data.price)}{unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
      </p>
      <div className="flex items-center gap-2">
        <span className={`num text-sm font-medium ${colorClass}`}>
          {arrow} {Math.abs(data.changePct).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

function SmallCard({
  label,
  data,
  format = "usd",
  unit,
  emoji,
}: {
  label: string;
  data: IndexData | null;
  format?: "number" | "usd";
  unit?: string;
  emoji?: string;
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

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-navy-card/40 rounded-lg border border-navy-border/30">
      <div className="flex items-center gap-1.5">
        {emoji && <span className="text-sm">{emoji}</span>}
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="num text-xs text-gray-300">
          {formatPrice(data.price)}{unit && <span className="text-gray-600 ml-0.5">{unit}</span>}
        </span>
        <span className={`num text-xs font-semibold ${colorClass}`}>
          {arrow}{Math.abs(data.changePct).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

export default function LiveMarketPulse() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

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
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <section className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">실시간 시장 현황</h2>
        {lastUpdated && (
          <span className="text-xs text-gray-600">
            {loading ? "갱신 중..." : `${lastUpdated} 기준`}
          </span>
        )}
      </div>

      {/* 국내·미국 지수 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <IndexCard label="KOSPI"   data={data?.kospi ?? null} />
        <IndexCard label="KOSDAQ"  data={data?.kosdaq ?? null} />
        <IndexCard label="S&P 500" data={data?.sp500 ?? null} />
        <IndexCard label="NASDAQ"  data={data?.nasdaq ?? null} />
      </div>

      {/* 선물·원자재·환율 (컴팩트 행) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SmallCard label="S&P500 선물" data={data?.esFut ?? null}  emoji="📈" />
        <SmallCard label="나스닥 선물" data={data?.nqFut ?? null}  emoji="📊" />
        <SmallCard label="금"          data={data?.gold ?? null}   emoji="🥇" unit="/oz" />
        <SmallCard label="WTI 원유"    data={data?.oil ?? null}    emoji="🛢" unit="/bbl" />
      </div>

      {/* 환율 */}
      <div className="grid grid-cols-1 gap-2">
        <SmallCard label="USD/KRW" data={data?.usdKrw ?? null} emoji="💱"
          format="number" unit="원" />
      </div>
    </section>
  );
}
