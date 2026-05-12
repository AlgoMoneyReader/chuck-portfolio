"use client";

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
const StockDetailDrawer = lazy(() => import("./StockDetailDrawer"));

interface DrawerState { code: string; market: "KS" | "KQ"; name: string; }

interface SectorStockLive {
  sym: string; code: string; market: "KS" | "KQ"; name: string;
  price: number; changePct: number; sparkline: number[]; rawPrices: number[];
}

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
  stocks: {
    name: string;
    code: string;
    market: "KS" | "KQ";
    changePct: number;
    price: number;
    volume: number;
  }[];
}
interface HighRow {
  rank: number; code: string; name: string;
  price: number; changePct: number;
  week52High: number; distFromHigh: number; isNewHigh: boolean;
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
const fmtVol = (n: number) => n.toLocaleString("ko-KR");

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

function MainTabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function TopGainersList({ market, onSelect }: { market: string; onSelect: (d: DrawerState) => void }) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-top?market=${market}&_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.topGainers ?? []);
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); load();
    let tid: ReturnType<typeof setTimeout>;
    function schedule() {
      // 매 tick마다 장 상태를 재평가 — mount 시점에 고정되지 않음
      const delay = isMarketOpen() ? 30_000 : 120_000;
      tid = setTimeout(() => { load(); schedule(); }, delay);
    }
    schedule();
    return () => clearTimeout(tid);
  }, [load]);

  return (
    <div>
      <div className="flex justify-between mb-3 text-xs"><StatusBadge />
        {ts && <span className="text-gray-600">{ts} 기준</span>}
      </div>
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
            <div key={r.code}
              className="flex items-center gap-3 py-2 hover:bg-navy-card/30 rounded cursor-pointer transition-colors"
              onClick={() => onSelect({ code: r.code, market: market === "KOSDAQ" ? "KQ" : "KS", name: r.name })}
            >
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

function VolumeSpikeList({ market, onSelect }: { market: string; onSelect: (d: DrawerState) => void }) {
  const [rows, setRows] = useState<SpikeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/volume-spike?market=${market}&_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.spikes ?? []);
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); load();
    let tid: ReturnType<typeof setTimeout>;
    function schedule() {
      // 매 tick마다 장 상태를 재평가
      const delay = isMarketOpen() ? 60_000 : 300_000;
      tid = setTimeout(() => { load(); schedule(); }, delay);
    }
    schedule();
    return () => clearTimeout(tid);
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
            <div key={r.code}
              className="flex items-center gap-3 py-2 hover:bg-navy-card/30 rounded cursor-pointer transition-colors"
              onClick={() => onSelect({ code: r.code, market: market === "KOSDAQ" ? "KQ" : "KS", name: r.name })}
            >
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

function Sparkline({ points, changePct, width = 72, height = 28 }: {
  points: number[]; changePct: number; width?: number; height?: number;
}) {
  if (points.length < 2) {
    return <div style={{ width, height }} className="bg-white/5 rounded" />;
  }
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pathD = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + (1 - p / 100) * h;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  // Korean stock convention: red = up, blue = down
  const color = changePct >= 0 ? "#f43f5e" : "#60a5fa";
  const lastY = pad + (1 - (points[points.length - 1] ?? 50) / 100) * h;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`sg_${changePct >= 0 ? "up" : "dn"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path
        d={`${pathD} L ${(pad + w).toFixed(1)} ${(pad + h).toFixed(1)} L ${pad} ${(pad + h).toFixed(1)} Z`}
        fill={`url(#sg_${changePct >= 0 ? "up" : "dn"})`}
      />
      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      <circle cx={(pad + w).toFixed(1)} cy={lastY.toFixed(1)} r="2" fill={color} />
    </svg>
  );
}

const SECTOR_COLORS: Record<string, string> = {
  "반도체":"#22d3ee","자동차":"#a78bfa","2차전지":"#34d399","바이오":"#f472b6",
  "IT플랫폼":"#60a5fa","엔터":"#fb923c","금융":"#facc15","소재":"#94a3b8",
  "에너지":"#f87171","소비재":"#86efac","통신":"#c4b5fd","지주":"#9ca3af",
  "가전":"#67e8f9","건설":"#fca5a5","해운":"#6ee7b7","항공":"#a5b4fc","기타":"#6b7280",
};

function SectorHeatmap({ market, onSelect }: { market: string; onSelect: (d: DrawerState) => void }) {
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalSector, setModalSector] = useState<SectorRow | null>(null);
  const [modalStocks, setModalStocks] = useState<SectorStockLive[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sector-perf?market=${market}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setSectors(json.sectors ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); setModalSector(null); load();
    const i = setInterval(load, 120_000);
    return () => clearInterval(i);
  }, [load]);

  // ESC closes modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModalSector(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fetch stocks when sector is selected
  function openSectorModal(s: SectorRow) {
    setModalSector(s);
    setModalStocks([]);
    setModalLoading(true);
    fetch(`/api/sector-stocks?sector=${encodeURIComponent(s.sector)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((j: { stocks?: SectorStockLive[] } | null) => { if (j?.stocks) setModalStocks(j.stocks); })
      .catch(() => {})
      .finally(() => setModalLoading(false));
  }

  const SECTOR_ICONS: Record<string, string> = {
    "반도체":"💾","자동차":"🚗","2차전지":"🔋","바이오":"💊","IT플랫폼":"📱",
    "엔터":"🎵","금융":"🏦","소재":"⚙️","에너지":"⚡","소비재":"🛍️",
    "통신":"📡","지주":"🏢","가전":"📺","건설":"🏗️","해운":"🚢",
    "항공":"✈️","방산·조선":"🛡️","로봇·AI":"🤖","기타":"📊",
  };

  if (loading) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="h-16 bg-navy-border rounded-lg animate-pulse" />
      ))}
    </div>
  );

  return (
    <>
      {/* ── 섹터 카드 그리드 ── */}
      <p className="text-xs text-gray-600 mb-3">오늘 섹터별 평균 등락률 · 클릭하면 구성 종목 보기</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sectors.map(s => {
          const isPos = s.avgChangePct >= 0;
          const intensity = Math.min(Math.abs(s.avgChangePct) / 5, 1);
          const color = SECTOR_COLORS[s.sector] ?? "#6b7280";
          return (
            <button
              key={s.sector}
              onClick={() => openSectorModal(s)}
              className="p-3 rounded-lg border relative overflow-hidden text-left transition-all active:scale-[0.97] hover:brightness-110"
              style={{
                backgroundColor: `${color}${isPos ? Math.round(intensity * 25).toString(16).padStart(2, "0") : "08"}`,
                borderColor: "rgba(255,255,255,0.1)",
              }}
            >
              <div className="absolute bottom-0 left-0 h-1 rounded-b-lg"
                style={{ width: `${intensity * 100}%`, backgroundColor: color, opacity: 0.7 }} />
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-sm">{SECTOR_ICONS[s.sector] ?? "📊"}</span>
                <p className="text-xs font-semibold text-white">{s.sector}</p>
              </div>
              <p className={`text-lg font-bold num ${isPos ? "text-[#f43f5e]" : "text-[#60a5fa]"}`}>
                {isPos ? "+" : ""}{s.avgChangePct.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500 truncate">▲ {s.topStock}</p>
            </button>
          );
        })}
      </div>

      {/* ── Toss 스타일 모달 ── */}
      {modalSector && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setModalSector(null)} />

          {/* Modal container */}
          <div className="relative z-10 w-full sm:max-w-md bg-[#111827] border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: "85vh" }}>

            {/* ── Modal Header ── */}
            <div className="px-5 pt-6 pb-4 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium tracking-wider uppercase">섹터 흐름</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{SECTOR_ICONS[modalSector.sector] ?? "📊"}</span>
                    <h2 className="text-2xl font-bold text-white">{modalSector.sector}</h2>
                  </div>
                  {!modalLoading && modalStocks.length > 0 && (
                    <p className="text-sm text-gray-400 mt-1">{modalStocks.length}개 종목</p>
                  )}
                </div>
                {/* Sector avg change */}
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">오늘</p>
                  <p className={`text-xl font-bold num ${modalSector.avgChangePct >= 0 ? "text-[#f43f5e]" : "text-[#60a5fa]"}`}>
                    {modalSector.avgChangePct >= 0 ? "+" : ""}{modalSector.avgChangePct.toFixed(2)}%
                  </p>
                  <button onClick={() => setModalSector(null)}
                    className="mt-2 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-all ml-auto">
                    <span className="text-sm leading-none">✕</span>
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="mt-4 border-t border-white/10" />
            </div>

            {/* ── Stock List ── */}
            <div className="overflow-y-auto flex-1 px-2 pb-6"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#1A2D42 transparent" }}>

              {modalLoading ? (
                /* Loading skeleton */
                <div className="space-y-1 px-3 pt-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 animate-pulse">
                      <div className="w-9 h-9 rounded-full bg-white/10 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-white/10 rounded w-24" />
                        <div className="h-2.5 bg-white/5 rounded w-16" />
                      </div>
                      <div className="w-16 h-7 bg-white/5 rounded" />
                      <div className="text-right space-y-1">
                        <div className="h-3 bg-white/10 rounded w-16" />
                        <div className="h-2.5 bg-white/5 rounded w-12" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : modalStocks.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-gray-500">종목 데이터를 불러올 수 없습니다</p>
                </div>
              ) : (
                <div>
                  {modalStocks.map((stock, idx) => {
                    const isUp = stock.changePct >= 0;
                    const changeColor = isUp ? "#f43f5e" : "#60a5fa";
                    // Color-coded avatar background
                    const avatarColors = ["#1e3a5f","#1a3a2f","#3d1f3d","#2d2a1a","#1f2d3d","#2d1a1a","#1a2d3d","#2d2d1a"];
                    const bgColor = avatarColors[idx % avatarColors.length];

                    return (
                      <div
                        key={stock.code}
                        onClick={() => { onSelect({ code: stock.code, market: stock.market, name: stock.name }); setModalSector(null); }}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.04] active:bg-white/[0.08]"
                      >
                        {/* Avatar */}
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 border border-white/10"
                          style={{ backgroundColor: bgColor }}
                        >
                          {stock.name.slice(0, 2)}
                        </div>

                        {/* Name + Code */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{stock.name}</p>
                          <p className="text-xs text-gray-500 num">{stock.code}</p>
                        </div>

                        {/* Sparkline */}
                        <div className="shrink-0">
                          <Sparkline points={stock.sparkline} changePct={stock.changePct} width={72} height={28} />
                        </div>

                        {/* Price + Change */}
                        <div className="text-right shrink-0 min-w-[72px]">
                          {stock.price > 0 ? (
                            <>
                              <p className="text-sm font-semibold text-white num">
                                {stock.price.toLocaleString("ko-KR")}원
                              </p>
                              <p className="text-xs font-bold num" style={{ color: changeColor }}>
                                {isUp ? "▲" : "▼"} {Math.abs(stock.changePct).toFixed(2)}%
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-600">—</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom handle for mobile */}
            <div className="flex justify-center pb-2 pt-1 sm:hidden shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── 52주 신고가 ──────────────────────────────────────────────────────────────

function Week52HighList({ market, onSelect }: { market: string; onSelect: (d: DrawerState) => void }) {
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
    const i = setInterval(load, 3_600_000);
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
            <div key={r.code}
              className="flex items-center gap-3 py-2 hover:bg-navy-card/30 rounded cursor-pointer transition-colors"
              onClick={() => onSelect({ code: r.code, market: market === "KOSDAQ" ? "KQ" : "KS", name: r.name })}
            >
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

// ─── 투자자 동향 (토스 스타일) ───────────────────────────────────────────────

interface RankItem {
  rank: number; code: string; name: string;
  price: number; changePct: number;
  netBuyAmount: number; netBuyQty: number;
}
interface RankData {
  buy: { foreign: RankItem[]; institution: RankItem[]; individual: RankItem[] };
  sell: { foreign: RankItem[]; institution: RankItem[]; individual: RankItem[] };
}

function fmtAmount(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 10000 ? (abs / 10000).toFixed(1) + "조" : abs.toLocaleString("ko-KR") + "억";
  return (n > 0 ? "+" : n < 0 ? "-" : "") + s;
}


function InvestorRankCol({
  title, items, mode, onSelect,
}: {
  title: string; items: RankItem[]; mode: "buy" | "sell";
  onSelect: (d: DrawerState) => void;
}) {
  const isPos = mode === "buy";
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-300 mb-2 px-1">{title}</p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <button
            key={item.code}
            onClick={() => onSelect({ code: item.code, market: "KS", name: item.name })}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-navy-sub/60 transition-colors text-left group"
          >
            <span className="text-xs text-gray-600 w-4 shrink-0">{item.rank}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate group-hover:text-cyan-brand transition-colors">
                {item.name}
              </p>
              <p className="text-xs text-gray-500 num">
                {item.price.toLocaleString("ko-KR")}원
                <span className={item.changePct >= 0 ? "text-signal-green" : "text-signal-red"}>
                  {" "}{item.changePct >= 0 ? "▲" : "▼"}{Math.abs(item.changePct).toFixed(2)}%
                </span>
              </p>
            </div>
            <span className={`text-xs font-bold num shrink-0 ${isPos ? "text-signal-green" : "text-signal-red"}`}>
              {fmtAmount(item.netBuyAmount)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InvestorFlowList({ onSelect }: { market: string; onSelect: (d: DrawerState) => void }) {
  const [data, setData]       = useState<RankData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode]       = useState<"buy" | "sell">("buy");

  useEffect(() => {
    setLoading(true);
    fetch("/api/investor-ranking", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && !j.error) setData(j); })
      .finally(() => setLoading(false));
  }, []);

  const cols = data?.[mode];

  return (
    <div className="space-y-3">
      {/* 순매수/순매도 토글 */}
      <div className="flex gap-2">
        {(["buy", "sell"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-1.5 text-xs rounded-full font-semibold transition-all ${
              mode === m
                ? m === "buy"
                  ? "bg-signal-green/20 text-signal-green border border-signal-green/40"
                  : "bg-signal-red/20 text-signal-red border border-signal-red/40"
                : "text-gray-500 hover:text-gray-300 border border-transparent"
            }`}>
            {m === "buy" ? "순매수" : "순매도"}
          </button>
        ))}
        <span className="text-xs text-gray-600 self-center ml-auto">KIS 기준 · KOSPI 상위 45종목</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[0,1,2].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 bg-navy-border rounded animate-pulse w-12" />
              {Array.from({length:5}).map((_,j) => (
                <div key={j} className="h-10 bg-navy-border rounded animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : cols ? (
        <div className="grid grid-cols-3 gap-1 divide-x divide-navy-border/30">
          <InvestorRankCol title="외국인" items={cols.foreign}     mode={mode} onSelect={onSelect} />
          <div className="pl-3"><InvestorRankCol title="기관"   items={cols.institution} mode={mode} onSelect={onSelect} /></div>
          <div className="pl-3"><InvestorRankCol title="개인"   items={cols.individual}  mode={mode} onSelect={onSelect} /></div>
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center py-4">데이터를 불러오지 못했습니다</p>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type MainTabType = "top10" | "volume" | "sector" | "high52" | "flow";
type MarketType = "KOSPI" | "KOSDAQ";

const TABS: { id: MainTabType; label: string }[] = [
  { id: "top10",  label: "상승 TOP10"  },
  { id: "volume", label: "거래량 급등" },
  { id: "sector", label: "섹터 흐름"  },
  { id: "high52", label: "52주 신고가" },
  { id: "flow",   label: "투자자 동향" },
];

export default function MarketSummary() {
  const [mainTab, setMainTab] = useState<MainTabType>("top10");
  const [market, setMarket] = useState<MarketType>("KOSPI");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

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
        <div className="flex gap-0.5 bg-navy-border/30 rounded-full p-0.5 flex-wrap">
          {TABS.map(t => (
            <MainTabBtn key={t.id} label={t.label} active={mainTab === t.id} onClick={() => setMainTab(t.id)} />
          ))}
        </div>
      </div>

      {/* 컨텐츠 */}
      {mainTab === "top10"  && <TopGainersList  market={market} onSelect={setDrawer} />}
      {mainTab === "volume" && <VolumeSpikeList  market={market} onSelect={setDrawer} />}
      {mainTab === "sector" && <SectorHeatmap    market={market} onSelect={setDrawer} />}
      {mainTab === "high52" && <Week52HighList   market={market} onSelect={setDrawer} />}
      {mainTab === "flow"   && <InvestorFlowList market={market} onSelect={setDrawer} />}

      {/* 종목 디테일 드로어 */}
      {drawer && (
        <Suspense fallback={null}>
          <StockDetailDrawer
            code={drawer.code}
            market={drawer.market}
            name={drawer.name}
            onClose={() => setDrawer(null)}
          />
        </Suspense>
      )}
    </section>
  );
}
