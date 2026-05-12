/**
 * GET /api/stock-search?q=검색어
 *
 * 검색 전략 (블로킹 없음):
 *  1. KIS 마스터 캐시가 이미 적재됐으면 → 로컬 필터 즉시 반환
 *  2. 캐시 미적재(초기 로드 중) → Yahoo Finance 라이브 검색으로 직행
 *
 * ★ getKisMaster() 대신 getKisMasterCached() 사용 → 절대 블로킹 없음
 *    KIS API 순회가 완료되기 전에도 Yahoo Finance로 즉각 응답
 */

import { NextResponse } from "next/server";
import { getKisMasterCached } from "@/lib/fetchKisMaster";

export const dynamic = "force-dynamic";

interface SearchResult {
  code: string;
  name: string;
  market: "KS" | "KQ";
  type: string;
}

interface YFQuote {
  symbol: string;
  quoteType?: string;
  shortname?: string;
  longname?: string;
}

async function yahooSearch(q: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(q)}&lang=ko-KR&region=KR` +
      `&quotesCount=15&newsCount=0&enableFuzzyQuery=false`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const quotes: YFQuote[] = json?.quotes ?? [];
    return quotes
      .filter(
        (q) => q.symbol?.endsWith(".KS") || q.symbol?.endsWith(".KQ")
      )
      .map((q) => ({
        code: q.symbol.replace(/\.(KS|KQ)$/, ""),
        name: q.shortname ?? q.longname ?? q.symbol,
        market: (q.symbol.endsWith(".KS") ? "KS" : "KQ") as "KS" | "KQ",
        type: q.quoteType === "ETF" ? "etf" : "regular",
      }));
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json([]);

  const lq = q.toLowerCase();

  // ── 1. KIS 캐시가 이미 있으면 → 로컬 필터 즉시 (0ms) ─────────────────────
  const cached = getKisMasterCached(["regular", "etf"]);
  if (cached) {
    const localHits: SearchResult[] = cached
      .filter(
        (s) =>
          s.type !== "spac" &&
          s.type !== "preferred" &&
          (s.name.toLowerCase().includes(lq) || s.code.includes(lq))
      )
      .slice(0, 10)
      .map((s) => ({ code: s.code, name: s.name, market: s.market, type: s.type }));

    if (localHits.length >= 10) {
      return NextResponse.json(localHits, {
        headers: { "Cache-Control": "no-store", "X-Source": "kis-cache" },
      });
    }

    // 부족하면 Yahoo Finance 보완
    const masterCodes = new Set(cached.map((s) => s.code));
    const yfExtra = (await yahooSearch(q)).filter(
      (r) => !masterCodes.has(r.code)
    );

    return NextResponse.json([...localHits, ...yfExtra].slice(0, 10), {
      headers: { "Cache-Control": "no-store", "X-Source": "kis-cache+yf" },
    });
  }

  // ── 2. 캐시 미적재 → Yahoo Finance 직행 (블로킹 없음) ─────────────────────
  const yfResults = await yahooSearch(q);
  return NextResponse.json(yfResults.slice(0, 10), {
    headers: { "Cache-Control": "no-store", "X-Source": "yf-only" },
  });
}
