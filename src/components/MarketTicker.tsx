"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

interface Q { price: number; changePct: number }
type Market = Record<string, Q | null | undefined>;
interface Headline { title: string; url: string; source: string }

// [시세 키, 표시 이름, 소수 자릿수, 차트 모달 라벨]
const GROUPS: { name: string; items: [string, string, number, string][] }[] = [
  { name: "지수", items: [
    ["kospi", "코스피", 2, "KOSPI"], ["kosdaq", "코스닥", 2, "KOSDAQ"], ["sp500", "S&P500", 2, "S&P 500"],
    ["nasdaq", "나스닥", 2, "NASDAQ"], ["dow", "다우", 2, "다우존스"], ["russell", "러셀2000", 2, "러셀 2000"],
    ["sox", "필라델피아반도체", 2, "필라델피아 반도체"],
  ] },
  { name: "선물", items: [["esFut", "S&P선물", 2, "S&P500 선물"], ["nqFut", "나스닥선물", 2, "나스닥 선물"], ["yjFut", "다우선물", 0, "다우 선물"]] },
  { name: "원자재", items: [["gold", "금", 1, "금"], ["oil", "WTI", 2, "WTI 원유"]] },
  { name: "환율", items: [["usdKrw", "원/달러", 2, "USD/KRW"]] },
];

export const OPEN_CHART_EVENT = "alliknam:open-chart";

function Chg({ p }: { p: number }) {
  return <span className={p >= 0 ? "text-signal-green" : "text-signal-red"}>{p >= 0 ? "▲" : "▼"}{Math.abs(p).toFixed(2)}%</span>;
}

function Track({ children, seconds }: { children: React.ReactNode; seconds: number }) {
  return (
    <div className="ticker relative h-7 overflow-hidden flex items-center">
      <div className="ticker-track flex w-max" style={{ animationDuration: `${seconds}s` }}>
        <div className="flex items-center gap-5 pr-5 shrink-0">{children}</div>
        <div aria-hidden className="flex items-center gap-5 pr-5 shrink-0">{children}</div>
      </div>
    </div>
  );
}

export default function MarketTicker() {
  const [m, setM] = useState<Market>({});
  const [btc, setBtc] = useState<Q | null>(null);
  const [news, setNews] = useState<Headline[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const loadMarket = () => {
      fetch("/api/market", { cache: "no-store" }).then(r => r.json()).then(setM).catch(() => {});
      fetch("/api/crypto-prices", { cache: "no-store" }).then(r => r.json()).then(j => j?.btc && setBtc(j.btc)).catch(() => {});
    };
    const loadNews = () => fetch("/api/news-feed", { cache: "no-store" }).then(r => r.json())
      .then(j => setNews((j.items ?? []).slice(0, 8))).catch(() => {});
    loadMarket(); loadNews();
    const a = setInterval(loadMarket, 60_000), b = setInterval(loadNews, 5 * 60_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  // 지표를 누르면 해당 차트: 증시 탭이면 바로 열고, 다른 탭이면 증시 탭으로 이동해서 연다
  const openChart = (label: string) => {
    if (pathname === "/") window.dispatchEvent(new CustomEvent(OPEN_CHART_EVENT, { detail: label }));
    else router.push(`/?chart=${encodeURIComponent(label)}`);
  };

  const groups = GROUPS.map(g => ({
    name: g.name,
    items: g.items.flatMap(([k, label, d, chart]) => {
      const q = m[k];
      return q ? [{ label, chart, text: q.price.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }), p: q.changePct }] : [];
    }),
  })).filter(g => g.items.length);

  return (
    <div className="border-b border-navy-border bg-navy-sub/95 backdrop-blur-md">
      <Track seconds={60}>
        {groups.map(g => (
          <span key={g.name} className="flex items-center gap-4">
            <span className="text-[10px] text-gold/80 font-semibold whitespace-nowrap">{g.name}</span>
            {g.items.map(q => (
              <button key={q.label} onClick={() => openChart(q.chart)} className="flex items-center gap-1.5 text-xs whitespace-nowrap num hover:opacity-80">
                <span className="text-gray-400">{q.label}</span>
                <span className="text-white font-semibold">{q.text}</span>
                <Chg p={q.p} />
              </button>
            ))}
          </span>
        ))}
        {btc?.price ? (
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap num">
            <span className="text-[10px] text-gold/80 font-semibold">코인</span>
            <span className="text-gray-400">비트코인</span>
            <span className="text-white font-semibold">${Math.round(btc.price).toLocaleString("en-US")}</span>
            <Chg p={btc.changePct} />
          </span>
        ) : null}
      </Track>
      {news.length > 0 && (
        <div className="border-t border-navy-border/60">
          <Track seconds={90}>
            {news.map(n => (
              <a key={n.url} href={n.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs whitespace-nowrap hover:text-white">
                <span className="text-gold">●</span>
                <span className="text-gray-200">{n.title}</span>
                <span className="text-gray-600">{n.source}</span>
              </a>
            ))}
          </Track>
        </div>
      )}
    </div>
  );
}
