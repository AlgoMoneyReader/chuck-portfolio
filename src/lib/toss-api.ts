/**
 * 토스증권 OpenAPI 클라이언트
 * Base URL: https://openapi.tossinvest.com
 * 인증: OAuth 2.0 Client Credentials (토큰 24시간 유효 → 서버 메모리 캐시)
 */

const TOSS_BASE = "https://openapi.tossinvest.com";

// ── 토큰 캐시 (서버 인스턴스 내) ─────────────────────────────────────────────
interface TokenCache {
  accessToken: string;
  expiresAt: number; // ms timestamp
}
let tokenCache: TokenCache | null = null;

export async function getTossToken(): Promise<string> {
  // 만료 60초 전에 재발급
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const clientId     = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 환경변수가 없습니다");
  }

  const res = await fetch(`${TOSS_BASE}/oauth2/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`토스 토큰 발급 실패 (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt:   Date.now() + data.expires_in * 1_000,
  };
  return tokenCache.accessToken;
}

// ── 공통 GET 요청 래퍼 ────────────────────────────────────────────────────────
export async function tossGet(
  path: string,
  params?: Record<string, string>,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const token = await getTossToken();
  const url   = new URL(`${TOSS_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(8000),
    cache:  "no-store",
  });
}

// ── 현재가 배치 조회 (/api/v1/prices) ────────────────────────────────────────
// symbols: 6자리 KR 코드 or US 티커, 최대 200개
export interface TossPriceItem {
  symbol:    string;
  lastPrice: string; // 문자열로 옴 → parseFloat 필요
  currency:  "KRW" | "USD";
  timestamp: string;
}

export async function fetchTossPrices(symbols: string[]): Promise<TossPriceItem[]> {
  if (symbols.length === 0) return [];
  const res = await tossGet("/api/v1/prices", {
    symbols: symbols.join(","),
  });
  if (!res.ok) throw new Error(`/api/v1/prices ${res.status}`);
  return (await res.json()) as TossPriceItem[];
}

// ── 계좌 목록 (/api/v1/accounts) ─────────────────────────────────────────────
export interface TossAccount {
  accountNo:   string;
  accountSeq:  string;
  accountType: string;
}

export async function fetchTossAccounts(): Promise<TossAccount[]> {
  const res = await tossGet("/api/v1/accounts");
  if (!res.ok) throw new Error(`/api/v1/accounts ${res.status}`);
  return (await res.json()) as TossAccount[];
}

// ── 보유 주식 (/api/v1/holdings) ─────────────────────────────────────────────
export interface TossHoldingItem {
  symbol:               string;
  name:                 string;
  marketCountry:        "KR" | "US";
  currency:             "KRW" | "USD";
  quantity:             string;
  lastPrice:            string;
  averagePurchasePrice: string;
  marketValue: {
    purchaseAmount:    string;
    amount:            string;
    amountAfterCost:   string;
  };
  profitLoss: {
    amount:            string;
    amountAfterCost:   string;
    rate:              string; // % 문자열 e.g. "5.23"
    rateAfterCost:     string;
  };
  dailyProfitLoss: {
    amount: string;
    rate:   string;
  };
}

export interface TossHoldingsResponse {
  totalPurchaseAmount: { krw?: string; usd?: string };
  marketValue:         { amount: string; amountAfterCost: string };
  profitLoss:          { amount: string; amountAfterCost: string; rate: string; rateAfterCost: string };
  dailyProfitLoss:     { amount: string; rate: string };
  items:               TossHoldingItem[];
}

export async function fetchTossHoldings(accountSeq: string): Promise<TossHoldingsResponse> {
  const res = await tossGet(
    "/api/v1/holdings",
    undefined,
    { "X-Tossinvest-Account": accountSeq }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`/api/v1/holdings ${res.status}: ${text}`);
  }
  return (await res.json()) as TossHoldingsResponse;
}

// ── 캔들 차트 (/api/v1/candles) ───────────────────────────────────────────────
export interface TossCandle {
  timestamp:  string;
  openPrice:  string;
  highPrice:  string;
  lowPrice:   string;
  closePrice: string;
  volume:     string;
  currency:   string;
}

export async function fetchTossCandles(
  symbol:   string,
  interval: "1m" | "1d",
  count     = 100
): Promise<TossCandle[]> {
  const res = await tossGet("/api/v1/candles", {
    symbol,
    interval,
    count: String(count),
  });
  if (!res.ok) throw new Error(`/api/v1/candles ${res.status}`);
  const data = (await res.json()) as { candles: TossCandle[]; nextBefore: string | null };
  return data.candles ?? [];
}
