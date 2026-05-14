import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
    const price     = parseFloat(j.closePrice?.replace(/,/g, "") ?? "0");
    const change    = parseFloat(j.compareToPreviousClosePrice?.replace(/,/g, "") ?? "0");
    const changePct = parseFloat(j.fluctuationsRatio ?? "0");
    if (!price) return null;
    return {
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePct: parseFloat(changePct.toFixed(2)),
      marketState: j.marketStatus === "OPEN" ? "REGULAR" : "CLOSED",
    };
  } catch { return null; }
}

async function fetchYahoo(symbol: string) {
  try {
    for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const meta      = result.meta;
      const price     = meta.regularMarketPrice ?? meta.price;
      const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
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
  } catch { return null; }
}

export async function GET() {
  const [kospi, kosdaq, sp500, nasdaq, dow, russell, usdKrw, esFut, nqFut, yjFut, gold, oil] =
    await Promise.all([
      fetchNaverIndex("KOSPI"),
      fetchNaverIndex("KOSDAQ"),
      fetchYahoo("^GSPC"),   // S&P 500
      fetchYahoo("^IXIC"),   // NASDAQ
      fetchYahoo("^DJI"),    // 다우존스
      fetchYahoo("^RUT"),    // 러셀 2000
      fetchYahoo("KRW=X"),   // USD/KRW
      fetchYahoo("ES=F"),    // S&P500 선물
      fetchYahoo("NQ=F"),    // 나스닥 선물
      fetchYahoo("YM=F"),    // 다우 선물
      fetchYahoo("GC=F"),    // 금
      fetchYahoo("CL=F"),    // WTI 원유
    ]);

  return NextResponse.json(
    { kospi, kosdaq, sp500, nasdaq, dow, russell, usdKrw, esFut, nqFut, yjFut, gold, oil, timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" } }
  );
}
