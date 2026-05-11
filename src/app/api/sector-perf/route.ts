import { NextResponse } from "next/server";
import { KOSPI_SYMBOLS, KOSDAQ_SYMBOLS, SECTOR_MAP, koreanName } from "@/lib/stockList";

interface SectorResult {
  sector: string;
  avgChangePct: number;
  stockCount: number;
  topStock: string;
  topChangePct: number;
  stocks: { name: string; changePct: number }[];
}

async function fetchChangePct(symbol: string): Promise<{ symbol: string; changePct: number; name: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      next: { revalidate: 120 },
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
    type StockEntry = { changePct: number; name: string };
    const sectorMap: Record<string, StockEntry[]> = {};
    for (const r of valid) {
      const sector = SECTOR_MAP[r.symbol] ?? "기타";
      if (!sectorMap[sector]) sectorMap[sector] = [];
      sectorMap[sector].push({ changePct: r.changePct, name: r.name });
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
