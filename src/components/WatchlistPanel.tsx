"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiHeart, FiTrash2 } from "react-icons/fi";
import { useAuth } from "./AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useMarketPoll } from "@/lib/useMarketPoll";
import { StockLink } from "./StockModal";

// 관심 종목 = '내 종목 브리핑': 오늘 요약 + 종목별 시세 · AI 한 줄 이유 · 오늘 외국인 수급(국내)
interface W { code: string; name: string; market: string; price?: number; changePct?: number }
interface Extra { why?: string; foreign?: number | null; flowLabel?: string }

const merge = <T extends { code: string }>(cur: T[], fresh: T[]) => cur.map(w => fresh.find(x => x.code === w.code) ?? w);
const isUS = (w: W) => w.market === "US";
const isAsia = (w: W) => w.market.startsWith("ASIA");
const tickerOf = (w: W) => (isUS(w) || isAsia(w) ? w.code : `${w.code}.${w.market || "KS"}`);
const tone = (v?: number | null) => (v == null ? "text-gray-400" : v > 0 ? "text-signal-green" : v < 0 ? "text-signal-red" : "text-gray-400");
const eok = (v: number) => (Math.abs(v) >= 10000 ? `${v >= 0 ? "+" : "-"}${(Math.abs(v) / 10000).toFixed(1)}조` : `${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString("ko-KR")}억`);
const mktLabel = (w: W) => (isUS(w) ? "미국" : isAsia(w) ? "아시아" : w.market === "KQ" ? "코스닥" : "코스피");
const money = (w: W) => (w.price == null ? "—" : isUS(w) ? `$${w.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : isAsia(w) ? w.price.toLocaleString("en-US", { maximumFractionDigits: 2 }) : `${Math.round(w.price).toLocaleString("ko-KR")}원`);

export default function WatchlistPanel() {
  const { user } = useAuth();
  const [list, setList] = useState<W[]>([]);
  const [extra, setExtra] = useState<Record<string, Extra>>({});
  const [loading, setLoading] = useState(true);
  const asked = useRef(new Set<string>());

  const prices = useCallback(async (items: W[]) => {
    if (!items.length) return items;
    try {
      const j = await (await fetch(`/api/stock?tickers=${encodeURIComponent(items.map(tickerOf).join(","))}`, { cache: "no-store" })).json();
      return items.map(w => { const d = j.data?.[tickerOf(w)]; return d ? { ...w, price: d.price, changePct: d.changePct } : w; });
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

  // 종목별 AI 한 줄 이유(뉴스 기반, 한 번만) + 오늘 외국인 수급(국내, 2분마다)
  useEffect(() => {
    list.filter(w => w.changePct != null && !asked.current.has(w.code)).slice(0, 20).forEach(w => {
      asked.current.add(w.code);
      fetch(`/api/stock-news-summary?ticker=${encodeURIComponent(tickerOf(w))}&name=${encodeURIComponent(w.name)}&changePct=${w.changePct}`)
        .then(r => r.json()).then(j => { if (j?.summary && !j.heuristic) setExtra(e => ({ ...e, [w.code]: { ...e[w.code], why: j.summary } })); }).catch(() => {});
    });
  }, [list]);
  const loadFlows = useCallback(() => {
    list.filter(w => !isUS(w) && !isAsia(w)).slice(0, 15).forEach(w => {
      fetch(`/api/stock-flow-live?code=${w.code}`, { cache: "no-store" }).then(r => r.json()).then(f => {
        const v = f?.foreignEok ?? f?.globalEok;
        if (v != null) setExtra(e => ({ ...e, [w.code]: { ...e[w.code], foreign: v, flowLabel: f.final ? "확정" : f.foreignEok != null ? "가집계" : "추정" } }));
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map(w => w.code).join(",")]);
  useEffect(() => { loadFlows(); }, [loadFlows]);
  useMarketPoll(loadFlows, 120_000);

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

  // 오늘 요약
  const priced = list.filter(w => w.changePct != null);
  const upN = priced.filter(w => w.changePct! > 0).length, downN = priced.filter(w => w.changePct! < 0).length;
  const avg = priced.length ? priced.reduce((s, w) => s + w.changePct!, 0) / priced.length : null;
  const best = priced.length ? priced.reduce((a, b) => (b.changePct! > a.changePct! ? b : a)) : null;
  const worst = priced.length ? priced.reduce((a, b) => (b.changePct! < a.changePct! ? b : a)) : null;
  const pctTxt = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

  return (
    <div className="space-y-3">
      <section className="card !py-3.5">
        <p className="text-xs font-semibold text-gray-400">오늘 내 관심 종목</p>
        <div className="mt-2 flex items-end gap-4 flex-wrap">
          <div>
            <p className="text-[11px] text-gray-500">평균 등락</p>
            <p className={`text-xl font-bold num ${tone(avg)}`}>{avg == null ? "—" : pctTxt(avg)}</p>
          </div>
          <div className="text-xs text-gray-400 num pb-1">
            <span className="text-signal-green font-semibold">▲ {upN}</span> · <span className="text-signal-red font-semibold">▼ {downN}</span> · 전체 {list.length}
          </div>
        </div>
        {best && worst && best.code !== worst.code && (
          <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
            <StockLink code={best.code} className="rounded-lg bg-navy-sub px-2.5 py-2 min-w-0">
              <p className="text-[10px] text-gray-500">가장 많이 오름</p>
              <p className="text-white font-semibold truncate">{best.name} <span className={`num ${tone(best.changePct)}`}>{pctTxt(best.changePct!)}</span></p>
            </StockLink>
            <StockLink code={worst.code} className="rounded-lg bg-navy-sub px-2.5 py-2 min-w-0">
              <p className="text-[10px] text-gray-500">가장 많이 내림</p>
              <p className="text-white font-semibold truncate">{worst.name} <span className={`num ${tone(worst.changePct)}`}>{pctTxt(worst.changePct!)}</span></p>
            </StockLink>
          </div>
        )}
      </section>

      <ul className="card !p-0 divide-y divide-navy-border">
        {list.map(w => {
          const x = extra[w.code];
          return (
            <li key={w.code} className="flex items-center gap-3 px-4 py-3">
              <StockLink className="flex-1 min-w-0" code={w.code}>
                <p className="text-sm font-semibold text-white truncate">{w.name}</p>
                <p className="text-[11px] text-gray-500 num truncate">
                  {w.code} · {mktLabel(w)}
                  {x?.why && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-cyan-brand/10 text-cyan-brand text-[10px] font-semibold">{x.why}</span>}
                </p>
              </StockLink>
              <div className="text-right num shrink-0">
                <p key={`${w.code}-${w.price}`} className="text-sm text-white rounded animate-tick">{money(w)}</p>
                {w.changePct != null && <p className={`text-xs font-semibold ${tone(w.changePct)}`}>{pctTxt(w.changePct)}</p>}
                {x?.foreign != null && <p className="text-[10px] text-gray-500">외국인 <span className={tone(x.foreign)}>{eok(x.foreign)}</span></p>}
              </div>
              <button onClick={() => remove(w.code)} aria-label="관심 종목 삭제" className="p-2 text-gray-600 hover:text-signal-red"><FiTrash2 size={15} /></button>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-gray-600 px-1">AI 한 줄은 그 종목 최신 뉴스 요약 · 외국인은 오늘 장중 가집계(마감 후 확정치), 투자 권유가 아닙니다</p>
    </div>
  );
}
