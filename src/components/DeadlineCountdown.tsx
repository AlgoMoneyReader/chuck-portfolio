"use client";

import { useEffect, useState } from "react";

// ─── 분양대금 납입 데이터 (래미안 엘라비네) ────────────────────────────────────
interface PaymentRow {
  seq: number;       // 차수
  dueDate: string;   // 지정일 YYYY-MM-DD
  amount: number;    // 분양대금 (원)
  paidAmount: number; // 입금액 (원)
  paidDate: string | null; // 입금일 YYYY-MM-DD (null = 미납)
  label: string;     // 차수명
}

const PAYMENTS: PaymentRow[] = [
  { seq: 0, dueDate: "2026-04-12", amount: 30_000_000,  paidAmount: 30_000_000,  paidDate: "2026-04-12", label: "0차 (계약금)" },
  { seq: 1, dueDate: "2026-05-11", amount: 150_200_000, paidAmount: 150_200_000, paidDate: "2026-05-11", label: "1차 (중도금)" },
  { seq: 2, dueDate: "2026-07-15", amount: 180_200_000, paidAmount: 0,           paidDate: null,         label: "2차 (중도금)" },
  { seq: 3, dueDate: "2026-11-16", amount: 180_200_000, paidAmount: 0,           paidDate: null,         label: "3차 (중도금)" },
  { seq: 4, dueDate: "2027-03-15", amount: 180_200_000, paidAmount: 0,           paidDate: null,         label: "4차 (중도금)" },
  { seq: 5, dueDate: "2027-07-15", amount: 180_200_000, paidAmount: 0,           paidDate: null,         label: "5차 (중도금)" },
  { seq: 6, dueDate: "2027-11-15", amount: 180_200_000, paidAmount: 0,           paidDate: null,         label: "6차 (중도금)" },
  { seq: 7, dueDate: "2028-03-15", amount: 180_200_000, paidAmount: 0,           paidDate: null,         label: "7차 (중도금)" },
  { seq: 8, dueDate: "2028-08-01", amount: 540_600_000, paidAmount: 0,           paidDate: null,         label: "8차 (잔금)" },
];

const TOTAL_AMOUNT   = 1_802_000_000;
const TOTAL_PAID     = 180_200_000;
const TOTAL_REMAIN   = TOTAL_AMOUNT - TOTAL_PAID;

// ─── 유틸 ──────────────────────────────────────────────────────────────────────
function calcDays(targetDate: string): number {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = new Date(kst.toISOString().split("T")[0]);
  const target = new Date(targetDate);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

/** 억 단위 (소수 1자리) */
function toUk(won: number): string {
  return (won / 1_0000_0000).toFixed(1) + "억";
}

function fmtDate(iso: string): string {
  return iso.replace(/-/g, ".");
}

function ddayStyle(days: number, paid: boolean) {
  if (paid)       return { text: "text-signal-green", bg: "bg-signal-green/10 border-signal-green/30" };
  if (days < 0)   return { text: "text-signal-red",   bg: "bg-signal-red/10   border-signal-red/30"   };
  if (days <= 14) return { text: "text-signal-red",   bg: "bg-signal-red/10   border-signal-red/30"   };
  if (days <= 60) return { text: "text-gold",         bg: "bg-gold/10         border-gold/30"         };
  return               { text: "text-gray-400",       bg: "bg-navy-sub/40     border-navy-border/40"  };
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────
export default function DeadlineCountdown() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(i);
  }, []);

  const rows = PAYMENTS.map(p => ({ ...p, days: calcDays(p.dueDate) }));
  const nextDue = rows.find(r => !r.paidDate && r.days >= 0);
  const paidPct = (TOTAL_PAID / TOTAL_AMOUNT) * 100;

  return (
    <div className="card space-y-5">

      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="card-title">래미안 엘라비네 분양대금 납입현황</h2>
          <p className="text-xs text-gray-500 mt-0.5">총 분양대금 {toUk(TOTAL_AMOUNT)} · 납부 {toUk(TOTAL_PAID)} · 잔여 {toUk(TOTAL_REMAIN)}</p>
        </div>
        {nextDue && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold border shrink-0
            ${ddayStyle(nextDue.days, false).bg} ${ddayStyle(nextDue.days, false).text}`}>
            다음 납부 D-{nextDue.days}
          </span>
        )}
      </div>

      {/* ── 전체 납부 진행바 ──────────────────────────────────────────────── */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>납부 진행률</span>
          <span className="text-signal-green font-semibold">{paidPct.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-navy-border rounded-full overflow-hidden">
          <div
            className="h-full bg-signal-green rounded-full transition-all"
            style={{ width: `${paidPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-signal-green num">납부 {toUk(TOTAL_PAID)}</span>
          <span className="text-gray-500 num">잔여 {toUk(TOTAL_REMAIN)}</span>
        </div>
      </div>

      {/* ── 납입 일정 테이블 ──────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b border-navy-border/60">
              <th className="py-2 px-2 text-left text-gray-500 font-medium w-16">차수</th>
              <th className="py-2 px-2 text-center text-gray-500 font-medium">지정일</th>
              <th className="py-2 px-2 text-right text-gray-500 font-medium">분양대금</th>
              <th className="py-2 px-2 text-right text-gray-500 font-medium">입금액</th>
              <th className="py-2 px-2 text-center text-gray-500 font-medium">입금일</th>
              <th className="py-2 px-2 text-center text-gray-500 font-medium w-20">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isPaid = !!r.paidDate;
              const style = ddayStyle(r.days, isPaid);
              const isNext = nextDue?.seq === r.seq;

              return (
                <tr
                  key={r.seq}
                  className={`border-b border-navy-border/20 transition-colors
                    ${isNext ? "bg-gold/5" : "hover:bg-navy-sub/20"}
                    ${isPaid ? "opacity-60" : ""}`}
                >
                  {/* 차수 */}
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1.5">
                      {isNext && <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" />}
                      <span className={`font-semibold ${isNext ? "text-gold" : "text-gray-300"}`}>
                        {r.label}
                      </span>
                    </div>
                  </td>

                  {/* 지정일 */}
                  <td className="py-2.5 px-2 text-center text-gray-400 tabular-nums">
                    {fmtDate(r.dueDate)}
                  </td>

                  {/* 분양대금 */}
                  <td className="py-2.5 px-2 text-right font-semibold text-white num tabular-nums">
                    {toUk(r.amount)}
                  </td>

                  {/* 입금액 */}
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    {isPaid
                      ? <span className="text-signal-green font-semibold num">{toUk(r.paidAmount)}</span>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>

                  {/* 입금일 */}
                  <td className="py-2.5 px-2 text-center text-gray-400 tabular-nums">
                    {r.paidDate ? fmtDate(r.paidDate) : <span className="text-gray-600">—</span>}
                  </td>

                  {/* 상태 / D-day */}
                  <td className="py-2.5 px-2 text-center">
                    {isPaid ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-signal-green/10 border border-signal-green/30 text-signal-green">
                        ✓ 완납
                      </span>
                    ) : r.days < 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-signal-red/10 border border-signal-red/30 text-signal-red">
                        D+{Math.abs(r.days)}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${style.bg} ${style.text}`}>
                        D-{r.days}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* 합계 행 */}
          <tfoot>
            <tr className="border-t-2 border-navy-border/60 bg-navy-sub/30">
              <td className="py-2.5 px-2 text-gray-400 font-semibold" colSpan={2}>합계</td>
              <td className="py-2.5 px-2 text-right text-white font-bold num">{toUk(TOTAL_AMOUNT)}</td>
              <td className="py-2.5 px-2 text-right text-signal-green font-bold num">{toUk(TOTAL_PAID)}</td>
              <td className="py-2.5 px-2" />
              <td className="py-2.5 px-2 text-center">
                <span className="text-[11px] text-gray-500">{paidPct.toFixed(1)}%</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── 다음 납부 하이라이트 카드 ────────────────────────────────────── */}
      {nextDue && (
        <div className={`p-3 rounded-xl border ${ddayStyle(nextDue.days, false).bg} flex items-center justify-between`}>
          <div>
            <p className={`text-xs font-bold ${ddayStyle(nextDue.days, false).text}`}>
              ⏰ 다음 납부 예정
            </p>
            <p className="text-sm text-gray-300 font-semibold mt-0.5">{nextDue.label}</p>
            <p className="text-xs text-gray-500">{fmtDate(nextDue.dueDate)} · {toUk(nextDue.amount)}</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold num ${ddayStyle(nextDue.days, false).text}`}>
              D-{nextDue.days}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
