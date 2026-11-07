"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { US_POPULAR } from "@/data/usPopular";
import { searchAsia } from "@/data/asiaStocks";
import { useStockModal } from "./StockModal";
import CandleChart, { TIMEFRAMES, type Timeframe } from "./CandleChart";
import RadarReport from "./RadarReport";
import { TbRadar2 } from "react-icons/tb";
import { logActivity } from "@/lib/activity";
import { useMarketPoll } from "@/lib/useMarketPoll";

// ── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  code: string;
  name: string;
  market: "KS" | "KQ" | "US" | "ASIA";
  type: string;
}

interface StockItem { sym: string; code: string; market: "KS"|"KQ"|"US"; name: string; }

interface QuoteData {
  price: number; change: number; changePct: number;
  dayHigh: number; dayLow: number; volume: number;
  week52High: number; week52Low: number; marketState: string;
  preMarketPrice: number | null;
  preMarketChangePct: number | null;
  postMarketPrice: number | null;
  postMarketChangePct: number | null;
  dayMarketPrice?: number | null;
  dayMarketChangePct?: number | null;
}

interface InvestorData {
  foreign: number; institution: number; individual: number | null;
  confirmed?: { foreign: number; institution: number; individual: number };
  foreignQty: number; institutionQty: number; individualQty: number;
  invDate: string;
  volumeRatio: number; week52Pct: number;
  grade: string; score: number;
  factors: { label: string; score: number; max: number; desc: string }[];
  comment: string;
}

/** 억원 → ±1,234억 / ±1.2조 */
function fmtUk(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 10000) return `${sign}${(abs / 10000).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}조`;
  if (abs > 0 && abs < 1) return `${sign}${Math.round(abs * 10000).toLocaleString("ko-KR")}만`;
  return `${sign}${(abs >= 100 ? Math.round(abs) : Math.round(abs * 10) / 10).toLocaleString("ko-KR")}억`;
}
/** 주 수량 → ±123만주 / ±1,234주 */
function fmtQty(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1_000_000) return `${sign}${(abs / 10000).toFixed(0)}만주`;
  return `${sign}${abs.toLocaleString("ko-KR")}주`;
}

/** yyyyMMdd → M.D 형식 */
function fmtDate(d: string): string {
  if (!d || d.length < 8) return "";
  return `${parseInt(d.slice(4, 6))}.${parseInt(d.slice(6, 8))}`;
}

// ── Grade 색상 ───────────────────────────────────────────────────────────────

// ── 마켓 상태 타입 ────────────────────────────────────────────────────────────

type MarketSession = "NXT_PRE" | "REGULAR" | "NXT_POST" | "CLOSED";

function getMarketSession(): MarketSession {
  const now = new Date();
  // KST = UTC+9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return "CLOSED";
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (minutes >= 480 && minutes < 530) return "NXT_PRE";   // 08:00-08:49
  if (minutes >= 540 && minutes <= 930) return "REGULAR";  // 09:00-15:30
  if (minutes > 930 && minutes <= 1200) return "NXT_POST"; // 15:30-20:00 (KRX 애프터마켓 16~20시 + NXT)
  return "CLOSED";
}

// ── MarketStatusBadge 컴포넌트 ────────────────────────────────────────────────

function MarketStatusBadge() {
  const [session, setSession] = useState<MarketSession>(getMarketSession());

  useEffect(() => {
    const id = setInterval(() => setSession(getMarketSession()), 30_000);
    return () => clearInterval(id);
  }, []);

  const config: Record<MarketSession, { cls: string; label: string; dot?: boolean }> = {
    NXT_PRE:  { cls: "text-blue-400 bg-blue-400/15 border border-blue-400/30",     label: "NXT 프리마켓" },
    REGULAR:  { cls: "text-signal-green bg-signal-green/15 border border-signal-green/30", label: "KRX 정규장", dot: true },
    NXT_POST: { cls: "text-purple-400 bg-purple-400/15 border border-purple-400/30", label: "애프터마켓 (KRX·NXT)" },
    CLOSED:   { cls: "text-gray-500 bg-gray-500/15 border border-gray-500/30",      label: "장마감" },
  };

  const { cls, label, dot } = config[session];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />}
      {label}
    </span>
  );
}

// ── 인라인 차트 ──────────────────────────────────────────────────────────────

// 종목 상세와 같은 캔들 차트(분봉~월봉)
function InlineChart({ sym }: { sym: string }) {
  const [tf, setTf] = useState<Timeframe>("5m");
  return (
    <div className="space-y-2">
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {TIMEFRAMES.map(([k, l]) => (
          <button key={k} onClick={() => setTf(k)}
            className={`shrink-0 px-3 py-1 text-xs rounded-lg ${tf === k ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>
      <CandleChart label={sym} tf={tf} height={300} digits={sym.includes(".") ? 0 : 2} />
    </div>
  );
}

export default function StockSearchPanel({ initialTicker = "", initialName = "" }: { initialTicker?: string; initialName?: string } = {}) {
  // ── 전종목 마스터: KRX KIND 에서 수집한 KOSPI+KOSDAQ 약 2,600개 (src/data/stock_master.json, 약 190KB)
  // 첫 화면을 가볍게 하려고 화면이 뜬 뒤 따로 불러온다 (업데이트: scripts/generate-stock-master.py 실행 후 커밋)
  const stockModal = useStockModal();
  const [allStocks, setAllStocks] = useState<SearchResult[]>([]);
  const [masterFetching, setMasterFetching] = useState(true);
  useEffect(() => {
    let alive = true;
    import("@/data/stock_master.json").then(m => {
      if (!alive) return;
      setAllStocks(((m.default ?? m) as { stocks: SearchResult[] }).stocks.filter(s => s.type !== "spac" && s.type !== "preferred"));
    }).finally(() => { if (alive) setMasterFetching(false); });
    return () => { alive = false; };
  }, []);
  const masterLoaded = allStocks.length > 0;

  // ── 검색 상태 ────────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState("");
  const [suggestions,   setSuggestions]   = useState<SearchResult[]>([]);
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const [highlightIdx,  setHighlightIdx]  = useState(-1);

  // ── 분석 상태 ────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [quote,    setQuote]    = useState<QuoteData | null>(null);
  const [investor, setInvestor] = useState<InvestorData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [invLoading,  setInvLoading]  = useState(false);
  const [supplyTab, setSupplyTab] = useState<"amount" | "qty">("amount");

  const searchContainerRef = useRef<HTMLDivElement>(null);
  // 종목 선택 직후 재검색 방지 (setSearchQuery(item.name) 트리거로 드롭다운 재오픈되는 버그 차단)
  const skipNextSearchRef = useRef(false);
  const justSelectedRef = useRef(false);

  // 빈 검색어면 목록 닫기 (예전 서버 검색은 늦게 도착해 미국 종목 결과를 덮어써 제거)
  useEffect(() => {
    if (!searchQuery.trim()) { setSuggestions([]); setDropdownOpen(false); }
  }, [searchQuery]);

  // ── 클라이언트 필터: 마스터 로드 완료 시 즉시 결과 교체 (debounce 불필요) ──
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || !masterLoaded || allStocks.length === 0) return;

    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    const lq = q.toLowerCase();
    try {
      const kr = allStocks
        // ★ 옵셔널 체이닝: name/code가 undefined인 항목에서 TypeError 방지
        .filter((s) =>
          (s.name?.toLowerCase() ?? "").includes(lq) ||
          (s.code ?? "").includes(lq)
        )
        .sort((a, b) => (a.name.toLowerCase().startsWith(lq) ? 0 : 1) - (b.name.toLowerCase().startsWith(lq) ? 0 : 1) || a.name.length - b.name.length)
        .slice(0, 8);
      // 미국 인기 종목·ETF: 티커·영문명·한글 별칭(테슬라·속슬 등)
      const us: SearchResult[] = US_POPULAR
        .filter(u => u.code.toLowerCase().startsWith(lq) || u.name.toLowerCase().includes(lq) || u.ko.toLowerCase().includes(lq))
        .sort((a, b) => (a.code.toLowerCase() === lq ? -1 : 0) - (b.code.toLowerCase() === lq ? -1 : 0))
        .slice(0, 6)
        .map(u => ({ code: u.code, name: `${u.ko.split(" ")[0]} · ${u.name}`, market: "US", type: u.type === "etf" ? "us-etf" : "us" } as SearchResult));
      // 아시아 종목: AI 레이더 분석은 없고, 누르면 종목 팝업(시세·차트·뉴스)
      const asia: SearchResult[] = searchAsia(q, 5).map(h => ({ code: h.code, name: `${h.name} · ${h.label}`, market: "ASIA", type: "asia" } as SearchResult));
      const hits = (/^[A-Za-z]/.test(lq) ? [...us, ...kr] : [...kr, ...us]).concat(asia);

      // 영문 입력이면 hits가 0이어도 US stock 버튼을 위해 dropdown 열기
      if (hits.length === 0 && /^[A-Za-z]/.test(lq)) {
        setSuggestions([]);
        setDropdownOpen(true);
        setHighlightIdx(-1);
        return;
      }
      setSuggestions(hits);
      setDropdownOpen(hits.length > 0);
      setHighlightIdx(-1);
    } catch (e) {
      // filter 중 예외 발생 시 컴포넌트 크래시 방지
      console.error("[StockSearchPanel] 로컬 필터 오류:", e);
    }
  }, [searchQuery, allStocks, masterLoaded]);

  // ── 클릭 외부 감지 ────────────────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setHighlightIdx(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── 주식 로드 ─────────────────────────────────────────────────────────────
  const loadStock = useCallback(async (item: SearchResult) => {
    const code   = item.code   ?? "";
    const market = item.market ?? "KS";
    const name   = item.name   ?? item.code ?? "";
    if (market === "ASIA") { setDropdownOpen(false); stockModal({ code, market: "US", name: name.split(" · ")[0] }); return; }
    logActivity("search", { code, name, from: "종목검색" });
    const isUS   = market === "US";

    const stockItem: StockItem = {
      sym: isUS ? code.toUpperCase() : `${code}.${market}`,
      code,
      market,
      name,
    };
    setSelected(stockItem);
    skipNextSearchRef.current = true;
    justSelectedRef.current = true;
    setSearchQuery(isUS ? `${name} (${code.toUpperCase()})` : name);
    setDropdownOpen(false);
    setHighlightIdx(-1);
    setQuote(null);
    setInvestor(null);
    setLoading(true);
    setInvLoading(!isUS); // 미국주식은 수급 조회 없음

    fetch(`/api/stock-detail?code=${code}&market=${market}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j && !j.error) {
          setQuote({
            price: j.price, change: j.change, changePct: j.changePct,
            dayHigh: j.dayHigh, dayLow: j.dayLow, volume: j.volume,
            week52High: j.week52High, week52Low: j.week52Low,
            marketState: j.marketState,
            preMarketPrice: j.preMarketPrice ?? null,
            preMarketChangePct: j.preMarketChangePct ?? null,
            postMarketPrice: j.postMarketPrice ?? null,
            postMarketChangePct: j.postMarketChangePct ?? null,
            dayMarketPrice: j.dayMarketPrice ?? null,
            dayMarketChangePct: j.dayMarketChangePct ?? null,
          });
          // currency는 isUSStock 플래그로 fmtPrice에서 처리
        }
      })
      .finally(() => setLoading(false));

    // 미국주식은 KIS 수급 데이터 없음 → 스킵
    if (!isUS) {
      fetch(`/api/stock-investor?code=${code}&market=${market}`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(j => { if (j && !j.error) setInvestor(j); })
        .finally(() => setInvLoading(false));
    }

  }, [stockModal]);

  // 다른 화면에서 종목을 넘겨받으면(예: /analyze?ticker=005930.KS) 바로 연다
  useEffect(() => {
    if (!initialTicker) return;
    const [code, mk] = initialTicker.toUpperCase().split(".");
    const hit = allStocks.find(x => x.code === code);
    if (hit) loadStock(hit);
    else if (/^[A-Z]/.test(code)) loadStock({ code, name: initialName || code, market: "US", type: "us" } as SearchResult);
    else if (/^[0-9][0-9A-Z]{5}$/.test(code)) loadStock({ code, name: initialName || code, market: (mk === "KQ" ? "KQ" : "KS"), type: "regular" } as SearchResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker]);

  // 오늘 장중 수급(외국인 창구 실시간 · 기관 가집계)
  const [live, setLive] = useState<{ available: boolean; final?: boolean; asOf?: string; foreignEok?: number; institutionEok?: number; globalEok?: number | null; updatedAt?: string } | null>(null);
  const loadLive = useCallback(() => {
    if (!selected || selected.market === "US") { setLive(null); return; }
    fetch(`/api/stock-flow-live?code=${selected.code}`, { cache: "no-store" })
      .then(r => r.json()).then(j => setLive(j.error ? null : j)).catch(() => {});
  }, [selected]);
  useEffect(() => { setLive(null); loadLive(); }, [loadLive]);
  useMarketPoll(loadLive, 30_000);

  // ── 키보드 이벤트 ─────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!dropdownOpen) {
        setDropdownOpen(suggestions.length > 0);
      } else {
        setHighlightIdx(prev => (prev + 1) % suggestions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      if (highlightIdx >= 0 && suggestions[highlightIdx]) {
        loadStock(suggestions[highlightIdx]);
      } else if (suggestions.length === 1) {
        loadStock(suggestions[0]);
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
      setHighlightIdx(-1);
    }
  }

  const isPos = (quote?.changePct ?? 0) >= 0;
  const priceColor = isPos ? "text-signal-green" : "text-signal-red";
  const isUSStock = selected?.market === "US";

  // 가격 포맷 함수 (KRW: 정수 원, USD: $소수점2자리)
  const fmtPrice = (n: number) =>
    isUSStock
      ? `$${n.toFixed(2)}`
      : `${n.toLocaleString("ko-KR")}원`;

  // 현재 마켓 세션 (extended hours 표시용)
  const currentSession = getMarketSession();

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-1.5"><TbRadar2 className="text-cyan-brand" size={17} />AI 레이더 분석</h2>
          <MarketStatusBadge />
        </div>
        <span className="text-xs text-gray-500 hidden sm:inline">종목을 검색하면 수급·흐름 신호와 실적·뉴스를 AI가 종합합니다</span>
      </div>

      {/* 검색창 */}
      <div className="relative" ref={searchContainerRef}>
        <div className="flex items-center gap-2 bg-navy-sub/60 border border-navy-border rounded-xl px-4 py-3 focus-within:border-cyan-brand/60 transition-colors">
          <span className="text-gray-500 text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setDropdownOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={
              allStocks.length > 0
                ? "종목명·코드·티커 (예: 삼성전자, 테슬라, TSMC, 키옥시아)"
                : masterFetching
                  ? "KIS 종목 데이터 수집 중... (종목코드 먼저 검색 가능)"
                  : "종목코드로 검색 (예: 005930) · 한글 검색은 KIS 로그인 필요"
            }
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
          />
          {/* KIS 마스터 로딩 중 스피너 */}
          {masterFetching && (
            <span className="w-3 h-3 border border-gray-600 border-t-cyan-brand/60 rounded-full animate-spin shrink-0" />
          )}
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setSelected(null); setDropdownOpen(false); setSuggestions([]); }}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            >×</button>
          )}
        </div>

        {/* 드롭다운: 검색어 있는데 결과 없음 → 이유 안내 */}
        {searchQuery.trim() && !dropdownOpen && !(selected && searchQuery.startsWith(selected.name)) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-navy-card border border-navy-border rounded-xl shadow-xl px-4 py-3 text-xs"
            style={{ zIndex: 60 }}>
            {masterFetching ? (
              <span className="text-gray-400 flex items-center gap-2">
                <span className="w-3 h-3 border border-gray-600 border-t-cyan-brand/60 rounded-full animate-spin" />
                KIS 전종목 데이터 수집 중... 잠시 후 한글 검색 가능
              </span>
            ) : allStocks.length === 0 ? (
              <span className="text-gray-500">종목코드로 검색하세요 (예: 005930)</span>
            ) : (
              <span className="text-gray-500">
                &apos;{searchQuery.trim()}&apos; 검색 결과 없음
              </span>
            )}
          </div>
        )}

        {/* 드롭다운: 결과 있음 OR 미국주식 입력 감지 */}
        {dropdownOpen ? (
          <div className="absolute top-full left-0 right-0 mt-1 bg-navy-card border border-navy-border rounded-xl shadow-2xl overflow-hidden animate-fade-in"
            style={{ zIndex: 60 }}>
            {suggestions.map((item, idx) => {
              const itemCode   = item?.code   ?? "";
              const itemName   = item?.name   ?? itemCode;
              const itemMarket = item?.market ?? "KS";
              const itemType   = item?.type   ?? "regular";
              const marketLabel =
                itemMarket === "ASIA" ? "🌏 시세만" :
                itemType === "us-etf" ? "🇺🇸 ETF" :
                itemMarket === "US"   ? "🇺🇸 미국" :
                itemType === "etf"    ? "ETF"    :
                itemMarket === "KS"   ? "KOSPI"  : "KOSDAQ";
              const marketColor =
                itemMarket === "ASIA" ? "text-gray-400" :
                itemMarket === "US"   ? "text-gold" :
                itemType === "etf"    ? "text-gold" :
                itemMarket === "KS"   ? "text-gray-600" : "text-cyan-brand/60";
              return (
                <button
                  key={`${itemCode}-${itemMarket}-${idx}`}
                  onClick={() => loadStock(item)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={`w-full px-3 py-2.5 flex items-center gap-3 cursor-pointer transition-colors text-left ${
                    highlightIdx === idx
                      ? "bg-cyan-brand/10 border-l-2 border-cyan-brand"
                      : "hover:bg-cyan-brand/10 hover:border-l-2 hover:border-cyan-brand"
                  }`}
                >
                  <span className="flex-1 text-sm font-bold text-white">{itemName}</span>
                  <span className="text-xs text-gray-500 font-mono">{itemCode}</span>
                  <span className={`text-xs font-medium ${marketColor}`}>{marketLabel}</span>
                </button>
              );
            })}
            {/* 미국주식 직접 검색 옵션 (영문 입력 감지) */}
            {/^[A-Za-z]/.test(searchQuery.trim()) && !suggestions.some(x => x.market === "US" && x.code === searchQuery.trim().toUpperCase()) && (
              <button
                onClick={() => {
                  const ticker = searchQuery.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
                  loadStock({ code: ticker, name: ticker, market: "US", type: "us" });
                }}
                className="w-full px-3 py-2.5 flex items-center gap-3 cursor-pointer transition-colors text-left border-t border-navy-border/50 hover:bg-gold/10"
              >
                <span className="flex-1 text-sm font-bold text-gold font-mono">
                  {searchQuery.trim().toUpperCase()}
                </span>
                <span className="text-xs text-gray-400">미국 티커로 보기</span>
                <span className="text-xs font-medium text-gold bg-gold/10 px-1.5 py-0.5 rounded">🇺🇸 US</span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* 결과 패널 */}
      {selected && (
        <div className="space-y-4 animate-fade-in">

          {/* 현재가 헤더 */}
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-8 bg-navy-border rounded w-40" />
              <div className="h-4 bg-navy-border rounded w-24" />
            </div>
          ) : quote ? (
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <span className="text-xs text-gray-500 px-2 py-0.5 bg-navy-sub/60 rounded">{selected.code}</span>
                  <MarketStatusBadge />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`text-3xl font-bold num ${priceColor}`}>
                    {fmtPrice(quote.price ?? 0)}
                  </span>
                  <span className={`text-sm font-semibold num ${priceColor}`}>
                    {isPos ? "▲" : "▼"} {Math.abs(quote.changePct ?? 0).toFixed(2)}%
                    &nbsp;({isPos ? "+" : ""}{fmtPrice(quote.change ?? 0)})
                  </span>
                </div>

                {/* 미국 시간외: 데이마켓 > 프리 > 애프터 */}
                {isUSStock && (() => {
                  const d = quote.dayMarketPrice != null, pre = !d && quote.preMarketPrice != null && quote.marketState === "PRE", post = !d && !pre && quote.postMarketPrice != null;
                  const p = d ? quote.dayMarketPrice : pre ? quote.preMarketPrice : post ? quote.postMarketPrice : null;
                  const c = d ? quote.dayMarketChangePct : pre ? quote.preMarketChangePct : post ? quote.postMarketChangePct : null;
                  if (p == null || c == null) return null;
                  return (
                    <div className="mt-1.5">
                      <span className={`text-xs px-2.5 py-1 rounded-full border num ${d ? "text-cyan-brand bg-cyan-brand/10 border-cyan-brand/30" : pre ? "text-amber-300 bg-amber-400/10 border-amber-400/30" : "text-purple-300 bg-purple-400/10 border-purple-400/30"}`}>
                        {d ? "데이마켓" : pre ? "프리마켓" : quote.marketState === "POST" ? "애프터마켓" : "애프터 종가"} {fmtPrice(p)} {c >= 0 ? "▲" : "▼"} {Math.abs(c).toFixed(2)}%
                      </span>
                    </div>
                  );
                })()}
                {/* 시간외 가격 pill */}
                {!isUSStock && currentSession === "NXT_PRE" && quote.preMarketPrice && (
                  <div className="mt-1.5">
                    <span className="text-xs px-2.5 py-1 rounded-full border text-blue-400 bg-blue-400/15 border-blue-400/30">
                      NXT 프리마켓 {fmtPrice(quote.preMarketPrice)}
                      {quote.preMarketChangePct != null && (
                        <> {quote.preMarketChangePct >= 0 ? "▲" : "▼"} {Math.abs(quote.preMarketChangePct).toFixed(2)}%</>
                      )}
                    </span>
                  </div>
                )}
                {!isUSStock && currentSession === "NXT_POST" && quote.postMarketPrice && (
                  <div className="mt-1.5">
                    <span className="text-xs px-2.5 py-1 rounded-full border text-purple-400 bg-purple-400/15 border-purple-400/30">
                      애프터마켓 {fmtPrice(quote.postMarketPrice)}
                      {quote.postMarketChangePct != null && (
                        <> {quote.postMarketChangePct >= 0 ? "▲" : "▼"} {Math.abs(quote.postMarketChangePct).toFixed(2)}%</>
                      )}
                    </span>
                  </div>
                )}
              </div>
              {/* 세부 수치 */}
              <div className="flex gap-4 text-xs">
                {[
                  { label: "고가",    val: fmtPrice(quote.dayHigh   ?? 0) },
                  { label: "저가",    val: fmtPrice(quote.dayLow    ?? 0) },
                  { label: "52주 고", val: fmtPrice(quote.week52High ?? 0) },
                ].map(({ label, val }) => (
                  <div key={label} className="text-center">
                    <p className="text-gray-500 mb-0.5">{label}</p>
                    <p className="text-gray-200 num font-medium">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 차트 */}
          {selected && quote && (
            <InlineChart sym={selected.sym} />
          )}

          {/* 수급현황 */}
          <div className="grid grid-cols-1 gap-4">

            {/* 수급현황 — 미국주식은 대체 안내 표시 */}
            <div className="bg-navy-sub/40 rounded-xl p-4 space-y-3">
            {isUSStock ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <span className="text-2xl">🇺🇸</span>
                <p className="text-sm text-gray-400 font-medium">미국주식 수급 데이터</p>
                <p className="text-xs text-gray-600 text-center">
                  외국인/기관/개인 수급은 KRX 전용 데이터입니다.<br/>
                  미국 시장은 미지원
                </p>
              </div>
            ) : (<>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">수급현황</p>
                <div className="flex items-center gap-2">
                  {investor?.invDate && (
                    <span className="text-xs text-gray-600">확정 기준: {fmtDate(investor.invDate)}</span>
                  )}
                  {/* 금액/수량 탭 */}
                  <div className="flex rounded-lg overflow-hidden border border-navy-border">
                    {(["amount","qty"] as const).map(t => (
                      <button key={t} onClick={() => setSupplyTab(t)}
                        className={`px-2 py-0.5 text-xs transition-colors ${
                          supplyTab === t ? "bg-cyan-brand/20 text-cyan-brand" : "text-gray-500 hover:text-gray-300"
                        }`}>
                        {t === "amount" ? "금액" : "수량"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {live && (live.available || live.globalEok != null) && investor?.invDate !== new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "") && (
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["외국인", live.final ? live.foreignEok : live.globalEok ?? live.foreignEok, live.final ? "장마감 확정" : live.globalEok != null ? `${live.updatedAt} 창구` : `${live.asOf} 가집계`],
                    ["기관", live.available ? live.institutionEok : null, live.final ? "장마감 확정" : `${live.asOf ?? "09:30"} 가집계`],
                  ] as const).map(([l, v, at]) => (
                    <div key={l} className="px-3 py-2 rounded-lg bg-cyan-brand/5 border border-cyan-brand/20">
                      <p className="text-[11px] text-gray-400">오늘 {l} <span className="text-gray-600 num">· {at}</span></p>
                      <p className={`text-sm font-bold num ${v == null ? "text-gray-600" : v >= 0 ? "text-signal-green" : "text-signal-red"}`}>{v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("ko-KR")}억`}</p>
                    </div>
                  ))}
                </div>
              )}
              {invLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[0,1,2].map(i => <div key={i} className="h-10 bg-navy-border rounded-lg" />)}
                </div>
              ) : investor ? (
                <div className="space-y-2">
                  {[
                    { label:"외국인", icon:"🌐", amt:investor.confirmed?.foreign ?? investor.foreign,     qty:investor.foreignQty ?? 0 },
                    { label:"기관",   icon:"🏦", amt:investor.confirmed?.institution ?? investor.institution,  qty:investor.institutionQty ?? 0 },
                    { label:"개인",   icon:"👤", amt:investor.confirmed?.individual ?? investor.individual ?? 0,   qty:investor.individualQty ?? 0 },
                  ].map(({ label, icon, amt, qty }) => {
                    const val = supplyTab === "amount" ? amt : qty;
                    const pos = val >= 0;
                    return (
                      <div key={label} className="flex items-center justify-between px-3 py-2.5 bg-navy-card/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{icon}</span>
                          <span className="text-sm text-white font-medium">{label}</span>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold num ${pos ? "text-signal-green" : "text-signal-red"}`}>
                            {supplyTab === "amount" ? fmtUk(amt) : fmtQty(qty)}
                          </p>
                          <p className="text-xs text-gray-600">{pos ? "순매수" : "순매도"}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-gray-500">거래량 배율</span>
                    <span className="text-gold num font-semibold">{investor.volumeRatio}x</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">52주 고가 대비</span>
                    <span className="text-gray-300 num">{investor.week52Pct}%</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 py-2">수급 데이터 로딩 중...</p>
              )}
            </>)}
            </div>

          </div>

          {/* AI 레이더 분석: 레이더(수급·흐름) + AI(실적·밸류·뉴스) 종합 */}
          <RadarReport code={selected.code} name={selected.name} market={selected.market} />

          {/* 네이버 금융 링크 */}
          <a href={`https://finance.naver.com/item/main.naver?code=${selected.code}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                       bg-cyan-brand/10 hover:bg-cyan-brand/20 border border-cyan-brand/30
                       text-cyan-brand text-xs font-semibold transition-all">
            네이버 금융 상세 페이지 ↗
          </a>
        </div>
      )}
    </section>
  );
}
