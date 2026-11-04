import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 지수 카드 라벨 → Yahoo 심볼
const SYMBOLS: Record<string, string> = {
  KOSPI: "^KS11", KOSDAQ: "^KQ11",
  "S&P 500": "^GSPC", NASDAQ: "^IXIC", "다우존스": "^DJI", "러셀 2000": "^RUT", "필라델피아 반도체": "^SOX",
  "S&P500 선물": "ES=F", "나스닥 선물": "NQ=F", "다우 선물": "YM=F",
};

let cache: { at: number; body: object } | null = null;
const TTL = 2 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body);
  const entries = Object.entries(SYMBOLS);
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${entries.map(([, s]) => encodeURIComponent(s)).join(",")}&range=1d&interval=5m`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const bySymbol = new Map<string, number[]>();
    for (const r of (j?.spark?.result ?? []) as Record<string, unknown>[]) {
      const resp = (r.response as Record<string, unknown>[])?.[0];
      const closes = ((resp?.indicators as { quote?: { close?: (number | null)[] }[] })?.quote?.[0]?.close ?? [])
        .filter((v): v is number => typeof v === "number");
      const prev = (resp?.meta as Record<string, number> | undefined)?.chartPreviousClose ?? null;
      if (closes.length > 1) bySymbol.set(r.symbol as string, prev ? [prev, ...closes] : closes);
    }
    const lines = Object.fromEntries(entries.filter(([, s]) => bySymbol.has(s)).map(([label, s]) => [label, bySymbol.get(s)!]));
    const body = { lines };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ lines: {}, error: String(e) });
  }
}
