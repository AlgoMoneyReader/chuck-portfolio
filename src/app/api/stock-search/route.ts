import { NextResponse } from "next/server";
import { STOCK_MASTER } from "@/lib/stockMaster";

export const dynamic = "force-dynamic";

// Fast local lookup map (Korean names take priority over YF English names)
const masterMap = new Map(STOCK_MASTER.map(s => [`${s.code}.${s.market}`, s]));

interface YFQuote {
  symbol: string;
  quoteType?: string;
  shortname?: string;
  longname?: string;
}

interface SearchResult {
  code: string;
  name: string;
  market: "KS" | "KQ";
  type: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json([]);

  // 1. Local master fast-path (Korean names, instant)
  const lq = q.toLowerCase();
  const localHits: SearchResult[] = STOCK_MASTER
    .filter(s =>
      s.type !== "spac" && s.type !== "preferred" &&
      (s.name.toLowerCase().includes(lq) || s.code.includes(lq))
    )
    .slice(0, 10)
    .map(s => ({ code: s.code, name: s.name, market: s.market, type: s.type }));

  if (localHits.length >= 5) {
    return NextResponse.json(localHits, { headers: { "Cache-Control": "no-store" } });
  }

  // 2. Yahoo Finance live search (covers all stocks including small-caps & ETF)
  try {
    const yfUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=ko-KR&region=KR&quotesCount=15&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
    const yfRes = await fetch(yfUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Accept: "application/json" },
      cache: "no-store",
    });

    const yfResults: SearchResult[] = [];
    if (yfRes.ok) {
      const yfJson = await yfRes.json();
      const quotes: YFQuote[] = yfJson?.quotes ?? [];
      for (const item of quotes) {
        if (!item.symbol?.endsWith(".KS") && !item.symbol?.endsWith(".KQ")) continue;
        const master = masterMap.get(item.symbol);
        const code = item.symbol.replace(/\.(KS|KQ)$/, "");
        const market = item.symbol.endsWith(".KS") ? "KS" as const : "KQ" as const;
        yfResults.push({
          code,
          name: master?.name || item.shortname || item.longname || code,
          market,
          type: master?.type ?? (item.quoteType === "ETF" ? "etf" : "regular"),
        });
      }
    }

    // Merge: local results first, then YF-only results
    const localCodes = new Set(localHits.map(s => s.code));
    const merged = [
      ...localHits,
      ...yfResults.filter(r => !localCodes.has(r.code)),
    ].slice(0, 10);

    return NextResponse.json(merged, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(localHits, { headers: { "Cache-Control": "no-store" } });
  }
}
