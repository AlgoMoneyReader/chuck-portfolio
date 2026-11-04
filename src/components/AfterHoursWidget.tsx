"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface StockItem {
  code: string;
  name: string;
  regularPrice: number;
  extPrice: number | null;
  extChangePct: number | null;
  changePct: number;
  marketState: string;
}

export default function AfterHoursWidget() {
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => fetch("/api/after-hours-stocks", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.stocks) setStocks(j.stocks); })
      .finally(() => setLoading(false));
    load();
    // 장중 30초, 그 외 5분마다 갱신
    let iv: ReturnType<typeof setInterval>;
    const schedule = () => {
      const k = new Date(Date.now() + 9 * 3_600_000);
      const hm = k.getUTCHours() * 100 + k.getUTCMinutes();
      const open = ![0, 6].includes(k.getUTCDay()) && hm >= 900 && hm < 1530;
      iv = setInterval(load, open ? 30_000 : 300_000);
    };
    schedule();
    return () => clearInterval(iv);
  }, []);

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">주요 종목 시세</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-navy-card border border-navy-border rounded-xl animate-pulse" />
            ))
          : stocks.map(s => {
              const displayPrice = s.extPrice ?? s.regularPrice;
              const displayPct   = s.extChangePct ?? s.changePct;
              const isPos        = displayPct >= 0;
              const colorCls     = isPos ? "text-signal-green" : "text-signal-red";
              const hasExt       = s.extPrice != null && s.extChangePct != null;
              return (
                <Link
                  key={s.code}
                  href={`/stock/${s.code.split(".")[0]}`}
                  className="block bg-navy-card border border-navy-border rounded-xl p-3 hover:border-cyan-brand/40 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-white truncate">{s.name}</span>
                    {hasExt && (
                      <span className="text-[10px] text-gold/80 ml-1 shrink-0">시간외</span>
                    )}
                  </div>
                  <p className={`text-base font-bold num ${colorCls}`}>
                    {displayPrice.toLocaleString("ko-KR")}
                  </p>
                  <p className={`text-xs font-semibold num ${colorCls}`}>
                    {isPos ? "▲" : "▼"} {Math.abs(displayPct).toFixed(2)}%
                  </p>
                  {hasExt && s.regularPrice > 0 && (
                    <p className="text-xs text-gray-600 mt-0.5 num">
                      종가 {s.regularPrice.toLocaleString("ko-KR")}
                    </p>
                  )}
                </Link>
              );
            })
        }
      </div>
    </section>
  );
}
