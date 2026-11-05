"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";

// ─── 분양대금 납입 데이터 (래미안 엘라비네) ────────────────────────────────────
// 운영자가 직접 입력·수정한다. Supabase payment_plans 에 저장(없으면 이 브라우저에 임시 저장)
interface PaymentRow {
  seq: number;             // 차수
  label: string;           // 차수명
  dueDate: string;         // 지정일 YYYY-MM-DD
  amount: number;          // 분양대금 (원)
  paidAmount: number;      // 입금액 (원)
  paidDate: string | null; // 입금일 YYYY-MM-DD (null = 미입금)
  memo?: string;           // 메모 (대출 실행·이체 계좌 등)
}

const DEFAULT_ROWS: PaymentRow[] = [
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
const LOCAL_KEY = "elavine-payments-v1";

// ─── 유틸 ──────────────────────────────────────────────────────────────────────
function calcDays(targetDate: string): number {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = new Date(kst.toISOString().split("T")[0]);
  return Math.ceil((new Date(targetDate).getTime() - today.getTime()) / 86_400_000);
}
/** 억 단위 (소수 2자리까지, 천 단위 쉼표) */
const toUk = (won: number) => `${(won / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억`;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const fmtDate = (iso: string) => iso.replace(/-/g, ".");
const parseWon = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

function ddayStyle(days: number, paid: boolean) {
  if (paid)       return { text: "text-signal-green", bg: "bg-signal-green/10 border-signal-green/30" };
  if (days <= 14) return { text: "text-signal-red",   bg: "bg-signal-red/10 border-signal-red/30" };
  if (days <= 60) return { text: "text-gold",         bg: "bg-gold/10 border-gold/30" };
  return               { text: "text-gray-400",       bg: "bg-navy-sub/40 border-navy-border/40" };
}

// 숫자 입력: 쉼표 붙여 보여주고 숫자만 저장
function WonInput({ value, onChange, className = "" }: { value: number; onChange: (n: number) => void; className?: string }) {
  return (
    <input inputMode="numeric" value={value ? value.toLocaleString("ko-KR") : ""} placeholder="0"
      onChange={e => onChange(parseWon(e.target.value))}
      className={`w-full bg-navy-sub border border-navy-border rounded-lg px-2 py-1.5 text-right text-white num focus:border-cyan-brand outline-none ${className}`} />
  );
}
const inputCls = "w-full bg-navy-sub border border-navy-border rounded-lg px-2 py-1.5 text-white num focus:border-cyan-brand outline-none";

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────
export default function DeadlineCountdown() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PaymentRow[]>(DEFAULT_ROWS);
  const [draft, setDraft] = useState<PaymentRow[] | null>(null); // 편집 중이면 사본
  const [store, setStore] = useState<"db" | "local" | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => { const i = setInterval(() => setTick(t => t + 1), 60_000); return () => clearInterval(i); }, []);

  // 불러오기: DB → (없으면) 이 브라우저 → 기본값
  useEffect(() => {
    const local = () => { try { const v = localStorage.getItem(LOCAL_KEY); if (v) setRows(JSON.parse(v)); } catch { /* 무시 */ } };
    const sb = getBrowserSupabase();
    if (!sb || !user) { local(); setStore("local"); return; }
    sb.from("payment_plans").select("rows").eq("user_id", user.id).maybeSingle().then(({ data, error }) => {
      if (error) { local(); setStore("local"); return; } // 테이블이 아직 없으면
      setStore("db");
      if (Array.isArray(data?.rows) && data!.rows.length) setRows(data!.rows as PaymentRow[]);
      else local();
    });
  }, [user]);

  const save = useCallback(async () => {
    if (!draft) return;
    const clean = draft.map((r, i) => ({ ...r, seq: i, paidDate: r.paidDate || null }));
    setSaving(true); setMsg("");
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(clean)); } catch { /* 무시 */ }
    const sb = getBrowserSupabase();
    if (sb && user) {
      const { error } = await sb.from("payment_plans").upsert({ user_id: user.id, rows: clean, updated_at: new Date().toISOString() });
      if (error) { setStore("local"); setMsg("서버 저장 실패 — 이 브라우저에만 저장했습니다. Supabase 에 supabase/payments.sql 을 실행해 주세요."); }
      else { setStore("db"); setMsg("저장했습니다"); }
    } else setMsg("이 브라우저에 저장했습니다 (로그인하면 기기 간 동기화)");
    setRows(clean); setDraft(null); setSaving(false);
    setTimeout(() => setMsg(""), 4000);
  }, [draft, user]);

  const view = draft ?? rows;
  const total = useMemo(() => view.reduce((a, r) => a + r.amount, 0), [view]);
  const paid = useMemo(() => view.reduce((a, r) => a + Math.min(r.paidAmount, r.amount || r.paidAmount), 0), [view]);
  const remain = Math.max(0, total - paid);
  const paidPct = total ? (paid / total) * 100 : 0;
  const withDays = rows.map(r => ({ ...r, days: calcDays(r.dueDate), done: r.paidAmount >= r.amount && r.amount > 0 }));
  const nextDue = withDays.find(r => !r.done && r.days >= 0) ?? withDays.find(r => !r.done);

  const set = (i: number, patch: Partial<PaymentRow>) => setDraft(d => d!.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <div className="card space-y-5">
      {/* ── 헤더 ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="card-title">래미안 엘라비네 분양대금 납입현황</h2>
          <p className="text-xs text-gray-500 mt-0.5">총 분양대금 {toUk(total)} · 납부 {toUk(paid)} · 잔여 {toUk(remain)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!draft && nextDue && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${ddayStyle(nextDue.days, false).bg} ${ddayStyle(nextDue.days, false).text}`}>
              다음 납부 {nextDue.days >= 0 ? `D-${nextDue.days}` : `D+${-nextDue.days}`}
            </span>
          )}
          {draft ? (
            <>
              <button onClick={() => setDraft(null)} className="text-xs px-3 py-1.5 rounded-lg border border-navy-border text-gray-400">취소</button>
              <button onClick={save} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-brand text-navy font-bold disabled:opacity-50">{saving ? "저장 중…" : "저장"}</button>
            </>
          ) : (
            <button onClick={() => setDraft(rows.map(r => ({ ...r })))} className="text-xs px-3 py-1.5 rounded-lg border border-cyan-brand/40 text-cyan-brand bg-cyan-brand/10 font-semibold">✎ 입금 입력·수정</button>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-gold">{msg}</p>}

      {/* ── 전체 납부 진행바 ── */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>납부 진행률</span>
          <span className="text-signal-green font-semibold">{paidPct.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-navy-border rounded-full overflow-hidden">
          <div className="h-full bg-signal-green rounded-full transition-all" style={{ width: `${Math.min(100, paidPct)}%` }} />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-signal-green num">납부 {won(paid)}</span>
          <span className="text-gray-500 num">잔여 {won(remain)}</span>
        </div>
      </div>

      {/* ── 편집 모드 ── */}
      {draft ? (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500">입금액·입금일을 넣고 저장하세요. 입금액이 분양대금 이상이면 ‘완납’, 일부면 ‘부분 납부’로 표시됩니다.</p>
          {draft.map((r, i) => (
            <div key={i} className="rounded-xl border border-navy-border bg-navy-sub/30 p-3 grid grid-cols-2 sm:grid-cols-[1.1fr_1fr_1.2fr_1.2fr_1fr_auto] gap-2 items-end">
              <label className="space-y-1 col-span-2 sm:col-span-1"><span className="text-[10px] text-gray-500">차수</span>
                <input value={r.label} onChange={e => set(i, { label: e.target.value })} className={inputCls} /></label>
              <label className="space-y-1"><span className="text-[10px] text-gray-500">지정일</span>
                <input type="date" value={r.dueDate} onChange={e => set(i, { dueDate: e.target.value })} className={inputCls} /></label>
              <label className="space-y-1"><span className="text-[10px] text-gray-500">분양대금(원)</span>
                <WonInput value={r.amount} onChange={n => set(i, { amount: n })} /></label>
              <label className="space-y-1"><span className="text-[10px] text-gold">입금액(원)</span>
                <div className="flex gap-1">
                  <WonInput value={r.paidAmount} onChange={n => set(i, { paidAmount: n })} className="border-gold/40" />
                  <button type="button" title="분양대금 전액" onClick={() => set(i, { paidAmount: r.amount, paidDate: r.paidDate || new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10) })}
                    className="shrink-0 px-2 rounded-lg text-[10px] border border-signal-green/40 text-signal-green">전액</button>
                </div></label>
              <label className="space-y-1"><span className="text-[10px] text-gold">입금일</span>
                <input type="date" value={r.paidDate ?? ""} onChange={e => set(i, { paidDate: e.target.value || null })} className={`${inputCls} border-gold/40`} /></label>
              <button type="button" onClick={() => setDraft(d => d!.filter((_, k) => k !== i))} className="text-[11px] text-gray-500 hover:text-signal-red py-1.5 px-1">삭제</button>
              <label className="space-y-1 col-span-2 sm:col-span-6"><span className="text-[10px] text-gray-500">메모</span>
                <input value={r.memo ?? ""} placeholder="예: 중도금 대출 실행, 이체 계좌" onChange={e => set(i, { memo: e.target.value })} className={inputCls} /></label>
            </div>
          ))}
          <button type="button" onClick={() => setDraft(d => [...d!, { seq: d!.length, label: `${d!.length}차`, dueDate: new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10), amount: 0, paidAmount: 0, paidDate: null }])}
            className="w-full py-2 rounded-xl border border-dashed border-navy-border text-xs text-gray-400 hover:text-white">+ 차수 추가</button>
        </div>
      ) : (
        /* ── 납입 일정 테이블 ── */
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-navy-border/60 text-gray-500">
                {["차수", "지정일", "분양대금", "입금액", "잔여", "입금일", "상태"].map((h, i) => (
                  <th key={h} className={`py-2 px-2 font-medium whitespace-nowrap ${i === 0 ? "text-left" : i === 1 || i >= 5 ? "text-center" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withDays.map(r => {
                const partial = !r.done && r.paidAmount > 0;
                const isNext = nextDue?.seq === r.seq;
                const left = Math.max(0, r.amount - r.paidAmount);
                const st = ddayStyle(r.days, r.done);
                return (
                  <tr key={r.seq} className={`border-b border-navy-border/20 ${isNext ? "bg-gold/5" : "hover:bg-navy-sub/20"} ${r.done ? "opacity-60" : ""}`}>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {isNext && <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" />}
                        <span className={`font-semibold ${isNext ? "text-gold" : "text-gray-300"}`}>{r.label}</span>
                      </div>
                      {r.memo && <p className="text-[10px] text-gray-500 mt-0.5 max-w-[160px] truncate">{r.memo}</p>}
                    </td>
                    <td className="py-2.5 px-2 text-center text-gray-400 num whitespace-nowrap">{fmtDate(r.dueDate)}</td>
                    <td className="py-2.5 px-2 text-right font-semibold text-white num whitespace-nowrap" title={won(r.amount)}>{toUk(r.amount)}</td>
                    <td className="py-2.5 px-2 text-right num whitespace-nowrap" title={r.paidAmount ? won(r.paidAmount) : undefined}>
                      {r.paidAmount > 0 ? <span className={`font-semibold ${r.done ? "text-signal-green" : "text-gold"}`}>{toUk(r.paidAmount)}</span> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 px-2 text-right num whitespace-nowrap">
                      {left > 0 ? <span className="text-gold font-semibold">{toUk(left)}</span> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 px-2 text-center text-gray-400 num whitespace-nowrap">{r.paidDate ? fmtDate(r.paidDate) : <span className="text-gray-600">—</span>}</td>
                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                      {r.done ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-signal-green/10 border border-signal-green/30 text-signal-green">✓ 완납</span>
                      ) : partial ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-gold/10 border border-gold/30 text-gold">부분 납부</span>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${st.bg} ${st.text}`}>{r.days >= 0 ? `D-${r.days}` : `D+${-r.days}`}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy-border/60 bg-navy-sub/30">
                <td className="py-2.5 px-2 text-gray-400 font-semibold" colSpan={2}>합계</td>
                <td className="py-2.5 px-2 text-right text-white font-bold num">{toUk(total)}</td>
                <td className="py-2.5 px-2 text-right text-signal-green font-bold num">{toUk(paid)}</td>
                <td className="py-2.5 px-2 text-right text-gold font-bold num">{toUk(remain)}</td>
                <td className="py-2.5 px-2" />
                <td className="py-2.5 px-2 text-center text-[11px] text-gray-500">{paidPct.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── 다음 납부 하이라이트 ── */}
      {!draft && nextDue && (
        <div className={`p-3 rounded-xl border ${ddayStyle(nextDue.days, false).bg} flex items-center justify-between`}>
          <div>
            <p className={`text-xs font-bold ${ddayStyle(nextDue.days, false).text}`}>⏰ 다음 납부 예정</p>
            <p className="text-sm text-gray-300 font-semibold mt-0.5">{nextDue.label}</p>
            <p className="text-xs text-gray-500 num">{fmtDate(nextDue.dueDate)} · {won(Math.max(0, nextDue.amount - nextDue.paidAmount))}</p>
          </div>
          <p className={`text-3xl font-bold num ${ddayStyle(nextDue.days, false).text}`}>{nextDue.days >= 0 ? `D-${nextDue.days}` : `D+${-nextDue.days}`}</p>
        </div>
      )}
      {store === "local" && !draft && <p className="text-[10px] text-gray-600">이 브라우저에 저장된 값입니다. 다른 기기와 맞추려면 Supabase 에 supabase/payments.sql 을 실행하세요.</p>}
    </div>
  );
}
