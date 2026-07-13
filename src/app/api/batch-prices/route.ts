/**
 * GET /api/batch-prices?symbols=005930.KS,000660.KS,NVDA,AAPL,...
 *
 * KR 주식 (.KS/.KQ): Naver Finance itemSummary.nhn (실시간, rate 포함)
 * US 주식 (suffix 없음): 토스증권 OpenAPI /api/v1/prices + /api/v1/candles(전일종가)
 *
 * PricePoller가 30초마다 호출 → Zustand 스토어 업데이트
 */

import { NextResponse } from "next/server";
import { fetchTossPrices, fetchTossCandles } from "@/lib/toss-api";

export const dynamic = "force-dynamic";

export interface BatchPriceEntry {
  price:     number;
  changePct: number;
  volume:    number;
}

// ── 전일종가 캐시 (당일 한 번만 조회) ─────────────────────────────────────────
interface PrevCloseCache { [symbol: string]: number }
let prevCloseCache: PrevCloseCache = {};
let prevCloseCacheDate = "";        // "YYYY-MM-DD"

async function getPrevCloseUS(symbols: string[]): Promise<PrevCloseCache> {
  const today = new Date().toISOString().slice(0, 10);

  if (today !== prevCloseCacheDate) {
    // 날짜가 바뀌면 캐시 초기화
    prevCloseCache = {};
    prevCloseCacheDate = today;
  }

  const stillMissing = symbols.filter(s => !(s in prevCloseCache));
  if (stillMissing.length === 0) return prevCloseCache;

  // 전일종가: 1일봉 2개 조회 → 직전 candle의 closePrice
  await Promise.allSettled(
    stillMissing.map(async (sym) => {
      try {
        const candles = await fetchTossCandles(sym, "1d", 2);
        // 최신 candle[0]=오늘(장중), candle[1]=어제
        const prevCandle = candles[1] ?? candles[0];
        if (prevCandle) {
          prevCloseCache[sym] = parseFloat(prevCandle.closePrice) || 0;
        }
      } catch {
        prevCloseCache[sym] = 0;
      }
    })
  );

  return prevCloseCache;
}

// ── KR 주식: Naver Finance itemSummary ────────────────────────────────────────
const NAVER_REFERER = "https://finance.naver.com/";

async function fetchNaverBatch(codes: string[]): Promise<Record<string, BatchPriceEntry>> {
  const result: Record<string, BatchPriceEntry> = {};
  await Promise.allSettled(
    codes.map(async (code) => {
      try {
        const r = await fetch(
          `https://api.finance.naver.com/service/itemSummary.nhn?itemcode=${code}`,
          {
            headers: { "User-Agent": "Mozilla/5.0", Referer: NAVER_REFERER },
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
          }
        );
        if (!r.ok) return;
        const d = await r.json() as { now?: number; rate?: number; quant?: number };
        if (d.now) {
          result[code] = {
            price:     d.now,
            changePct: d.rate ?? 0,
            volume:    d.quant ?? 0,
          };
        }
      } catch { /* silent */ }
    })
  );
  return result;
}

// ── US 주식: 토스 OpenAPI ─────────────────────────────────────────────────────
async function fetchTossBatch(usTickers: string[]): Promise<Record<string, BatchPriceEntry>> {
  const result: Record<string, BatchPriceEntry> = {};
  if (usTickers.length === 0) return result;

  try {
    const [priceItems, prevCloses] = await Promise.all([
      fetchTossPrices(usTickers),
      getPrevCloseUS(usTickers),
    ]);

    for (const item of priceItems) {
      const price    = parseFloat(item.lastPrice) || 0;
      const prev     = prevCloses[item.symbol] || price;
      const changePct = prev > 0
        ? parseFloat(((price - prev) / prev * 100).toFixed(2))
        : 0;
      result[item.symbol] = { price, changePct, volume: 0 };
    }
  } catch { /* 토스 실패 시 빈 결과 */ }

  return result;
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawSymbols = searchParams.get("symbols") ?? "";

  if (!rawSymbols) return NextResponse.json({ prices: {} });

  const symbols = rawSymbols.split(",").map(s => s.trim()).filter(Boolean).slice(0, 100);

  // KR: 006자리 코드 (.KS/.KQ 있는 것)
  const krSymbols = symbols.filter(s => /\.(KS|KQ)$/i.test(s));
  const krCodes   = krSymbols.map(s => s.replace(/\.(KS|KQ)$/i, ""));

  // US: suffix 없는 것
  const usSymbols = symbols.filter(s => !/\.(KS|KQ|T|HK)$/i.test(s));

  const [krPrices, usPrices] = await Promise.all([
    fetchNaverBatch(krCodes),
    fetchTossBatch(usSymbols),
  ]);

  // KR 결과를 원래 symbol 키(.KS/.KQ)로 복원
  const prices: Record<string, BatchPriceEntry> = {};

  for (const sym of krSymbols) {
    const code = sym.replace(/\.(KS|KQ)$/i, "");
    if (krPrices[code]) prices[sym] = krPrices[code];
  }
  for (const sym of usSymbols) {
    if (usPrices[sym]) prices[sym] = usPrices[sym];
  }

  return NextResponse.json(
    { prices, ts: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
