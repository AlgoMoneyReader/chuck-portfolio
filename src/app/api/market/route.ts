import { NextResponse } from "next/server";

// Vercel 엣지 캐시 완전 비활성화 — 매 요청마다 새로 가져옴
export const dynamic = "force-dynamic";

// ── 네이버 금융 모바일 API (한국 지수 실시간) ──────────────────────────────
async function fetchNaverIndex(code: "KOSPI" | "KOSDAQ") {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/index/${code}/basic`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          Referer: "https://m.stock.naver.com/",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const j = await res.json();

    const price      = parseFloat(j.closePrice?.replace(/,/g, "") ?? "0");
    const change     = parseFloat(j.compareToPreviousClosePrice?.replace(/,/g, "") ?? "0");
    const changePct  = parseFloat(j.fluctuationsRatio ?? "0");
    if (!price) return null;

    return {
      price:     parseFloat(price.toFixed(2)),
      change:    parseFloat(change.toFixed(2)),
      changePct: parseFloat(changePct.toFixed(2)),
      marketState: j.marketStatus === "OPEN" ? "REGULAR" : "CLOSED",
    };
  } catch {
    return null;
  }
}

// ── Yahoo Finance v8 (미국 지수·선물·원자재·환율) ─────────────────────────
async function fetchYahoo(symbol: string) {
  try {
    // query1 / query2 를 번갈아 시도
    for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        cache: "no-store",       // ← 서버 캐시 완전 무효화
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const meta       = result.meta;
      const price      = meta.regularMarketPrice ?? meta.price;
      const prevClose  = meta.chartPreviousClose ?? meta.previousClose ?? price;
      if (!price || !prevClose) continue;

      const change    = price - prevClose;
      const changePct = (change / prevClose) * 100;

      return {
        price:     parseFloat(price.toFixed(2)),
        change:    parseFloat(change.toFixed(2)),
        changePct: parseFloat(changePct.toFixed(2)),
        marketState: meta.marketState ?? "CLOSED",
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [kospi, kosdaq, sp500, nasdaq, usdKrw, esFut, nqFut, gold, oil] =
    await Promise.all([
      fetchNaverIndex("KOSPI"),          // 네이버 실시간
      fetchNaverIndex("KOSDAQ"),         // 네이버 실시간
      fetchYahoo("^GSPC"),
      fetchYahoo("^IXIC"),
      fetchYahoo("KRW=X"),
      fetchYahoo("ES=F"),
      fetchYahoo("NQ=F"),
      fetchYahoo("GC=F"),
      fetchYahoo("CL=F"),
    ]);

  return NextResponse.json(
    { kospi, kosdaq, sp500, nasdaq, usdKrw, esFut, nqFut, gold, oil, timestamp: new Date().toISOString() },
    {
      headers: {
        // 브라우저·CDN 캐시도 차단
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    }
  );
}
