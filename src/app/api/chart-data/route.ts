import { NextResponse } from "next/server";
import { ASIA_SYMBOLS } from "@/lib/asiaMarkets";
import { getKisToken } from "@/lib/fetchKisMaster";

export const dynamic = "force-dynamic";

const SYMBOL_MAP: Record<string, string> = {
  ...ASIA_SYMBOLS,
  "KOSPI":      "^KS11",
  "KOSDAQ":     "^KQ11",
  "S&P 500":    "^GSPC",
  "NASDAQ":     "^IXIC",
  "S&P500 선물": "ES=F",
  "나스닥 선물":  "NQ=F",
  "다우 선물":    "YM=F",
  "다우존스":     "^DJI",
  "러셀 2000":   "^RUT",
  "필라델피아 반도체": "^SOX",
  VIX: "^VIX",
  "금":          "GC=F",
  "WTI 원유":    "CL=F",
  "USD/KRW":    "KRW=X",
};

const KIS_INDEX: Record<string, string> = { KOSPI: "0001", KOSDAQ: "1001" };

// KIS 업종 현재가 — 공식 전일 대비 값 (alliknam collect/kis.py index_price 와 동일 호출)
async function kisIndexQuote(code: string): Promise<{ price: number; prev: number } | null> {
  try {
    const token = await getKisToken();
    const res = await fetch(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-index-price?FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=${code}`,
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          authorization: `Bearer ${token}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: "FHPUP02100000",
          custtype: "P",
        },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      }
    );
    const j = await res.json();
    if (j.rt_cd !== "0") return null;
    const price = parseFloat(String(j.output?.bstp_nmix_prpr ?? "").replace(/,/g, ""));
    const diff = parseFloat(String(j.output?.bstp_nmix_prdy_vrss ?? "").replace(/,/g, ""));
    // 장 시작 전 새벽엔 전일 대비가 0으로 초기화돼 들어온다 → 이 값은 쓰지 않고 일봉으로 계산
    if (!price || isNaN(diff) || diff === 0) return null;
    return { price, prev: parseFloat((price - diff).toFixed(2)) };
  } catch { return null; }
}

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

  const kisQuote = KIS_INDEX[label] ? await kisIndexQuote(KIS_INDEX[label]) : null;

  let prevDayClose: number | null = null;
  if (!kisQuote && KIS_INDEX[label]) {
    // 국내 지수: 일봉 날짜(KST)로 마지막 거래일 바로 앞 종가
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1d&range=5d`,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" }
      );
      if (r.ok) {
        const res0 = (await r.json())?.chart?.result?.[0];
        const ts: number[] = res0?.timestamp ?? [];
        const cs: (number | null)[] = res0?.indicators?.quote?.[0]?.close ?? [];
        const day = (t: number) => new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10);
        const lastDay = res0?.meta?.regularMarketTime ? day(res0.meta.regularMarketTime) : null;
        const before = ts.map((t, i) => ({ d: day(t), c: cs[i] })).filter(b => b.c != null && lastDay && b.d < lastDay);
        if (before.length) prevDayClose = before[before.length - 1].c!;
      }
    } catch { /* 아래 meta 값으로 폴백 */ }
  } else if (!kisQuote) {
    // 해외 지수·선물·환율: 메인 카드(/api/market)와 같은 방식 — range=1d 의 chartPreviousClose
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" }
      );
      if (r.ok) {
        const m = (await r.json())?.chart?.result?.[0]?.meta;
        prevDayClose = m?.chartPreviousClose ?? m?.previousClose ?? null;
      }
    } catch { /* 아래 meta 값으로 폴백 */ }
  }

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
        currentPrice:  kisQuote?.price ?? meta.regularMarketPrice ?? null,
        previousClose: kisQuote?.prev ?? prevDayClose ?? (range === "1d" ? meta.chartPreviousClose : null) ?? meta.previousClose ?? meta.chartPreviousClose ?? null,
        currency:      meta.currency ?? "",
        marketState:   meta.marketState ?? "CLOSED",
      }, {
        headers: { "Cache-Control": "no-store, no-cache" },
      });
    } catch { continue; }
  }
  return NextResponse.json({ error: "fetch failed" }, { status: 500 });
}
