import { NextResponse } from "next/server";
import { koreanName } from "@/lib/stockList";
import { kisGet, num } from "@/lib/kis";
import { krSession } from "@/lib/krSession";
import { nxtQuote } from "@/lib/nxtPrice";
import { extendedOne, dayMarketOne, inDaySession, type ExtFields } from "@/lib/usExtended";

export const preferredRegion = "icn1";

// 여러 사람이 같은 종목 팝업을 열어도 KIS 호출은 2초에 한 번
const hot = new Map<string, { at: number; body: object }>();

// 국내: KIS 현재가(실시간) — Yahoo 국내 시세는 지연·누락이 잦다
async function krFromKis(code: string, market: string) {
  if (!process.env.KIS_APP_KEY) return null;
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code });
    const o = (j.output ?? {}) as Record<string, string>;
    const price = num(o.stck_prpr) ?? 0;
    if (!price) return null;
    const down = o.prdy_vrss_sign === "4" || o.prdy_vrss_sign === "5";
    const sg = (v: number | null) => (v == null ? 0 : down ? -Math.abs(v) : Math.abs(v));
    const change = sg(num(o.prdy_vrss)), changePct = sg(num(o.prdy_ctrt));
    let preMarketPrice: number | null = null, postMarketPrice: number | null = null;
    const s = krSession();
    if (s.key !== "regular") {
      const n = await nxtQuote(code);
      if (n) { if (s.key === "nxt-pre" || s.key === "auction-open") preMarketPrice = n.price; else postMarketPrice = n.price; }
    }
    const pctVs = (x: number | null) => (x && price ? parseFloat((((x - price) / price) * 100).toFixed(2)) : null);
    return {
      symbol: `${code}.${market}`, code, market, currency: "KRW", isUS: false,
      name: koreanName(`${code}.${market}`),
      price, change, changePct,
      dayHigh: num(o.stck_hgpr) ?? 0, dayLow: num(o.stck_lwpr) ?? 0, volume: num(o.acml_vol) ?? 0,
      week52High: num(o.w52_hgpr) ?? 0, week52Low: num(o.w52_lwpr) ?? 0,
      marketState: s.key === "regular" ? "REGULAR" : s.key === "closed" ? "CLOSED" : s.key === "nxt-pre" || s.key === "auction-open" ? "PRE" : "POST",
      dayMarketPrice: null, dayMarketChangePct: null,
      preMarketPrice, preMarketChangePct: pctVs(preMarketPrice),
      postMarketPrice, postMarketChangePct: pctVs(postMarketPrice),
      naverUrl: `https://finance.naver.com/item/main.naver?code=${code}`,
      source: "kis",
    };
  } catch { return null; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code   = searchParams.get("code") ?? "";
  const market = searchParams.get("market") ?? "KS"; // KS | KQ | US

  // 미국주식은 티커 그대로, 국내는 code.market
  const isUS   = market === "US";
  const symbol = isUS ? code.toUpperCase() : `${code}.${market}`;

  // 수치 포맷: 국내는 원 단위(정수), 미국은 달러(소수 2자리)
  const fmt = (n: number) => isUS ? parseFloat(n.toFixed(2)) : Math.round(n);

  if (!isUS) {
    const h = hot.get(code);
    if (h && Date.now() - h.at < 2_000) return NextResponse.json(h.body, { headers: { "Cache-Control": "no-store" } });
    const k = await krFromKis(code, market);
    if (k) { hot.set(code, { at: Date.now(), body: k }); return NextResponse.json(k, { headers: { "Cache-Control": "no-store" } }); }
  }

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

    // 시간외: 미국은 목록과 같은 방식(프리·애프터 차트 + 데이마켓 KIS), 국내는 Yahoo 메타 값
    let preMarketPrice  = (meta.preMarketPrice  as number | null | undefined) ?? null;
    let postMarketPrice = (meta.postMarketPrice as number | null | undefined) ?? null;
    let dayMarketPrice: number | null = null, dayMarketChangePct: number | null = null;
    let marketState: string = meta.marketState ?? "CLOSED";
    if (!isUS) {
      // 국내: 넥스트레이드 프리(08:00~08:50)·애프터(15:30~20:00) 시세
      const s = krSession();
      if (s.key !== "regular") {
        const n = await nxtQuote(code);
        if (n) {
          if (s.key === "nxt-pre" || s.key === "auction-open") { preMarketPrice = n.price; }
          else { postMarketPrice = n.price; }
        }
      }
    }
    if (isUS && !symbol.includes(".")) { // 아시아 종목(.T/.TW/.HK 등)은 미국 프리·애프터 없음
      let e: ExtFields = await extendedOne<ExtFields>({ code: symbol, price });
      if (inDaySession() && process.env.KIS_APP_KEY) e = await dayMarketOne(e);
      preMarketPrice = e.preMarketPrice ?? preMarketPrice;
      postMarketPrice = e.postMarketPrice ?? postMarketPrice;
      dayMarketPrice = e.dayMarketPrice ?? null;
      dayMarketChangePct = e.dayMarketChangePct ?? null;
      marketState = e.marketState ?? marketState;
    }

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
      marketState,
      dayMarketPrice: dayMarketPrice != null ? fmt(dayMarketPrice) : null,
      dayMarketChangePct,
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
