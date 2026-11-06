"use client";

import { useCallback, useEffect, useState } from "react";
import { FiHeart, FiTrash2 } from "react-icons/fi";
import { useAuth } from "./AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useMarketPoll } from "@/lib/useMarketPoll";
import { StockLink } from "./StockModal";

interface W { code: string; name: string; market: string; price?: number; changePct?: number }

const merge = <T extends { code: string }>(cur: T[], fresh: T[]) => cur.map(w => fresh.find(x => x.code === w.code) ?? w);

export default function WatchlistPanel() {
  const { user } = useAuth();
  const [list, setList] = useState<W[]>([]);
  const [loading, setLoading] = useState(true);

  const prices = useCallback(async (items: W[]) => {
    if (!items.length) return items;
    try {
      const tickers = items.map(w => `${w.code}.${w.market || "KS"}`).join(",");
      const j = await (await fetch(`/api/stock?tickers=${encodeURIComponent(tickers)}`, { cache: "no-store" })).json();
      return items.map(w => {
        const d = j.data?.[`${w.code}.${w.market || "KS"}`];
        return d ? { ...w, price: d.price, changePct: d.changePct } : w;
      });
    } catch { return items; }
  }, []);

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (!sb || !user) return;
    const { data } = await sb.from("watchlist").select("code,name,market").eq("user_id", user.id).order("created_at", { ascending: false });
    const items = (data as W[]) ?? [];
    setList(items);
    setLoading(false);
    const p = await prices(items);
    setList(cur => merge(cur, p));
  }, [user, prices]);

  useEffect(() => { load(); }, [load]);
  // 시세만 덮어쓴다: 응답을 기다리는 사이 지운 종목이 되살아나지 않게 '지금 목록'에 값만 합친다
  useMarketPoll(async () => { const p = await prices(list); setList(cur => merge(cur, p)); }, 5_000);

  const remove = async (code: string) => {
    const sb = getBrowserSupabase();
    if (!sb || !user) return;
    await sb.from("watchlist").delete().eq("user_id", user.id).eq("code", code);
    setList(l => l.filter(w => w.code !== code));
  };

  if (loading) return <div className="card h-32 animate-pulse" />;
  if (!list.length) {
    return (
      <div className="card text-center py-10 space-y-2">
        <FiHeart className="mx-auto text-pink-400" size={22} />
        <p className="text-sm text-gray-300">아직 관심 종목이 없습니다</p>
        <p className="text-xs text-gray-500">종목 상세에서 ♥를 누르면 여기에 모입니다</p>
      </div>
    );
  }
  return (
    <ul className="card !p-0 divide-y divide-navy-border">
      {list.map(w => (
        <li key={w.code} className="flex items-center gap-3 px-4 py-3">
          <StockLink  className="flex-1 min-w-0" code={w.code}>
            <p className="text-sm font-semibold text-white truncate">{w.name}</p>
            <p className="text-[11px] text-gray-500 num">{w.code} · {w.market === "KQ" ? "코스닥" : "코스피"}</p>
          </StockLink>
          <div className="text-right num">
            <p className="text-sm text-white">{w.price != null ? `${w.price.toLocaleString("ko-KR")}원` : "—"}</p>
            {w.changePct != null && (
              <p className={`text-xs font-semibold ${w.changePct > 0 ? "text-signal-green" : w.changePct < 0 ? "text-signal-red" : "text-gray-400"}`}>
                {w.changePct > 0 ? "+" : ""}{w.changePct.toFixed(2)}%
              </p>
            )}
          </div>
          <button onClick={() => remove(w.code)} aria-label="관심 종목 삭제" className="p-2 text-gray-600 hover:text-signal-red"><FiTrash2 size={15} /></button>
        </li>
      ))}
    </ul>
  );
}
