"use client";

import { useEffect, useState, lazy, Suspense } from "react";

const StockDetailDrawer = lazy(() => import("./StockDetailDrawer"));

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
  const [drawer, setDrawer] = useState<{ code: string; market: "KS" | "KQ"; name: string } | null>(null);

  useEffect(() => {
    fetch("/api/after-hours-stocks", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.stocks) setStocks(j.stocks); })
      .finally(() => setLoading(false));
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
                <button
                  key={s.code}
                  onClick={() => {
                    const [code, mk] = s.code.split(".");
                    setDrawer({ code, market: mk === "KQ" ? "KQ" : "KS", name: s.name });
                  }}
                  className="text-left bg-navy-card border border-navy-border rounded-xl p-3 hover:border-cyan-brand/40 transition-colors"
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
                </button>
              );
            })
        }
      </div>
      {drawer && (
        <Suspense fallback={null}>
          <StockDetailDrawer code={drawer.code} market={drawer.market} name={drawer.name} onClose={() => setDrawer(null)} />
        </Suspense>
      )}
    </section>
  );
}
