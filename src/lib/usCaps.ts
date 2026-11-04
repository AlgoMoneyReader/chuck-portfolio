import { unstable_cache } from "next/cache";
import universe from "@/data/us_universe.json";

type Info = { n: string; sec: string; ind: string; idx: string[] };
export const US_TICKERS = (universe as { tickers: Record<string, Info> }).tickers;
const TICKERS = US_TICKERS;
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export interface NasdaqQuote { pct: number; cap: number; price: number }
type Quote = NasdaqQuote;

// 나스닥 전 종목 스크리너: 시가총액(칸 크기)용. 등락률은 장 마감 후에도 한동안 전날 값이 남아 있어 쓰지 않는다(6시간 캐시)
export const nasdaqQuotes = unstable_cache(async (): Promise<Record<string, Quote>> => {
  const res = await fetch("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`nasdaq HTTP ${res.status}`);
  const j = await res.json();
  const rows = (j?.data?.rows ?? []) as Record<string, string>[];
  const want = new Map(Object.keys(TICKERS).map(s => [norm(s), s]));
  const out: Record<string, Quote> = {};
  for (const r of rows) {
    const sym = want.get(norm(r.symbol ?? ""));
    if (!sym) continue;
    const pct = parseFloat(String(r.pctchange ?? "").replace(/[%,]/g, ""));
    const cap = parseFloat(String(r.marketCap ?? "").replace(/[$,]/g, ""));
    const price = parseFloat(String(r.lastsale ?? "").replace(/[$,]/g, ""));
    if (!isNaN(pct)) out[sym] = { pct, cap: isNaN(cap) ? 0 : cap, price: isNaN(price) ? 0 : price };
  }
  if (Object.keys(out).length < 100) throw new Error(`nasdaq rows ${rows.length}, matched ${Object.keys(out).length}`);
  return out;
}, ["us-heatmap-nasdaq-v1"], { revalidate: 6 * 3600 });
