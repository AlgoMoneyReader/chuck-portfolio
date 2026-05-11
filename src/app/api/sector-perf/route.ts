import { NextResponse } from "next/server";
import { KOSPI_SYMBOLS, KOSDAQ_SYMBOLS, SECTOR_MAP, koreanName } from "@/lib/stockList";

export const dynamic = "force-dynamic";

interface SectorResult {
  sector: string;
  avgChangePct: number;
  stockCount: number;
  topStock: string;
  topChangePct: number;
  stocks: {
    name: string;
    code: string;
    market: "KS" | "KQ";
    changePct: number;
    price: number;
    volume: number;
  }[];
}

async function fetchChangePct(symbol: string): Promise<{
  symbol: string;
  changePct: number;
  name: string;
  price: number;
  volume: number;
} | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    if (!price || !prev) return null;

    return {
      symbol,
      name: koreanName(symbol),
      changePct: parseFloat(((price - prev) / prev * 100).toFixed(2)),
      price: price as number,
      volume: (meta.regularMarketVolume as number) ?? 0,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";
  const symbols = market === "KOSDAQ" ? KOSDAQ_SYMBOLS : KOSPI_SYMBOLS;

  try {
    const results = await Promise.all(symbols.map(fetchChangePct));
    const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);

    // 섹터별 그룹핑
    type StockEntry = {
      name: string;
      code: string;
      market: "KS" | "KQ";
      changePct: number;
      price: number;
      volume: number;
    };
    const sectorMap: Record<string, StockEntry[]> = {};
    for (const r of valid) {
      const sector = SECTOR_MAP[r.symbol] ?? "기타";
      if (!sectorMap[sector]) sectorMap[sector] = [];
      // Extract code and market from symbol (e.g. "005930.KS" → code="005930", market="KS")
      const dotIdx = r.symbol.lastIndexOf(".");
      const code = dotIdx >= 0 ? r.symbol.slice(0, dotIdx) : r.symbol;
      const suffix = dotIdx >= 0 ? r.symbol.slice(dotIdx + 1) : "KS";
      const market: "KS" | "KQ" = suffix === "KQ" ? "KQ" : "KS";
      sectorMap[sector].push({ name: r.name, code, market, changePct: r.changePct, price: r.price, volume: r.volume });
    }

    const sectors: SectorResult[] = [];
    for (const sector of Object.keys(sectorMap)) {
      const stocks = sectorMap[sector];
      if (!stocks || stocks.length === 0) continue;
      const avg = stocks.reduce((s: number, r: StockEntry) => s + r.changePct, 0) / stocks.length;
      const top = stocks.reduce((a: StockEntry, b: StockEntry) => a.changePct > b.changePct ? a : b);
      sectors.push({
        sector,
        avgChangePct: parseFloat(avg.toFixed(2)),
        stockCount: stocks.length,
        topStock: top.name,
        topChangePct: top.changePct,
        stocks: [...stocks].sort((a: StockEntry, b: StockEntry) => b.changePct - a.changePct),
      });
    }

    sectors.sort((a, b) => b.avgChangePct - a.avgChangePct);
    return NextResponse.json({ market, sectors, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "섹터 데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
