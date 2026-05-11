"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockRow {
  rank: number; code: string; name: string;
  price: number; change: number; changePct: number; volume: number;
}
interface SpikeRow {
  rank: number; code: string; name: string;
  price: number; changePct: number;
  todayVolume: number; avgVolume: number; ratio: number;
}
interface SectorRow {
  sector: string; avgChangePct: number; stockCount: number;
  topStock: string; topChangePct: number;
}
interface HighRow {
  rank: number; code: string; name: string;
  price: number; changePct: number;
  week52High: number; distFromHigh: number; isNewHigh: boolean;
}
interface FlowItem {
  type: string; label: string; netBuy: number; buy: number; sell: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMarketOpen(): boolean {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return mins >= 540 && mins < 930;
}

const fmtPrice = (n: number) => n.toLocaleString("ko-KR") + "원";
const fmtVol = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" :
  n >= 1_000 ? (n / 1_000).toFixed(0) + "K" : String(n);
const fmtAmount = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 10000 ? (abs / 10000).toFixed(1) + "조" : abs.toLocaleString("ko-KR") + "억";
  return (n > 0 ? "+" : n < 0 ? "-" : "") + s;
};

// ─── 공통 UI ──────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1 ? "text-yellow-400" : rank === 2 ? "text-gray-300" :
    rank === 3 ? "text-amber-600" : "text-gray-600";
  return <span className={`text-xs font-bold w-5 text-center ${cls}`}>{rank}</span>;
}

function MarketTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
        active ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40"
               : "text-gray-500 hover:text-gray-300"
      }`}>{label}</button>
  );
}

function MainTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full transition-all whitespace-nowrap ${
        active ? "bg-navy-card text-white font-semibold" : "text-gray-500 hover:text-gray-300"
      }`}>{label}</button>
  );
}

function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2 pt-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-5 h-3 bg-navy-border rounded" />
          <div className="flex-1 h-3 bg-navy-border rounded" />
          <div className="w-16 h-3 bg-navy-border rounded" />
          <div className="w-12 h-3 bg-navy-border rounded" />
        </div>
      ))}
    </div>
  );
}

function StatusBadge() {
  return isMarketOpen()
    ? <span className="text-signal-green text-xs">● 장중</span>
    : <span className="text-gray-600 text-xs">○ 장마감</span>;
}

// ─── 상승 TOP 10 ──────────────────────────────────────────────────────────────

function TopGainersList({ market }: { market: string }) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-top?market=${market}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.topGainers ?? []);
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); load();
    const i = setInterval(load, isMarketOpen() ? 60_000 : 300_000);
    return () => clearInterval(i);
  }, [load]);

  return (
    <div>
      <div className="flex justify-between mb-3 text-xs"><StatusBadge />
        {ts && <span className="text-gray-600">{ts} 기준</span>}
      </div>
      {/* 헤더 */}
      <div className="flex gap-3 py-1.5 text-xs text-gray-600 font-medium border-b border-navy-border/40">
        <span className="w-5 text-center">#</span>
        <span className="flex-1">종목</span>
        <span className="w-20 text-right">현재가</span>
        <span className="w-14 text-right">등락률</span>
        <span className="w-14 text-right hidden sm:block">거래량</span>
      </div>
      {loading ? <SkeletonRows /> : (
        <div className="divide-y divide-navy-border/30">
          {rows.map(r => (
            <div key={r.code} className="flex items-center gap-3 py-2 hover:bg-navy-card/30 rounded">
              <RankBadge rank={r.rank} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{r.name}</p>
                <p className="text-xs text-gray-600">{r.code}</p>
              </div>
              <span className="w-20 text-right text-sm text-white num">{fmtPrice(r.price)}</span>
              <span className={`w-14 text-right text-sm font-semibold num ${r.changePct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                {r.changePct >= 0 ? "▲" : "▼"}{Math.abs(r.changePct).toFixed(2)}%
              </span>
              <span className="w-14 text-right text-xs text-gray-500 num hidden sm:block">{fmtVol(r.volume)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 거래량 급등 ──────────────────────────────────────────────────────────────

function VolumeSpikeList({ market }: { market: string }) {
  const [rows, setRows] = useState<SpikeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/volume-spike?market=${market}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.spikes ?? []);
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); load();
    const i = setInterval(load, isMarketOpen() ? 120_000 : 600_000);
    return () => clearInterval(i);
  }, [load]);

  return (
    <div>
      <div className="flex justify-between mb-3 text-xs"><StatusBadge />
        {ts && <span className="text-gray-600">{ts} 기준</span>}
      </div>
      <p className="text-xs text-gray-600 mb-3">5일 평균 대비 오늘 거래량 배율 기준 정렬</p>
      <div className="flex gap-3 py-1.5 text-xs text-gray-600 font-medium border-b border-navy-border/40">
        <span className="w-5 text-center">#</span>
        <span className="flex-1">종목</span>
        <span className="w-14 text-right">등락률</span>
        <span className="w-16 text-right">오늘 거래량</span>
        <span className="w-12 text-right">배율</span>
      </div>
      {loading ? <SkeletonRows /> : rows.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">데이터가 없습니다</p>
      ) : (
        <div className="divide-y divide-navy-border/30">
          {rows.map(r => (
            <div key={r.code} className="flex items-center gap-3 py-2 hover:bg-navy-card/30 rounded">
              <RankBadge rank={r.rank} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{r.name}</p>
                <p className="text-xs text-gray-600">{r.code}</p>
              </div>
              <span className={`w-14 text-right text-sm font-semibold num ${r.changePct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                {r.changePct >= 0 ? "▲" : "▼"}{Math.abs(r.changePct).toFixed(2)}%
              </span>
              <span className="w-16 text-right text-xs text-gray-300 num">{fmtVol(r.todayVolume)}</span>
              <span className="w-12 text-right">
                <span className="text-xs font-bold text-gold num">{r.ratio}x</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 섹터 흐름 ────────────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  "반도체":"#22d3ee","자동차":"#a78bfa","2차전지":"#34d399","바이오":"#f472b6",
  "IT플랫폼":"#60a5fa","엔터":"#fb923c","금융":"#facc15","소재":"#94a3b8",
  "에너지":"#f87171","소비재":"#86efac","통신":"#c4b5fd","지주":"#9ca3af",
  "가전":"#67e8f9","건설":"#fca5a5","해운":"#6ee7b7","항공":"#a5b4fc","기타":"#6b7280",
};

function SectorHeatmap({ market }: { market: string }) {
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sector-perf?market=${market}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setSectors(json.sectors ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); load();
    const i = setInterval(load, 120_000);
    return () => clearInterval(i);
  }, [load]);

  if (loading) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="h-16 bg-navy-border rounded-lg animate-pulse" />
      ))}
    </div>
  );

  return (
    <div>
      <p className="text-xs text-gray-600 mb-3">오늘 섹터별 평균 등락률</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sectors.map(s => {
          const isPos = s.avgChangePct >= 0;
          const intensity = Math.min(Math.abs(s.avgChangePct) / 5, 1); // 0~5% → opacity 0~1
          const color = SECTOR_COLORS[s.sector] ?? "#6b7280";
          return (
            <div key={s.sector}
              className="p-3 rounded-lg border border-navy-border/30 relative overflow-hidden hover:border-gray-600 transition-colors"
              style={{ backgroundColor: `${color}${isPos ? Math.round(intensity * 25).toString(16).padStart(2,"0") : "08"}` }}>
              {/* 배경 강도 바 */}
              <div className="absolute bottom-0 left-0 h-1 rounded-b-lg transition-all"
                style={{ width: `${intensity * 100}%`, backgroundColor: color, opacity: 0.7 }} />
              <p className="text-xs font-semibold text-white">{s.sector}</p>
              <p className={`text-lg font-bold num ${isPos ? "text-signal-green" : "text-signal-red"}`}>
                {isPos ? "+" : ""}{s.avgChangePct.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500 truncate">TOP: {s.topStock}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 52주 신고가 ──────────────────────────────────────────────────────────────

function Week52HighList({ market }: { market: string }) {
  const [rows, setRows] = useState<HighRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/week52-high?market=${market}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.candidates ?? []);
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); load();
    const i = setInterval(load, 3_600_000); // 1시간 (자주 안 바뀜)
    return () => clearInterval(i);
  }, [load]);

  return (
    <div>
      <div className="flex justify-between mb-3 text-xs">
        <span className="text-gray-500">신고가 돌파 / 3% 이내 근접 종목</span>
        {ts && <span className="text-gray-600">{ts} 기준</span>}
      </div>
      <div className="flex gap-3 py-1.5 text-xs text-gray-600 font-medium border-b border-navy-border/40">
        <span className="w-5 text-center">#</span>
        <span className="flex-1">종목</span>
        <span className="w-20 text-right">현재가</span>
        <span className="w-16 text-right">52주 고가</span>
        <span className="w-14 text-right">신고가 대비</span>
      </div>
      {loading ? <SkeletonRows /> : rows.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">52주 신고가 근접 종목이 없습니다</p>
      ) : (
        <div className="divide-y divide-navy-border/30">
          {rows.map(r => (
            <div key={r.code} className="flex items-center gap-3 py-2 hover:bg-navy-card/30 rounded">
              <RankBadge rank={r.rank} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-white font-medium truncate">{r.name}</p>
                  {r.isNewHigh && (
                    <span className="text-xs px-1.5 py-0.5 bg-gold/20 text-gold rounded font-bold whitespace-nowrap">NEW</span>
                  )}
                </div>
                <p className="text-xs text-gray-600">{r.code}</p>
              </div>
              <span className="w-20 text-right text-sm text-white num">{fmtPrice(r.price)}</span>
              <span className="w-16 text-right text-xs text-gray-400 num">{fmtPrice(r.week52High)}</span>
              <span className={`w-14 text-right text-sm font-semibold num ${r.distFromHigh >= 0 ? "text-gold" : "text-gray-400"}`}>
                {r.distFromHigh >= 0 ? "+" : ""}{r.distFromHigh.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 투자자 동향 ──────────────────────────────────────────────────────────────

const INVESTOR_ICONS: Record<string, string> = { foreign:"🌐", institution:"🏦", individual:"👤" };

function InvestorFlowList({ market }: { market: string }) {
  const [flow, setFlow] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/investor-flow?market=${market}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setFlow(json.flow ?? []);
      setError(false);
    } catch { setError(true); } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); load();
    const i = setInterval(load, isMarketOpen() ? 300_000 : 600_000);
    return () => clearInterval(i);
  }, [load]);

  return (
    <div>
      {error ? (
        <div className="py-4 space-y-3">
          <p className="text-xs text-gray-500 text-center">KRX 서버가 직접 API 접근을 제한하고 있습니다.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { label: "네이버 금융 — 투자자 동향", url: `https://finance.naver.com/sise/investorDealTrendDay.naver?sosok=${market === "KOSDAQ" ? 1 : 0}` },
              { label: "KRX 통계 — 매매동향",       url: "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020203" },
            ].map(link => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-navy-card border border-navy-border rounded-lg hover:border-gray-600 transition-colors text-xs text-gray-400 hover:text-gray-200">
                <span className="text-gray-600">↗</span>{link.label}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 font-medium pb-1 border-b border-navy-border/40">
            <span>투자자</span>
            <span className="text-right">순매수</span>
            <span className="text-right">매수</span>
            <span className="text-right">매도</span>
          </div>
          {loading ? (
            [0,1,2].map(i => (
              <div key={i} className="grid grid-cols-4 gap-2 animate-pulse">
                {[0,1,2,3].map(j => <div key={j} className="h-8 bg-navy-border rounded" />)}
              </div>
            ))
          ) : (
            flow.map(item => (
              <div key={item.type}
                className="grid grid-cols-4 gap-2 items-center py-2 px-3 rounded-lg bg-navy-card/40 border border-navy-border/30">
                <div className="flex items-center gap-2">
                  <span>{INVESTOR_ICONS[item.type]}</span>
                  <span className="text-sm text-white font-medium">{item.label}</span>
                </div>
                <span className={`text-right text-sm font-bold num ${item.netBuy >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                  {fmtAmount(item.netBuy)}
                </span>
                <span className="text-right text-xs text-gray-400 num">{fmtAmount(Math.abs(item.buy))}</span>
                <span className="text-right text-xs text-gray-400 num">{fmtAmount(Math.abs(item.sell))}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type MainTab = "top10" | "volume" | "sector" | "high52" | "flow";
type MarketType = "KOSPI" | "KOSDAQ";

const TABS: { id: MainTab; label: string }[] = [
  { id: "top10",  label: "상승 TOP10"  },
  { id: "volume", label: "거래량 급등" },
  { id: "sector", label: "섹터 흐름"  },
  { id: "high52", label: "52주 신고가" },
  { id: "flow",   label: "투자자 동향" },
];

export default function MarketSummary() {
  const [mainTab, setMainTab] = useState<MainTab>("top10");
  const [market, setMarket] = useState<MarketType>("KOSPI");

  return (
    <section className="card">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">국내 시장 동향</h2>
          <div className="flex gap-1">
            {(["KOSPI","KOSDAQ"] as MarketType[]).map(m => (
              <MarketTab key={m} label={m} active={market === m} onClick={() => setMarket(m)} />
            ))}
          </div>
        </div>
        {/* 탭 */}
        <div className="flex gap-0.5 bg-navy-border/30 rounded-full p-0.5 flex-wrap">
          {TABS.map(t => (
            <MainTab key={t.id} label={t.label} active={mainTab === t.id} onClick={() => setMainTab(t.id)} />
          ))}
        </div>
      </div>

      {/* 컨텐츠 */}
      {mainTab === "top10"  && <TopGainersList  market={market} />}
      {mainTab === "volume" && <VolumeSpikeList  market={market} />}
      {mainTab === "sector" && <SectorHeatmap    market={market} />}
      {mainTab === "high52" && <Week52HighList   market={market} />}
      {mainTab === "flow"   && <InvestorFlowList market={market} />}
    </section>
  );
}
