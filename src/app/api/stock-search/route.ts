/**
 * GET /api/stock-search?q=검색어
 *
 * 검색 우선순위:
 *  1. KIS 전종목 마스터 (2,000개+) 서버 캐시 필터 — 즉시 반환
 *  2. Yahoo Finance 라이브 검색 — KIS 마스터에 없는 신규 상장·소형주 보완
 *
 * Ticker 포맷 정책 (이 파일 전체 준수):
 *  응답 code = 6자리 숫자 문자열  ← UI 표시 기준
 *  Yahoo Finance 심볼(.KS/.KQ)은 내부 전용, 응답에 노출 안 함
 */

import { NextResponse } from "next/server";
import { getKisMaster } from "@/lib/fetchKisMaster";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json([]);

  const lq = q.toLowerCase();
  let localHits: SearchResult[] = [];
  let masterCodes = new Set<string>();

  // ── 1. KIS 전종목 마스터 로컬 필터 ─────────────────────────────────────────
  try {
    const master = await getKisMaster(["regular", "etf"]);
    masterCodes = new Set(master.map((s) => s.code));

    localHits = master
      .filter(
        (s) =>
          s.type !== "spac" &&
          s.type !== "preferred" &&
          (s.name.toLowerCase().includes(lq) || s.code.includes(lq))
      )
      .slice(0, 10)
      .map((s) => ({
        code: s.code,
        name: s.name,
        market: s.market,
        type: s.type,
      }));

    if (localHits.length >= 10) {
      return NextResponse.json(localHits, {
        headers: { "Cache-Control": "no-store" },
      });
    }
  } catch {
    // KIS 미설정 환경 → Yahoo Finance 단독 검색
  }

  // ── 2. Yahoo Finance 보완 ────────────────────────────────────────────────────
  const localCodes = new Set(localHits.map((s) => s.code));

  try {
    const yfUrl =
      `https://query2.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(q)}&lang=ko-KR&region=KR` +
      `&quotesCount=15&newsCount=0&enableFuzzyQuery=false`;

    const yfRes = await fetch(yfUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const yfResults: SearchResult[] = [];
    if (yfRes.ok) {
      const yfJson = await yfRes.json();
      const quotes: YFQuote[] = yfJson?.quotes ?? [];

      for (const item of quotes) {
        if (!item.symbol?.endsWith(".KS") && !item.symbol?.endsWith(".KQ"))
          continue;
        const code = item.symbol.replace(/\.(KS|KQ)$/, "");
        const market: "KS" | "KQ" = item.symbol.endsWith(".KS") ? "KS" : "KQ";
        if (localCodes.has(code) || masterCodes.has(code)) continue;

        yfResults.push({
          code,
          name: item.shortname ?? item.longname ?? code,
          market,
          type: item.quoteType === "ETF" ? "etf" : "regular",
        });
      }
    }

    return NextResponse.json([...localHits, ...yfResults].slice(0, 10), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(localHits, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
