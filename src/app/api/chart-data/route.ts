import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYMBOL_MAP: Record<string, string> = {
  "KOSPI":      "^KS11",
  "KOSDAQ":     "^KQ11",
  "S&P 500":    "^GSPC",
  "NASDAQ":     "^IXIC",
  "S&P500 선물": "ES=F",
  "나스닥 선물":  "NQ=F",
  "금":          "GC=F",
  "WTI 원유":    "CL=F",
  "USD/KRW":    "KRW=X",
};

// range → 기본 interval 매핑 (클라이언트가 명시적으로 보낼 수도 있음)
const DEFAULT_INTERVAL: Record<string, string> = {
  "1d":  "5m",
  "5d":  "60m",
  "1mo": "1d",
  "3mo": "1d",
  "6mo": "1d",
  "1y":  "1wk",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const label    = searchParams.get("label") ?? "";
  const range    = searchParams.get("range") ?? "3mo";
  const ySym     = SYMBOL_MAP[label] ?? label;
  const interval = searchParams.get("interval") ?? DEFAULT_INTERVAL[range] ?? "1d";

  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url =
        `https://${host}/v8/finance/chart/${encodeURIComponent(ySym)}` +
        `?interval=${interval}&range=${range}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp ?? [];
      const quote   = result.indicators?.quote?.[0] ?? {};
      const closes: (number | null)[] = quote.close ?? [];
      const highs:  (number | null)[] = quote.high  ?? [];
      const lows:   (number | null)[] = quote.low   ?? [];

      const intraday = ["1d", "5d"].includes(range);

      const data = timestamps
        .map((ts, i) => {
          const dt = new Date(ts * 1000);
          // 장중 데이터는 KST HH:MM, 일봉 이상은 날짜만
          const dateStr = intraday
            ? dt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
            : dt.toISOString().split("T")[0];
          return {
            date:  dateStr,
            close: closes[i] != null ? parseFloat(closes[i]!.toFixed(2)) : null,
            high:  highs[i]  != null ? parseFloat(highs[i]!.toFixed(2))  : null,
            low:   lows[i]   != null ? parseFloat(lows[i]!.toFixed(2))   : null,
          };
        })
        .filter(d => d.close !== null);

      const meta = result.meta;
      return NextResponse.json({
        label, symbol: ySym, data, intraday,
        currentPrice:  meta.regularMarketPrice ?? null,
        previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
        currency:      meta.currency ?? "",
        marketState:   meta.marketState ?? "CLOSED",
      }, {
        headers: { "Cache-Control": "no-store, no-cache" },
      });
    } catch { continue; }
  }
  return NextResponse.json({ error: "fetch failed" }, { status: 500 });
}
