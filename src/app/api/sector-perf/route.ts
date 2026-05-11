import { NextResponse } from "next/server";
import { SECTOR_STOCKS } from "@/lib/sectorStocks";

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

async function fetchChangePct(symbol: string, name: string): Promise<{
  symbol: string;
  name: string;
  changePct: number;
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
      name,
      changePct: parseFloat(((price - prev) / prev * 100).toFixed(2)),
      price: price as number,
      volume: (meta.regularMarketVolume as number) ?? 0,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // 1. SECTOR_STOCKS에서 유니크 심볼 수집 (name 정보 포함)
    const symMap = new Map<string, string>(); // symbol → name
    for (const stocks of Object.values(SECTOR_STOCKS)) {
      for (const s of stocks) {
        if (!symMap.has(s.sym)) symMap.set(s.sym, s.name);
      }
    }

    const allSymbols = Array.from(symMap.entries()); // [symbol, name][]

    // 2. 15개씩 배치로 Yahoo Finance 조회
    const BATCH = 15;
    const dataMap = new Map<string, { changePct: number; price: number; volume: number }>();

    for (let i = 0; i < allSymbols.length; i += BATCH) {
      const batch = allSymbols.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(([sym, name]) => fetchChangePct(sym, name))
      );
      for (const r of results) {
        if (r) {
          dataMap.set(r.symbol, { changePct: r.changePct, price: r.price, volume: r.volume });
        }
      }
      if (i + BATCH < allSymbols.length) {
        await new Promise((r) => setTimeout(r, 60));
      }
    }

    // 3. SECTOR_STOCKS 기반으로 섹터별 결과 구성
    const sectors: SectorResult[] = [];

    for (const [sector, stockDefs] of Object.entries(SECTOR_STOCKS)) {
      type StockEntry = {
        name: string; code: string; market: "KS" | "KQ";
        changePct: number; price: number; volume: number;
      };

      const stocks: StockEntry[] = [];
      for (const def of stockDefs) {
        const d = dataMap.get(def.sym);
        if (!d) continue;
        const dotIdx = def.sym.lastIndexOf(".");
        const code = dotIdx >= 0 ? def.sym.slice(0, dotIdx) : def.sym;
        const suffix = dotIdx >= 0 ? def.sym.slice(dotIdx + 1) : "KS";
        const market: "KS" | "KQ" = suffix === "KQ" ? "KQ" : "KS";
        stocks.push({ name: def.name, code, market, changePct: d.changePct, price: d.price, volume: d.volume });
      }

      if (stocks.length === 0) continue;

      const avg = stocks.reduce((s, r) => s + r.changePct, 0) / stocks.length;
      const top = stocks.reduce((a, b) => a.changePct > b.changePct ? a : b);

      sectors.push({
        sector,
        avgChangePct: parseFloat(avg.toFixed(2)),
        stockCount: stocks.length,
        topStock: top.name,
        topChangePct: top.changePct,
        stocks: [...stocks].sort((a, b) => b.changePct - a.changePct),
      });
    }

    sectors.sort((a, b) => b.avgChangePct - a.avgChangePct);
    return NextResponse.json({ sectors, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "섹터 데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
