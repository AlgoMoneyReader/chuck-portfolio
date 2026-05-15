"use client";

import { useState, useMemo, useCallback } from "react";

// ── 납부 일정 ──────────────────────────────────────────────────────────────────
const PAYMENT_SCHEDULE = [
  { seq: 2, label: "2차 중도금", dueDate: "2026-07-15", amount: 180_200_000 },
  { seq: 3, label: "3차 중도금", dueDate: "2026-11-16", amount: 180_200_000 },
  { seq: 4, label: "4차 중도금", dueDate: "2027-03-15", amount: 180_200_000 },
  { seq: 5, label: "5차 중도금", dueDate: "2027-07-15", amount: 180_200_000 },
  { seq: 6, label: "6차 중도금", dueDate: "2027-11-15", amount: 180_200_000 },
  { seq: 7, label: "7차 중도금", dueDate: "2028-03-15", amount: 180_200_000 },
  { seq: 8, label: "8차 잔금",   dueDate: "2028-08-01", amount: 540_600_000 },
];

function calcDays(d: string) {
  const kst   = new Date(Date.now() + 9 * 3_600_000);
  const today = new Date(kst.toISOString().split("T")[0]);
  return Math.ceil((new Date(d).getTime() - today.getTime()) / 86_400_000);
}

function fmtW(won: number) {
  const abs = Math.abs(won), s = won < 0 ? "-" : "";
  if (abs >= 1e8) return `${s}${(abs / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${s}${Math.round(abs / 1e4).toLocaleString()}만`;
  return `${s}${Math.round(abs).toLocaleString()}원`;
}

// 기술 지표 약세 레이블
const WEAK_LABEL: Record<string, string> = {
  tv5_20: "거래량 감소",
  v5_20:  "볼륨 약세",
  adx14:  "추세 소멸",
  mfi14:  "자금 이탈",
  cmf20:  "매도 우세",
  clv:    "종가 하방",
  vwap20: "VWAP 하방",
  udvr60: "하락 우세",
  squeeze:"변동성 수축",
};
// 기술 지표 강세 레이블
const STRONG_LABEL: Record<string, string> = {
  tv5_20: "거래량 증가",
  v5_20:  "볼륨 강세",
  adx14:  "강한 추세",
  mfi14:  "자금 유입",
  cmf20:  "매수 우세",
  clv:    "종가 상방",
  vwap20: "VWAP 상방",
  udvr60: "상승 우세",
  squeeze:"스퀴즈 발동",
};

const GRADE_ORDER: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 };
const GRADE_CLS: Record<string, string> = {
  S: "bg-amber-500/20 text-amber-400",
  A: "bg-green-500/20 text-green-400",
  B: "bg-cyan-500/20 text-cyan-400",
  C: "bg-orange-500/20 text-orange-400",
  D: "bg-red-500/20 text-red-400",
  F: "bg-red-900/30 text-red-600",
};

// ── 타입 ────────────────────────────────────────────────────────────────────────
interface Holding {
  ticker: string; name: string; qty: number; avg_price: number;
  currency: "KRW" | "USD"; sector: string;
  profitLossPct?: number; evalAmount?: number;
}

interface Indicator { key: string; label: string; grade: string; display: string; }

interface SignalData {
  techScore: number | null;
  techGrade: string | null;
  indicators: Indicator[];
  error?: boolean;
}

type SignalMap = Record<string, SignalData>;

type EnrichedHolding = Holding & { evalKRW: number };

interface SellItem {
  ticker: string; name: string; currency: "KRW" | "USD";
  evalKRW: number; sellKRW: number; isPartial: boolean; fraction: number;
  profitLossPct: number;
  techScore: number | null; techGrade: string | null;
  sellReasons: string[];   // why to sell
  holdReasons: string[];   // what's good (for hold list)
}

interface ScenarioResult {
  id: "A" | "B" | "C" | "D";
  name: string; tagline: string; accent: string;
  sellItems: SellItem[];
  holdItems: Array<{ ticker: string; name: string; techGrade: string | null; techScore: number | null; reason: string }>;
  cashContrib: number; stockRaised: number;
  totalRaised: number; shortfall: number; sufficient: boolean;
  remainingPortfolio: number;
}

// ── 신호 요약 생성 ──────────────────────────────────────────────────────────────
function getSellReasons(sig: SignalData | undefined): string[] {
  if (!sig || sig.error || !sig.indicators?.length) return ["신호 데이터 없음"];
  return sig.indicators
    .filter(i => GRADE_ORDER[i.grade] <= GRADE_ORDER["C"])
    .sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade])
    .slice(0, 2)
    .map(i => WEAK_LABEL[i.key] ?? i.label);
}

function getHoldReasons(sig: SignalData | undefined): string[] {
  if (!sig || sig.error || !sig.indicators?.length) return [];
  return sig.indicators
    .filter(i => GRADE_ORDER[i.grade] >= GRADE_ORDER["A"])
    .sort((a, b) => GRADE_ORDER[b.grade] - GRADE_ORDER[a.grade])
    .slice(0, 2)
    .map(i => STRONG_LABEL[i.key] ?? i.label);
}

// ── 시나리오 빌더 ───────────────────────────────────────────────────────────────
function buildScenario(
  id: "A" | "B" | "C" | "D",
  name: string, tagline: string, accent: string,
  enriched: EnrichedHolding[],
  signals: SignalMap,
  cashWon: number,
  target: number,
  priorityFn: (h: EnrichedHolding) => number  // HIGHER = sell sooner
): ScenarioResult {
  const needed  = Math.max(0, target - cashWon);
  // Sort descending by priority (highest priority first = sell first)
  const sorted  = [...enriched].sort((a, b) => priorityFn(b) - priorityFn(a));
  const sellItems: SellItem[] = [];
  let accumulated = 0;

  for (const h of sorted) {
    if (accumulated >= needed) break;
    const remaining  = needed - accumulated;
    const fullAmount = h.evalKRW;
    const sig        = signals[h.ticker];
    const isPartial  = fullAmount > remaining;
    const fraction   = isPartial ? remaining / fullAmount : 1;
    const sellKRW    = isPartial ? remaining : fullAmount;

    sellItems.push({
      ticker: h.ticker, name: h.name, currency: h.currency,
      evalKRW: fullAmount, sellKRW, isPartial, fraction,
      profitLossPct: h.profitLossPct ?? 0,
      techScore: sig?.techScore ?? null,
      techGrade: sig?.techGrade ?? null,
      sellReasons: getSellReasons(sig),
      holdReasons: getHoldReasons(sig),
    });
    accumulated += sellKRW;
  }

  const soldTickers = new Set(sellItems.map(s => s.ticker));
  const holdItems   = sorted
    .filter(h => !soldTickers.has(h.ticker))
    .slice(0, 6)
    .map(h => {
      const sig = signals[h.ticker];
      const reasons = getHoldReasons(sig);
      return {
        ticker: h.ticker, name: h.name,
        techGrade: sig?.techGrade ?? null,
        techScore: sig?.techScore ?? null,
        reason: reasons.length ? reasons.join(" · ") : "보유 유지",
      };
    });

  const totalPortfolio = enriched.reduce((s, h) => s + h.evalKRW, 0);
  const totalRaised    = cashWon + accumulated;
  const shortfall      = Math.max(0, target - totalRaised);

  return {
    id, name, tagline, accent, sellItems, holdItems,
    cashContrib: Math.min(cashWon, target),
    stockRaised: accumulated,
    totalRaised, shortfall,
    sufficient: shortfall === 0,
    remainingPortfolio: totalPortfolio - accumulated,
  };
}

// ── 4개 시나리오 우선순위 함수 ─────────────────────────────────────────────────
function scenarioA_priority(h: EnrichedHolding, signals: SignalMap): number {
  // 기술 신호 최약체 우선 매도 — techScore 낮을수록 priority 높음
  const ts = signals[h.ticker]?.techScore ?? 50;
  return 100 - ts;
}

function scenarioB_priority(h: EnrichedHolding, signals: SignalMap): number {
  // 손실 + 기술약세 이중 리스크 우선
  const ts    = signals[h.ticker]?.techScore ?? 50;
  const pl    = h.profitLossPct ?? 0;
  const lossP = Math.max(0, -pl);               // 손실폭
  const weakP = Math.max(0, 50 - ts);          // 기술 약세폭
  const synergy = lossP > 0 && weakP > 0 ? 30 : 0; // 이중 취약 보너스
  return lossP + weakP + synergy;
}

function scenarioC_priority(h: EnrichedHolding, signals: SignalMap): number {
  // 수익 실현 + 신호 피크아웃: 수익났는데 신호 약화 → 지금 팔아야
  const ts = signals[h.ticker]?.techScore ?? 50;
  const pl = h.profitLossPct ?? 0;
  if (pl > 5 && ts < 60) return 50 + pl - ts * 0.3;  // 핵심 타깃
  if (pl > 15)            return 30 + pl * 0.5;         // 수익 크면 일단 우선
  return Math.max(0, 50 - ts) * 0.3;                    // 나머지는 기술 약세 소폭
}

function scenarioD_priority(h: EnrichedHolding, signals: SignalMap, topEvalThreshold: number): number {
  // 정예 집중: 핵심 종목(대형+강세) 보유, 한계 종목 정리
  const ts      = signals[h.ticker]?.techScore ?? 50;
  const isCore  = h.evalKRW >= topEvalThreshold && (signals[h.ticker]?.techScore ?? 0) >= 55;
  const isUSD   = h.currency === "USD";
  if (isCore || isUSD) return -50;           // 강력 보유 — 우선순위 최하
  return 100 - ts;                            // 나머지는 기술 약세순
}

// ── Props ───────────────────────────────────────────────────────────────────────
interface Props { holdings: Holding[]; }

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────────
export default function FundingScenario({ holdings }: Props) {
  const [cash,       setCash]       = useState<number>(0);
  const [rate,       setRate]       = useState<number>(1380);
  const [targetSeq,  setTargetSeq]  = useState<number>(2);
  const [signals,    setSignals]    = useState<SignalMap>({});
  const [analyzing,  setAnalyzing]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [done,       setDone]       = useState(false);

  const payment  = PAYMENT_SCHEDULE.find(p => p.seq === targetSeq)!;
  const days     = calcDays(payment.dueDate);
  const cashWon  = cash * 10_000;

  const enriched = useMemo<EnrichedHolding[]>(() =>
    holdings.map(h => ({
      ...h,
      evalKRW: (h.evalAmount ?? h.qty * h.avg_price) * (h.currency === "USD" ? rate : 1),
    })),
    [holdings, rate]
  );
  const totalPortfolioKRW = enriched.reduce((s, h) => s + h.evalKRW, 0);

  // ── 신호 데이터 일괄 fetch ─────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (holdings.length === 0) return;
    setAnalyzing(true); setDone(false); setProgress(0);
    let cnt = 0;
    const results: SignalMap = {};

    await Promise.all(
      holdings.map(async h => {
        try {
          const r = await fetch(`/api/stock-technicals?ticker=${encodeURIComponent(h.ticker)}`);
          const j = await r.json();
          if (j.techScore !== undefined) {
            results[h.ticker] = {
              techScore: j.techScore ?? null,
              techGrade: j.techGrade ?? null,
              indicators: j.indicators ?? [],
            };
          } else {
            results[h.ticker] = { techScore: null, techGrade: null, indicators: [], error: true };
          }
        } catch {
          results[h.ticker] = { techScore: null, techGrade: null, indicators: [], error: true };
        }
        cnt++;
        setProgress(Math.round((cnt / holdings.length) * 100));
      })
    );

    setSignals(results);
    setAnalyzing(false);
    setDone(true);
  }, [holdings]);

  // ── 시나리오 계산 (신호 완료 후) ──────────────────────────────────────────
  const scenarios = useMemo((): ScenarioResult[] => {
    if (!done || Object.keys(signals).length === 0) return [];
    const t = payment.amount;

    // 시나리오 D용 — 상위 30% 평가금 기준
    const sorted30 = [...enriched].sort((a, b) => b.evalKRW - a.evalKRW);
    const threshold = sorted30[Math.floor(sorted30.length * 0.3)]?.evalKRW ?? 0;

    return [
      buildScenario("A", "기술 신호 약체 정리",
        "추세·자금흐름 최하위 종목부터 단계적 매도",
        "#ef4444", enriched, signals, cashWon, t,
        h => scenarioA_priority(h, signals)
      ),
      buildScenario("B", "손실+약세 이중 리스크 해소",
        "돈도 잃고 신호도 나쁜 종목 → 더 늦기 전에 정리",
        "#f97316", enriched, signals, cashWon, t,
        h => scenarioB_priority(h, signals)
      ),
      buildScenario("C", "수익 실현 + 신호 피크아웃",
        "수익 났지만 기술 신호 약화 → 지금이 최적 매도 타이밍",
        "#22c55e", enriched, signals, cashWon, t,
        h => scenarioC_priority(h, signals)
      ),
      buildScenario("D", "정예 포트폴리오 집중",
        "핵심 종목만 보유, 한계 종목 정리 → 질적 집중 전환",
        "#06b6d4", enriched, signals, cashWon, t,
        h => scenarioD_priority(h, signals, threshold)
      ),
    ];
  }, [done, signals, enriched, cashWon, payment]);

  const signalCounts = Object.values(signals);
  const successCount = signalCounts.filter(s => !s.error && s.techScore !== null).length;

  return (
    <div className="card border border-gold/20 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="card-title">자금 계획 분석</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            보유 종목 기술 신호 분석 기반 매도/보유 시나리오 A~D
          </p>
        </div>
        {done && (
          <button
            onClick={() => { setDone(false); setSignals({}); }}
            className="text-xs text-gray-500 hover:text-white px-3 py-1.5 rounded-lg border border-navy-border hover:border-gray-500 transition-all"
          >
            재분석
          </button>
        )}
      </div>

      {/* 입력 4칸 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">목표 회차</label>
          <select
            value={targetSeq}
            onChange={e => { setTargetSeq(Number(e.target.value)); setDone(false); }}
            className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none"
          >
            {PAYMENT_SCHEDULE.map(p => (
              <option key={p.seq} value={p.seq}>
                {p.label} ({p.dueDate.slice(0, 7)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">가용 현금 (만원)</label>
          <input type="number" value={cash || ""} placeholder="예: 5000"
            onChange={e => { setCash(Number(e.target.value)); setDone(false); }}
            className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">USD/KRW 환율</label>
          <input type="number" value={rate || ""} placeholder="1380"
            onChange={e => { setRate(Number(e.target.value)); setDone(false); }}
            className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={runAnalysis}
            disabled={analyzing || holdings.length === 0}
            className="w-full py-2 text-sm font-semibold rounded-lg bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30 transition-all disabled:opacity-40"
          >
            {analyzing ? `분석 중... ${progress}%` : "📊 시나리오 분석"}
          </button>
        </div>
      </div>

      {/* 분석 중 프로그레스 */}
      {analyzing && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>종목별 기술 신호 수집 중...</span>
            <span className="num">{progress}%</span>
          </div>
          <div className="h-1.5 bg-navy-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-600">
            {holdings.length}개 종목의 ADX · MFI · CMF · VWAP 등 기술 지표 수집 중
          </p>
        </div>
      )}

      {/* 결과 */}
      {done && (
        <>
          {/* 신호 수집 요약 + 타겟 배너 */}
          <div className="flex items-center justify-between p-3 bg-navy-sub/50 rounded-xl border border-navy-border/40">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{payment.label}</span>
                <span className="text-xs text-gray-400">{payment.dueDate.replace(/-/g, ".")}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold
                  ${days <= 60 ? "bg-signal-red/20 text-signal-red" :
                    days <= 180 ? "bg-gold/20 text-gold" :
                    "bg-navy-border/40 text-gray-400"}`}>
                  D-{days}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                필요 <span className="text-white font-bold num">{fmtW(payment.amount)}</span>
                {cashWon > 0 && <span className="ml-2 text-signal-green">· 현금 {fmtW(cashWon)}</span>}
                <span className="ml-2 text-gray-600">
                  신호 수집 {successCount}/{holdings.length}종목
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-500">포트폴리오</p>
              <p className="text-sm font-bold text-white num">{fmtW(totalPortfolioKRW)}</p>
              <p className="text-[10px] text-gray-500 num">총 가용 {fmtW(totalPortfolioKRW + cashWon)}</p>
            </div>
          </div>

          {/* 시나리오 2×2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scenarios.map(sc => (
              <ScenarioCard key={sc.id} sc={sc} target={payment.amount} />
            ))}
          </div>

          {/* 비교 요약표 */}
          <div className="overflow-x-auto rounded-xl border border-navy-border/40">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-border bg-navy-sub/30 text-gray-500">
                  <th className="text-left px-4 py-2.5">안</th>
                  <th className="text-left px-3 py-2.5">전략</th>
                  <th className="text-right px-3 py-2.5">정리 종목</th>
                  <th className="text-right px-3 py-2.5">주식 조달</th>
                  <th className="text-right px-3 py-2.5">잔여 포트</th>
                  <th className="text-right px-4 py-2.5">판정</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(sc => (
                  <tr key={sc.id} className="border-b border-navy-border/30 hover:bg-navy-sub/20 transition-colors">
                    <td className="px-4 py-2.5 font-black num text-base" style={{ color: sc.accent }}>{sc.id}</td>
                    <td className="px-3 py-2.5 text-gray-300 font-medium">{sc.name}</td>
                    <td className="px-3 py-2.5 text-right num text-gray-400">{sc.sellItems.length}개</td>
                    <td className="px-3 py-2.5 text-right num text-gray-200">{fmtW(sc.stockRaised)}</td>
                    <td className="px-3 py-2.5 text-right num text-gray-300">{fmtW(sc.remainingPortfolio)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {sc.sufficient
                        ? <span className="text-signal-green font-semibold">✅ 가능</span>
                        : <span className="text-signal-red font-semibold">⚠️ {fmtW(sc.shortfall)} 부족</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!done && !analyzing && holdings.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-3">보유 종목을 먼저 등록하세요</p>
      )}
    </div>
  );
}

// ── 시나리오 카드 ─────────────────────────────────────────────────────────────
function ScenarioCard({ sc, target }: { sc: ScenarioResult; target: number }) {
  const [showHold, setShowHold] = useState(false);
  const fillPct = Math.min(100, (sc.totalRaised / target) * 100);

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      sc.sufficient ? "border-signal-green/20 bg-signal-green/5" : "border-signal-red/20 bg-signal-red/5"
    }`}>
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-base font-black" style={{ color: sc.accent }}>안 {sc.id}</span>
            <span className="text-sm font-bold text-white">{sc.name}</span>
          </div>
          <p className="text-[11px] text-gray-500">{sc.tagline}</p>
        </div>
        <span className={`text-xs font-bold shrink-0 ${sc.sufficient ? "text-signal-green" : "text-signal-red"}`}>
          {sc.sufficient ? "✅ 납부 가능" : "⚠️ 부족"}
        </span>
      </div>

      {/* 진행바 */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>조달 <span className="text-white num font-semibold">{fmtW(sc.totalRaised)}</span></span>
          <span className="num">{fillPct.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-navy-border rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${sc.sufficient ? "bg-signal-green" : "bg-signal-red"}`}
            style={{ width: `${fillPct}%` }} />
        </div>
        {!sc.sufficient && (
          <p className="text-[10px] text-signal-red mt-1 num">부족 {fmtW(sc.shortfall)}</p>
        )}
      </div>

      {/* 숫자 요약 */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          { label: "현금 기여",  value: fmtW(sc.cashContrib),        cls: "text-white"      },
          { label: "주식 조달",  value: fmtW(sc.stockRaised),        cls: "text-cyan-brand" },
          { label: "잔여 포트",  value: fmtW(sc.remainingPortfolio), cls: "text-gray-300"   },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-navy-sub/60 rounded-lg py-2">
            <p className="text-[9px] text-gray-500 mb-0.5">{label}</p>
            <p className={`text-[11px] font-bold num ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── 매도 추천 종목 ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] text-gray-500 font-semibold mb-1.5 uppercase tracking-wide">
          매도 추천 ({sc.sellItems.length}종목)
        </p>
        <div className="space-y-1.5">
          {sc.sellItems.map(item => {
            const plPos = item.profitLossPct >= 0;
            const grCls = item.techGrade ? GRADE_CLS[item.techGrade] ?? GRADE_CLS.F : "bg-gray-700 text-gray-400";
            return (
              <div key={item.ticker}
                className="bg-navy-sub/50 rounded-lg px-3 py-2 space-y-1">
                {/* 1행: 종목명 + 등급 + P&L */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-white text-[12px] font-semibold truncate max-w-[100px]">
                      {item.name}
                    </span>
                    {item.currency === "USD" && (
                      <span className="text-[9px] px-1 py-0.5 bg-gold/20 text-gold rounded shrink-0">$</span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${grCls}`}>
                      {item.techGrade ?? "?"}
                    </span>
                    <span className={`text-[10px] shrink-0 ${plPos ? "text-signal-green" : "text-signal-red"}`}>
                      {plPos ? "+" : ""}{item.profitLossPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[12px] text-gray-200 num font-semibold">{fmtW(item.sellKRW)}</span>
                    {item.isPartial && (
                      <span className="text-gray-500 text-[10px] ml-1">
                        ({(item.fraction * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>
                </div>
                {/* 2행: 매도 이유 */}
                {item.sellReasons.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {item.sellReasons.map(r => (
                      <span key={r}
                        className="text-[9px] px-1.5 py-0.5 bg-signal-red/10 text-signal-red/80 rounded">
                        {r}
                      </span>
                    ))}
                    {item.techScore !== null && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-navy-border/50 text-gray-500 rounded num">
                        신호 {item.techScore}점
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 보유 추천 종목 (접힘) ──────────────────────────────────────────── */}
      {sc.holdItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowHold(v => !v)}
            className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-200 transition-colors"
          >
            <span className="text-[9px]">{showHold ? "▲" : "▶"}</span>
            보유 유지 추천 {sc.holdItems.length}종목 {showHold ? "접기" : "보기"}
          </button>
          {showHold && (
            <div className="mt-2 space-y-1">
              {sc.holdItems.map(item => {
                const grCls = item.techGrade ? GRADE_CLS[item.techGrade] ?? GRADE_CLS.F : "bg-gray-700 text-gray-400";
                return (
                  <div key={item.ticker}
                    className="flex items-center justify-between bg-navy-sub/30 rounded-lg px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-white font-medium">{item.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${grCls}`}>
                        {item.techGrade ?? "?"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.techScore !== null && (
                        <span className="text-[9px] text-gray-500 num">{item.techScore}점</span>
                      )}
                      <span className="text-[9px] text-signal-green/70">{item.reason}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
