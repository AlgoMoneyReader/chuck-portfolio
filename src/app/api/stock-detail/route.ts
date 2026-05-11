import { NextResponse } from "next/server";
import { koreanName } from "@/lib/stockList";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code   = searchParams.get("code") ?? "";
  const market = searchParams.get("market") ?? "KS"; // KS or KQ

  const symbol = `${code}.${market}`;

  try {
    // 1년 주봉으로 52주 범위 + 오늘 메타 동시 조회
    const [dayRes, yearRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        cache: "no-store",
      }),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=1y`, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        cache: "no-store",
      }),
    ]);

    if (!dayRes.ok) throw new Error("day fetch failed");

    const dayJson  = await dayRes.json();
    const yearJson = yearRes.ok ? await yearRes.json() : null;

    const dayResult  = dayJson?.chart?.result?.[0];
    const yearResult = yearJson?.chart?.result?.[0];
    if (!dayResult) throw new Error("no data");

    const meta = dayResult.meta;
    const price    = meta.regularMarketPrice ?? 0;
    const prev     = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change   = price - prev;
    const changePct = prev ? (change / prev) * 100 : 0;

    // NXT 시간외 데이터 (Yahoo Finance pre/post market fields)
    const preMarketPrice  = (meta.preMarketPrice  as number | null | undefined) ?? null;
    const postMarketPrice = (meta.postMarketPrice as number | null | undefined) ?? null;

    const preMarketChangePct = preMarketPrice && price
      ? parseFloat(((preMarketPrice - price) / price * 100).toFixed(2)) : null;
    const postMarketChangePct = postMarketPrice && price
      ? parseFloat(((postMarketPrice - price) / price * 100).toFixed(2)) : null;

    // 52주 고저가
    let week52High = 0;
    let week52Low  = Infinity;
    if (yearResult) {
      const highs: number[] = yearResult.indicators?.quote?.[0]?.high  ?? [];
      const lows:  number[] = yearResult.indicators?.quote?.[0]?.low   ?? [];
      const validHighs = highs.filter((v: number) => v > 0);
      const validLows  = lows.filter((v: number)  => v > 0);
      if (validHighs.length) week52High = Math.max(...validHighs);
      if (validLows.length)  week52Low  = Math.min(...validLows);
    }

    return NextResponse.json({
      symbol,
      code,
      name: koreanName(symbol),
      price:      Math.round(price),
      change:     Math.round(change),
      changePct:  parseFloat(changePct.toFixed(2)),
      dayHigh:    Math.round(meta.regularMarketDayHigh ?? price),
      dayLow:     Math.round(meta.regularMarketDayLow  ?? price),
      volume:     meta.regularMarketVolume ?? 0,
      week52High: Math.round(week52High),
      week52Low:  week52Low === Infinity ? 0 : Math.round(week52Low),
      marketState: meta.marketState ?? "CLOSED",
      preMarketPrice:   preMarketPrice  ? Math.round(preMarketPrice)  : null,
      preMarketChangePct,
      postMarketPrice:  postMarketPrice ? Math.round(postMarketPrice) : null,
      postMarketChangePct,
      naverUrl: `https://finance.naver.com/item/main.naver?code=${code}`,
    });
  } catch (err) {
    return NextResponse.json({ error: "데이터 조회 실패", detail: String(err) }, { status: 500 });
  }
}
