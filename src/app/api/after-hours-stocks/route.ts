import { NextResponse } from "next/server";
import { kisGet, num } from "@/lib/kis";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

const STOCKS = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
  { code: "005380", name: "현대차" },
  { code: "373220", name: "LG에너지솔루션" },
  { code: "207940", name: "삼성바이오로직스" },
  { code: "035420", name: "NAVER" },
];

interface StockResult {
  code: string; name: string;
  regularPrice: number; extPrice: number | null; extChangePct: number | null;
  changePct: number; marketState: string;
}

let cache: { data: StockResult[]; at: number } | null = null;
const TTL = 15_000;

// KIS 주식 현재가 (실시간). Yahoo 국내 시세는 약 20분 늦어 장 초반엔 전날 값이 보였다
async function kisPrice(code: string): Promise<{ price: number; pct: number } | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100",
      { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code });
    const o = j.output ?? {};
    const price = num(o.stck_prpr), pct = num(o.prdy_ctrt);
    return price ? { price, pct: pct ?? 0 } : null;
  } catch { return null; }
}

function marketState(): string {
  const k = new Date(Date.now() + 9 * 3_600_000);
  const hm = k.getUTCHours() * 100 + k.getUTCMinutes();
  if ([0, 6].includes(k.getUTCDay())) return "CLOSED";
  return hm >= 900 && hm < 1530 ? "REGULAR" : "CLOSED";
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json({ stocks: cache.data, cached: true });

  const quotes = await Promise.all(STOCKS.map(s => kisPrice(s.code)));
  const state = marketState();
  const data: StockResult[] = STOCKS.map((s, i) => ({
    code: `${s.code}.KS`, name: s.name,
    regularPrice: quotes[i]?.price ?? 0,
    extPrice: null, extChangePct: null,
    changePct: parseFloat((quotes[i]?.pct ?? 0).toFixed(2)),
    marketState: state,
  }));

  if (quotes.some(Boolean)) cache = { data, at: Date.now() };
  return NextResponse.json({ stocks: data, marketState: state, timestamp: new Date().toISOString() });
}
