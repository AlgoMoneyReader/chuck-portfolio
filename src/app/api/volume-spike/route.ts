import { NextResponse } from "next/server";
import { KOSPI_SYMBOLS, KOSDAQ_SYMBOLS, koreanName } from "@/lib/stockList";

export const dynamic = "force-dynamic";

interface VolumeResult {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePct: number;
  todayVolume: number;
  avgVolume: number;
  ratio: number; // todayVolume / avgVolume
}

async function fetchVolumeData(symbol: string): Promise<VolumeResult | null> {
  try {
    // 5일치 일봉 → 오늘 포함 최대 5개 데이터 포인트
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const volumes: number[] = result.indicators?.quote?.[0]?.volume ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    if (volumes.length < 2) return null;

    const todayVolume = volumes[volumes.length - 1] ?? 0;
    const prevVolumes = volumes.slice(0, -1).filter((v) => v > 0);
    if (!prevVolumes.length || todayVolume === 0) return null;

    const avgVolume = prevVolumes.reduce((a, b) => a + b, 0) / prevVolumes.length;
    const ratio = todayVolume / avgVolume;

    const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2] ?? 0;
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

    return {
      rank: 0,
      code: symbol.replace(/\.(KS|KQ)$/, ""),
      name: koreanName(symbol),
      price: Math.round(price),
      changePct: parseFloat(changePct.toFixed(2)),
      todayVolume,
      avgVolume: Math.round(avgVolume),
      ratio: parseFloat(ratio.toFixed(1)),
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
    const results = await Promise.all(symbols.map(fetchVolumeData));
    const sorted = results
      .filter((r): r is VolumeResult => r !== null && r.ratio >= 1)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 10)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return NextResponse.json({ market, spikes: sorted, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
