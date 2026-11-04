import { kisGet, num } from "@/lib/kis";

// 넥스트레이드(NXT) 시세 — KIS 주식현재가 시세에 시장 분류 코드 NX. 프리·애프터마켓 가격용 (15초 보관)
export interface NxtQuote { price: number; change: number; pct: number }
const cache = new Map<string, { at: number; q: NxtQuote | null }>();

export async function nxtQuote(code: string): Promise<NxtQuote | null> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < 15_000) return hit.q;
  let q: NxtQuote | null = null;
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: "NX", FID_INPUT_ISCD: code });
    const o = j.output ?? {};
    const price = num(o.stck_prpr);
    if (price) {
      const sign = o.prdy_vrss_sign;
      const ch = Math.abs(num(o.prdy_vrss) ?? 0) * (sign === "4" || sign === "5" ? -1 : 1);
      const pct = num(o.prdy_ctrt) ?? 0;
      q = { price, change: ch, pct: (sign === "4" || sign === "5") && pct > 0 ? -pct : pct };
    }
  } catch { q = null; }
  cache.set(code, { at: Date.now(), q });
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
