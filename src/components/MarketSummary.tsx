"use client";

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
const StockDetailDrawer = lazy(() => import("./StockDetailDrawer"));

interface DrawerState { code: string; market: "KS" | "KQ" | "US"; name: string; }

interface SectorStockLive {
  sym: string; code: string; market: "KS" | "KQ"; name: string;
  price: number; changePct: number; volume: number;
  sparkline: number[]; rawPrices: number[];
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

// Sparkline 컴포넌트는 섹터 모달이 테이블 형태로 전환됨에 따라 제거됨

const SECTOR_COLORS: Record<string, string> = {
  "반도체":"#22d3ee","자동차":"#a78bfa","2차전지":"#34d399","바이오":"#f472b6",
  "IT플랫폼":"#60a5fa","엔터":"#fb923c","금융":"#facc15","소재":"#94a3b8",
  "에너지":"#f87171","소비재":"#86efac","통신":"#c4b5fd","지주":"#9ca3af",
  "가전":"#67e8f9","건설":"#fca5a5","해운":"#6ee7b7","항공":"#a5b4fc","기타":"#6b7280",
};

function SectorHeatmap({ market }: { market: string }) {
  const router = useRouter();
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

      {/* ── 섹터 종목 모달 — 항상 화면 중앙, 테이블 형식 ── */}
      {modalSector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 배경 어둠 + 블러 */}
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setModalSector(null)} />

          {/* 모달 컨테이너 */}
          <div className="relative z-10 w-full max-w-lg bg-[#0f1923] border border-white/10 rounded-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: "85vh" }}>

            {/* ── 헤더 ── */}
            <div className="px-5 pt-5 pb-0 shrink-0">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{SECTOR_ICONS[modalSector.sector] ?? "📊"}</span>
                    <h2 className="text-lg font-bold text-white">
                      {modalSector.sector} 주요 종목 TOP 10
                    </h2>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`text-sm font-bold num ${modalSector.avgChangePct >= 0 ? "text-[#f43f5e]" : "text-[#60a5fa]"}`}>
                      오늘 {modalSector.avgChangePct >= 0 ? "+" : ""}{modalSector.avgChangePct.toFixed(2)}%
                    </span>
                    {!modalLoading && modalStocks.length > 0 && (
                      <span className="text-xs text-gray-500">{Math.min(modalStocks.length, 10)}개 종목</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setModalSector(null)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-all shrink-0 mt-0.5">
                  <span className="text-sm leading-none">✕</span>
                </button>
              </div>

              {/* 테이블 헤더 */}
              <div className="flex items-center gap-2 py-2 border-y border-white/10 text-xs text-gray-500 font-medium">
                <span className="w-5 shrink-0" />
                <span className="flex-1">종목명</span>
                <span className="w-[86px] text-right shrink-0">현재가</span>
                <span className="w-[60px] text-right shrink-0">등락률</span>
                <span className="hidden sm:block w-[76px] text-right shrink-0">거래량</span>
              </div>
            </div>

            {/* ── 종목 테이블 ── */}
            <div className="overflow-y-auto flex-1 pb-3"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#1A2D42 transparent" }}>

              {modalLoading ? (
                <div className="space-y-0 pt-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 px-5 py-2.5 animate-pulse">
                      <div className="w-5 h-3 bg-white/10 rounded shrink-0" />
                      <div className="flex-1 h-3 bg-white/10 rounded" />
                      <div className="w-[90px] h-3 bg-white/5 rounded shrink-0" />
                      <div className="w-[62px] h-3 bg-white/5 rounded shrink-0" />
                      <div className="w-[76px] h-3 bg-white/5 rounded shrink-0" />
                    </div>
                  ))}
                </div>
              ) : modalStocks.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-gray-500">종목 데이터를 불러올 수 없습니다</p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {modalStocks.slice(0, 10).map((stock, idx) => {
                    const isUp = stock.changePct >= 0;
                    return (
                      <div
                        key={stock.code}
                        onClick={() => {
                          router.push(
                            `/analyze?ticker=${stock.code}.${stock.market}&name=${encodeURIComponent(stock.name)}`
                          );
                          setModalSector(null);
                        }}
                        className="flex items-center gap-2 px-5 py-2.5 cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.07] transition-colors group"
                      >
                        <span className="text-xs text-gray-600 w-5 shrink-0 text-center">{idx + 1}</span>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                            {stock.name}
                          </p>
                          <p className="text-xs text-gray-600">{stock.code}</p>
                        </div>

                        <span className="w-[86px] text-right text-sm text-white num shrink-0">
                          {stock.price > 0 ? stock.price.toLocaleString("ko-KR") + "원" : "—"}
                        </span>

                        <span className={`w-[60px] text-right text-sm font-bold num shrink-0 ${isUp ? "text-[#f43f5e]" : "text-[#60a5fa]"}`}>
                          {stock.price > 0
                            ? `${isUp ? "▲" : "▼"}${Math.abs(stock.changePct).toFixed(2)}%`
                            : "—"}
                        </span>

                        <span className="hidden sm:block w-[76px] text-right text-xs text-gray-400 num shrink-0">
                          {(stock.volume ?? 0) > 0
                            ? stock.volume.toLocaleString("ko-KR")
                            : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 하단 힌트 */}
            <div className="px-5 py-2.5 border-t border-white/10 shrink-0">
              <p className="text-xs text-gray-600">종목 클릭 → AI 종목 분석 페이지</p>
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
        <span className="w-5 text-center shrink-0">#</span>
        <span className="flex-1">종목</span>
        <span className="w-20 text-right shrink-0">현재가</span>
        <span className="hidden sm:block w-16 text-right shrink-0">52주 고가</span>
        <span className="w-14 text-right shrink-0">대비</span>
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
                    <span className="text-[10px] px-1 py-0.5 bg-gold/20 text-gold rounded font-bold whitespace-nowrap shrink-0">NEW</span>
                  )}
                </div>
                <p className="text-xs text-gray-600">{r.code}</p>
              </div>
              <span className="w-20 text-right text-sm text-white num shrink-0">{fmtPrice(r.price)}</span>
              <span className="hidden sm:block w-16 text-right text-xs text-gray-400 num shrink-0">{fmtPrice(r.week52High)}</span>
              <span className={`w-14 text-right text-sm font-semibold num shrink-0 ${r.distFromHigh >= 0 ? "text-gold" : "text-gray-400"}`}>
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


// 투자자 종류별 단일 리스트 (모바일 탭뷰 + 데스크탑 컬럼뷰 공용)
function InvestorRankCol({
  items, mode, onSelect, compact = false,
}: {
  items: RankItem[]; mode: "buy" | "sell";
  onSelect: (d: DrawerState) => void;
  compact?: boolean; // 데스크탑 3열 모드
}) {
  const isPos = mode === "buy";
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <button
          key={item.code}
          onClick={() => onSelect({ code: item.code, market: "KS", name: item.name })}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-navy-sub/60 active:bg-navy-sub/80 transition-colors text-left group"
        >
          {/* 순위 */}
          <span className="text-xs text-gray-600 w-4 shrink-0 text-center">{item.rank}</span>

          {/* 종목명 + 가격/등락률 */}
          <div className="flex-1 min-w-0">
            <p className={`font-medium truncate group-hover:text-cyan-brand transition-colors ${
              compact ? "text-xs" : "text-sm"
            } text-white`}>
              {item.name}
            </p>
            <p className="text-[11px] text-gray-500 num leading-tight">
              {item.price.toLocaleString("ko-KR")}원
              <span className={`ml-1 ${item.changePct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                {item.changePct >= 0 ? "▲" : "▼"}{Math.abs(item.changePct).toFixed(2)}%
              </span>
            </p>
          </div>

          {/* 순매수/순매도 금액 */}
          <span className={`text-xs font-bold num shrink-0 ${isPos ? "text-signal-green" : "text-signal-red"}`}>
            {fmtAmount(item.netBuyAmount)}
          </span>
        </button>
      ))}
    </div>
  );
}

type InvestorType = "foreign" | "institution" | "individual";
const INVESTOR_TABS: { key: InvestorType; label: string }[] = [
  { key: "foreign",     label: "외국인" },
  { key: "institution", label: "기관"   },
  { key: "individual",  label: "개인"   },
];

function InvestorFlowList({ onSelect }: { market: string; onSelect: (d: DrawerState) => void }) {
  const [data, setData]         = useState<RankData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [mode, setMode]         = useState<"buy" | "sell">("buy");
  const [investor, setInvestor] = useState<InvestorType>("foreign");

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

      {/* ── 상단 컨트롤: 순매수/순매도 + 기준 안내 ── */}
      <div className="flex items-center gap-2 flex-wrap">
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
        <span className="text-xs text-gray-600 ml-auto">KIS · KOSPI 상위 45종목</span>
      </div>

      {loading ? (
        /* 스켈레톤 */
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-2 animate-pulse">
              <div className="w-4 h-3 bg-navy-border rounded" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-navy-border rounded w-3/4" />
                <div className="h-2.5 bg-navy-border/60 rounded w-1/2" />
              </div>
              <div className="h-3 w-12 bg-navy-border rounded" />
            </div>
          ))}
        </div>
      ) : cols ? (<>

        {/* ── 모바일: 외국인/기관/개인 탭 ── */}
        <div className="flex sm:hidden gap-1 bg-navy-sub/40 rounded-lg p-1">
          {INVESTOR_TABS.map(t => (
            <button key={t.key} onClick={() => setInvestor(t.key)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                investor === t.key
                  ? "bg-navy-card text-white shadow"
                  : "text-gray-500 hover:text-gray-300"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 모바일: 선택된 투자자 리스트 (full-width) */}
        <div className="sm:hidden">
          <InvestorRankCol
            items={cols[investor]}
            mode={mode}
            onSelect={onSelect}
          />
        </div>

        {/* ── 데스크탑: 3열 그리드 ── */}
        <div className="hidden sm:grid grid-cols-3 gap-1 divide-x divide-navy-border/30">
          {INVESTOR_TABS.map((t, idx) => (
            <div key={t.key} className={idx > 0 ? "pl-3" : ""}>
              <p className="text-xs font-semibold text-gray-400 mb-2 px-1">{t.label}</p>
              <InvestorRankCol
                items={cols[t.key]}
                mode={mode}
                onSelect={onSelect}
                compact
              />
            </div>
          ))}
        </div>

      </>) : (
        <p className="text-xs text-gray-500 text-center py-4">데이터를 불러오지 못했습니다</p>
      )}
    </div>
  );
}

// ─── US Market Components ──────────────────────────────────────────────────────

interface USStockRow {
  rank: number; code: string; name: string;
  price: number; change: number; changePct: number; volume: number;
  marketState: string;
  preMarketPrice:     number | null;
  preMarketChangePct: number | null;
  postMarketPrice:    number | null;
  postMarketChangePct: number | null;
}
interface USSectorRow { sector: string; symbol: string; changePct: number; price: number; }

function fmtUSD(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtVolUS(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

function USStockList({
  type, index, onSelect,
}: {
  type: "gainers" | "losers" | "actives";
  index: string;
  onSelect: (d: DrawerState) => void;
}) {
  const [rows, setRows]       = useState<USStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs]           = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-us?type=${type}&index=${index}&_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.stocks ?? []);
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* silent */ } finally { setLoading(false); }
  }, [type, index]);

  useEffect(() => {
    setLoading(true); setRows([]); load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const subLabel =
    index === "SP500"  ? "S&P 500 기준" :
    index === "NASDAQ" ? "NASDAQ 기준"  : "다우존스 30 기준";

  return (
    <div>
      <div className="flex justify-between mb-3 text-xs">
        <span className="text-gray-500">{subLabel}</span>
        {ts && <span className="text-gray-600">{ts} 기준</span>}
      </div>
      <div className="flex gap-3 py-1.5 text-xs text-gray-600 font-medium border-b border-navy-border/40">
        <span className="w-5 text-center">#</span>
        <span className="flex-1">종목</span>
        <span className="w-20 text-right">현재가</span>
        <span className="w-14 text-right">등락률</span>
        <span className="w-14 text-right hidden sm:block">거래량</span>
      </div>
      {loading ? <SkeletonRows /> : rows.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">데이터를 불러올 수 없습니다</p>
      ) : (
        <div className="divide-y divide-navy-border/30">
          {rows.map(r => {
            // 시간외 표시 로직
            const isPre  = r.marketState === "PRE"  && r.preMarketPrice  !== null;
            const isPost = (r.marketState === "POST" || r.marketState === "POSTPOST") && r.postMarketPrice !== null;
            const extPrice  = isPre  ? r.preMarketPrice  : isPost ? r.postMarketPrice  : null;
            const extPct    = isPre  ? r.preMarketChangePct : isPost ? r.postMarketChangePct : null;
            const extLabel  = isPre  ? "PRE"  : isPost ? "POST" : null;
            // 표시 주가: 시간외 있으면 시간외가 메인, 전일종가를 보조로
            const displayPrice  = extPrice  ?? r.price;
            const displayPct    = extPct    ?? r.changePct;
            const isDisplayPos  = displayPct >= 0;
            return (
              <div key={r.code}
                className="flex items-center gap-3 py-2 hover:bg-navy-card/30 rounded cursor-pointer transition-colors"
                onClick={() => onSelect({ code: r.code, market: "US", name: r.name })}
              >
                <RankBadge rank={r.rank} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-white font-medium truncate">{r.name}</p>
                    {extLabel && (
                      <span className={`text-[10px] font-bold px-1 py-0.5 rounded shrink-0 ${
                        isPre ? "bg-amber-400/20 text-amber-300" : "bg-purple-400/20 text-purple-300"
                      }`}>{extLabel}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 whitespace-nowrap">
                    {r.code}
                    {extPrice !== null && (
                      <span className="text-gray-600 ml-1">· 종가 {fmtUSD(r.price)}</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end shrink-0 w-20">
                  <span className="text-sm text-white num whitespace-nowrap">{fmtUSD(displayPrice!)}</span>
                  {extPrice !== null && (
                    <span className="text-xs text-gray-600 num whitespace-nowrap line-through">{fmtUSD(r.price)}</span>
                  )}
                </div>
                <span className={`w-14 text-right text-sm font-semibold num whitespace-nowrap ${isDisplayPos ? "text-signal-green" : "text-signal-red"}`}>
                  {isDisplayPos ? "▲" : "▼"}{Math.abs(displayPct!).toFixed(2)}%
                </span>
                <span className="w-14 text-right text-xs text-gray-500 num hidden sm:block whitespace-nowrap">{fmtVolUS(r.volume)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const US_SECTOR_COLORS: Record<string, string> = {
  "기술":"#22d3ee","금융":"#facc15","에너지":"#f87171","헬스케어":"#f472b6",
  "산업재":"#60a5fa","임의소비재":"#fb923c","필수소비재":"#86efac",
  "유틸리티":"#c4b5fd","부동산":"#fca5a5","소재":"#94a3b8","통신":"#67e8f9",
};
const US_SECTOR_ICONS: Record<string, string> = {
  "기술":"💻","금융":"🏦","에너지":"⚡","헬스케어":"💊","산업재":"⚙️",
  "임의소비재":"🛍️","필수소비재":"🛒","유틸리티":"💡","부동산":"🏘️","소재":"⚗️","통신":"📡",
};

function USSectorHeatmap() {
  const [sectors, setSectors] = useState<USSectorRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-us?type=sector&_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setSectors(json.sectors ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setLoading(true); load();
    const iv = setInterval(load, 120_000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
      {Array.from({ length: 11 }).map((_, i) => (
        <div key={i} className="h-16 bg-navy-border rounded-lg animate-pulse" />
      ))}
    </div>
  );

  return (
    <div>
      <p className="text-xs text-gray-600 mb-3">SPDR 섹터 ETF 기준 오늘 등락률 (지수 무관 동일)</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sectors.map(s => {
          const isPos    = s.changePct >= 0;
          const intensity = Math.min(Math.abs(s.changePct) / 5, 1);
          const color    = US_SECTOR_COLORS[s.sector] ?? "#6b7280";
          return (
            <div key={s.symbol} className="p-3 rounded-lg border relative overflow-hidden"
              style={{
                backgroundColor: `${color}${isPos ? Math.round(intensity * 25).toString(16).padStart(2, "0") : "08"}`,
                borderColor: "rgba(255,255,255,0.1)",
              }}>
              <div className="absolute bottom-0 left-0 h-1 rounded-b-lg"
                style={{ width: `${intensity * 100}%`, backgroundColor: color, opacity: 0.7 }} />
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-sm">{US_SECTOR_ICONS[s.sector] ?? "📊"}</span>
                <p className="text-xs font-semibold text-white">{s.sector}</p>
              </div>
              <p className={`text-lg font-bold num ${isPos ? "text-signal-green" : "text-signal-red"}`}>
                {isPos ? "+" : ""}{s.changePct.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500">{s.symbol}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type RegionTabType = "KR" | "US";
type MainTabType = "top10" | "volume" | "sector" | "high52" | "flow";
type MarketType = "KOSPI" | "KOSDAQ";
type USIndexType = "SP500" | "NASDAQ" | "DOW";
type USContentTab = "gainers" | "losers" | "actives" | "sector";

const KR_TABS: { id: MainTabType; label: string }[] = [
  { id: "top10",  label: "상승 TOP10"  },
  { id: "volume", label: "거래량 급등" },
  { id: "sector", label: "섹터 흐름"  },
  { id: "high52", label: "52주 신고가" },
  { id: "flow",   label: "투자자 동향" },
];

const US_INDEX_TABS: { id: USIndexType; label: string }[] = [
  { id: "SP500",  label: "S&P 500"  },
  { id: "NASDAQ", label: "NASDAQ"   },
  { id: "DOW",    label: "다우존스" },
];

const US_CONTENT_TABS: { id: USContentTab; label: string }[] = [
  { id: "gainers", label: "상승 TOP10" },
  { id: "losers",  label: "하락 TOP10" },
  { id: "actives", label: "거래량 TOP10" },
  { id: "sector",  label: "섹터 흐름"   },
];

export default function MarketSummary() {
  const [region, setRegion]   = useState<RegionTabType>("KR");
  const [mainTab, setMainTab] = useState<MainTabType>("top10");
  const [market, setMarket]   = useState<MarketType>("KOSPI");
  const [usIndex, setUsIndex]     = useState<USIndexType>("SP500");
  const [usContent, setUsContent] = useState<USContentTab>("gainers");
  const [drawer, setDrawer]   = useState<DrawerState | null>(null);

  return (
    <section className="card">
      {/* ── 국내 / 미국 Region 토글 ── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">시장 동향</h2>
        <div className="flex gap-0.5 bg-navy-border/30 rounded-full p-0.5">
          {([["KR","🇰🇷 국내"],["US","🇺🇸 미국"]] as [RegionTabType, string][]).map(([r, label]) => (
            <button key={r} onClick={() => setRegion(r)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                region === r ? "bg-navy-card text-white shadow" : "text-gray-500 hover:text-gray-300"
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── KR 헤더 + 컨텐츠 ── */}
      {region === "KR" && (<>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex gap-1">
            {(["KOSPI","KOSDAQ"] as MarketType[]).map(m => (
              <MarketTab key={m} label={m} active={market === m} onClick={() => setMarket(m)} />
            ))}
          </div>
          <div className="flex gap-0.5 bg-navy-border/30 rounded-full p-0.5 flex-wrap">
            {KR_TABS.map(t => (
              <MainTabBtn key={t.id} label={t.label} active={mainTab === t.id} onClick={() => setMainTab(t.id)} />
            ))}
          </div>
        </div>

        {mainTab === "top10"  && <TopGainersList  market={market} onSelect={setDrawer} />}
        {mainTab === "volume" && <VolumeSpikeList  market={market} onSelect={setDrawer} />}
        {mainTab === "sector" && <SectorHeatmap    market={market} />}
        {mainTab === "high52" && <Week52HighList   market={market} onSelect={setDrawer} />}
        {mainTab === "flow"   && <InvestorFlowList market={market} onSelect={setDrawer} />}
      </>)}

      {/* ── US 헤더 + 컨텐츠 ── */}
      {region === "US" && (<>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex gap-1">
            {US_INDEX_TABS.map(t => (
              <MarketTab key={t.id} label={t.label} active={usIndex === t.id} onClick={() => setUsIndex(t.id)} />
            ))}
          </div>
          <div className="flex gap-0.5 bg-navy-border/30 rounded-full p-0.5 flex-wrap">
            {US_CONTENT_TABS.map(t => (
              <MainTabBtn key={t.id} label={t.label} active={usContent === t.id} onClick={() => setUsContent(t.id)} />
            ))}
          </div>
        </div>

        {usContent !== "sector" && (
          <USStockList type={usContent} index={usIndex} onSelect={setDrawer} />
        )}
        {usContent === "sector" && <USSectorHeatmap />}
      </>)}

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
