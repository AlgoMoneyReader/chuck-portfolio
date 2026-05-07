"use client";

import { useEffect, useState, useCallback } from "react";

interface IndexData {
  price: number;
  change: number;
  changePct: number;
  marketState: string;
}

interface MarketData {
  kospi: IndexData | null;
  kosdaq: IndexData | null;
  sp500: IndexData | null;
  nasdaq: IndexData | null;
  usdKrw: IndexData | null;
  timestamp: string;
}

function IndexCard({
  label,
  data,
  format = "number",
}: {
  label: string;
  data: IndexData | null;
  format?: "number" | "currency";
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
    if (p >= 1000) return p.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    return p.toFixed(2);
  };

  return (
    <div className="card flex flex-col gap-1">
      <p className="card-title">{label}</p>
      <p className="num text-2xl font-bold text-white">{formatPrice(data.price)}</p>
      <div className="flex items-center gap-2">
        <span className={`num text-sm font-medium ${colorClass}`}>
          {arrow} {Math.abs(data.changePct).toFixed(2)}%
        </span>
        <span className={`num text-xs ${colorClass} opacity-70`}>
          ({isPositive ? "+" : ""}{data.change.toLocaleString("ko-KR", { maximumFractionDigits: 2 })})
        </span>
      </div>
      <span className={`text-xs ${data.marketState === "REGULAR" ? "text-signal-green" : "text-gray-500"}`}>
        {data.marketState === "REGULAR" ? "● 장중" : data.marketState === "PRE" ? "○ 프리장" : "○ 장외"}
      </span>
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
      // silent fail — keep showing last data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000); // refresh every 60s
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">
          실시간 시장 현황
        </h2>
        {lastUpdated && (
          <span className="text-xs text-gray-600">
            {loading ? "갱신 중..." : `${lastUpdated} 기준`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <IndexCard label="KOSPI" data={data?.kospi ?? null} />
        <IndexCard label="KOSDAQ" data={data?.kosdaq ?? null} />
        <IndexCard label="S&P 500" data={data?.sp500 ?? null} />
        <IndexCard label="NASDAQ" data={data?.nasdaq ?? null} />
        <IndexCard label="USD/KRW" data={data?.usdKrw ?? null} format="currency" />
      </div>
    </section>
  );
}
