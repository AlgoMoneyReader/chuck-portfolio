import { NextResponse } from "next/server";
import { koreanName } from "@/lib/stockList";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code   = searchParams.get("code") ?? "";
  const market = searchParams.get("market") ?? "KS"; // KS | KQ | US

  // 미국주식은 티커 그대로, 국내는 code.market
  const isUS   = market === "US";
  const symbol = isUS ? code.toUpperCase() : `${code}.${market}`;

  // 수치 포맷: 국내는 원 단위(정수), 미국은 달러(소수 2자리)
  const fmt = (n: number) => isUS ? parseFloat(n.toFixed(2)) : Math.round(n);

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
    const currency  = meta.currency ?? (isUS ? "USD" : "KRW");

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
      market,
      currency,
      isUS,
      name: isUS ? (meta.longName ?? meta.shortName ?? code.toUpperCase()) : koreanName(symbol),
      price:      fmt(price),
      change:     fmt(change),
      changePct:  parseFloat(changePct.toFixed(2)),
      dayHigh:    fmt(meta.regularMarketDayHigh ?? price),
      dayLow:     fmt(meta.regularMarketDayLow  ?? price),
      volume:     meta.regularMarketVolume ?? 0,
      week52High: fmt(week52High),
      week52Low:  week52Low === Infinity ? 0 : fmt(week52Low),
      marketState: meta.marketState ?? "CLOSED",
      preMarketPrice:   preMarketPrice  ? fmt(preMarketPrice)  : null,
      preMarketChangePct,
      postMarketPrice:  postMarketPrice ? fmt(postMarketPrice) : null,
      postMarketChangePct,
      // 국내만 네이버 금융 링크 제공
      naverUrl: isUS ? null : `https://finance.naver.com/item/main.naver?code=${code}`,
    });
  } catch (err) {
    return NextResponse.json({ error: "데이터 조회 실패", detail: String(err) }, { status: 500 });
  }
}
