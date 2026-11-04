"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiBriefcase, FiX } from "react-icons/fi";
import { useAuth } from "./AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";

// 종목 상세에서 바로 My 포트폴리오(보유 종목)에 담기
export default function AddToPortfolio({ code, name, market, price }: { code: string; name: string; market: string; price?: number | null }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const start = () => {
    if (!user || !profile) { router.push(`/me?next=/stock/${code}`); return; }
    setAvg(price ? String(price) : ""); setQty(""); setMsg(""); setOpen(true);
  };

  const save = async () => {
    const q = Number(qty), a = Number(avg);
    if (!(q > 0) || !(a > 0)) { setMsg("수량과 평단가를 입력해 주세요"); return; }
    const sb = getBrowserSupabase();
    if (!sb || !user) return;
    setSaving(true);
    const { data } = await sb.from("portfolios").select("holdings").eq("user_id", user.id).maybeSingle();
    const list = ((data?.holdings ?? []) as { ticker: string; qty: number; avg_price: number }[]);
    const ticker = `${code}.${market}`;
    const i = list.findIndex(h => h.ticker === ticker);
    let next;
    if (i >= 0) {
      // 이미 있으면 물타기처럼 수량 합치고 평단 가중평균
      const h = list[i], tq = h.qty + q;
      next = list.map((x, k) => k === i ? { ...x, qty: tq, avg_price: Math.round((h.qty * h.avg_price + q * a) / tq) } : x);
    } else {
      next = [...list, { id: `${Date.now()}`, ticker, name, qty: q, avg_price: a, currency: "KRW", sector: "기타" }];
    }
    const { error } = await sb.from("portfolios").upsert({ user_id: user.id, holdings: next, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { setMsg("저장 실패: " + error.message); return; }
    setOpen(false);
    router.push("/portfolio");
  };

  return (
    <>
      <button onClick={start} aria-label="내 포트폴리오에 추가" title="내 포트폴리오에 추가"
        className="w-10 h-10 rounded-full flex items-center justify-center bg-navy-card text-gray-400 hover:text-gold">
        <FiBriefcase size={17} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="w-full sm:max-w-sm bg-navy-card border border-navy-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-white">{name} 포트폴리오에 담기</p>
              <button onClick={() => setOpen(false)} className="text-gray-500"><FiX size={20} /></button>
            </div>
            <label className="block text-xs text-gray-400">수량(주)
              <input inputMode="numeric" value={qty} onChange={e => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
                className="mt-1 w-full h-11 rounded-lg bg-navy-sub border border-navy-border px-3 text-white num" placeholder="10" />
            </label>
            <label className="block text-xs text-gray-400">평단가(원)
              <input inputMode="numeric" value={avg} onChange={e => setAvg(e.target.value.replace(/[^0-9.]/g, ""))}
                className="mt-1 w-full h-11 rounded-lg bg-navy-sub border border-navy-border px-3 text-white num" />
            </label>
            {msg && <p className="text-xs text-signal-red">{msg}</p>}
            <button onClick={save} disabled={saving} className="w-full h-11 rounded-xl bg-gold text-navy font-bold disabled:opacity-50">
              {saving ? "저장 중…" : "담기"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
