/**
 * /api/batch-prices?symbols=005930.KS,000660.KS,NVDA,...
 *
 * Yahoo Finance v7 spark API로 복수 종목 현재가를 한 번에 조회.
 * PricePoller (client) 가 5초마다 호출 → Zustand 스토어 업데이트.
 *
 * 최대 50개 심볼 / 요청 (YF 안정적 상한)
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface SparkMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketVolume?: number;
}

interface SparkResult {
  symbol: string;
  response?: Array<{
    meta?: SparkMeta;
    indicators?: { quote?: Array<{ volume?: (number | null)[] }> };
  }>;
}

export interface BatchPriceEntry {
  price: number;
  changePct: number;
  volume: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawSymbols = searchParams.get("symbols") ?? "";

  if (!rawSymbols) {
    return NextResponse.json({ prices: {} });
  }

  // 최대 50개 슬라이스
  const symbols = rawSymbols
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  const prices: Record<string, BatchPriceEntry> = {};
  const bust = Date.now();

  try {
    const url =
      `https://query2.finance.yahoo.com/v7/finance/spark` +
      `?symbols=${encodeURIComponent(symbols.join(","))}` +
      `&range=1d&interval=5m&_=${bust}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (res.ok) {
      const json = (await res.json()) as {
        spark?: { result?: SparkResult[] };
      };

      for (const item of json?.spark?.result ?? []) {
        const sym = item.symbol;
        const resp = item.response?.[0];
        if (!resp) continue;

        const meta: SparkMeta = resp.meta ?? {};
        const price = meta.regularMarketPrice ?? 0;
        const prev =
          meta.chartPreviousClose ?? meta.previousClose ?? price;
        const changePct =
          prev > 0
            ? parseFloat(((price - prev) / prev * 100).toFixed(2))
            : 0;

        // 거래량: regularMarketVolume 우선, 없으면 마지막 5분봉 volume
        const metaVol = (meta.regularMarketVolume as number | undefined) ?? 0;
        const vols: (number | null)[] =
          resp.indicators?.quote?.[0]?.volume ?? [];
        const lastBarVol =
          [...vols].reverse().find((v) => v !== null && v! > 0) ?? 0;
        const volume = metaVol > 0 ? metaVol : (lastBarVol as number);

        prices[sym] = { price, changePct, volume };
      }
    }
  } catch {
    /* silent — 부분 실패 허용 */
  }

  // 아직 조회 못한 심볼은 v8 개별 조회로 fallback
  const missing = symbols.filter((s) => !prices[s]);
  if (missing.length > 0) {
    await Promise.allSettled(
      missing.map(async (sym) => {
        try {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
              `?interval=5m&range=1d&_=${bust}`,
            {
              headers: { "User-Agent": "Mozilla/5.0" },
              cache: "no-store",
            }
          );
          if (!r.ok) return;
          const j = await r.json();
          const result = j?.chart?.result?.[0];
          if (!result) return;
          const meta: SparkMeta = result.meta ?? {};
          const price = meta.regularMarketPrice ?? 0;
          const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
          const changePct =
            prev > 0
              ? parseFloat(((price - prev) / prev * 100).toFixed(2))
              : 0;
          const metaVol =
            (meta.regularMarketVolume as number | undefined) ?? 0;
          const vols: (number | null)[] =
            result.indicators?.quote?.[0]?.volume ?? [];
          const lastBarVol =
            [...vols].reverse().find((v) => v !== null && v! > 0) ?? 0;
          prices[sym] = {
            price,
            changePct,
            volume: metaVol > 0 ? metaVol : (lastBarVol as number),
          };
        } catch {
          /* silent */
        }
      })
    );
  }

  return NextResponse.json(
    { prices, ts: bust },
    { headers: { "Cache-Control": "no-store" } }
  );
}
