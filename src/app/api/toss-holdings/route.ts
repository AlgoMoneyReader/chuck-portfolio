/**
 * GET /api/toss-holdings
 * 토스증권 실제 계좌 보유 주식 조회
 * → /api/v1/accounts 로 accountSeq 조회 후
 *   /api/v1/holdings 로 보유 종목·평가손익 반환
 */

import { NextResponse } from "next/server";
import {
  fetchTossAccounts,
  fetchTossHoldings,
  TossHoldingItem,
} from "@/lib/toss-api";

export const dynamic = "force-dynamic";

// 계좌 seq 캐시 (서버 재시작 전까지 유지)
let cachedAccountSeq: string | null = null;

// 잔고 캐시 (30초)
interface HoldingsCache {
  data: HoldingsPayload;
  ts: number;
}
let holdingsCache: HoldingsCache | null = null;
const CACHE_TTL = 30_000;

export interface HoldingRow {
  symbol:          string;
  name:            string;
  market:          "KR" | "US";
  currency:        "KRW" | "USD";
  quantity:        number;
  lastPrice:       number;
  avgPrice:        number;
  purchaseAmount:  number;
  marketValue:     number;
  profitLoss:      number;
  profitLossRate:  number; // %
  dailyPL:         number;
  dailyPLRate:     number; // %
}

export interface HoldingsPayload {
  summary: {
    totalPurchaseKRW:  number;
    totalMarketValue:  number;
    totalProfitLoss:   number;
    totalProfitLossRate: number;
    dailyPL:           number;
    dailyPLRate:       number;
  };
  items:     HoldingRow[];
  updatedAt: string;
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/,/g, "")) || 0;
}

function toRow(item: TossHoldingItem): HoldingRow {
  return {
    symbol:         item.symbol,
    name:           item.name,
    market:         item.marketCountry,
    currency:       item.currency,
    quantity:       parseNum(item.quantity),
    lastPrice:      parseNum(item.lastPrice),
    avgPrice:       parseNum(item.averagePurchasePrice),
    purchaseAmount: parseNum(item.marketValue?.purchaseAmount),
    marketValue:    parseNum(item.marketValue?.amount),
    profitLoss:     parseNum(item.profitLoss?.amount),
    profitLossRate: parseNum(item.profitLoss?.rate),
    dailyPL:        parseNum(item.dailyProfitLoss?.amount),
    dailyPLRate:    parseNum(item.dailyProfitLoss?.rate),
  };
}

export async function GET() {
  // 캐시 히트
  if (holdingsCache && Date.now() - holdingsCache.ts < CACHE_TTL) {
    return NextResponse.json({ ...holdingsCache.data, cached: true });
  }

  try {
    // 계좌 seq 조회 (캐시)
    if (!cachedAccountSeq) {
      const accounts = await fetchTossAccounts();
      if (accounts.length === 0) {
        return NextResponse.json({ error: "연결된 토스증권 계좌가 없습니다" }, { status: 404 });
      }
      cachedAccountSeq = accounts[0].accountSeq;
    }

    const raw = await fetchTossHoldings(cachedAccountSeq);

    const items = (raw.items ?? []).map(toRow);

    const payload: HoldingsPayload = {
      summary: {
        totalPurchaseKRW:    parseNum(raw.totalPurchaseAmount?.krw),
        totalMarketValue:    parseNum(raw.marketValue?.amount),
        totalProfitLoss:     parseNum(raw.profitLoss?.amount),
        totalProfitLossRate: parseNum(raw.profitLoss?.rate),
        dailyPL:             parseNum(raw.dailyProfitLoss?.amount),
        dailyPLRate:         parseNum(raw.dailyProfitLoss?.rate),
      },
      items,
      updatedAt: new Date().toISOString(),
    };

    holdingsCache = { data: payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    // accountSeq 캐시 무효화 (토큰/계좌 오류 대비)
    if (String(err).includes("401") || String(err).includes("403")) {
      cachedAccountSeq = null;
    }
    console.error("🚨 [toss-holdings]:", String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
