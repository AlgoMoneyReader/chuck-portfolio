"use client";

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { OPEN_CHART_EVENT } from "./MarketTicker";
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
  dow:     IndexData | null;
  russell: IndexData | null;
  sox?:    IndexData | null;
  usdKrw:  IndexData | null;
  esFut:   IndexData | null;
  nqFut:   IndexData | null;
  yjFut:   IndexData | null;
  gold:    IndexData | null;
  oil:     IndexData | null;
  timestamp: string;
}

const CHART_LABELS = new Set([
  "KOSPI", "KOSDAQ", "S&P 500", "NASDAQ", "다우존스", "러셀 2000", "필라델피아 반도체",
  "S&P500 선물", "나스닥 선물", "다우 선물", "금", "WTI 원유", "USD/KRW",
]);

// ── 하루 흐름 미니 그래프 (첫 점 = 전일 종가) ─────────────────────────────────
function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const W = 120, H = 34;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - ((v - min) / span) * (H - 4) - 2]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = up ? "#1D9E75" : "#E24B4A";
  const id = `sp${up ? "u" : "d"}`;
  const baseY = H - ((values[0] - min) / span) * (H - 4) - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-9 mt-1.5">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={W} y1={baseY} y2={baseY} stroke="#4B5563" strokeWidth="0.6" strokeDasharray="2 2" />
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── 풀 박스형 IndexCard ──────────────────────────────────────────────────────
function IndexCard({
  label, data, format = "number", unit, onSelect, sub, line,
}: {
  label: string; data: IndexData | null; line?: number[];
  format?: "number" | "currency" | "usd"; unit?: string;
  onSelect: (label: string) => void; sub?: string;
}) {
  if (!data) {
    return (
      <div className="card flex flex-col gap-2 animate-pulse">
        <p className="card-title text-xs">{label}</p>
        <div className="h-6 bg-navy-border rounded w-24" />
        <div className="h-3 bg-navy-border rounded w-16" />
      </div>
    );
  }
  const isPos = data.changePct >= 0;
  const col   = isPos ? "text-signal-green" : "text-signal-red";
  const arrow = isPos ? "▲" : "▼";

  const fmt = (p: number) => {
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
        <div>
          <p className="card-title mb-0 text-xs">{label}</p>
          {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
        </div>
        {data.marketState === "REGULAR" && (
          <span className="text-signal-green text-[10px] shrink-0">● 장중</span>
        )}
      </div>
      <p className="num text-lg font-bold text-white mt-0.5 leading-tight">
        {fmt(data.price)}{unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
      </p>
      <span className={`num text-xs font-semibold ${col}`}>
        {arrow} {Math.abs(data.changePct).toFixed(2)}%
      </span>
      {line && line.length > 2 && <Sparkline values={line} up={isPos} />}
    </button>
  );
}

// ── 소형 가로 행 (환율·원자재) ────────────────────────────────────────────────
function SmallRow({
  label, data, format = "usd", unit, emoji, onSelect,
}: {
  label: string; data: IndexData | null;
  format?: "number" | "usd"; unit?: string; emoji?: string;
  onSelect: (label: string) => void;
}) {
  if (!data) {
    return (
      <div className="flex items-center justify-between py-2 px-3 bg-navy-card/40 rounded-lg border border-navy-border/30 animate-pulse">
        <div className="h-3 bg-navy-border rounded w-16" />
        <div className="h-3 bg-navy-border rounded w-20" />
      </div>
    );
  }
  const isPos = data.changePct >= 0;
  const col   = isPos ? "text-signal-green" : "text-signal-red";
  const arrow = isPos ? "▲" : "▼";
  const fmtP  = (p: number) =>
    format === "usd"
      ? `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : p.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  const hasChart = CHART_LABELS.has(label);

  return (
    <button
      onClick={() => hasChart && onSelect(label)}
      className={`w-full flex items-center justify-between py-2 px-3
        bg-navy-card/40 rounded-lg border border-navy-border/30 text-left transition-all
        ${hasChart ? "cursor-pointer hover:border-cyan-brand/30 hover:bg-navy-card/60" : ""}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {emoji && <span className="text-sm shrink-0">{emoji}</span>}
        <span className="text-xs text-gray-400 whitespace-nowrap">{label}</span>
        {hasChart && <span className="text-gray-600 text-xs opacity-50 shrink-0">↗</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="num text-xs text-gray-300 whitespace-nowrap">
          {fmtP(data.price)}{unit && <span className="text-gray-600 ml-0.5">{unit}</span>}
        </span>
        <span className={`num text-xs font-semibold whitespace-nowrap ${col}`}>
          {arrow}{Math.abs(data.changePct).toFixed(2)}%
        </span>
      </div>
    </button>
  );
}

interface CryptoData { price: number; changePct: number; }

export default function LiveMarketPulse() {
  const [data, setData]           = useState<MarketData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [chart, setChart]         = useState<string | null>(null);
  const [btc, setBtc]             = useState<CryptoData | null>(null);
  const [lines, setLines]         = useState<Record<string, number[]>>({});

  // 상단 티커에서 지표를 누르면 차트 모달 (다른 탭에서 오면 ?chart= 로)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("chart");
    if (q) { setChart(q); window.history.replaceState(null, "", window.location.pathname); }
    const h = (e: Event) => setChart((e as CustomEvent<string>).detail);
    window.addEventListener(OPEN_CHART_EVENT, h);
    return () => window.removeEventListener(OPEN_CHART_EVENT, h);
  }, []);

  useEffect(() => {
    const load = () => fetch("/api/sparklines", { cache: "no-store" })
      .then(r => r.json()).then(j => setLines(j.lines ?? {})).catch(() => {});
    load();
    const iv = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      if (!res.ok) return;
      const json: MarketData = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString("ko-KR"));
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch("/api/crypto-prices", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.btc) setBtc({ price: j.btc.price, changePct: j.btc.changePct }); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    function getInterval() {
      const kst  = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const day  = kst.getUTCDay();
      const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes();
      const open = day >= 1 && day <= 5 && mins >= 540 && mins < 930;
      return open ? 15_000 : 60_000;
    }
    let iv = setInterval(fetchData, getInterval());
    const reschedule = setInterval(() => { clearInterval(iv); iv = setInterval(fetchData, getInterval()); }, 60_000);
    return () => { clearInterval(iv); clearInterval(reschedule); };
  }, [fetchData]);

  return (
    <>
      <section className="space-y-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">실시간 시장 현황</h2>
          <span className="text-xs text-gray-600">
            {loading ? "갱신 중..." : lastUpdated ? `${lastUpdated} 기준` : ""}
          </span>
        </div>

        {/* ① 국내 지수 */}
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">국내</p>
          <div className="grid grid-cols-2 gap-2">
            <IndexCard label="KOSPI" line={lines["KOSPI"]}  data={data?.kospi  ?? null} onSelect={setChart} />
            <IndexCard label="KOSDAQ" line={lines["KOSDAQ"]} data={data?.kosdaq ?? null} onSelect={setChart} />
          </div>
        </div>

        {/* ② 미국 현물 지수 */}
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">미국 지수</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <IndexCard label="S&P 500" line={lines["S&P 500"]}    data={data?.sp500   ?? null} onSelect={setChart} />
            <IndexCard label="NASDAQ" line={lines["NASDAQ"]}     data={data?.nasdaq  ?? null} onSelect={setChart} />
            <IndexCard label="다우존스" line={lines["다우존스"]}   data={data?.dow     ?? null} onSelect={setChart} sub="Dow Jones" />
            <IndexCard label="러셀 2000" line={lines["러셀 2000"]}  data={data?.russell ?? null} onSelect={setChart} sub="Russell 2000" />
            <IndexCard label="필라델피아 반도체" line={lines["필라델피아 반도체"]} data={data?.sox ?? null} onSelect={setChart} sub="SOX" />
          </div>
        </div>

        {/* ③ 선물 */}
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">선물</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <IndexCard label="S&P500 선물" line={lines["S&P500 선물"]} data={data?.esFut ?? null} onSelect={setChart} sub="ES Futures" />
            <IndexCard label="나스닥 선물" line={lines["나스닥 선물"]} data={data?.nqFut ?? null} onSelect={setChart} sub="NQ Futures" />
            <IndexCard label="다우 선물" line={lines["다우 선물"]}   data={data?.yjFut ?? null} onSelect={setChart} sub="YM Futures" />
          </div>
        </div>

        {/* ④ 원자재·환율·암호화폐 (소형 행) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <SmallRow label="금"       data={data?.gold   ?? null} emoji="🥇" unit="/oz"  onSelect={setChart} />
          <SmallRow label="WTI 원유" data={data?.oil    ?? null} emoji="🛢"  unit="/bbl" onSelect={setChart} />
          <SmallRow label="USD/KRW"  data={data?.usdKrw ?? null} emoji="💱"
            format="number" unit="원" onSelect={setChart} />
          <SmallRow label="비트코인"
            data={btc ? { price: btc.price, change: 0, changePct: btc.changePct, marketState: "REGULAR" } : null}
            emoji="₿" onSelect={setChart} />
        </div>
      </section>

      {chart && (
        <Suspense fallback={null}>
          <ChartModal label={chart} onClose={() => setChart(null)} />
        </Suspense>
      )}
    </>
  );
}
