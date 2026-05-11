"use client";

import { useEffect, useState } from "react";

interface Deadline {
  label: string;
  date: string;       // YYYY-MM-DD
  amount: number;     // 만원
  installment: string; // 차수
  emoji: string;
}

const DEADLINES: Deadline[] = [
  { label: "래미안 엘라비네 5차 중도금",  date: "2026-07-01", amount: 4200, installment: "5차", emoji: "🏗" },
  { label: "래미안 엘라비네 6차 중도금",  date: "2026-11-01", amount: 4200, installment: "6차", emoji: "🏗" },
  { label: "래미안 엘라비네 잔금 (예정)", date: "2027-05-01", amount: 17400, installment: "잔금", emoji: "🏠" },
];

function calcDays(targetDate: string): number {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = new Date(kstNow.toISOString().split("T")[0]);
  const target = new Date(targetDate);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyStyle(days: number): { bar: string; badge: string; text: string } {
  if (days < 0)   return { bar: "bg-gray-600",      badge: "bg-gray-700 text-gray-400",   text: "text-gray-400" };
  if (days <= 14) return { bar: "bg-signal-red",     badge: "bg-signal-red/20 text-signal-red",   text: "text-signal-red" };
  if (days <= 60) return { bar: "bg-gold",           badge: "bg-gold/20 text-gold",               text: "text-gold" };
  return             { bar: "bg-signal-green",    badge: "bg-signal-green/20 text-signal-green", text: "text-signal-green" };
}

export default function DeadlineCountdown() {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(i);
  }, []);

  // next 기준일 계산
  const upcoming = DEADLINES.map(d => ({ ...d, days: calcDays(d.date) }));
  const nextDue = upcoming.find(d => d.days >= 0);

  return (
    <div className="card">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="card-title">중도금 납부 일정</h2>
        {nextDue && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${urgencyStyle(nextDue.days).badge}`}>
            D-{nextDue.days}
          </span>
        )}
      </div>

      {/* 카운트다운 카드 목록 */}
      <div className="space-y-3">
        {upcoming.map(d => {
          const style = urgencyStyle(d.days);
          const isPast = d.days < 0;
          const progressPct = isPast ? 100 :
            (() => {
              const allDays = DEADLINES.map(x => calcDays(x.date));
              const maxDays = Math.max(...allDays.filter(x => x > 0), 1);
              return Math.max(0, 100 - (d.days / maxDays) * 100);
            })();

          return (
            <div key={d.date}
              className={`p-4 rounded-xl border ${isPast ? "border-navy-border/30 opacity-50" : "border-navy-border/60"} bg-navy-sub/30`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{d.emoji}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${style.badge}`}>
                      {d.installment}
                    </span>
                    <span className="text-xs text-gray-500">{d.date}</span>
                  </div>
                  <p className="text-sm text-gray-300 font-medium">{d.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    납부액: <span className="text-white font-semibold num">{d.amount.toLocaleString("ko-KR")}만원</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {isPast ? (
                    <p className="text-xs text-gray-500">완료</p>
                  ) : (
                    <>
                      <p className={`text-2xl font-bold num ${style.text}`}>D-{d.days}</p>
                      <p className="text-xs text-gray-600">
                        {new Date(d.date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                      </p>
                    </>
                  )}
                </div>
              </div>
              {/* 진행 바 */}
              <div className="mt-3 h-1.5 bg-navy-border rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${style.bar}`}
                  style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 총 잔여 중도금 */}
      <div className="mt-4 p-3 bg-navy-card/40 rounded-lg border border-navy-border/30">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">남은 납부 총액</span>
          <span className="text-sm font-bold text-gold num">
            {upcoming.filter(d => d.days >= 0).reduce((s, d) => s + d.amount, 0).toLocaleString("ko-KR")}만원
          </span>
        </div>
      </div>
    </div>
  );
}
