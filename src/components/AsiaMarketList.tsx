"use client";

import { useCallback, useEffect, useState } from "react";
import { ASIA_MARKETS, type AsiaMkt } from "@/data/asiaStocks";
import { useStockModal } from "./StockModal";
import { Pills, useQueryTab } from "./Segmented";

interface Row { rank: number; code: string; name: string; price: number; change?: number; changePct: number; volume: number; amount: number; foreignNet?: number | null }
interface Flow { date: string | null; foreign: number; trust: number; dealer: number }
type ListType = "cap" | "gainers" | "losers" | "amount" | "foreign";

// 금액 축약 (현지 통화): 1.2조 / 3,450억 / 820만
const big = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e12) return `${s}${(a / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}조`;
  if (a >= 1e8) return `${s}${Math.round(a / 1e8).toLocaleString("ko-KR")}억`;
  if (a >= 1e4) return `${s}${Math.round(a / 1e4).toLocaleString("ko-KR")}만`;
  return `${s}${Math.round(a).toLocaleString("ko-KR")}`;
};
const tone = (v: number) => (v > 0 ? "text-signal-green" : v < 0 ? "text-signal-red" : "text-gray-400");

function RankBadge({ rank }: { rank: number }) {
  const cls = rank === 1 ? "text-yellow-400" : rank === 2 ? "text-gray-300" : rank === 3 ? "text-amber-600" : "text-gray-600";
  return <span className={`w-5 text-center text-xs font-bold shrink-0 ${cls}`}>{rank}</span>;
}

// 매매동향 · 아시아: 일본·대만·홍콩·중국 대표 대형주 30 (대만은 외국인 순매수 포함)
export default function AsiaMarketList() {
  const [mkt, setMkt] = useQueryTab("a", ["JP", "TW", "HK", "CN"] as const, "JP");
  const [type, setType] = useState<ListType>("cap");
  const [rows, setRows] = useState<Row[]>([]);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [ts, setTs] = useState("");
  const [loading, setLoading] = useState(true);
  const open = useStockModal();
  const info = ASIA_MARKETS.find(m => m.key === mkt)!;
  const t = mkt !== "TW" && type === "foreign" ? "cap" : type;

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/market-asia?mkt=${mkt}&type=${t}&_=${Date.now()}`, { cache: "no-store" });
      const j = await r.json();
      setRows(j.stocks ?? []); setFlow(j.flow ?? null);
      setTs(j.timestamp ? new Date(j.timestamp).toLocaleTimeString("ko-KR") : "");
    } catch { /* 유지 */ } finally { setLoading(false); }
  }, [mkt, t]);

  useEffect(() => {
    setLoading(true); setRows([]); load();
    // 실시간 티커처럼 10초마다 (서버 20초 캐시)
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10_000);
    return () => clearInterval(iv);
  }, [load]);

  const types: [ListType, string][] = [["cap", "대형주 TOP30"], ["gainers", "상승"], ["losers", "하락"], ["amount", "거래대금"], ...(mkt === "TW" ? [["foreign", "외국인 순매수"] as [ListType, string]] : [])];
  const money = (v: number) => `${info.currency}${v.toLocaleString("en-US", { minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <Pills value={mkt} onChange={v => { setMkt(v); setType("cap"); }} items={ASIA_MARKETS.map(m => [m.key, `${m.flag} ${m.label}`] as [AsiaMkt, string])} />

      {mkt === "TW" && flow && (
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-bold text-white">대만 투자주체별 순매수</h3>
            <span className="text-xs text-gray-500">{flow.date ? `${flow.date.slice(4, 6)}/${flow.date.slice(6, 8)} 확정` : "최근 거래일"} · 대만달러</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {([["외국인", flow.foreign], ["투신", flow.trust], ["자기매매", flow.dealer]] as const).map(([l, v]) => (
              <div key={l} className="rounded-xl bg-navy-sub/50 px-3 py-2.5">
                <p className="text-xs text-gray-500">{l}</p>
                <p className={`text-base font-bold num mt-0.5 ${tone(v)}`}>{v > 0 ? "+" : ""}{big(v)}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-600">대만증권거래소 공개 자료 · 장 마감 후(한국시간 15~16시경) 집계됩니다</p>
        </section>
      )}

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs text-gray-400">{info.flag} {info.label} 시장 동향 <span className="text-gray-600">· {info.sub}</span></h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {types.map(([k, l]) => (
            <button key={k} onClick={() => setType(k)}
              className={`px-3.5 py-1.5 text-sm rounded-lg border whitespace-nowrap transition-all ${t === k ? "bg-white text-navy border-white font-bold" : "border-navy-border text-gray-400 hover:text-white hover:border-gray-500"}`}>{l}</button>
          ))}
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">{t === "foreign" ? "외국인 순매수 금액 순 (직전 거래일)" : "대표 대형주 30 · 시총 상위권"}</span>
          {ts && <span className="text-gray-600">{ts} 기준</span>}
        </div>
        <p className="md:hidden text-[11px] text-gray-600">← 표를 좌우로 밀면 거래대금·거래량 등이 더 보입니다</p>
        {loading ? (
          <div className="space-y-2 pt-1">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-navy-border/40 rounded animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">{t === "gainers" ? "오르는 종목이 없습니다" : t === "losers" ? "내리는 종목이 없습니다" : "데이터를 불러올 수 없습니다"}</p>
        ) : (
          <div className="overflow-x-auto scrollbar-none md:overflow-visible">
          <div className="grid items-center gap-x-3 w-max min-w-full grid-cols-[136px_100px_64px_84px_80px_104px] md:w-auto md:gap-x-4 md:grid-cols-[minmax(200px,2fr)_repeat(5,minmax(0,1fr))] py-2 text-xs text-gray-500 font-medium border-b border-navy-border/40">
            <span className="sticky left-0 z-10 bg-navy-card md:static md:bg-transparent flex gap-2"><span className="w-5 text-center">#</span>종목</span>
            <span className="text-right">현재가</span>
            <span className="text-right">등락률</span>
            <span className="text-right">{t === "foreign" || (mkt === "TW" && t === "cap") ? "외국인 순매수" : "거래대금"}</span>
            <span className="text-right">전일대비</span>
            <span className="text-right">거래량</span>
          </div>
          <div className="divide-y divide-navy-border/30">
            {rows.map(r => {
              const showForeign = t === "foreign" || (mkt === "TW" && t === "cap");
              return (
                <div key={r.code} onClick={() => open({ code: r.code, market: "US", name: r.name })}
                  className="grid items-center gap-x-3 w-max min-w-full grid-cols-[124px_92px_68px_84px_80px_104px] md:w-auto md:gap-x-4 md:grid-cols-[minmax(200px,2fr)_repeat(5,minmax(0,1fr))] py-2.5 hover:bg-navy-sub/40 cursor-pointer transition-colors group text-sm num">
                  <div className="sticky left-0 z-10 bg-navy-card md:static md:bg-transparent flex items-center gap-2 min-w-0 self-stretch">
                    <span className="w-5 shrink-0 flex justify-center"><RankBadge rank={r.rank} /></span>
                    <div className="min-w-0 py-0.5">
                      <p className="text-white font-medium leading-snug [word-break:break-all] line-clamp-2 group-hover:text-cyan-brand">{r.name}</p>
                      <p className="text-xs text-gray-600">{r.code.replace(/\.(T|TW|HK|SS|SZ)$/, "")}</p>
                    </div>
                  </div>
                  <span key={`${r.code}-d-${r.price}`} className="text-right text-white whitespace-nowrap rounded px-0.5 animate-tick">{money(r.price)}</span>
                  <span className={`text-right font-semibold whitespace-nowrap ${tone(r.changePct)}`}>{r.changePct > 0 ? "+" : r.changePct < 0 ? "-" : ""}{Math.abs(r.changePct).toFixed(2)}%</span>
                  <span className={`text-right whitespace-nowrap ${showForeign ? (r.foreignNet == null ? "text-gray-600" : tone(r.foreignNet)) : "text-gray-300"}`}>
                    {showForeign ? (r.foreignNet == null ? "—" : `${r.foreignNet > 0 ? "+" : ""}${big(r.foreignNet)}`) : r.amount ? big(r.amount) : "—"}
                  </span>
                  <span className={`text-right whitespace-nowrap ${tone(r.changePct)}`}>{r.change != null ? `${r.changePct > 0 ? "▲" : r.changePct < 0 ? "▼" : ""}${Math.abs(r.change).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}</span>
                  <span className="text-right text-gray-300 whitespace-nowrap">{r.volume ? r.volume.toLocaleString("ko-KR") : "—"}</span>
                </div>
              );
            })}
          </div>
          </div>
        )}
        <p className="text-[11px] text-gray-600">금액은 현지 통화 기준 · 시세는 거래소에 따라 약 15분 지연될 수 있습니다{mkt === "TW" ? " · 외국인은 직전 거래일 확정 순매수" : ""}</p>
      </section>
    </div>
  );
}
