import { kisGet, num } from "@/lib/kis";
import { krSession } from "@/lib/krSession";

// 정규장 밖 시세 — KIS 주식현재가의 시장 분류 코드로 조회 (15초 보관)
//  · 개장 전(08:00~09:00): NXT 프리마켓만 열림 → NX
//  · 장 마감 후(15:30~20:00): KRX 애프터마켓(2026-09-14~)과 NXT 애프터가 함께 → 통합 UN, 실패하면 NX
export interface NxtQuote { price: number; change: number; pct: number }
const cache = new Map<string, { at: number; q: NxtQuote | null }>();

async function quoteOn(market: "UN" | "NX", code: string): Promise<NxtQuote | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: code });
    const o = j.output ?? {};
    const price = num(o.stck_prpr);
    if (!price) return null;
    const sign = o.prdy_vrss_sign;
    const ch = Math.abs(num(o.prdy_vrss) ?? 0) * (sign === "4" || sign === "5" ? -1 : 1);
    const pct = num(o.prdy_ctrt) ?? 0;
    return { price, change: ch, pct: (sign === "4" || sign === "5") && pct > 0 ? -pct : pct };
  } catch { return null; }
}

export async function nxtQuote(code: string): Promise<NxtQuote | null> {
  const after = krSession().key === "nxt-after";
  const key = `${after ? "UN" : "NX"}:${code}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.q;
  const q = after ? (await quoteOn("UN", code)) ?? (await quoteOn("NX", code)) : await quoteOn("NX", code);
  cache.set(key, { at: Date.now(), q });
  return q;
}

export async function nxtQuotes(codes: string[], concurrency = 6): Promise<Record<string, NxtQuote>> {
  const out: Record<string, NxtQuote> = {};
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < codes.length) { const c = codes[i++]; const q = await nxtQuote(c); if (q) out[c] = q; }
  }));
  return out;
}
