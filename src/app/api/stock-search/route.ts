/**
 * GET /api/stock-search?q=검색어
 *
 * 검색 전략:
 *  1. 정적 마스터(stock_master.json) 로컬 필터 — 0ms, KIS API 호출 없음
 *  2. 결과 10개 미만 → Yahoo Finance 보완 (영문명/코드 검색용)
 *
 * KIS API 호출 완전 없음 — rate limit 무관
 */

import { NextResponse } from "next/server";
import stockMaster from "@/data/stock_master.json";

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
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const quotes: YFQuote[] = json?.quotes ?? [];
    return quotes
      .filter((q) => q.symbol?.endsWith(".KS") || q.symbol?.endsWith(".KQ"))
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

// 정적 마스터 (서버 모듈 레벨에서 1회 초기화)
const MASTER = (stockMaster.stocks as SearchResult[]).filter(
  (s) => s.type !== "spac" && s.type !== "preferred"
);
const MASTER_CODES = new Set(MASTER.map((s) => s.code));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json([]);

  const lq = q.toLowerCase();

  // 1. 정적 마스터 로컬 필터 (0ms)
  const localHits = MASTER
    .filter((s) =>
      (s.name?.toLowerCase() ?? "").includes(lq) || (s.code ?? "").includes(lq)
    )
    .slice(0, 10);

  if (localHits.length >= 10) {
    return NextResponse.json(localHits, {
      headers: { "Cache-Control": "no-store", "X-Source": "static-master" },
    });
  }

  // 2. Yahoo Finance 보완 (코드/영문명 검색 커버리지 확장)
  const yfExtra = (await yahooSearch(q)).filter((r) => !MASTER_CODES.has(r.code));

  return NextResponse.json([...localHits, ...yfExtra].slice(0, 10), {
    headers: { "Cache-Control": "no-store", "X-Source": "static-master+yf" },
  });
}
