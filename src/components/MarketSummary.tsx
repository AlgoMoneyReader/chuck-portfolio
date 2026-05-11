"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockRow {
  rank: number;
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
}

interface FlowItem {
  type: "foreign" | "institution" | "individual";
  label: string;
  netBuy: number;
  buy: number;
  sell: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** KST 기준 장중 여부 (09:00 ~ 15:30) */
function isMarketOpen(): boolean {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay(); // 0=일 6=토
  if (day === 0 || day === 6) return false;
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  const minutes = h * 60 + m;
  return minutes >= 9 * 60 && minutes < 15 * 60 + 30;
}

function fmtPrice(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

/** 억 단위 포맷: 1_0000억 이상이면 조 단위 */
function fmtAmount(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  let str: string;
  if (abs >= 10000) {
    str = (abs / 10000).toFixed(1) + "조";
  } else {
    str = abs.toLocaleString("ko-KR") + "억";
  }
  return n > 0 ? "+" + str : "-" + str;
}

function fmtVolume(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MarketTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
        active
          ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {label}
    </button>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const gold = rank === 1 ? "text-yellow-400" : rank === 2 ? "text-gray-300" : rank === 3 ? "text-amber-600" : "text-gray-600";
  return <span className={`text-xs font-bold w-5 text-center ${gold}`}>{rank}</span>;
}

function SkeletonRows({ count = 10 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
          <div className="w-5 h-3 bg-navy-border rounded" />
          <div className="flex-1 h-3 bg-navy-border rounded w-20" />
          <div className="w-16 h-3 bg-navy-border rounded" />
          <div className="w-12 h-3 bg-navy-border rounded" />
        </div>
      ))}
    </>
  );
}

// ─── TOP 10 상승 종목 탭 ───────────────────────────────────────────────────────

function TopGainersList({ market }: { market: string }) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [ts, setTs] = useState("");

  const load = useCallback(async () => {
    try {
      setError(false);
      const res = await fetch(`/api/market-top?market=${market}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRows(json.topGainers ?? []);
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [market]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, isMarketOpen() ? 60_000 : 300_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500">
          {isMarketOpen() ? (
            <span className="text-signal-green">● 장중 · 60초 자동갱신</span>
          ) : (
            <span className="text-gray-600">○ 장마감 기준 데이터</span>
          )}
        </span>
        {ts && <span className="text-xs text-gray-600">{ts} 기준</span>}
      </div>

      {error ? (
        <p className="text-xs text-gray-500 py-6 text-center">
          데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.
        </p>
      ) : (
        <div className="space-y-0 divide-y divide-navy-border/40">
          {/* Header */}
          <div className="flex items-center gap-3 py-1.5 text-xs text-gray-600 font-medium">
            <span className="w-5 text-center">#</span>
            <span className="flex-1">종목</span>
            <span className="w-20 text-right">현재가</span>
            <span className="w-14 text-right">등락률</span>
            <span className="w-14 text-right hidden sm:block">거래량</span>
          </div>

          {loading ? (
            <SkeletonRows />
          ) : (
            rows.map((row) => (
              <div
                key={row.code}
                className="flex items-center gap-3 py-2 hover:bg-navy-card/50 transition-colors rounded px-0.5"
              >
                <RankBadge rank={row.rank} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{row.name}</p>
                  <p className="text-xs text-gray-600">{row.code}</p>
                </div>
                <span className="w-20 text-right text-sm text-white num">
                  {fmtPrice(row.price)}
                </span>
                <span
                  className={`w-14 text-right text-sm font-semibold num ${
                    row.changePct >= 0 ? "text-signal-green" : "text-signal-red"
                  }`}
                >
                  {row.changePct >= 0 ? "▲" : "▼"} {Math.abs(row.changePct).toFixed(2)}%
                </span>
                <span className="w-14 text-right text-xs text-gray-500 num hidden sm:block">
                  {fmtVolume(row.volume)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── 투자자 동향 탭 ───────────────────────────────────────────────────────────

const INVESTOR_ICONS: Record<string, string> = {
  foreign: "🌐",
  institution: "🏦",
  individual: "👤",
};

function InvestorFlowList({ market }: { market: string }) {
  const [flow, setFlow] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [ts, setTs] = useState("");

  const load = useCallback(async () => {
    try {
      setError(false);
      const res = await fetch(`/api/investor-flow?market=${market}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setFlow(json.flow ?? []);
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [market]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, isMarketOpen() ? 300_000 : 600_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500">
          {isMarketOpen() ? (
            <span className="text-signal-green">● 장중 · 5분 자동갱신</span>
          ) : (
            <span className="text-gray-600">○ 장마감 기준 데이터</span>
          )}
        </span>
        {ts && <span className="text-xs text-gray-600">{ts} 기준</span>}
      </div>

      {error ? (
        <div className="py-4 space-y-3">
          <p className="text-xs text-gray-500 text-center">
            KRX 서버가 직접 API 접근을 제한하고 있습니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { label: "네이버 금융 — 투자자 동향", url: `https://finance.naver.com/sise/investorDealTrendDay.naver?sosok=${market === "KOSDAQ" ? 1 : 0}` },
              { label: "KRX 통계 — 매매동향", url: "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020203" },
            ].map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-navy-card border border-navy-border rounded-lg hover:border-gray-600 transition-colors text-xs text-gray-400 hover:text-gray-200"
              >
                <span className="text-gray-600">↗</span>
                {link.label}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header */}
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 font-medium pb-1 border-b border-navy-border/40">
            <span>투자자</span>
            <span className="text-right">순매수</span>
            <span className="text-right">매수</span>
            <span className="text-right">매도</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-4 gap-2 animate-pulse">
                  {[0, 1, 2, 3].map((j) => (
                    <div key={j} className="h-8 bg-navy-border rounded" />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            flow.map((item) => {
              const isNet = item.netBuy >= 0;
              return (
                <div
                  key={item.type}
                  className="grid grid-cols-4 gap-2 items-center py-2 px-3 rounded-lg bg-navy-card/40 border border-navy-border/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{INVESTOR_ICONS[item.type]}</span>
                    <span className="text-sm text-white font-medium">{item.label}</span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-sm font-bold num ${
                        isNet ? "text-signal-green" : "text-signal-red"
                      }`}
                    >
                      {fmtAmount(item.netBuy)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-400 num">{fmtAmount(Math.abs(item.buy))}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-400 num">{fmtAmount(Math.abs(item.sell))}</span>
                  </div>
                </div>
              );
            })
          )}

          {!loading && flow.length > 0 && (
            <p className="text-xs text-gray-600 text-right pt-1">
              단위: 억원 · KRX 집계 기준
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type MainTab = "top10" | "flow";
type MarketType = "KOSPI" | "KOSDAQ";

export default function MarketSummary() {
  const [mainTab, setMainTab] = useState<MainTab>("top10");
  const [market, setMarket] = useState<MarketType>("KOSPI");

  return (
    <section className="card">
      {/* Title row */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
            국내 시장 동향
          </h2>
          <div className="flex gap-1">
            {(["KOSPI", "KOSDAQ"] as MarketType[]).map((m) => (
              <MarketTab
                key={m}
                label={m}
                active={market === m}
                onClick={() => setMarket(m)}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-1 bg-navy-border/30 rounded-full p-0.5">
          <button
            onClick={() => setMainTab("top10")}
            className={`px-3 py-1 text-xs rounded-full transition-all ${
              mainTab === "top10" ? "bg-navy-card text-white font-semibold" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            상승 TOP 10
          </button>
          <button
            onClick={() => setMainTab("flow")}
            className={`px-3 py-1 text-xs rounded-full transition-all ${
              mainTab === "flow" ? "bg-navy-card text-white font-semibold" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            투자자 동향
          </button>
        </div>
      </div>

      {/* Content */}
      {mainTab === "top10" ? (
        <TopGainersList market={market} />
      ) : (
        <InvestorFlowList market={market} />
      )}
    </section>
  );
}
