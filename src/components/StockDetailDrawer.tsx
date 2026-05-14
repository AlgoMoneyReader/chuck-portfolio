"use client";

import { useEffect, useState } from "react";

interface StockDetail {
  symbol: string; code: string; name: string;
  price: number; change: number; changePct: number;
  dayHigh: number; dayLow: number; volume: number;
  week52High: number; week52Low: number;
  marketState: string; naverUrl: string | null;
  isUS: boolean; currency: string;
  preMarketPrice: number | null;  preMarketChangePct: number | null;
  postMarketPrice: number | null; postMarketChangePct: number | null;
}

interface Props {
  code: string;
  market: "KS" | "KQ" | "US";
  name: string;
  onClose: () => void;
}

const fmtKRW = (n: number) => n > 0 ? n.toLocaleString("ko-KR") + "원" : "-";
const fmtUSD = (n: number) => n > 0 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-";

const fmtVol = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + "M주" :
  n >= 1_000     ? (n / 1_000).toFixed(0)     + "K주" : n + "주";

export default function StockDetailDrawer({ code, market, name, onClose }: Props) {
  const [data, setData] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true); setError(false); setData(null);
    fetch(`/api/stock-detail?code=${code}&market=${market}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if ("error" in j) throw new Error(); setData(j); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [code, market]);

  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isUS   = market === "US";
  const fmt    = (n: number) => isUS ? fmtUSD(n) : fmtKRW(n);
  const isPos  = (data?.changePct ?? 0) >= 0;
  const color  = isPos ? "text-signal-green" : "text-signal-red";
  const marketLabel = market === "KS" ? "KOSPI" : market === "KQ" ? "KOSDAQ" : "NYSE/NASDAQ";

  // 52주 내 현재 위치 (%)
  const position52 = data && data.week52High > data.week52Low
    ? ((data.price - data.week52Low) / (data.week52High - data.week52Low)) * 100
    : 50;

  // 시간외 데이터
  const extPrice  = data?.postMarketPrice  ?? data?.preMarketPrice  ?? null;
  const extPct    = data?.postMarketChangePct ?? data?.preMarketChangePct ?? null;
  const extLabel  = data?.postMarketPrice ? "시간후" : "시간전";

  return (
    <>
      {/* 백드롭 */}
      <div className="fixed inset-0 bg-black/50 z-40 animate-fade-in" onClick={onClose} />

      {/* 드로어 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto
                      bg-navy-card border border-navy-border rounded-t-3xl shadow-2xl
                      animate-slide-up p-6 space-y-5">

        {/* 헤더 */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">{name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {code} · {marketLabel}
              {data?.marketState === "REGULAR" && (
                <span className="ml-2 text-signal-green">● 장중</span>
              )}
            </p>
          </div>
          <button onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl leading-none px-1 transition-colors">
            ×
          </button>
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-10 bg-navy-border rounded w-1/2" />
            <div className="grid grid-cols-2 gap-3">
              {[0,1,2,3].map(i => <div key={i} className="h-16 bg-navy-border rounded-xl" />)}
            </div>
            <div className="h-8 bg-navy-border rounded" />
          </div>
        ) : error || !data ? (
          <p className="text-sm text-gray-500 py-4 text-center">데이터를 불러올 수 없습니다</p>
        ) : (
          <>
            {/* 현재가 */}
            <div>
              <p className="text-3xl font-bold text-white num">{fmt(data.price)}</p>
              <p className={`text-sm font-semibold num mt-1 ${color}`}>
                {isPos ? "▲" : "▼"} {Math.abs(data.changePct).toFixed(2)}%
                &nbsp;({isPos ? "+" : ""}{isUS
                  ? `$${Math.abs(data.change).toFixed(2)}`
                  : data.change.toLocaleString("ko-KR") + "원"
                })
              </p>
              {/* 미국: 시간외 단가 */}
              {isUS && extPrice && extPct !== null && (
                <p className="text-xs text-gray-500 mt-0.5 num">
                  {extLabel} {fmtUSD(extPrice)}
                  <span className={extPct >= 0 ? "text-signal-green ml-1" : "text-signal-red ml-1"}>
                    {extPct >= 0 ? "▲" : "▼"}{Math.abs(extPct).toFixed(2)}%
                  </span>
                </p>
              )}
            </div>

            {/* 지표 그리드 */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "오늘 고가",  value: fmt(data.dayHigh)      },
                { label: "오늘 저가",  value: fmt(data.dayLow)       },
                { label: "거래량",     value: fmtVol(data.volume)    },
                { label: "52주 고가",  value: fmt(data.week52High)   },
              ].map(({ label, value }) => (
                <div key={label} className="bg-navy-sub/50 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-sm font-semibold text-white num">{value}</p>
                </div>
              ))}
            </div>

            {/* 52주 레인지 바 */}
            {data.week52High > 0 && data.week52Low > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>52주 저가 {fmt(data.week52Low)}</span>
                  <span>52주 고가 {fmt(data.week52High)}</span>
                </div>
                <div className="relative h-2 bg-navy-border rounded-full overflow-hidden">
                  <div className="absolute h-full bg-gradient-to-r from-signal-red via-gold to-signal-green rounded-full"
                    style={{ width: "100%" }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow border-2 border-navy-card transition-all"
                    style={{ left: `calc(${Math.max(0, Math.min(100, position52))}% - 6px)` }} />
                </div>
              </div>
            )}

            {/* 바로가기 */}
            {isUS ? (
              <a href={`https://finance.yahoo.com/quote/${code}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                           bg-cyan-brand/20 hover:bg-cyan-brand/30 border border-cyan-brand/40
                           text-cyan-brand text-sm font-semibold transition-all">
                Yahoo Finance 상세보기 ↗
              </a>
            ) : data.naverUrl ? (
              <a href={data.naverUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                           bg-cyan-brand/20 hover:bg-cyan-brand/30 border border-cyan-brand/40
                           text-cyan-brand text-sm font-semibold transition-all">
                네이버 금융 상세보기 ↗
              </a>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
