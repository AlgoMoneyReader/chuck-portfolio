import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let cache: { data: object; at: number } | null = null;
const TTL = 30_000;

async function fetchBinance<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({ ...cache.data, cached: true });
  }
  try {
    const [stats, btcKlines] = await Promise.all([
      fetchBinance<{ symbol: string; lastPrice: string; priceChangePercent: string }[]>(
        "https://data-api.binance.vision/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D"
      ),
      fetchBinance<[number, string, string, string, string][]>(
        "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=24"
      ),
    ]);

    const btcStats = stats?.find(s => s.symbol === "BTCUSDT");
    const ethStats = stats?.find(s => s.symbol === "ETHUSDT");

    const btcPrice    = parseFloat(btcStats?.lastPrice ?? "0");
    const btcChangePct = parseFloat(btcStats?.priceChangePercent ?? "0");
    const ethPrice    = parseFloat(ethStats?.lastPrice ?? "0");
    const ethChangePct = parseFloat(ethStats?.priceChangePercent ?? "0");

    const sparkline = btcKlines?.map(k => parseFloat(k[4])) ?? [];

    const data = {
      btc: { price: btcPrice, changePct: parseFloat(btcChangePct.toFixed(2)), sparkline },
      eth: { price: ethPrice, changePct: parseFloat(ethChangePct.toFixed(2)) },
    };
    cache = { data, at: Date.now() };
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
