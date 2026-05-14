"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import staticMaster from "@/data/stock_master.json";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  code: string;
  name: string;
  market: "KS" | "KQ" | "US";
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
}

interface ChartPoint { date: string; close: number | null; }

interface InvestorData {
  foreign: number; institution: number; individual: number;
  foreignQty: number; institutionQty: number; individualQty: number;
  invDate: string;
  volumeRatio: number; week52Pct: number;
  grade: string; score: number;
  factors: { label: string; score: number; max: number; desc: string }[];
  comment: string;
}

interface AnalysisData {
  businessModel: string;
  pros: string[];
  cons: string[];
  financialHealth: string;
  valuation: string;
  summary: string[];
}

/** 억원 → ±1,234억 / ±1.2조 */
function fmtUk(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}조`;
  return `${sign}${abs.toLocaleString("ko-KR")}억`;
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

const GRADE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  S: { color: "#f59e0b", bg: "bg-amber-500/20 border-amber-500/40", label: "강력 매수" },
  A: { color: "#22c55e", bg: "bg-green-500/20 border-green-500/40", label: "매수" },
  B: { color: "#06b6d4", bg: "bg-cyan-500/20 border-cyan-500/40",   label: "중립" },
  C: { color: "#f97316", bg: "bg-orange-500/20 border-orange-500/40", label: "주의" },
  D: { color: "#ef4444", bg: "bg-red-500/20 border-red-500/40",     label: "회피" },
};

const RANGES = [
  { key:"1d",  label:"1일"   },
  { key:"5d",  label:"5일"   },
  { key:"1mo", label:"1개월" },
  { key:"3mo", label:"3개월" },
  { key:"1y",  label:"1년"   },
];

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
  if (minutes >= 940 && minutes <= 1200) return "NXT_POST"; // 15:40-20:00
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
    NXT_POST: { cls: "text-purple-400 bg-purple-400/15 border border-purple-400/30", label: "NXT 애프터마켓" },
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

function InlineChart({ sym, changePct }: { sym: string; changePct: number }) {
  const [range, setRange]   = useState("3mo");
  const [data, setData]     = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState("KRW");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/chart-data?label=${encodeURIComponent(sym)}&range=${range}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j?.data) { setData(j.data); setCurrency(j.currency ?? "KRW"); }
      })
      .finally(() => setLoading(false));
  }, [sym, range]);

  const isPos  = changePct >= 0;
  const color  = isPos ? "#22c55e" : "#ef4444";
  const gradId = `ig_${sym.replace(/[^a-zA-Z0-9]/g, "")}`;
  const tickCount = 5;
  const step = data.length > tickCount ? Math.floor(data.length / tickCount) : 1;
  const ticks = data.filter((_, i) => i % step === 0).map(d => d.date);

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {RANGES.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-2.5 py-0.5 text-xs rounded-full transition-all ${
              range === r.key
                ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40 font-semibold"
                : "text-gray-500 hover:text-gray-300"
            }`}>{r.label}</button>
        ))}
      </div>
      <div className="h-44 w-full">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-cyan-brand/30 border-t-cyan-brand rounded-full animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2D42" vertical={false} />
              <XAxis dataKey="date" ticks={ticks}
                tick={{ fill: "#6B7280", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis domain={["auto","auto"]}
                tick={{ fill: "#6B7280", fontSize: 9 }}
                tickFormatter={v =>
                  currency === "KRW"
                    ? v >= 1000 ? (v/1000).toFixed(0)+"K" : String(v)
                    : v.toFixed(0)
                }
                axisLine={false} tickLine={false} width={44} />
              <Tooltip
                content={({ active, payload, label: d }) => {
                  if (!active || !payload?.length) return null;
                  // null 포인트(connectNulls)에서 value가 null일 수 있음
                  const v = payload[0]?.value;
                  if (v == null) return null;
                  const num = v as number;
                  return (
                    <div className="bg-navy-card border border-navy-border rounded-lg px-2.5 py-1.5 text-xs">
                      <p className="text-gray-400">{d}</p>
                      <p className="text-white font-bold">
                        {currency === "KRW" ? num.toLocaleString("ko-KR")+"원" : num.toFixed(2)}
                      </p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="close"
                stroke={color} strokeWidth={1.5} fill={`url(#${gradId})`}
                dot={false} activeDot={{ r: 3, fill: color, stroke:"#07111E", strokeWidth:2 }} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function StockSearchPanel() {
  // ── 전종목 마스터: 정적 JSON 직접 import (0ms, 네트워크 없음) ──────────────
  // KRX KIND에서 수집한 KOSPI+KOSDAQ 2,610개 — src/data/stock_master.json
  // 업데이트: scripts/generate-stock-master.py 실행 후 커밋
  const [allStocks] = useState<SearchResult[]>(() => {
    const stocks = (staticMaster.stocks as SearchResult[]).filter(
      (s) => s.type !== "spac" && s.type !== "preferred"
    );
    console.log(`[검색창] 정적 마스터 로드: ${stocks.length}개 (KRX ${staticMaster.generated})`);
    return stocks;
  });
  const masterLoaded = true;        // 정적 import → 항상 즉시 로드됨
  const masterFetching = false;     // 로딩 없음

  // ── 검색 상태 ────────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState("");
  const [suggestions,   setSuggestions]   = useState<SearchResult[]>([]);
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const [highlightIdx,  setHighlightIdx]  = useState(-1);

  // ── 분석 상태 ────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [quote,    setQuote]    = useState<QuoteData | null>(null);
  const [investor, setInvestor] = useState<InvestorData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [invLoading,  setInvLoading]  = useState(false);
  const [analLoading, setAnalLoading] = useState(false);
  const [supplyTab, setSupplyTab] = useState<"amount" | "qty">("amount");

  const searchContainerRef = useRef<HTMLDivElement>(null);
  // 종목 선택 직후 재검색 방지 (setSearchQuery(item.name) 트리거로 드롭다운 재오픈되는 버그 차단)
  const skipNextSearchRef = useRef(false);

  // ── 검색: 300ms 디바운스 API 검색 (항상 동작 — master 로드 여부 무관) ────
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSuggestions([]);
      setDropdownOpen(false);
      return;
    }

    // 종목 선택 직후엔 재검색 skip (드롭다운 재오픈 버그 방지)
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/stock-search?q=${encodeURIComponent(q)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const raw = await res.json();
        // 방어적 타입 체크: 배열이 아닌 응답(에러 객체 등)이 오면 무시
        const apiHits: SearchResult[] = Array.isArray(raw) ? raw : [];
        setSuggestions(apiHits);
        setDropdownOpen(apiHits.length > 0);
        setHighlightIdx(-1);
      } catch { /* silent */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]); // searchQuery만 의존 → master 로드 시 타이머 취소 없음

  // ── 클라이언트 필터: 마스터 로드 완료 시 즉시 결과 교체 (debounce 불필요) ──
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || !masterLoaded || allStocks.length === 0) return;

    const lq = q.toLowerCase();
    try {
      const hits = allStocks
        // ★ 옵셔널 체이닝: name/code가 undefined인 항목에서 TypeError 방지
        .filter((s) =>
          (s.name?.toLowerCase() ?? "").includes(lq) ||
          (s.code ?? "").includes(lq)
        )
        .slice(0, 10);

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
    const isUS   = market === "US";

    const stockItem: StockItem = {
      sym: isUS ? code.toUpperCase() : `${code}.${market}`,
      code,
      market,
      name,
    };
    setSelected(stockItem);
    skipNextSearchRef.current = true;
    setSearchQuery(isUS ? `${name} (${code.toUpperCase()})` : name);
    setDropdownOpen(false);
    setHighlightIdx(-1);
    setQuote(null);
    setInvestor(null);
    setAnalysis(null);
    setLoading(true);
    setInvLoading(!isUS); // 미국주식은 수급 조회 없음
    setAnalLoading(true);

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

    fetch(`/api/stock-analysis?code=${code}&name=${encodeURIComponent(name)}&market=${market}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && !j.error) setAnalysis(j); })
      .finally(() => setAnalLoading(false));
  }, []);

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
  const gc = investor ? GRADE_CONFIG[investor.grade] : null;
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
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">종목 검색 · 수급 분석</h2>
          <MarketStatusBadge />
        </div>
        <span className="text-xs text-gray-600">진보적 사고 기반 Grade</span>
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
                ? `종목명·코드 검색 (${allStocks.length.toLocaleString("ko-KR")}개 로드됨)`
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
        {searchQuery.trim() && !dropdownOpen && (
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
        {(dropdownOpen && suggestions.length > 0) || (searchQuery.trim() && /^[A-Za-z]/.test(searchQuery.trim())) ? (
          <div className="absolute top-full left-0 right-0 mt-1 bg-navy-card border border-navy-border rounded-xl shadow-2xl overflow-hidden animate-fade-in"
            style={{ zIndex: 60 }}>
            {suggestions.map((item, idx) => {
              const itemCode   = item?.code   ?? "";
              const itemName   = item?.name   ?? itemCode;
              const itemMarket = item?.market ?? "KS";
              const itemType   = item?.type   ?? "regular";
              const marketLabel =
                itemType === "etf"    ? "ETF"    :
                itemMarket === "KS"   ? "KOSPI"  : "KOSDAQ";
              const marketColor =
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
            {/^[A-Za-z]/.test(searchQuery.trim()) && (
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
                <span className="text-xs text-gray-400">미국주식 검색</span>
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

                {/* 시간외 가격 pill */}
                {currentSession === "NXT_PRE" && quote.preMarketPrice && (
                  <div className="mt-1.5">
                    <span className="text-xs px-2.5 py-1 rounded-full border text-blue-400 bg-blue-400/15 border-blue-400/30">
                      프리마켓 {fmtPrice(quote.preMarketPrice)}
                      {quote.preMarketChangePct != null && (
                        <> {quote.preMarketChangePct >= 0 ? "▲" : "▼"} {Math.abs(quote.preMarketChangePct).toFixed(2)}%</>
                      )}
                    </span>
                  </div>
                )}
                {currentSession === "NXT_POST" && quote.postMarketPrice && (
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
            <InlineChart sym={selected.sym} changePct={quote?.changePct ?? 0} />
          )}

          {/* 수급·등급 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

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
                    <span className="text-xs text-gray-600">기준: {fmtDate(investor.invDate)}</span>
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
              {invLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[0,1,2].map(i => <div key={i} className="h-10 bg-navy-border rounded-lg" />)}
                </div>
              ) : investor ? (
                <div className="space-y-2">
                  {[
                    { label:"외국인", icon:"🌐", amt:investor.foreign,     qty:investor.foreignQty ?? 0 },
                    { label:"기관",   icon:"🏦", amt:investor.institution,  qty:investor.institutionQty ?? 0 },
                    { label:"개인",   icon:"👤", amt:investor.individual,   qty:investor.individualQty ?? 0 },
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

            {/* 진보적 사고 Grade */}
            <div className="bg-navy-sub/40 rounded-xl p-4 space-y-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">진보적 사고 Grade</p>
              {invLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-16 bg-navy-border rounded-lg" />
                  <div className="h-4 bg-navy-border rounded w-3/4" />
                </div>
              ) : investor && gc ? (
                <div className="space-y-3">
                  {/* 등급 뱃지 */}
                  <div className={`flex items-center gap-3 px-3 py-3 rounded-lg border ${gc.bg}`}>
                    <span className="text-4xl font-black" style={{ color: gc.color }}>{investor.grade}</span>
                    <div>
                      <p className="text-white font-bold text-sm">{gc.label}</p>
                      <p className="text-xs text-gray-400">{investor.score}/100점</p>
                    </div>
                  </div>

                  {/* 스코어 바 */}
                  <div className="space-y-2">
                    {(investor.factors ?? []).map((f, fi) => {
                      const fScore = f?.score ?? 0;
                      const fMax   = f?.max   ?? 1; // 0으로 나누기 방지
                      return (
                        <div key={f?.label ?? fi}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-400">{f?.label ?? ""}</span>
                            <span className="text-gray-300">{fScore}/{fMax}</span>
                          </div>
                          <div className="h-1.5 bg-navy-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min((fScore / fMax) * 100, 100)}%`,
                                backgroundColor: gc.color,
                                opacity: 0.8,
                              }} />
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">{f?.desc ?? ""}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 py-2">분석 중...</p>
              )}
            </div>
          </div>

          {/* 수급 기반 코멘트 */}
          {investor && (
            <div className="px-4 py-3 bg-navy-sub/30 rounded-xl border border-navy-border/30">
              <p className="text-xs text-gray-500 mb-1.5">📊 수급 시그널</p>
              <p className="text-sm text-gray-300 leading-relaxed">{investor.comment}</p>
            </div>
          )}

          {/* AI 심층분석 */}
          <div className="bg-navy-sub/30 rounded-xl border border-navy-border/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-navy-border/30 flex items-center gap-2">
              <span className="text-xs font-medium text-gray-300">📖 진보적 사고 — AI 심층분석</span>
              {analLoading && <div className="w-3 h-3 border border-cyan-brand/30 border-t-cyan-brand rounded-full animate-spin" />}
            </div>
            {analLoading ? (
              <div className="p-4 space-y-2 animate-pulse">
                {[0,1,2,3,4].map(i => <div key={i} className="h-3 bg-navy-border rounded w-full" />)}
              </div>
            ) : analysis ? (
              <div className="p-4 space-y-4 text-sm">
                {/* 3줄 요약 */}
                <div className="space-y-1.5">
                  {analysis.summary.map((line, i) => (
                    <p key={i} className="text-gray-200 leading-snug">
                      <span className="text-cyan-brand mr-1">›</span>{line}
                    </p>
                  ))}
                </div>
                <div className="border-t border-navy-border/30 pt-3 space-y-3">
                  {/* 비즈니스 모델 */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">💼 핵심 비즈니스</p>
                    <p className="text-gray-300 text-xs leading-relaxed">{analysis.businessModel}</p>
                  </div>
                  {/* Pros / Cons */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-signal-green mb-1.5 font-medium">▲ 성장 동력</p>
                      <ul className="space-y-1">
                        {analysis.pros.map((p, i) => (
                          <li key={i} className="text-xs text-gray-400 leading-snug">• {p}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs text-signal-red mb-1.5 font-medium">▼ 핵심 리스크</p>
                      <ul className="space-y-1">
                        {analysis.cons.map((c, i) => (
                          <li key={i} className="text-xs text-gray-400 leading-snug">• {c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {/* 재무건전성 */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">📈 재무 건전성</p>
                    <p className="text-xs text-gray-400 leading-relaxed">{analysis.financialHealth}</p>
                  </div>
                  {/* 밸류에이션 */}
                  <div className="px-3 py-2.5 bg-navy-card/60 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">⚖️ 밸류에이션 · 최종 의견</p>
                    <p className="text-xs text-gray-200 leading-relaxed font-medium">{analysis.valuation}</p>
                  </div>
                </div>
              </div>
            ) : !analLoading && selected ? (
              <p className="text-xs text-gray-500 p-4">분석 데이터를 불러오지 못했습니다</p>
            ) : null}
          </div>

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
