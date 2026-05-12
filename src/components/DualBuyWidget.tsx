"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface DualBuyItem {
  code: string;
  name: string;
  market: "KS" | "KQ";
  price: number;
  changePct: number;
  foreign: number;
  institution: number;
  combined: number;
}

interface ApiResponse {
  stocks: DualBuyItem[];
  timestamp: string;
  threshold: number;
}

function SkeletonRows() {
  return (
    <div className="space-y-2 pt-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 animate-pulse">
          <div className="w-4 h-3 bg-navy-border rounded" />
          <div className="flex-1 h-3 bg-navy-border rounded" />
          <div className="w-16 h-3 bg-navy-border rounded" />
          <div className="w-12 h-3 bg-navy-border rounded" />
        </div>
      ))}
    </div>
  );
}

function RatioBars({ foreign, institution }: { foreign: number; institution: number }) {
  const total = foreign + institution;
  if (total === 0) return null;
  const fPct = Math.round((foreign / total) * 100);
  const oPct = 100 - fPct;
  return (
    <div className="flex gap-0.5 w-14 h-2 rounded overflow-hidden shrink-0">
      <div className="bg-cyan-brand/70" style={{ width: `${fPct}%` }} title={`외국인 ${fPct}%`} />
      <div className="bg-signal-green/70" style={{ width: `${oPct}%` }} title={`기관 ${oPct}%`} />
    </div>
  );
}

export default function DualBuyWidget() {
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dual-buy", { cache: "no-store" });
      if (!res.ok) return;
      const json: ApiResponse = await res.json();
      setData(json);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  /** 종목 클릭 → /analyze?ticker=005930.KS&name=삼성전자 */
  function goAnalyze(stock: DualBuyItem) {
    router.push(
      `/analyze?ticker=${stock.code}.${stock.market}&name=${encodeURIComponent(stock.name)}`
    );
  }

  const ts = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="bg-navy-card border border-navy-border rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <h2 className="text-sm font-bold text-white">실시간 쌍끌이 포착</h2>
          <span className="text-xs px-1.5 py-0.5 bg-signal-green/20 text-signal-green border border-signal-green/30 rounded font-bold">
            LIVE
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-3">외국인·기관 동반 순매수 TOP 10</p>

      {/* Legend */}
      <div className="flex gap-3 mb-2">
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-sm bg-cyan-brand/70 inline-block" />외국인
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-sm bg-signal-green/70 inline-block" />기관
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonRows />
      ) : !data || data.stocks.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">
          현재 시장에 강력한 쌍끌이 수급이 유입되는 종목이 없습니다.
        </p>
      ) : (
        <div
          className="max-h-[360px] overflow-y-auto"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#1A2D42 #07111E" }}
        >
          <div className="divide-y divide-navy-border/30">
            {data.stocks.map((stock, idx) => (
              <button
                key={stock.code}
                onClick={() => goAnalyze(stock)}
                className="w-full flex items-center gap-2 py-2 hover:bg-navy-sub/60 rounded cursor-pointer transition-colors text-left group"
                title={`AI 종목 분석: ${stock.name}`}
              >
                <span className="text-xs text-gray-600 w-4 shrink-0 text-center">{idx + 1}</span>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate group-hover:text-cyan-brand transition-colors">
                    {stock.name}
                  </p>
                  <p className="text-xs text-gray-500 num">
                    {stock.price.toLocaleString("ko-KR")}원
                  </p>
                </div>

                <span className={`text-xs font-semibold num shrink-0 ${
                  stock.changePct >= 0 ? "text-signal-green" : "text-signal-red"
                }`}>
                  {stock.changePct >= 0 ? "▲" : "▼"}{Math.abs(stock.changePct).toFixed(2)}%
                </span>

                <span className="text-xs font-bold text-signal-green bg-signal-green/10 px-1.5 py-0.5 rounded num shrink-0">
                  +{stock.combined}억
                </span>

                <RatioBars foreign={stock.foreign} institution={stock.institution} />

                <span className="text-gray-600 group-hover:text-cyan-brand transition-colors text-xs shrink-0">→</span>
              </button>
            ))}
          </div>
          {data.stocks.length < 3 && (
            <p className="text-xs text-gray-600 text-center py-3 italic">
              현재 강력한 쌍끌이 수급이 유입되는 다른 종목이 없습니다.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 border-t border-navy-border/40 pt-2">
        <p className="text-xs text-gray-600">클릭 → AI 종목 분석</p>
        {ts && <p className="text-xs text-gray-600">{ts} 기준</p>}
      </div>
    </div>
  );
}
