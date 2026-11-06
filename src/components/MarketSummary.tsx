"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { krSession } from "@/lib/krSession";
import { useStockModal } from "./StockModal";

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
  tradeAmount?: number; // 거래대금 (원)
  capEok?: number;      // 시가총액 (억원)
  nxtPrice?: number | null; nxtPct?: number | null; // 넥스트레이드 프리·애프터마켓
}

// 국내 종목 한 줄 — 미국 목록과 같은 배치: 종목 | 현재가·등락률(아래 줄에 프리/애프터) | 끝 열(시총·거래대금)
// 표: PC 는 열 간격이 고른 그리드, 휴대폰은 종목 열·머리글을 고정하고 나머지 열을 손가락으로 좌우로 밀어 본다
// (Tailwind 가 읽을 수 있게 클래스는 문자열 그대로 둔다)
const krGrid = (cap?: boolean) => (cap
  ? "grid items-center gap-x-3 w-max min-w-full grid-cols-[136px_100px_64px_80px_76px_84px_104px] md:w-auto md:gap-x-4 md:grid-cols-[minmax(200px,2fr)_repeat(6,minmax(0,1fr))]"
  : "grid items-center gap-x-3 w-max min-w-full grid-cols-[136px_100px_64px_76px_84px_104px] md:w-auto md:gap-x-4 md:grid-cols-[minmax(200px,2fr)_repeat(5,minmax(0,1fr))]");
// 고정 열(순위+종목명): 밀어도 남아 있도록 배경을 깔아 둔다
export const STICKY = "sticky left-0 z-10 bg-navy-card md:static md:bg-transparent";
/** 표 바깥 틀: 휴대폰에서 가로 스크롤 */
export function ScrollTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto scrollbar-none md:overflow-visible">{children}</div>;
}
export function SwipeHint() {
  return <p className="md:hidden text-[11px] text-gray-600 mb-1">← 표를 좌우로 밀면 거래대금·거래량 등이 더 보입니다</p>;
}

function KrGridHead({ cap }: { cap?: boolean }) {
  return (
    <div className={`${krGrid(cap)} py-2 text-xs text-gray-500 font-medium border-b border-navy-border/40`}>
      <span className={`${STICKY} flex gap-2`}><span className="w-5 text-center">#</span>종목</span>
      <span className="text-right">현재가</span>
      <span className="text-right">등락률</span>
      {cap && <span className="text-right">시가총액</span>}
      <span className="text-right">거래대금</span>
      <span className="text-right">전일대비</span>
      <span className="text-right">거래량</span>
    </div>
  );
}

function KrStockRow({ r, onClick, rankCls, last, badge, compact = false, wideCap }: {
  r: StockRow; onClick: () => void; rankCls?: string; last?: string; badge?: string; compact?: boolean; wideCap?: boolean;
}) {
  const s = krSession();
  const v = r.changePct;
  const tone = (x: number) => (x > 0 ? "text-signal-green" : x < 0 ? "text-signal-red" : "text-gray-400");
  const val = compact ? "text-xs" : "text-sm";
  const extended = s.key !== "regular" && s.key !== "auction-close";
  const useExt = extended && r.nxtPrice != null && r.nxtPct != null;
  const extTag = s.key === "nxt-pre" || s.key === "auction-open" ? "NXT" : s.key === "nxt-after" ? "애프터" : "애프터 종가";
  const mPrice = useExt ? r.nxtPrice! : r.price;
  const mPct = useExt ? r.nxtPct! : v;
  const mChange = useExt ? r.nxtPrice! - r.price : r.change; // 기준 = 직전 정규장 종가
  const mArrow = mPct > 0 ? "▲" : mPct < 0 ? "▼" : "";
  const tagCls = extTag === "NXT" ? "text-amber-300" : "text-purple-300";
  return (
    <>
      {/* 모바일(또는 2열 좁은 패널): 종목 | 현재가·등락률(아래 NXT) | 끝 열 */}
      {compact && <div className={`flex items-center ${compact ? "gap-2 py-1.5" : "gap-3 py-2"} hover:bg-navy-card/30 rounded cursor-pointer transition-colors group`} onClick={onClick}>
        {rankCls ? <span className={`w-5 text-center text-xs font-bold ${rankCls}`}>{r.rank}</span> : <RankBadge rank={r.rank} />}
        <div className="flex-1 min-w-0">
          <p className={`${val} text-white font-medium truncate group-hover:text-cyan-brand transition-colors`}>{r.name}</p>
          {/* 좁은 화면: 종목코드 대신 오늘의 사유(기관 매물 출회 등)를 보여 잘리지 않게 */}
          <p className={`${compact ? "text-[10px]" : "text-xs"} truncate`}>{badge ? <span className="text-gold/80">{badge}</span> : <span className="text-gray-600">{r.code}</span>}</p>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <div className="flex items-baseline gap-2">
            <span key={`${r.code}-${mPrice}`} className={`${val} text-white num whitespace-nowrap rounded px-0.5 animate-tick`}>{useExt && <span className={`text-[9px] font-bold mr-0.5 ${tagCls}`}>{extTag}</span>}{mPrice.toLocaleString("ko-KR")}</span>
            <span className={`${compact ? "w-14" : "w-16"} text-right ${val} font-semibold num whitespace-nowrap ${tone(mPct)}`}>{mArrow}{Math.abs(mPct).toFixed(2)}%</span>
          </div>
          {useExt && <span className="text-[10px] text-gray-500 num whitespace-nowrap mt-0.5">종가 {r.price.toLocaleString("ko-KR")} {v > 0 ? "+" : ""}{v.toFixed(2)}%</span>}
        </div>
        {last != null && <span className="w-14 text-right text-xs text-gray-300 num whitespace-nowrap">{last}</span>}
      </div>}

      {/* 표 한 줄 (PC 고른 간격 / 휴대폰 좌우 스크롤, 종목 열 고정) */}
      {!compact && (
        <div className={`${krGrid(wideCap)} py-2.5 hover:bg-navy-sub/40 cursor-pointer transition-colors group text-sm num`} onClick={onClick}>
          <div className={`${STICKY} flex items-center gap-2 min-w-0 self-stretch`}>
            {rankCls ? <span className={`w-5 shrink-0 text-center text-xs font-bold ${rankCls}`}>{r.rank}</span> : <span className="w-5 shrink-0 flex justify-center"><RankBadge rank={r.rank} /></span>}
            <div className="min-w-0 py-0.5">
              <p className="text-white font-medium leading-snug [overflow-wrap:anywhere] line-clamp-2 group-hover:text-cyan-brand transition-colors">{r.name}</p>
              <p className="text-xs truncate"><span className={`text-gray-600 ${badge ? "hidden md:inline" : ""}`}>{r.code}</span>{badge && <span className="text-gold/80"><span className="hidden md:inline"> · </span>{badge}</span>}</p>
            </div>
          </div>
          {/* 장외엔 NXT·애프터 시세가 메인, 아래 줄은 정규장 종가 / 정규장엔 정규장 시세 */}
          <div className="flex flex-col items-end">
            <span key={`${r.code}-${mPrice}`} className="text-white whitespace-nowrap rounded px-0.5 animate-tick">
              {useExt && <span className={`text-[10px] font-bold mr-1 ${tagCls}`}>{extTag}</span>}{mPrice.toLocaleString("ko-KR")}원
            </span>
            {useExt ? <span className="text-[11px] text-gray-500 whitespace-nowrap mt-0.5">정규장 종가 {r.price.toLocaleString("ko-KR")}</span>
              : extended ? <span className="text-[11px] text-gray-600 whitespace-nowrap mt-0.5">NXT 미거래</span> : null}
          </div>
          <div className="flex flex-col items-end">
            <span key={`${r.code}-p-${mPct}`} className={`font-semibold whitespace-nowrap rounded px-0.5 animate-tick ${tone(mPct)}`}>{mPct > 0 ? "+" : mPct < 0 ? "-" : ""}{Math.abs(mPct).toFixed(2)}%</span>
            {useExt && <span className={`text-[11px] whitespace-nowrap mt-0.5 ${tone(v)}`}>{v > 0 ? "+" : ""}{v.toFixed(2)}%</span>}
          </div>
          {/* 값이 바뀐 칸은 잠깐 깜빡인다 (가격이 움직이면 등락률·시총·거래대금·전일대비·거래량도 함께) */}
          {wideCap && <span className="text-right"><span key={`${r.code}-c-${fmtCap(r.capEok)}`} className="text-gray-200 font-semibold whitespace-nowrap rounded px-0.5 animate-tick">{fmtCap(r.capEok)}</span></span>}
          <span className="text-right"><span key={`${r.code}-a-${r.tradeAmount ? fmtTradeAmt(r.tradeAmount) : ""}`} className="text-gray-300 whitespace-nowrap rounded px-0.5 animate-tick">{r.tradeAmount ? fmtTradeAmt(r.tradeAmount) : "—"}</span></span>
          <span className="text-right"><span key={`${r.code}-d-${mChange}`} className={`whitespace-nowrap rounded px-0.5 animate-tick ${tone(mPct)}`}>{mChange != null ? `${mArrow}${Math.abs(mChange).toLocaleString("ko-KR")}` : "—"}</span></span>
          <span className="text-right"><span key={`${r.code}-v-${r.volume}`} className="text-gray-300 whitespace-nowrap rounded px-0.5 animate-tick">{r.volume ? `${r.volume.toLocaleString("ko-KR")}주` : "—"}</span></span>
        </div>
      )}
    </>
  );
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

// 종목별 AI 한줄 요약: 세션 동안 종목당 한 번만 받는다 (시세 갱신마다 AI를 부르지 않도록)
const SUMMARY = new Map<string, string>();
const PENDING = new Set<string>();
function summaryBadges(list: { code: string; name: string; changePct: number }[], mkt: string, set: (fn: (p: Record<string, string>) => Record<string, string>) => void) {
  const init: Record<string, string> = {};
  list.forEach(r => { init[r.code] = SUMMARY.get(r.code) ?? heuristicBadge(r.changePct); });
  set(() => init);
  list.filter(r => !SUMMARY.has(r.code) && !PENDING.has(r.code)).forEach(r => {
    PENDING.add(r.code);
    fetch(`/api/stock-news-summary?ticker=${encodeURIComponent(`${r.code}.${mkt}`)}&name=${encodeURIComponent(r.name)}&changePct=${r.changePct}`)
      .then(res => res.ok ? res.json() : null)
      .then(ns => { if (ns?.summary) { SUMMARY.set(r.code, ns.summary); set(prev => ({ ...prev, [r.code]: ns.summary })); } })
      .catch(() => null)
      .finally(() => PENDING.delete(r.code));
  });
}
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
      className={`px-4 py-1.5 text-sm rounded-md transition-all whitespace-nowrap ${
        active ? "bg-navy-card text-white font-bold shadow-sm ring-1 ring-white/70"
               : "text-gray-500 hover:text-gray-300"
      }`}>{label}</button>
  );
}

function MainTabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3.5 py-1.5 text-sm rounded-lg border transition-all whitespace-nowrap ${
        active ? "bg-white text-navy border-white font-bold" : "border-navy-border text-gray-400 hover:text-white hover:border-gray-500"
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

// 지금 거래 시간대: 정규장 / NXT 프리·애프터마켓 / 동시호가 / 장 종료
function StatusBadge() {
  const s = krSession();
  const cls = s.key === "regular" ? "text-signal-green" : s.extended ? "text-purple-300" : s.key === "auction-close" ? "text-gold" : "text-gray-500";
  return <span className={`text-xs ${cls}`}>{s.key === "closed" ? "○" : "●"} {s.label}</span>;
}

// ─── 등락률 → 즉시 heuristic 뱃지 ──────────────────────────────────────────
function heuristicBadge(pct: number): string {
  if (pct >= 7)  return "급등 모멘텀";
  if (pct >= 3)  return "강한 매수세";
  if (pct >= 1)  return "외국인 매수";
  if (pct >= 0)  return "소폭 강보합";
  if (pct >= -1) return "소폭 약보합";
  if (pct >= -3) return "차익 실현";
  if (pct >= -7) return "기관 매물";
  return "패닉 매도";
}

// ─── 상승 / 하락 TOP 20 (2컬럼 패널) ─────────────────────────────────────────

/** 상승/하락 공용 하프 컴포넌트 */
function TopMoversHalf({
  market, mode, ts, onSelect, large = false,
}: {
  market: string;
  mode: "gainers" | "losers";
  ts: string;
  onSelect: (d: DrawerState) => void;
  large?: boolean;   // 단독으로 보일 때(매매동향 상승/하락 탭) 다른 탭과 같은 글자 크기
}) {
  const T = { head: large ? "text-xs" : "text-[10px]" };
  const [rows, setRows]     = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<Record<string, string>>({});
  const mkt = market === "KOSDAQ" ? "KQ" : "KS";
  const isGainer = mode === "gainers";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-top?market=${market}&nx=${mode}&_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const list: StockRow[] = (isGainer ? json.topGainers : json.topLosers) ?? [];
      setRows(list);

      summaryBadges(list, mkt, setBadges);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market, mkt, isGainer, mode]);

  useEffect(() => {
    setLoading(true); load();
    let tid: ReturnType<typeof setTimeout>;
    function schedule() {
      // 정규장·NXT 프리·애프터(08~20시)엔 5초마다 — 실시간 티커처럼
      tid = setTimeout(() => { if (document.visibilityState === "visible") load(); schedule(); }, liveHours() ? 5_000 : 120_000);
    }
    schedule();
    return () => clearTimeout(tid);
  }, [load]);

  const accentColor = isGainer ? "text-signal-green" : "text-signal-red";
  const title       = isGainer ? `상승률 상위${rows.length ? ` ${rows.length}` : ""}` : `하락률 상위${rows.length ? ` ${rows.length}` : ""}`;
  const icon        = isGainer ? "▲" : "▼";

  return (
    <div className="min-w-0">
      {/* 섹션 제목 */}
      <div className="flex items-center justify-between mb-2">
        <span className={`${large ? "text-sm" : "text-xs"} font-bold ${accentColor}`}>{icon} {title}</span>
        {ts && <span className="text-[10px] text-gray-600">{ts}</span>}
      </div>

      {/* 헤더 */}
      {!large && <div className={`flex gap-3 py-1.5 ${T.head} text-gray-600 font-medium border-b border-navy-border/40`}>
        <span className="w-5 text-center">#</span>
        <span className="flex-1">종목</span>
        <span className="text-right">현재가 · 등락률 <span className="text-gray-700">(NXT/애프터)</span></span>
      </div>}
      {large && <SwipeHint />}

      {loading ? <SkeletonRows count={10} /> : (() => {
        const list = (
          <div className="divide-y divide-navy-border/20">
            {rows.map(r => (
              <KrStockRow key={r.code} r={r} compact={!large}
                rankCls={r.rank <= 3 ? accentColor : "text-gray-600"}
                badge={r.nxtPrice == null ? badges[r.code] : undefined}
                onClick={() => onSelect({ code: r.code, market: mkt, name: r.name })} />
            ))}
          </div>
        );
        return large ? <ScrollTable><KrGridHead />{list}</ScrollTable> : list;
      })()}
    </div>
  );
}

/** 상승/하락 2컬럼 패널 */
function GainersLosersPanel({ market, onSelect }: { market: string; onSelect: (d: DrawerState) => void }) {
  const [ts, setTs] = useState("");

  useEffect(() => {
    fetch(`/api/market-top?market=${market}&_=${Date.now()}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.timestamp) setTs(new Date(j.timestamp).toLocaleTimeString("ko-KR") + " 기준"); })
      .catch(() => null);
  }, [market]);

  return (
    <div>
      {/* 장중/장마감 표시 */}
      <div className="flex items-center gap-2 mb-3 text-xs">
        <StatusBadge />
      </div>

      {/* 2컬럼 분할 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
        <TopMoversHalf market={market} mode="gainers" ts={ts} onSelect={onSelect} />
        {/* 세로 구분선 (sm+) */}
        <TopMoversHalf market={market} mode="losers"  ts={ts} onSelect={onSelect} />
      </div>
    </div>
  );
}

// ─── 거래대금 TOP 20 ──────────────────────────────────────────────────────────

function fmtTradeAmt(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}조`;
  if (n >= 1e8)  return `${Math.round(n / 1e8).toLocaleString("ko-KR")}억`;
  if (n >= 1e4)  return `${Math.round(n / 1e4)}만`;
  return n.toLocaleString("ko-KR");
}

// 08:00~20:00 (정규장 + NXT 프리 + KRX·NXT 애프터)
const liveHours = () => krSession().key !== "closed";
const fmtCap = (eok?: number) => (!eok ? "—" : eok >= 10000 ? `${(eok / 10000).toLocaleString("ko-KR", { minimumFractionDigits: eok >= 1e5 ? 0 : 1, maximumFractionDigits: eok >= 1e5 ? 0 : 1 })}조` : `${Math.round(eok).toLocaleString("ko-KR")}억`);

function TopByAmountList({ market, onSelect, kind = "amount" }: { market: string; onSelect: (d: DrawerState) => void; kind?: "amount" | "cap" }) {
  const [rows, setRows]       = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs]           = useState("");
  const [badges, setBadges]   = useState<Record<string, string>>({});

  const mkt = market === "KOSDAQ" ? "KQ" : "KS";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-top?market=${market}&nx=${kind}&_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const list: StockRow[] = (kind === "cap" ? json.topByCap : json.topByAmount) ?? [];
      setRows(list);
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");

      summaryBadges(list, mkt, setBadges);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market, mkt, kind]);

  useEffect(() => {
    setLoading(true); load();
    let tid: ReturnType<typeof setTimeout>;
    function schedule() {
      const delay = liveHours() ? 5_000 : 300_000;
      tid = setTimeout(() => { if (document.visibilityState === "visible") load(); schedule(); }, delay);
    }
    schedule();
    return () => clearTimeout(tid);
  }, [load]);

  return (
    <div>
      <div className="flex justify-between mb-3 text-xs">
        <span className="text-gray-500">{market === "KOSDAQ" ? "코스닥" : "코스피"} {kind === "cap" ? "시가총액" : "당일 거래대금"} 상위 {rows.length || 100}종목</span>
        {ts && <span className="text-gray-600">{ts} 기준</span>}
      </div>
      <SwipeHint />
      {loading ? <SkeletonRows count={10} /> : (
        <ScrollTable>
          <KrGridHead cap={kind === "cap"} />
          <div className="divide-y divide-navy-border/30">
            {rows.map(r => (
              <KrStockRow key={r.code} r={r} wideCap={kind === "cap"}
                badge={r.nxtPrice == null ? badges[r.code] : undefined}
                onClick={() => onSelect({ code: r.code, market: mkt, name: r.name })} />
            ))}
          </div>
        </ScrollTable>
      )}
    </div>
  );
}

// ─── 거래량 급등 ──────────────────────────────────────────────────────────────

// ─── ETF·ETN (레버리지·인버스 포함) ─────────────────────────────────────────
const ETF_SORTS: [string, string][] = [["cap", "시총상위"], ["up", "상승"], ["down", "하락"], ["amount", "거래대금"]];
const ETF_KINDS: [string, string][] = [["all", "전체"], ["lev", "레버리지"], ["inv", "인버스"], ["etn", "ETN"]];
function EtfList({ onSelect }: { onSelect: (d: DrawerState) => void }) {
  const [sort, setSort] = useState("cap");
  const [kind, setKind] = useState("all");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState("");
  const load = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/market-etf?sort=${sort}&kind=${kind}&_=${Date.now()}`, { cache: "no-store" })).json();
      setRows(j.rows ?? []);
      setTs(j.timestamp ? new Date(j.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* 유지 */ } finally { setLoading(false); }
  }, [sort, kind]);
  useEffect(() => {
    setLoading(true); load();
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, liveHours() ? 5_000 : 120_000);
    return () => clearInterval(iv);
  }, [load]);
  const chip = (on: boolean) => `px-3 py-1 text-xs rounded-lg border whitespace-nowrap ${on ? "border-cyan-brand/50 bg-cyan-brand/10 text-cyan-brand font-semibold" : "border-navy-border text-gray-500 hover:text-gray-300"}`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {ETF_SORTS.map(([k, l]) => <button key={k} onClick={() => setSort(k)} className={chip(sort === k)}>{l}</button>)}
        <span className="w-px h-4 bg-navy-border mx-1" />
        {ETF_KINDS.map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={chip(kind === k)}>{l}</button>)}
      </div>
      <div className="flex justify-between mb-2 text-xs">
        <span className="text-gray-500">국내 상장 ETF·ETN {kind === "lev" ? "· 레버리지" : kind === "inv" ? "· 인버스" : kind === "etn" ? "· ETN" : ""} · 최대 100</span>
        {ts && <span className="text-gray-600">{ts} 기준</span>}
      </div>
      <SwipeHint />
      {loading ? <SkeletonRows count={10} /> : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">{sort === "up" ? "오르는 종목이 없습니다" : sort === "down" ? "내리는 종목이 없습니다" : "데이터를 불러올 수 없습니다"}</p>
      ) : (
        <ScrollTable>
          <KrGridHead cap />
          <div className="divide-y divide-navy-border/30">
            {rows.map(r => (
              <KrStockRow key={r.code} r={r} wideCap onClick={() => onSelect({ code: r.code, market: "KS", name: r.name })} />
            ))}
          </div>
        </ScrollTable>
      )}
    </div>
  );
}

function VolumeSpikeList({ market, onSelect }: { market: string; onSelect: (d: DrawerState) => void }) {
  const [rows, setRows] = useState<SpikeRow[]>([]);
  const [basis, setBasis] = useState("5일 평균 대비");
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/volume-spike?market=${market}&_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.spikes ?? []);
      setBasis(json.basis ?? "5일 평균 대비");
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); load();
    let tid: ReturnType<typeof setTimeout>;
    function schedule() {
      // 매 tick마다 장 상태를 재평가
      const delay = isMarketOpen() ? 20_000 : 300_000;
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
      <p className="text-xs text-gray-600 mb-3">{basis} 오늘 거래량 배율 순 · 1.5배 이상 · 최대 30종목</p>
      <div className="grid items-center gap-x-3 grid-cols-[20px_minmax(0,1fr)_64px_76px_44px] md:gap-x-4 md:grid-cols-[28px_minmax(160px,2fr)_repeat(4,minmax(0,1fr))] py-1.5 text-xs text-gray-600 font-medium border-b border-navy-border/40">
        <span className="text-center">#</span>
        <span>종목</span>
        <span className="hidden md:block text-right">현재가</span>
        <span className="text-right">등락률</span>
        <span className="text-right">오늘 거래량</span>
        <span className="text-right">{basis}</span>
      </div>
      {loading ? <SkeletonRows /> : rows.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">데이터가 없습니다</p>
      ) : (
        <div className="divide-y divide-navy-border/30">
          {rows.map(r => (
            <div key={r.code}
              className="grid items-center gap-x-3 grid-cols-[20px_minmax(0,1fr)_64px_76px_44px] md:gap-x-4 md:grid-cols-[28px_minmax(160px,2fr)_repeat(4,minmax(0,1fr))] py-2 md:py-2.5 hover:bg-navy-card/30 rounded cursor-pointer transition-colors"
              onClick={() => onSelect({ code: r.code, market: market === "KOSDAQ" ? "KQ" : "KS", name: r.name })}
            >
              <span className="flex justify-center"><RankBadge rank={r.rank} /></span>
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate">{r.name}</p>
                <p className="text-xs text-gray-600">{r.code}</p>
              </div>
              <span className="hidden md:block text-right text-sm text-white num whitespace-nowrap">{r.price ? fmtPrice(r.price) : "—"}</span>
              <span className={`text-right text-sm font-semibold num whitespace-nowrap ${r.changePct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                {r.changePct >= 0 ? "▲" : "▼"}{Math.abs(r.changePct).toFixed(2)}%
              </span>
              <span className="text-right text-sm text-gray-300 num whitespace-nowrap">{fmtVol(r.todayVolume)}</span>
              <span className="text-right text-sm font-bold text-gold num">{r.ratio.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}배</span>
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
  const stockModal = useStockModal();
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
    const i = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
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
                borderColor: "rgb(var(--c-white) / 0.1)",
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
                          setModalSector(null);
                          stockModal({ code: stock.code, market: stock.market as "KS" | "KQ", name: stock.name });
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
              <p className="text-xs text-gray-600">종목 클릭 → AI 레이더 분석</p>
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
  const [source, setSource] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/week52-high?market=${market}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.candidates ?? []);
      setSource(json.source ?? "");
      setTs(json.timestamp ? new Date(json.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* silent */ } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    setLoading(true); load();
    const i = setInterval(() => { if (document.visibilityState === "visible") load(); }, liveHours() ? 5_000 : 300_000);
    return () => clearInterval(i);
  }, [load]);

  return (
    <div>
      <div className="flex justify-between mb-3 text-xs">
        <span className="text-gray-500">오늘 52주 신고가 경신 · 고가 3% 이내 근접 {source === "yahoo" ? "(주요 종목 기준)" : "(시장 전체)"}</span>
        {ts && <span className="text-gray-600">{ts} 기준</span>}
      </div>
      <div className="grid items-center gap-x-3 grid-cols-[20px_minmax(0,1fr)_auto_60px] md:gap-x-4 md:grid-cols-[28px_minmax(160px,2fr)_repeat(4,minmax(0,1fr))] py-1.5 text-xs text-gray-600 font-medium border-b border-navy-border/40">
        <span className="text-center">#</span>
        <span>종목</span>
        <span className="text-right"><span className="md:hidden">현재가 · 등락률</span><span className="hidden md:inline">현재가</span></span>
        <span className="hidden md:block text-right">등락률</span>
        <span className="hidden md:block text-right">52주 고가</span>
        <span className="text-right">고가 대비</span>
      </div>
      {loading ? <SkeletonRows /> : rows.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">52주 신고가 근접 종목이 없습니다</p>
      ) : (
        <div className="divide-y divide-navy-border/30">
          {rows.map(r => (
            <div key={r.code}
              className="grid items-center gap-x-3 grid-cols-[20px_minmax(0,1fr)_auto_60px] md:gap-x-4 md:grid-cols-[28px_minmax(160px,2fr)_repeat(4,minmax(0,1fr))] py-2 md:py-2.5 hover:bg-navy-card/30 rounded cursor-pointer transition-colors"
              onClick={() => onSelect({ code: r.code, market: market === "KOSDAQ" ? "KQ" : "KS", name: r.name })}
            >
              <span className="flex justify-center"><RankBadge rank={r.rank} /></span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-white font-medium truncate">{r.name}</p>
                  {r.isNewHigh && (
                    <span className="text-[10px] px-1 py-0.5 bg-gold/20 text-gold rounded font-bold whitespace-nowrap shrink-0">NEW</span>
                  )}
                </div>
                <p className="text-xs text-gray-600">{r.code}</p>
              </div>
              <div className="flex flex-col items-end">
                <span key={`${r.code}-p-${r.price}`} className="text-sm text-white num whitespace-nowrap rounded px-0.5 animate-tick">{fmtPrice(r.price)}</span>
                <span key={`${r.code}-m-${r.changePct}`} className={`md:hidden text-[11px] num rounded animate-tick ${r.changePct > 0 ? "text-signal-green" : r.changePct < 0 ? "text-signal-red" : "text-gray-400"}`}>{r.changePct > 0 ? "▲" : r.changePct < 0 ? "▼" : ""}{Math.abs(r.changePct).toFixed(2)}%</span>
              </div>
              <span key={`${r.code}-c-${r.changePct}`} className={`hidden md:block text-right text-sm font-semibold num rounded animate-tick ${r.changePct > 0 ? "text-signal-green" : r.changePct < 0 ? "text-signal-red" : "text-gray-400"}`}>{r.changePct > 0 ? "▲" : r.changePct < 0 ? "▼" : ""}{Math.abs(r.changePct).toFixed(2)}%</span>
              <span className="hidden md:block text-right text-sm text-gray-300 num whitespace-nowrap">{fmtPrice(r.week52High)}</span>
              {/* 돌파 = 오늘 52주 고가를 새로 씀, 근접 = 고가까지 남은 하락폭 */}
              <span key={`${r.code}-d-${r.distFromHigh}-${r.isNewHigh}`} className={`text-right text-sm font-semibold num whitespace-nowrap rounded animate-tick ${r.isNewHigh ? "text-gold" : "text-gray-300"}`}>
                {r.isNewHigh ? "신고가" : `${r.distFromHigh.toFixed(1)}%`}
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
  dataDateLabel?: string;
}

function fmtAmount(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 10000 ? (abs / 10000).toFixed(1) + "조" : abs.toLocaleString("ko-KR") + "억";
  return (n > 0 ? "+" : n < 0 ? "-" : "") + s;
}


// 투자자 종류별 단일 리스트 (모바일 탭뷰 + 데스크탑 컬럼뷰 공용)
function InvestorRankCol({
  items, mode, onSelect,
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
              "text-sm"
            } text-white`}>
              {item.name}
            </p>
            <p className="text-xs text-gray-500 num leading-tight">
              <span key={`${item.code}-p-${item.price}`} className="rounded px-0.5 animate-tick">{item.price.toLocaleString("ko-KR")}원</span>
              <span key={`${item.code}-c-${item.changePct}`} className={`ml-1 rounded px-0.5 animate-tick ${item.changePct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                {item.changePct >= 0 ? "▲" : "▼"}{Math.abs(item.changePct).toFixed(2)}%
              </span>
            </p>
          </div>

          {/* 순매수/순매도 금액 */}
          <span className={`text-sm font-bold num shrink-0 ${isPos ? "text-signal-green" : "text-signal-red"}`}>
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

function InvestorFlowList({ market, onSelect }: { market: string; onSelect: (d: DrawerState) => void }) {
  const [data, setData]         = useState<RankData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [mode, setMode]         = useState<"buy" | "sell">("buy");
  const [investor, setInvestor] = useState<InvestorType>("foreign");

  useEffect(() => {
    setLoading(true);
    const load = () => fetch(`/api/investor-ranking?market=${market}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && !j.error) setData(j as RankData); })
      .finally(() => setLoading(false));
    load();
    // 순위는 서버가 60초 보관, 가격·등락률은 5초마다 실시간
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, liveHours() ? 5_000 : 60_000);
    return () => clearInterval(iv);
  }, [market]);

  const cols = data?.[mode];

  return (
    <div className="space-y-3">

      {/* ── 상단 컨트롤: 순매수/순매도 + 기준 안내 ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["buy", "sell"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-1.5 text-sm rounded-full font-semibold transition-all ${
              mode === m
                ? m === "buy"
                  ? "bg-signal-green/20 text-signal-green border border-signal-green/40"
                  : "bg-signal-red/20 text-signal-red border border-signal-red/40"
                : "text-gray-500 hover:text-gray-300 border border-transparent"
            }`}>
            {m === "buy" ? "순매수" : "순매도"}
          </button>
        ))}
        <div className="ml-auto text-right">
          <p className="text-xs text-gray-600">KIS · {market} · 개인은 추정</p>
          {data?.dataDateLabel && (
            <p className="text-[10px] text-gray-700">{data.dataDateLabel} 기준</p>
          )}
        </div>
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
              className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all ${
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
              <p className="text-sm font-semibold text-gray-400 mb-2 px-1">{t.label}</p>
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
  dollarVolume?: number;
  marketState: string;
  preMarketPrice:     number | null;
  preMarketChangePct: number | null;
  postMarketPrice:    number | null;
  postMarketChangePct: number | null;
  dayMarketPrice?: number | null;
  dayMarketChangePct?: number | null;
  capUsd?: number | null;
}
interface USSectorRow { sector: string; symbol: string; changePct: number; price: number; }
interface USSectorStockRow {
  rank: number; code: string; name: string;
  price: number; changePct: number; volume: number;
}

function fmtUSD(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtVolUS(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

const IDX_NAME: Record<string, string> = { SP500: "S&P 500", NASDAQ: "나스닥 100", DOW: "다우존스 30", RUSSELL: "러셀2000(시총 1001~3000위 근사)", SOXX: "필라델피아 반도체(SOXX)" };

// 미국 시가총액: 러셀2000 같은 중소형주도 읽히게 ($4.98T / $56B / $3.2B / $820M)
const fmtUsdCap = (c: number) => (c >= 1e12 ? `$${(c / 1e12).toFixed(2)}T` : c >= 1e10 ? `$${(c / 1e9).toFixed(0)}B` : c >= 1e9 ? `$${(c / 1e9).toFixed(1)}B` : `$${(c / 1e6).toFixed(0)}M`);

function USStockList({
  type, index, onSelect,
}: {
  type: "cap" | "gainers" | "losers" | "actives" | "etf";
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
    // 실시간 티커처럼: 화면이 보이는 동안 10초마다 (서버는 10초 캐시)
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5_000);
    return () => clearInterval(iv);
  }, [load]);

  const isValue = type === "actives" || type === "etf";
  const isCap = type === "cap";
  const subLabel = isCap
    ? `${IDX_NAME[index] ?? index} 구성 종목 · 시가총액 순`
    : type === "etf"
    ? "국내 투자자 인기 ETF·레버리지 · 거래대금 순 (지수 선택 무관)"
    : isValue
    ? `${IDX_NAME[index] ?? index} 구성 종목 · 거래대금(가격×거래량) 순 (최대 100)`
    : `${IDX_NAME[index] ?? index} 구성 종목 전체 · ${type === "gainers" ? "상승률" : "하락률"} 순 (최대 100)`;

  return (
    <div>
      <div className="flex justify-between mb-3 text-xs">
        <span className="text-gray-500">{subLabel}</span>
        {ts && <span className="text-gray-600">{ts} 기준</span>}
      </div>
      <SwipeHint />
      {loading ? <SkeletonRows /> : rows.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">데이터를 불러올 수 없습니다</p>
      ) : (
        <ScrollTable>
        <div className="grid items-center gap-x-3 w-max min-w-full grid-cols-[max(136px,calc(100vw_-_240px))_84px_64px_84px_84px] md:w-auto md:gap-x-4 md:grid-cols-[minmax(200px,2fr)_repeat(4,minmax(0,1fr))] py-2 text-xs text-gray-500 font-medium border-b border-navy-border/40">
          <span className={`${STICKY} flex gap-2`}><span className="w-5 text-center">#</span>종목</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span className="text-right">{isCap ? "시가총액" : isValue ? "거래대금" : "거래량"}</span>
          <span className="text-right">전일대비</span>
        </div>
        <div className="divide-y divide-navy-border/30">
          {rows.map(r => {
            // 시간외 표시 로직
            // 정규장 종가를 메인으로, 프리·애프터마켓은 아래 줄에 따로 (증권앱 방식)
            // 한국 낮(데이마켓) > 프리 > 애프터 순으로 보여준다
            const hasDay  = r.dayMarketPrice != null;
            const hasPre  = !hasDay && r.preMarketPrice != null && r.marketState === "PRE";
            const hasPost = !hasDay && !hasPre && r.postMarketPrice != null;
            const extPrice = hasDay ? r.dayMarketPrice : hasPre ? r.preMarketPrice : hasPost ? r.postMarketPrice : null;
            const extPct   = hasDay ? r.dayMarketChangePct : hasPre ? r.preMarketChangePct : hasPost ? r.postMarketChangePct : null;
            const isPos    = r.changePct >= 0;
            // 장외(데이·프리·애프터)엔 장외 시세가 메인, 아래 줄은 정규장 종가 (등락률은 정규장 종가 대비)
            const useExt = extPrice != null && extPct != null;
            const mPrice = useExt ? extPrice! : r.price, mPct = useExt ? extPct! : r.changePct;
            const mChange = useExt ? extPrice! - r.price : r.change, mPos = mPct >= 0;
            const extTagCls = hasDay ? "text-cyan-brand" : hasPre ? "text-amber-300" : "text-purple-300";
            return (
              <Fragment key={r.code}>
              <div className="grid items-center gap-x-3 w-max min-w-full grid-cols-[max(136px,calc(100vw_-_240px))_84px_64px_84px_84px] md:w-auto md:gap-x-4 md:grid-cols-[minmax(200px,2fr)_repeat(4,minmax(0,1fr))] py-2.5 hover:bg-navy-sub/40 cursor-pointer transition-colors text-sm num group"
                onClick={() => onSelect({ code: r.code, market: "US", name: r.name })}>
                <div className={`${STICKY} flex items-center gap-2 min-w-0 self-stretch`}>
                  <span className="w-5 shrink-0 flex justify-center"><RankBadge rank={r.rank} /></span>
                  <div className="min-w-0 py-0.5">
                    <p className="text-white font-medium leading-snug [overflow-wrap:anywhere] line-clamp-2 group-hover:text-cyan-brand">{r.name}</p>
                    <p className="text-xs text-gray-600">{r.code}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span key={`${r.code}-d-${mPrice}`} className="text-white whitespace-nowrap rounded px-0.5 animate-tick">
                    {useExt && <span className={`text-[10px] font-bold mr-1 ${extTagCls}`}>{hasDay ? "데이" : hasPre ? "프리" : "애프터"}</span>}{fmtUSD(mPrice)}
                  </span>
                  {useExt && <span className="text-[11px] text-gray-500 whitespace-nowrap mt-0.5">정규장 종가 {fmtUSD(r.price)}</span>}
                </div>
                <div className="flex flex-col items-end">
                  <span key={`${r.code}-c-${mPct}`} className={`font-semibold whitespace-nowrap rounded px-0.5 animate-tick ${mPos ? "text-signal-green" : "text-signal-red"}`}>{mPos ? "+" : "-"}{Math.abs(mPct).toFixed(2)}%</span>
                  {useExt && <span className={`text-[11px] whitespace-nowrap mt-0.5 ${isPos ? "text-signal-green" : "text-signal-red"}`}>{isPos ? "+" : ""}{r.changePct.toFixed(2)}%</span>}
                </div>
                <span className="text-right text-gray-300 whitespace-nowrap">
                  {isCap ? (r.capUsd ? fmtUsdCap(r.capUsd) : "—") : isValue && r.dollarVolume ? `$${fmtVolUS(r.dollarVolume)}` : fmtVolUS(r.volume)}
                </span>
                <span className="text-right"><span key={`${r.code}-d-${mChange}`} className={`whitespace-nowrap rounded px-0.5 animate-tick ${mPos ? "text-signal-green" : "text-signal-red"}`}>{mChange != null ? `${mPos ? "▲" : "▼"}$${Math.abs(mChange).toFixed(2)}` : "—"}</span></span>
              </div>
              </Fragment>
            );
          })}
        </div>
        </ScrollTable>
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
  const [sectors, setSectors]         = useState<USSectorRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState<USSectorRow | null>(null);
  const [modalStocks, setModalStocks] = useState<USSectorStockRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

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
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  // ESC closes modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openModal(s: USSectorRow) {
    setModal(s);
    setModalStocks([]);
    setModalLoading(true);
    fetch(`/api/us-sector-stocks?etf=${encodeURIComponent(s.symbol)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((j: { stocks?: USSectorStockRow[] } | null) => {
        if (j?.stocks) setModalStocks(j.stocks);
      })
      .catch(() => {})
      .finally(() => setModalLoading(false));
  }

  if (loading) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
      {Array.from({ length: 11 }).map((_, i) => (
        <div key={i} className="h-16 bg-navy-border rounded-lg animate-pulse" />
      ))}
    </div>
  );

  return (
    <>
      <div>
        <p className="text-xs text-gray-600 mb-3">SPDR 섹터 ETF 기준 오늘 등락률 · 클릭하면 구성 종목 보기</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sectors.map(s => {
            const isPos     = s.changePct >= 0;
            const intensity = Math.min(Math.abs(s.changePct) / 5, 1);
            const color     = US_SECTOR_COLORS[s.sector] ?? "#6b7280";
            return (
              <button key={s.symbol}
                onClick={() => openModal(s)}
                className="p-3 rounded-lg border relative overflow-hidden text-left transition-all active:scale-[0.97] hover:brightness-110"
                style={{
                  backgroundColor: `${color}${isPos ? Math.round(intensity * 25).toString(16).padStart(2, "0") : "08"}`,
                  borderColor: "rgb(var(--c-white) / 0.1)",
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
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 섹터 구성 종목 모달 ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative z-10 w-full max-w-lg bg-[#0f1923] border border-white/10 rounded-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: "85vh" }}>

            {/* 헤더 */}
            <div className="px-5 pt-5 pb-0 shrink-0">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{US_SECTOR_ICONS[modal.sector] ?? "📊"}</span>
                    <h2 className="text-lg font-bold text-white">{modal.sector} TOP 10</h2>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`text-sm font-bold num ${modal.changePct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                      {modal.symbol} 오늘 {modal.changePct >= 0 ? "+" : ""}{modal.changePct.toFixed(2)}%
                    </span>
                    {!modalLoading && modalStocks.length > 0 && (
                      <span className="text-xs text-gray-500">시가총액 상위 {modalStocks.length}개</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setModal(null)}
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

            {/* 종목 리스트 */}
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
                    </div>
                  ))}
                </div>
              ) : modalStocks.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-gray-500">종목 데이터를 불러올 수 없습니다</p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {modalStocks.map((stock, idx) => {
                    const isUp = stock.changePct >= 0;
                    return (
                      <div key={stock.code}
                        className="flex items-center gap-2 px-5 py-2.5"
                      >
                        <span className="text-xs text-gray-600 w-5 shrink-0 text-center">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{stock.name}</p>
                          <p className="text-xs text-gray-600">{stock.code}</p>
                        </div>
                        <span className="w-[86px] text-right text-sm text-white num shrink-0 whitespace-nowrap">
                          {stock.price > 0 ? fmtUSD(stock.price) : "—"}
                        </span>
                        <span className={`w-[60px] text-right text-sm font-bold num shrink-0 whitespace-nowrap ${isUp ? "text-signal-green" : "text-signal-red"}`}>
                          {stock.price > 0 ? `${isUp ? "▲" : "▼"}${Math.abs(stock.changePct).toFixed(2)}%` : "—"}
                        </span>
                        <span className="hidden sm:block w-[76px] text-right text-xs text-gray-400 num shrink-0 whitespace-nowrap">
                          {stock.volume > 0 ? fmtVolUS(stock.volume) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-2.5 border-t border-white/10 shrink-0">
              <p className="text-xs text-gray-600">시가총액 기준 상위 종목 · SPDR {modal.symbol} ETF 구성</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type RegionTabType = "KR" | "US";
type MainTabType = "top10" | "cap" | "gainers" | "losers" | "amount" | "etf" | "volume" | "sector" | "high52" | "flow";
type MarketType = "KOSPI" | "KOSDAQ";
export type USIndexType = "SP500" | "NASDAQ" | "DOW" | "RUSSELL" | "SOXX";
type USContentTab = "cap" | "gainers" | "losers" | "actives" | "etf" | "sector";

const KR_TABS: { id: MainTabType; label: string }[] = [
  { id: "top10",  label: "상승/하락"  },
  { id: "amount", label: "거래대금" },
  { id: "volume", label: "거래량급등" },
  { id: "sector", label: "섹터 흐름"  },
  { id: "high52", label: "52주신고가" },
  { id: "flow",   label: "투자자동향" },
];

export const US_INDEX_TABS: { id: USIndexType; label: string }[] = [
  { id: "SP500",   label: "S&P500"   },
  { id: "NASDAQ",  label: "NASDAQ"   },
  { id: "DOW",     label: "다우존스" },
  { id: "RUSSELL", label: "러셀2000" },
  { id: "SOXX",    label: "SOXX"     },
];

const US_CONTENT_TABS: { id: USContentTab; label: string }[] = [
  { id: "cap",     label: "시총상위" },
  { id: "gainers", label: "상승" },
  { id: "losers",  label: "하락" },
  { id: "actives", label: "거래대금" },
  { id: "etf",     label: "인기 ETF·레버리지" },
  { id: "sector",  label: "섹터 흐름"   },
];

// 매매동향 탭에서 쓰는 단일 시장 보기 (상승·하락 분리)
const KR_MARKET_TABS: { id: MainTabType; label: string }[] = [
  { id: "cap",     label: "시총상위" },
  { id: "gainers", label: "상승" },
  { id: "losers",  label: "하락" },
  { id: "amount",  label: "거래대금" },
  { id: "etf",     label: "ETF·ETN" },
  { id: "volume",  label: "거래량급등" },
  { id: "flow",    label: "투자자동향" },
  { id: "high52",  label: "52주신고가" },
];

// 상승·하락 한쪽만 (장 상태 표시 포함)
function MoversPanel({ market, mode, onSelect }: { market: string; mode: "gainers" | "losers"; onSelect: (d: DrawerState) => void }) {
  const [ts, setTs] = useState("");
  const [basis, setBasis] = useState("");
  useEffect(() => {
    fetch(`/api/market-top?market=${market}&_=${Date.now()}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.timestamp) setTs(new Date(j.timestamp).toLocaleTimeString("ko-KR") + " 기준"); if (j?.basis) setBasis(j.basis); })
      .catch(() => null);
  }, [market]);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs flex-wrap"><StatusBadge />{basis && <span className="text-gray-500">· 순위 {basis}</span>}</div>
      <TopMoversHalf market={market} mode={mode} ts={ts} onSelect={onSelect} large />
    </div>
  );
}

interface MarketSummaryProps {
  region?: RegionTabType;               // 주면 국내/미국 토글을 숨기고 고정
  krMarket?: MarketType;                // 국내 단일 시장(코스피/코스닥) 보기
  krSectorOnly?: boolean;               // 국내 섹터 흐름만
  usIndex?: USIndexType;                // 미국 지수(바깥 알약에서 고름)
}

export default function MarketSummary({ region: fixedRegion, krMarket, krSectorOnly, usIndex: usIndexProp }: MarketSummaryProps = {}) {
  const [regionState, setRegion] = useState<RegionTabType>(fixedRegion ?? "KR");
  const region = fixedRegion ?? regionState;
  const [mainTab, setMainTab] = useState<MainTabType>(krMarket ? "cap" : krSectorOnly ? "sector" : "top10");
  const [marketState, setMarket] = useState<MarketType>(krMarket ?? "KOSPI");
  const market = krMarket ?? marketState;
  const [usIndexState, setUsIndex] = useState<USIndexType>("SP500");
  const usIndex = usIndexProp ?? usIndexState;
  const [usContent, setUsContent] = useState<USContentTab>("cap");
  const stockModal = useStockModal();
  // 종목을 누르면 팝업(현황·수급·정보·뉴스·공시·레이더) — 바깥을 누르면 목록으로 돌아온다
  const openStock = useCallback((d: DrawerState) => {
    stockModal({ code: d.market === "US" ? d.code : d.code.replace(/\.(KS|KQ)$/, ""), market: d.market, name: d.name });
  }, [stockModal]);

  return (
    <section className="card">
      {/* ── 국내 / 미국 Region 토글 ── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">{krSectorOnly ? "섹터 흐름" : krMarket ? `${krMarket === "KOSPI" ? "코스피" : "코스닥"} 시장 동향` : region === "US" && usIndexProp ? `${US_INDEX_TABS.find(t => t.id === usIndexProp)?.label ?? ""} 시장 동향` : "시장 동향"}</h2>
        {!fixedRegion && <div className="flex gap-0.5 bg-navy-border/30 rounded-full p-0.5">
          {([["KR","🇰🇷 국내"],["US","🇺🇸 미국"]] as [RegionTabType, string][]).map(([r, label]) => (
            <button key={r} onClick={() => setRegion(r)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                region === r ? "bg-navy-card text-white shadow" : "text-gray-500 hover:text-gray-300"
              }`}>{label}</button>
          ))}
        </div>}
      </div>

      {/* ── KR 헤더 + 컨텐츠 ── */}
      {region === "KR" && (<>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          {(!krMarket && !krSectorOnly) && <div className="inline-flex gap-0.5 p-0.5 rounded-lg border border-navy-border">
            {(["KOSPI","KOSDAQ"] as MarketType[]).map(m => (
              <MarketTab key={m} label={m} active={market === m} onClick={() => setMarket(m)} />
            ))}
          </div>}
          {!krSectorOnly && <div className="flex gap-1.5 flex-wrap">
            {(krMarket ? KR_MARKET_TABS : KR_TABS).map(t => (
              <MainTabBtn key={t.id} label={t.label} active={mainTab === t.id} onClick={() => setMainTab(t.id)} />
            ))}
          </div>}
        </div>

        {mainTab === "top10"  && <GainersLosersPanel market={market} onSelect={openStock} />}
        {mainTab === "gainers" && <MoversPanel market={market} mode="gainers" onSelect={openStock} />}
        {mainTab === "losers"  && <MoversPanel market={market} mode="losers" onSelect={openStock} />}
        {mainTab === "amount" && <TopByAmountList  market={market} onSelect={openStock} />}
        {mainTab === "cap"    && <TopByAmountList  key="cap" kind="cap" market={market} onSelect={openStock} />}
        {mainTab === "etf"    && <EtfList onSelect={openStock} />}
        {mainTab === "volume" && <VolumeSpikeList  market={market} onSelect={openStock} />}
        {mainTab === "sector" && <SectorHeatmap    market={market} />}
        {mainTab === "high52" && <Week52HighList   market={market} onSelect={openStock} />}
        {mainTab === "flow"   && <InvestorFlowList market={market} onSelect={openStock} />}
      </>)}

      {/* ── US 헤더 + 컨텐츠 ── */}
      {region === "US" && (<>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {!usIndexProp && <div className="inline-flex gap-0.5 p-0.5 rounded-lg border border-navy-border">
            {US_INDEX_TABS.map(t => (
              <MarketTab key={t.id} label={t.label} active={usIndex === t.id} onClick={() => setUsIndex(t.id)} />
            ))}
          </div>}
          <div className="flex gap-1.5 flex-wrap">
            {US_CONTENT_TABS.map(t => (
              <MainTabBtn key={t.id} label={t.label} active={usContent === t.id} onClick={() => setUsContent(t.id)} />
            ))}
          </div>
        </div>

        {usContent !== "sector" && (
          <USStockList type={usContent} index={usIndex} onSelect={openStock} />
        )}
        {usContent === "sector" && <USSectorHeatmap />}
      </>)}

    </section>
  );
}
