"use client";

import { useState, useMemo } from "react";

// ── 납부 일정 ─────────────────────────────────────────────────────────────────
const PAYMENT_SCHEDULE = [
  { seq: 2, label: "2차 중도금", dueDate: "2026-07-15", amount: 180_200_000 },
  { seq: 3, label: "3차 중도금", dueDate: "2026-11-16", amount: 180_200_000 },
  { seq: 4, label: "4차 중도금", dueDate: "2027-03-15", amount: 180_200_000 },
  { seq: 5, label: "5차 중도금", dueDate: "2027-07-15", amount: 180_200_000 },
  { seq: 6, label: "6차 중도금", dueDate: "2027-11-15", amount: 180_200_000 },
  { seq: 7, label: "7차 중도금", dueDate: "2028-03-15", amount: 180_200_000 },
  { seq: 8, label: "8차 잔금",   dueDate: "2028-08-01", amount: 540_600_000 },
];

function calcDays(targetDate: string): number {
  const kst   = new Date(Date.now() + 9 * 3_600_000);
  const today = new Date(kst.toISOString().split("T")[0]);
  return Math.ceil((new Date(targetDate).getTime() - today.getTime()) / 86_400_000);
}

function fmt(won: number): string {
  const abs  = Math.abs(won);
  const sign = won < 0 ? "-" : "";
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e4).toLocaleString()}만`;
  return `${sign}${Math.round(abs).toLocaleString()}원`;
}

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface Holding {
  ticker: string;
  name: string;
  qty: number;
  avg_price: number;
  currency: "KRW" | "USD";
  sector: string;
  profitLossPct?: number;
  evalAmount?: number;  // in native currency
}

type Enriched = Holding & { evalAmountKRW: number };

interface SellItem {
  ticker: string;
  name: string;
  evalAmountKRW: number;
  sellAmountKRW: number;
  isPartial: boolean;
  fraction: number;
  profitLossPct: number;
  currency: "KRW" | "USD";
}

interface ScenarioResult {
  id: "A" | "B" | "C" | "D";
  name: string;
  tagline: string;
  note: string;
  accentColor: string;
  sellItems: SellItem[];
  cashContrib: number;
  stockRaised: number;
  totalRaised: number;
  shortfall: number;
  sufficient: boolean;
  remainingPortfolio: number;
}

// ── 시나리오 계산 엔진 ────────────────────────────────────────────────────────
function buildScenario(
  id: "A" | "B" | "C" | "D",
  name: string,
  tagline: string,
  note: string,
  accentColor: string,
  enriched: Enriched[],
  cashWon: number,
  target: number,
  sortFn: (a: Enriched, b: Enriched) => number
): ScenarioResult {
  const needed    = Math.max(0, target - cashWon);
  const sorted    = [...enriched].sort(sortFn);
  const sellItems: SellItem[] = [];
  let accumulated = 0;

  for (const h of sorted) {
    if (accumulated >= needed) break;
    const remaining = needed - accumulated;
    const full = h.evalAmountKRW;
    if (full <= remaining) {
      sellItems.push({
        ticker: h.ticker, name: h.name,
        evalAmountKRW: full, sellAmountKRW: full,
        isPartial: false, fraction: 1,
        profitLossPct: h.profitLossPct ?? 0,
        currency: h.currency,
      });
      accumulated += full;
    } else {
      const fraction = remaining / full;
      sellItems.push({
        ticker: h.ticker, name: h.name,
        evalAmountKRW: full, sellAmountKRW: remaining,
        isPartial: true, fraction,
        profitLossPct: h.profitLossPct ?? 0,
        currency: h.currency,
      });
      accumulated += remaining;
    }
  }

  const totalPortfolio = enriched.reduce((s, h) => s + h.evalAmountKRW, 0);
  const totalRaised    = cashWon + accumulated;
  const shortfall      = Math.max(0, target - totalRaised);

  return {
    id, name, tagline, note, accentColor, sellItems,
    cashContrib:        Math.min(cashWon, target),
    stockRaised:        accumulated,
    totalRaised,
    shortfall,
    sufficient:         shortfall === 0,
    remainingPortfolio: totalPortfolio - accumulated,
  };
}

// ── 컴포넌트 Props ────────────────────────────────────────────────────────────
interface Props {
  holdings: Holding[];
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function FundingScenario({ holdings }: Props) {
  const [cash,      setCash]      = useState<number>(0);
  const [rate,      setRate]      = useState<number>(1380);
  const [targetSeq, setTargetSeq] = useState<number>(2);
  const [show,      setShow]      = useState(false);

  const payment = PAYMENT_SCHEDULE.find(p => p.seq === targetSeq)!;
  const days    = calcDays(payment.dueDate);
  const cashWon = cash * 10_000;

  const enriched = useMemo<Enriched[]>(() =>
    holdings.map(h => ({
      ...h,
      evalAmountKRW: (h.evalAmount ?? h.qty * h.avg_price) * (h.currency === "USD" ? rate : 1),
    })),
    [holdings, rate]
  );

  const totalPortfolioKRW = enriched.reduce((s, h) => s + h.evalAmountKRW, 0);

  const scenarios = useMemo((): ScenarioResult[] => {
    if (!show || holdings.length === 0) return [];
    const t = payment.amount;

    return [
      buildScenario(
        "A", "손절 우선", "손실 종목부터 정리",
        "부실 자산 청산 + 자금 확보. 손실 세금 공제 효과도 있음",
        "#ef4444", enriched, cashWon, t,
        (a, b) => (a.profitLossPct ?? 0) - (b.profitLossPct ?? 0)   // 손실 큰 순
      ),
      buildScenario(
        "B", "수익 실현 우선", "고수익 종목부터 매도",
        "이익 확정 후 조정 시 재매수. 고점 이탈 리스크 선제 대응",
        "#22c55e", enriched, cashWon, t,
        (a, b) => (b.profitLossPct ?? 0) - (a.profitLossPct ?? 0)   // 수익 큰 순
      ),
      buildScenario(
        "C", "소액 분산 정리", "소액 포지션부터 청산",
        "종목 수 축소 → 핵심 종목 집중. 관리 코스트 절감",
        "#06b6d4", enriched, cashWon, t,
        (a, b) => a.evalAmountKRW - b.evalAmountKRW                  // 소액 순
      ),
      buildScenario(
        "D", "USD 자산 우선", "달러 보유분 먼저 활용",
        `현재 환율 ${rate.toLocaleString()}원 유리한 시점. 원화 약세 헤지 효과`,
        "#f59e0b", enriched, cashWon, t,
        (a, b) => {
          if (a.currency === "USD" && b.currency !== "USD") return -1;
          if (a.currency !== "USD" && b.currency === "USD") return  1;
          return b.evalAmountKRW - a.evalAmountKRW;
        }
      ),
    ];
  }, [show, holdings, enriched, cashWon, payment, rate]);

  return (
    <div className="card border border-gold/20 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="card-title">자금 계획 분석</h2>
          <p className="text-xs text-gray-500 mt-0.5">래미안 엘라비네 납부 · 종목 정리 시나리오 A~D</p>
        </div>
        {show && (
          <button
            onClick={() => setShow(false)}
            className="text-xs text-gray-500 hover:text-white px-3 py-1.5 rounded-lg border border-navy-border hover:border-gray-500 transition-all"
          >
            닫기
          </button>
        )}
      </div>

      {/* 입력 필드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">목표 회차</label>
          <select
            value={targetSeq}
            onChange={e => { setTargetSeq(Number(e.target.value)); setShow(false); }}
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
          <input
            type="number"
            value={cash || ""}
            onChange={e => { setCash(Number(e.target.value)); setShow(false); }}
            placeholder="예: 5000"
            className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">USD/KRW 환율</label>
          <input
            type="number"
            value={rate || ""}
            onChange={e => { setRate(Number(e.target.value)); setShow(false); }}
            placeholder="1380"
            className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setShow(true)}
            disabled={holdings.length === 0}
            className="w-full py-2 text-sm font-semibold rounded-lg bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30 transition-all disabled:opacity-40"
          >
            📊 시나리오 분석
          </button>
        </div>
      </div>

      {/* 결과 */}
      {show && (
        <>
          {/* 타겟 요약 배너 */}
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
                필요 자금 <span className="text-white font-bold num">{fmt(payment.amount)}</span>
                {cashWon > 0 && (
                  <span className="ml-2 text-signal-green">현금 {fmt(cashWon)} 보유</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-500">현재 포트폴리오</p>
              <p className="text-sm font-bold text-white num">{fmt(totalPortfolioKRW)}</p>
              <p className="text-[10px] text-gray-500 num">
                총 가용 {fmt(totalPortfolioKRW + cashWon)}
              </p>
            </div>
          </div>

          {/* 시나리오 2×2 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scenarios.map(sc => (
              <ScenarioCard key={sc.id} sc={sc} targetAmount={payment.amount} />
            ))}
          </div>

          {/* 요약 비교표 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-border text-gray-500">
                  <th className="text-left py-2 pr-3">안</th>
                  <th className="text-left py-2 pr-3">전략</th>
                  <th className="text-right py-2 pr-3">정리 종목수</th>
                  <th className="text-right py-2 pr-3">주식 조달</th>
                  <th className="text-right py-2 pr-3">잔여 포트</th>
                  <th className="text-right py-2">판정</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(sc => (
                  <tr key={sc.id} className="border-b border-navy-border/30 hover:bg-navy-sub/30 transition-colors">
                    <td className="py-2 pr-3 font-black num" style={{ color: sc.accentColor }}>{sc.id}</td>
                    <td className="py-2 pr-3 text-gray-300">{sc.name}</td>
                    <td className="py-2 pr-3 text-right num text-gray-300">{sc.sellItems.length}개</td>
                    <td className="py-2 pr-3 text-right num text-gray-200">{fmt(sc.stockRaised)}</td>
                    <td className="py-2 pr-3 text-right num text-gray-300">{fmt(sc.remainingPortfolio)}</td>
                    <td className="py-2 text-right">
                      {sc.sufficient
                        ? <span className="text-signal-green font-semibold">✅ 가능</span>
                        : <span className="text-signal-red font-semibold">⚠️ {fmt(sc.shortfall)} 부족</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!show && holdings.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-3">보유 종목을 먼저 등록하면 시나리오 분석이 가능합니다.</p>
      )}
    </div>
  );
}

// ── 시나리오 카드 ─────────────────────────────────────────────────────────────
function ScenarioCard({ sc, targetAmount }: { sc: ScenarioResult; targetAmount: number }) {
  const [expanded, setExpanded] = useState(false);
  const fillPct = Math.min(100, (sc.totalRaised / targetAmount) * 100);

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      sc.sufficient
        ? "border-signal-green/25 bg-signal-green/5"
        : "border-signal-red/25 bg-signal-red/5"
    }`}>
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black" style={{ color: sc.accentColor }}>안 {sc.id}</span>
            <span className="text-sm font-bold text-white">{sc.name}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">{sc.tagline}</p>
        </div>
        <span className={`text-xs font-bold shrink-0 ${sc.sufficient ? "text-signal-green" : "text-signal-red"}`}>
          {sc.sufficient ? "✅ 납부 가능" : "⚠️ 부족"}
        </span>
      </div>

      {/* 진행바 */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>조달 <span className="text-white num font-semibold">{fmt(sc.totalRaised)}</span></span>
          <span className="num">{fillPct.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-navy-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${sc.sufficient ? "bg-signal-green" : "bg-signal-red"}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        {!sc.sufficient && (
          <p className="text-[10px] text-signal-red mt-1 num">부족 {fmt(sc.shortfall)}</p>
        )}
      </div>

      {/* 숫자 3칸 */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          { label: "현금 기여",  value: fmt(sc.cashContrib),        cls: "text-white"         },
          { label: "주식 조달",  value: fmt(sc.stockRaised),        cls: "text-cyan-brand"    },
          { label: "잔여 포트",  value: fmt(sc.remainingPortfolio), cls: "text-gray-300"      },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-navy-sub/60 rounded-lg py-2">
            <p className="text-[9px] text-gray-500 mb-0.5">{label}</p>
            <p className={`text-[11px] font-bold num ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* 정리 종목 리스트 (아코디언) */}
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
        >
          <span className="text-[9px]">{expanded ? "▲" : "▶"}</span>
          정리 종목 {sc.sellItems.length}개 {expanded ? "접기" : "펼치기"}
        </button>
        {expanded && (
          <div className="mt-2 space-y-1">
            {sc.sellItems.length === 0 ? (
              <p className="text-xs text-signal-green py-1">현금만으로 납부 가능 — 주식 정리 불필요</p>
            ) : (
              sc.sellItems.map(item => {
                const pos = item.profitLossPct >= 0;
                return (
                  <div key={item.ticker}
                    className="flex items-center justify-between text-[11px] bg-navy-sub/40 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-white font-medium truncate max-w-[90px]">{item.name}</span>
                      {item.currency === "USD" && (
                        <span className="shrink-0 text-[9px] px-1 py-0.5 bg-gold/20 text-gold rounded">$</span>
                      )}
                      <span className={`shrink-0 ${pos ? "text-signal-green" : "text-signal-red"}`}>
                        {pos ? "+" : ""}{item.profitLossPct.toFixed(1)}%
                      </span>
                      {item.isPartial && (
                        <span className="shrink-0 text-gray-500">
                          ({(item.fraction * 100).toFixed(0)}%만)
                        </span>
                      )}
                      {!item.isPartial && (
                        <span className="shrink-0 text-gray-600">전량</span>
                      )}
                    </div>
                    <span className="text-gray-200 num ml-2 shrink-0">{fmt(item.sellAmountKRW)}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 전략 메모 */}
      <p className="text-[10px] text-gray-600 border-t border-navy-border/30 pt-2">{sc.note}</p>
    </div>
  );
}
