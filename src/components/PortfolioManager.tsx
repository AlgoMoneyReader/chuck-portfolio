"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";

// ─── 분양 납부 일정 (DeadlineCountdown 과 공유) ──────────────────────────────
const PAYMENT_SCHEDULE = [
  { seq: 2, label: "2차 중도금", dueDate: "2026-07-15", amount: 180_200_000 },
  { seq: 3, label: "3차 중도금", dueDate: "2026-11-16", amount: 180_200_000 },
  { seq: 4, label: "4차 중도금", dueDate: "2027-03-15", amount: 180_200_000 },
  { seq: 5, label: "5차 중도금", dueDate: "2027-07-15", amount: 180_200_000 },
  { seq: 6, label: "6차 중도금", dueDate: "2027-11-15", amount: 180_200_000 },
  { seq: 7, label: "7차 중도금", dueDate: "2028-03-15", amount: 180_200_000 },
  { seq: 8, label: "8차 잔금",   dueDate: "2028-08-01", amount: 540_600_000 },
];

function calcDaysToDate(targetDate: string): number {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  const today = new Date(kst.toISOString().split("T")[0]);
  return Math.ceil((new Date(targetDate).getTime() - today.getTime()) / 86_400_000);
}

function toUk(won: number): string {
  return (won / 1_0000_0000).toFixed(1) + "억";
}

interface Holding {
  id?: string;
  ticker: string;
  name: string;
  qty: number;
  avg_price: number;
  currency: "KRW" | "USD";
  sector: string;
  // live data
  currentPrice?: number;
  changePct?: number;
  profitLoss?: number;
  profitLossPct?: number;
  evalAmount?: number;
}

interface DiagnosisResult {
  score: number;
  grade: string;
  factors: {
    supply: number;   // 0-40
    momentum: number; // 0-30
    volume: number;   // 0-15
    week52: number;   // 0-15
  };
  stockScores: Array<{
    code: string; name: string; score: number; grade: string; weight: number;
  }>;
  sectorWeights: Array<{ sector: string; weight: number; avgChangePct: number }>;
  comment: string[];
  analyzedCount: number;
}

const gradeConfig: Record<string, { color: string; cls: string }> = {
  S: { color: "#f59e0b", cls: "bg-amber-500/20 text-amber-400 border border-amber-500/40" },
  A: { color: "#22c55e", cls: "bg-green-500/20 text-green-400 border border-green-500/40" },
  B: { color: "#06b6d4", cls: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" },
  C: { color: "#f97316", cls: "bg-orange-500/20 text-orange-400 border border-orange-500/40" },
  D: { color: "#ef4444", cls: "bg-red-500/20 text-red-400 border border-red-500/40" },
};

const SECTORS = ["반도체", "AI·테크", "금융", "바이오", "방산", "에너지", "통신", "건설", "자동차", "ETF", "기타"];
const STORAGE_KEY = "alilnam_portfolio";

function loadFromStorage(): Holding[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveToStorage(holdings: Holding[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

function krwFormat(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function usdFormat(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PortfolioManager() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);

  // 자금 계획 상태
  const [cash, setCash] = useState<number>(0);          // 만원
  const [usdkrw, setUsdkrw] = useState<number>(1380);   // 원/달러
  const [planVisible, setPlanVisible] = useState(false);

  const [form, setForm] = useState<Omit<Holding, "id">>({
    ticker: "",
    name: "",
    qty: 0,
    avg_price: 0,
    currency: "KRW",
    sector: "기타",
  });

  // Load from localStorage on mount
  useEffect(() => {
    setHoldings(loadFromStorage());
  }, []);

  const refreshPrices = useCallback(async (list: Holding[]) => {
    if (list.length === 0) return list;
    setLoading(true);
    try {
      const tickers = list.map((h) => h.ticker).join(",");
      const res = await fetch(`/api/stock?tickers=${encodeURIComponent(tickers)}`);
      if (!res.ok) return list;
      const json = await res.json();
      const updated = list.map((h) => {
        const live = json.data?.[h.ticker];
        if (!live) return h;
        const evalAmt = live.price * h.qty;
        const costBasis = h.avg_price * h.qty;
        const pl = evalAmt - costBasis;
        const plPct = (pl / costBasis) * 100;
        return {
          ...h,
          currentPrice: live.price,
          changePct: live.changePct,
          profitLoss: pl,
          profitLossPct: plPct,
          evalAmount: evalAmt,
        };
      });
      return updated;
    } catch {
      return list;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAndRefresh = useCallback(async () => {
    const stored = loadFromStorage();
    const updated = await refreshPrices(stored);
    setHoldings(updated);
    saveToStorage(updated.map(({ currentPrice, changePct, profitLoss, profitLossPct, evalAmount, ...rest }) => { void currentPrice; void changePct; void profitLoss; void profitLossPct; void evalAmount; return rest; }));
  }, [refreshPrices]);

  useEffect(() => {
    loadAndRefresh();
    const iv = setInterval(loadAndRefresh, 60_000);
    return () => clearInterval(iv);
  }, [loadAndRefresh]);

  function openAdd() {
    setEditTarget(null);
    setForm({ ticker: "", name: "", qty: 0, avg_price: 0, currency: "KRW", sector: "기타" });
    setShowForm(true);
  }

  function openEdit(h: Holding) {
    setEditTarget(h);
    setForm({ ticker: h.ticker, name: h.name, qty: h.qty, avg_price: h.avg_price, currency: h.currency, sector: h.sector });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.ticker || !form.qty || !form.avg_price) return;
    const ticker = form.ticker.toUpperCase();
    let updated: Holding[];
    if (editTarget) {
      updated = holdings.map((h) => h.ticker === editTarget.ticker ? { ...h, ...form, ticker } : h);
    } else {
      if (holdings.find((h) => h.ticker === ticker)) {
        alert("이미 등록된 종목입니다. 수정 버튼을 사용하세요.");
        return;
      }
      updated = [...holdings, { ...form, ticker, id: crypto.randomUUID() }];
    }

    // ① 즉시 저장 + 모달 닫기 (UX 즉각 반응)
    setHoldings(updated);
    saveToStorage(updated);
    setShowForm(false);

    // ② 백그라운드에서 시세 갱신
    const refreshed = await refreshPrices(updated);
    setHoldings(refreshed);
    saveToStorage(refreshed.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ currentPrice, changePct, profitLoss, profitLossPct, evalAmount, ...rest }) => rest
    ));
  }

  function handleDelete(ticker: string) {
    if (!confirm(`${ticker}를 삭제하시겠습니까?`)) return;
    const updated = holdings.filter((h) => h.ticker !== ticker);
    setHoldings(updated);
    saveToStorage(updated);
  }

  async function runDiagnosis() {
    if (holdings.length === 0) return;
    setDiagnosing(true);
    setDiagnosisOpen(false);
    try {
      const payload = holdings.map(h => ({
        ticker: h.ticker,
        name: h.name,
        evalAmount: h.evalAmount ?? h.qty * h.avg_price,
        sector: h.sector,
        changePct: h.changePct,
      }));
      const res = await fetch("/api/portfolio-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings: payload }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDiagnosis(data);
      setDiagnosisOpen(true);
    } catch {
      alert("진단 중 오류가 발생했습니다.");
    } finally {
      setDiagnosing(false);
    }
  }

  // Summary — KRW 환산 (USD 보유분은 usdkrw 적용)
  const totalEval = holdings.reduce((s, h) => {
    const v = h.evalAmount ?? h.qty * h.avg_price;
    return s + (h.currency === "USD" ? v * usdkrw : v);
  }, 0);
  const totalCost = holdings.reduce((s, h) => {
    const v = h.qty * h.avg_price;
    return s + (h.currency === "USD" ? v * usdkrw : v);
  }, 0);
  const totalPL = totalEval - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  // 자금 계획 계산
  const fundPlanRows = useMemo(() => {
    const cashWon = cash * 10_000;
    let resources = totalEval + cashWon;
    return PAYMENT_SCHEDULE.map(p => {
      const days = calcDaysToDate(p.dueDate);
      const sufficient = resources >= p.amount;
      const shortfall = Math.max(0, p.amount - resources);
      const after = resources - p.amount;
      resources = Math.max(0, after);
      return { ...p, days, sufficient, shortfall, before: resources + p.amount, after };
    });
  }, [totalEval, cash]);

  // 포트폴리오 없으면 자금계획 닫기
  const firstInsufficient = fundPlanRows.findIndex(r => !r.sufficient);

  // Radar chart data — normalize each factor to 0-100 for display
  const radarData = diagnosis ? [
    { label: "수급강도", value: parseFloat(((diagnosis.factors.supply / 40) * 100).toFixed(1)), fullMark: 100 },
    { label: "가격모멘텀", value: parseFloat(((diagnosis.factors.momentum / 30) * 100).toFixed(1)), fullMark: 100 },
    { label: "거래량", value: parseFloat(((diagnosis.factors.volume / 15) * 100).toFixed(1)), fullMark: 100 },
    { label: "52주위치", value: parseFloat(((diagnosis.factors.week52 / 15) * 100).toFixed(1)), fullMark: 100 },
  ] : [];

  const gc = diagnosis ? gradeConfig[diagnosis.grade] : null;

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "총 평가금", value: krwFormat(Math.round(totalEval)), color: "text-white" },
          { label: "총 투자원금", value: krwFormat(Math.round(totalCost)), color: "text-gray-300" },
          { label: "평가손익", value: (totalPL >= 0 ? "+" : "") + krwFormat(Math.round(totalPL)), color: totalPL >= 0 ? "text-signal-green" : "text-signal-red" },
          { label: "수익률", value: (totalPLPct >= 0 ? "+" : "") + totalPLPct.toFixed(2) + "%", color: totalPLPct >= 0 ? "text-signal-green" : "text-signal-red" },
        ].map((s) => (
          <div key={s.label} className="card">
            <p className="card-title">{s.label}</p>
            <p className={`num text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Header + Add Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">
          보유 종목 <span className="text-gray-500">({holdings.length})</span>
        </h2>
        <div className="flex gap-2">
          <button onClick={loadAndRefresh} disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-400 border border-navy-border rounded-lg hover:border-cyan-brand hover:text-cyan-brand transition-all">
            {loading ? "갱신 중..." : "↻ 새로고침"}
          </button>
          <button
            onClick={runDiagnosis}
            disabled={diagnosing || holdings.length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40 hover:bg-cyan-brand/30 disabled:opacity-40"
          >
            {diagnosing ? "진단 중..." : "🔍 알읽남 계좌 진단"}
          </button>
          <button onClick={openAdd}
            className="px-3 py-1.5 text-xs font-medium text-navy bg-gold rounded-lg hover:bg-gold-light transition-all">
            + 종목 추가
          </button>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-border text-xs text-gray-500">
              {["종목", "섹터", "수량", "평단가", "현재가", "일간", "평가금액", "손익", "수익률", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-600 text-sm">
                  아직 등록된 종목이 없습니다.<br />
                  <span className="text-gold cursor-pointer" onClick={openAdd}>+ 종목 추가</span>하여 포트폴리오를 구성하세요.
                </td>
              </tr>
            )}
            {holdings.map((h) => {
              const isPos = (h.profitLossPct ?? 0) >= 0;
              const dayPos = (h.changePct ?? 0) >= 0;
              const fmt = h.currency === "KRW" ? krwFormat : usdFormat;
              return (
                <tr key={h.ticker} className="border-b border-navy-border/50 hover:bg-navy-card/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-white">{h.name || h.ticker}</p>
                      <p className="text-xs text-gray-500 num">{h.ticker}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 bg-navy-sub border border-navy-border rounded-full text-gray-400">{h.sector}</span>
                  </td>
                  <td className="px-4 py-3 num text-gray-300">{h.qty.toLocaleString()}</td>
                  <td className="px-4 py-3 num text-gray-400">{fmt(h.avg_price)}</td>
                  <td className="px-4 py-3 num font-medium text-white">
                    {h.currentPrice ? fmt(h.currentPrice) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={`px-4 py-3 num text-sm ${dayPos ? "text-signal-green" : "text-signal-red"}`}>
                    {h.changePct != null ? `${dayPos ? "+" : ""}${h.changePct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 num text-gray-200">
                    {h.evalAmount ? fmt(h.evalAmount) : fmt(h.qty * h.avg_price)}
                  </td>
                  <td className={`px-4 py-3 num ${isPos ? "text-signal-green" : "text-signal-red"}`}>
                    {h.profitLoss != null ? `${isPos ? "+" : ""}${fmt(h.profitLoss)}` : "—"}
                  </td>
                  <td className={`px-4 py-3 num font-bold ${isPos ? "text-signal-green" : "text-signal-red"}`}>
                    {h.profitLossPct != null ? `${isPos ? "+" : ""}${h.profitLossPct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(h)} className="text-xs text-gray-500 hover:text-cyan-brand transition-colors">수정</button>
                      <button onClick={() => handleDelete(h.ticker)} className="text-xs text-gray-500 hover:text-signal-red transition-colors">삭제</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 알읽남 계좌 진단 패널 — 아코디언 */}
      {diagnosis && gc && (
        <div className={`transition-all duration-500 overflow-hidden ${diagnosisOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}>
          <div className="card border-cyan-brand/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                🔍 알읽남 계좌 진단 결과
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${gc.cls}`}>
                  {diagnosis.grade}등급
                </span>
              </h3>
              <span className="text-lg font-bold num" style={{ color: gc.color }}>
                {diagnosis.score}점
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Radar Chart */}
              <div>
                <p className="text-xs text-gray-500 mb-2">4대 지표 밸런스</p>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1A2D42" />
                    <PolarAngleAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#4B5563", fontSize: 9 }} />
                    <Radar
                      name="포트폴리오"
                      dataKey="value"
                      stroke={gc.color}
                      fill={gc.color}
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Right: Sector analysis + comment */}
              <div className="space-y-3">
                <p className="text-xs text-gray-500">섹터 비중 분석</p>
                <div className="space-y-2">
                  {diagnosis.sectorWeights.slice(0, 5).map(s => (
                    <div key={s.sector}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-300">{s.sector}</span>
                        <span className="text-gray-400 num">
                          {s.weight}%
                          <span className={`ml-2 ${s.avgChangePct >= 0 ? "text-signal-green" : "text-signal-red"}`}>
                            {s.avgChangePct >= 0 ? "+" : ""}{s.avgChangePct}%
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-navy-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(s.weight, 100)}%`,
                            backgroundColor: s.avgChangePct >= 0 ? "#22c55e" : "#ef4444",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* 3-line comment */}
                <div className="space-y-1.5 pt-2 border-t border-navy-border/40">
                  {diagnosis.comment.map((line, i) => (
                    <p key={i} className="text-xs text-gray-300 leading-relaxed">{line}</p>
                  ))}
                </div>

                <p className="text-xs text-gray-600">분석 종목: {diagnosis.analyzedCount}개</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 자금 계획 분석 ──────────────────────────────────────────── */}
      <div className="card border border-gold/20">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="card-title">자금 계획 분석</h2>
            <p className="text-xs text-gray-500 mt-0.5">래미안 엘라비네 분양대금 납부 시뮬레이션</p>
          </div>
          <button
            onClick={() => setPlanVisible(v => !v)}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-all bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30"
          >
            {planVisible ? "닫기" : "📊 분석 실행"}
          </button>
        </div>

        {/* 입력 필드 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">가용 현금 (만원)</label>
            <input
              type="number"
              value={cash || ""}
              onChange={e => setCash(Number(e.target.value))}
              placeholder="예: 5000"
              className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">USD/KRW 환율</label>
            <input
              type="number"
              value={usdkrw || ""}
              onChange={e => setUsdkrw(Number(e.target.value))}
              placeholder="1380"
              className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none"
            />
          </div>
        </div>

        {planVisible && (
          <div className="space-y-3">
            {/* 총 가용 자산 */}
            <div className="p-3 bg-navy-sub/50 rounded-xl border border-navy-border/40">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">총 가용 자산 (포트폴리오 + 현금)</span>
                <span className="text-sm font-bold text-white num">
                  {toUk(totalEval + cash * 10_000)}
                </span>
              </div>
              <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                <span>포트폴리오 <span className="text-gray-300 num">{toUk(totalEval)}</span></span>
                <span>현금 <span className="text-gray-300 num">{toUk(cash * 10_000)}</span></span>
                {holdings.some(h => h.currency === "USD") && (
                  <span className="text-gray-600">USD @ {usdkrw.toLocaleString()}원</span>
                )}
              </div>
            </div>

            {/* 분양 납부 시뮬레이션 */}
            {fundPlanRows.map((row, idx) => {
              const isFirst = idx === firstInsufficient;
              return (
                <div
                  key={row.seq}
                  className={`p-3 rounded-xl border transition-all ${
                    row.sufficient
                      ? "border-signal-green/20 bg-signal-green/5"
                      : isFirst
                        ? "border-signal-red/40 bg-signal-red/10"
                        : "border-signal-red/20 bg-signal-red/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold ${row.sufficient ? "text-signal-green" : "text-signal-red"}`}>
                          {row.sufficient ? "✅" : "⚠️"} {row.label}
                        </span>
                        <span className="text-xs text-gray-500">{row.dueDate.replace(/-/g, ".")}</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold
                          ${row.days <= 60 ? "bg-signal-red/20 text-signal-red" :
                            row.days <= 180 ? "bg-gold/20 text-gold" :
                            "bg-navy-border/40 text-gray-400"}`}>
                          D-{row.days}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        납부금액 <span className="text-white num font-semibold">{toUk(row.amount)}</span>
                        {" · "}납부 후 잔여 <span className={`num font-semibold ${row.after >= 0 ? "text-gray-300" : "text-signal-red"}`}>
                          {row.after >= 0 ? toUk(row.after) : `-${toUk(-row.after)}`}
                        </span>
                      </div>
                      {!row.sufficient && (
                        <div className="text-xs text-signal-red mt-1 font-medium">
                          → <span className="text-gold num">{toUk(row.shortfall)}</span> 부족 · 추가 매도 또는 자금 조달 필요
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-gray-600">납부 전 가용</div>
                      <div className={`text-sm font-bold num ${row.sufficient ? "text-signal-green" : "text-signal-red"}`}>
                        {toUk(row.before)}
                      </div>
                    </div>
                  </div>
                  {/* 진행바 */}
                  <div className="mt-2 h-1 bg-navy-border/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${row.sufficient ? "bg-signal-green" : "bg-signal-red"}`}
                      style={{ width: `${Math.min(100, (row.before / row.amount) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {/* 요약 */}
            <div className="p-3 bg-navy-sub/30 rounded-lg border border-navy-border/30">
              <div className="text-xs text-gray-500">
                {firstInsufficient === -1
                  ? <span className="text-signal-green font-semibold">✅ 현재 포트폴리오로 전체 분양대금 납부 가능합니다.</span>
                  : <span>⚠️ <span className="text-gold font-semibold">{PAYMENT_SCHEDULE[firstInsufficient].label}</span>부터 자금 부족. 그 전까지 추가 자금 마련이 필요합니다.</span>
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-navy-card border border-navy-border rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-bold text-white">{editTarget ? "종목 수정" : "종목 추가"}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">티커 (국내: 6자리 숫자, 해외: 영문)</label>
                <input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                  placeholder="005930 또는 AAPL" disabled={!!editTarget}
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none disabled:opacity-50" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">종목명</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="삼성전자"
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">수량</label>
                <input type="number" value={form.qty || ""} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                  placeholder="100"
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">평단가</label>
                <input type="number" value={form.avg_price || ""} onChange={(e) => setForm({ ...form, avg_price: Number(e.target.value) })}
                  placeholder="175572"
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">통화</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as "KRW" | "USD" })}
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none">
                  <option value="KRW">KRW (원화)</option>
                  <option value="USD">USD (달러)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">섹터</label>
                <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none">
                  {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="text-xs text-gray-600">
              * 국내주식: 티커에 6자리 숫자 입력 시 자동으로 .KS 처리됩니다
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 border border-navy-border text-gray-400 rounded-lg text-sm hover:border-gray-500 transition-all">
                취소
              </button>
              <button onClick={handleSave}
                className="flex-1 py-2 bg-gold text-navy font-bold rounded-lg text-sm hover:bg-gold-light transition-all">
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
