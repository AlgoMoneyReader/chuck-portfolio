"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface KrItem { code: string; name: string; regularPrice: number; extPrice: number | null; extChangePct: number | null; changePct: number }
interface UsItem {
  code: string; name: string; price: number; changePct: number; marketState: string;
  preMarketPrice: number | null; preMarketChangePct: number | null; postMarketPrice: number | null; postMarketChangePct: number | null;
  dayMarketPrice?: number | null; dayMarketChangePct?: number | null;
}

const isKrOpen = () => {
  const k = new Date(Date.now() + 9 * 3_600_000), hm = k.getUTCHours() * 100 + k.getUTCMinutes();
  return ![0, 6].includes(k.getUTCDay()) && hm >= 900 && hm < 1530;
};

// 증시 탭 '주요 종목 TOP10' — 국내는 코스피 시가총액 상위, 미국은 초대형주
export default function AfterHoursWidget({ region = "KR" }: { region?: "KR" | "US" }) {
  const [kr, setKr] = useState<KrItem[]>([]);
  const [us, setUs] = useState<UsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const url = region === "KR" ? "/api/after-hours-stocks" : `/api/market-us?type=mega&index=SP500`;
    return fetch(url, { cache: "no-store" }).then(r => r.ok ? r.json() : null)
      .then(j => { if (region === "KR" && j?.stocks) setKr(j.stocks); if (region === "US" && j?.stocks) setUs(j.stocks); })
      .finally(() => setLoading(false));
  }, [region]);

  useEffect(() => {
    setLoading(true); load();
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, region === "KR" && isKrOpen() ? 15_000 : 60_000);
    return () => clearInterval(iv);
  }, [load, region]);

  const tone = (v: number) => (v > 0 ? "text-signal-green" : v < 0 ? "text-signal-red" : "text-gray-400");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">{region === "KR" ? "코스피 시가총액 TOP10" : "미국 초대형주 TOP10"}</h2>
        <Link href={`/flow?m=${region === "KR" ? "kr" : "us"}`} className="text-xs text-gray-400 hover:text-cyan-brand">더보기 ›</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {loading
          ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-[72px] bg-navy-card border border-navy-border rounded-xl animate-pulse" />)
          : region === "KR"
          ? kr.map(s => (
              <Link key={s.code} href={`/stock/${s.code.split(".")[0]}`}
                className="block bg-navy-card border border-navy-border rounded-xl p-3 hover:border-cyan-brand/40 transition-colors">
                <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                <p className={`text-base font-bold num mt-0.5 ${tone(s.changePct)}`}>{s.regularPrice.toLocaleString("ko-KR")}</p>
                <p className={`text-xs font-semibold num ${tone(s.changePct)}`}>{s.changePct > 0 ? "▲" : s.changePct < 0 ? "▼" : ""} {Math.abs(s.changePct).toFixed(2)}%</p>
              </Link>
            ))
          : us.map(s => {
              const day = s.dayMarketPrice != null, pre = !day && s.preMarketPrice != null && s.marketState === "PRE", post = !day && !pre && s.postMarketPrice != null;
              const ep = day ? s.dayMarketPrice : pre ? s.preMarketPrice : post ? s.postMarketPrice : null;
              const ec = day ? s.dayMarketChangePct : pre ? s.preMarketChangePct : post ? s.postMarketChangePct : null;
              return (
                <Link key={s.code} href={`/analyze?ticker=${encodeURIComponent(s.code)}&name=${encodeURIComponent(s.name)}`}
                  className="block bg-navy-card border border-navy-border rounded-xl p-3 hover:border-cyan-brand/40 transition-colors">
                  <p className="text-xs font-semibold text-white truncate">{s.name} <span className="text-gray-500 font-normal">{s.code}</span></p>
                  <p className={`text-base font-bold num mt-0.5 ${tone(s.changePct)}`}>${s.price.toFixed(2)}</p>
                  <p className={`text-xs font-semibold num ${tone(s.changePct)}`}>{s.changePct > 0 ? "▲" : s.changePct < 0 ? "▼" : ""} {Math.abs(s.changePct).toFixed(2)}%</p>
                  {ep != null && ec != null && (
                    <p className="text-[10px] num mt-0.5 truncate">
                      <span className={day ? "text-cyan-brand" : pre ? "text-amber-300" : "text-purple-300"}>{day ? "데이" : pre ? "프리" : "애프터"}</span>{" "}
                      <span className="text-gray-300">${ep.toFixed(2)}</span> <span className={tone(ec)}>{ec > 0 ? "+" : ""}{ec.toFixed(2)}%</span>
                    </p>
                  )}
                </Link>
              );
            })}
      </div>
    </section>
  );
}
