"use client";

import { useEffect, useState } from "react";

interface Q { price: number; changePct: number }
type Market = Partial<Record<"kospi" | "kosdaq" | "sp500" | "nasdaq" | "dow" | "usdKrw" | "nqFut" | "gold" | "oil", Q | null>>;
interface Headline { title: string; url: string; source: string }

const ITEMS: [keyof Market, string, number][] = [
  ["kospi", "코스피", 2], ["kosdaq", "코스닥", 2], ["sp500", "S&P500", 2], ["nasdaq", "나스닥", 2], ["dow", "다우", 2],
  ["nqFut", "나스닥선물", 2], ["usdKrw", "원/달러", 2], ["gold", "금", 1], ["oil", "WTI", 2],
];

function Chg({ p }: { p: number }) {
  return <span className={p >= 0 ? "text-signal-green" : "text-signal-red"}>{p >= 0 ? "▲" : "▼"}{Math.abs(p).toFixed(2)}%</span>;
}

export default function MarketTicker() {
  const [m, setM] = useState<Market>({});
  const [btc, setBtc] = useState<Q | null>(null);
  const [news, setNews] = useState<Headline[]>([]);

  useEffect(() => {
    const loadMarket = () => {
      fetch("/api/market", { cache: "no-store" }).then(r => r.json()).then(setM).catch(() => {});
      fetch("/api/crypto-prices", { cache: "no-store" }).then(r => r.json()).then(j => j?.btc && setBtc(j.btc)).catch(() => {});
    };
    const loadNews = () => fetch("/api/news-feed", { cache: "no-store" }).then(r => r.json())
      .then(j => setNews((j.items ?? []).slice(0, 5))).catch(() => {});
    loadMarket(); loadNews();
    const a = setInterval(loadMarket, 60_000), b = setInterval(loadNews, 5 * 60_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  const quotes = ITEMS.flatMap(([k, label, d]) => {
    const q = m[k];
    return q ? [{ label, text: q.price.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }), p: q.changePct }] : [];
  });
  if (btc?.price) quotes.push({ label: "비트코인", text: `$${Math.round(btc.price).toLocaleString("en-US")}`, p: btc.changePct });
  if (!quotes.length && !news.length) return <div className="h-8 border-b border-navy-border bg-navy-sub/60" />;

  const row = (
    <div className="flex items-center gap-6 pr-6 shrink-0">
      {quotes.map(q => (
        <span key={q.label} className="flex items-center gap-1.5 text-xs whitespace-nowrap num">
          <span className="text-gray-400">{q.label}</span>
          <span className="text-white font-semibold">{q.text}</span>
          <Chg p={q.p} />
        </span>
      ))}
      {news.map(n => (
        <a key={n.url} href={n.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs whitespace-nowrap hover:text-white">
          <span className="text-gold">●</span>
          <span className="text-gray-300">{n.title}</span>
          <span className="text-gray-600">{n.source}</span>
        </a>
      ))}
    </div>
  );

  return (
    <div className="ticker relative h-8 overflow-hidden border-b border-navy-border bg-navy-sub/60 flex items-center" aria-label="시세·뉴스 티커">
      <div className="ticker-track flex w-max">
        {row}
        <div aria-hidden className="flex">{row}</div>
      </div>
    </div>
  );
}
