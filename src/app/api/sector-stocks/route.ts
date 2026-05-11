import { NextResponse } from "next/server";
import { SECTOR_STOCKS } from "@/lib/sectorStocks";

export const dynamic = "force-dynamic";

export interface SectorStockLive {
  sym: string;
  code: string;
  market: "KS" | "KQ";
  name: string;
  price: number;
  changePct: number;
  sparkline: number[];  // normalized price points (0-100 scale) for SVG drawing
  rawPrices: number[];  // raw price values
}

interface SparkMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
}

interface SparkData {
  meta: SparkMeta;
  close: number[];
  timestamp: number[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector") ?? "";

  const stocks = SECTOR_STOCKS[sector];
  if (!stocks || stocks.length === 0) {
    return NextResponse.json({ error: "Unknown sector", sector }, { status: 404 });
  }

  const symbols = stocks.map(s => s.sym).join(",");

  // Yahoo Finance spark API - gets intraday price for multiple symbols at once
  const sparkData: Record<string, SparkData> = {};

  try {
    const sparkRes = await fetch(
      `https://query2.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(symbols)}&range=1d&interval=15m`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (sparkRes.ok) {
      const sparkJson = await sparkRes.json() as {
        spark?: {
          result?: Array<{
            symbol: string;
            response?: Array<{
              meta?: SparkMeta;
              indicators?: { quote?: Array<{ close?: (number | null)[] }> };
              timestamp?: number[];
            }>;
          }>;
        };
      };
      const results = sparkJson?.spark?.result ?? [];
      for (const r of results) {
        const sym = r.symbol;
        const resp = r.response?.[0];
        if (!resp) continue;
        const meta: SparkMeta = resp.meta ?? {};
        const closes: number[] = (resp.indicators?.quote?.[0]?.close ?? []).filter(
          (v): v is number => v !== null && v !== undefined && v > 0
        );
        const timestamps: number[] = resp.timestamp ?? [];
        sparkData[sym] = { meta, close: closes, timestamp: timestamps };
      }
    }
  } catch { /* Fall back to quote endpoint if spark fails */ }

  // If spark failed, try individual quote fetch for each symbol (batched)
  const missing = stocks.filter(s => !sparkData[s.sym]);
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (s) => {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.sym)}?interval=15m&range=1d`,
            { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
          );
          if (!res.ok) return;
          const json = await res.json() as {
            chart?: {
              result?: Array<{
                meta?: SparkMeta;
                indicators?: { quote?: Array<{ close?: (number | null)[] }> };
                timestamp?: number[];
              }>;
            };
          };
          const result = json?.chart?.result?.[0];
          if (!result) return;
          const meta: SparkMeta = result.meta ?? {};
          const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter(
            (v): v is number => v !== null && v !== undefined && v > 0
          );
          const timestamps: number[] = result.timestamp ?? [];
          sparkData[s.sym] = { meta, close: closes, timestamp: timestamps };
        } catch { /* silent */ }
      })
    );
  }

  const liveStocks: SectorStockLive[] = stocks.map(s => {
    const data = sparkData[s.sym];
    const meta: SparkMeta = data?.meta ?? {};
    const closes = data?.close ?? [];

    const price = meta.regularMarketPrice ?? 0;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const changePct = prev > 0 ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0;

    // Normalize sparkline to 0-100 scale for easy SVG rendering
    let sparkline: number[] = [];
    let rawPrices: number[] = closes;

    if (closes.length >= 2) {
      // Downsample to at most 20 points
      const step = Math.max(1, Math.floor(closes.length / 20));
      const sampled = closes.filter((_: number, i: number) => i % step === 0);
      if (price > 0 && !sampled.includes(price)) sampled.push(price); // ensure last point = current price
      rawPrices = sampled;

      const min = Math.min(...sampled);
      const max = Math.max(...sampled);
      const range = max - min;
      sparkline = range > 0
        ? sampled.map(v => parseFloat(((v - min) / range * 100).toFixed(1)))
        : sampled.map(() => 50);
    }

    const dotIdx = s.sym.lastIndexOf(".");
    const code = dotIdx >= 0 ? s.sym.slice(0, dotIdx) : s.sym;
    const market: "KS" | "KQ" = s.sym.endsWith(".KQ") ? "KQ" : "KS";

    return { sym: s.sym, code, market, name: s.name, price, changePct, sparkline, rawPrices };
  });

  // Sort by absolute changePct desc so biggest movers show first
  liveStocks.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  return NextResponse.json(
    { sector, stocks: liveStocks, timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
