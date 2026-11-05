// 국내 종목 실시간 시세 — 네이버 실시간 폴링 API (여러 종목을 한 번에, 종목별 3초 보관)
// 순위 목록(누가 몇 위)은 각 API 가 따로 보관하고, 가격·등락·거래량·거래대금만 요청마다 덧입힌다
const nNum = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(x) ? 0 : x; };
// ── 실시간 시세 덧입히기: 순위(누가 몇 위인지)는 20초마다, 가격·등락·거래량·거래대금은 요청마다(종목별 3초 보관) ──
// 네이버 실시간 폴링 API 는 여러 종목을 한 번에 준다 (페이지가 쓰는 것과 같은 출처)
export interface Live { price: number; change: number; changePct: number; volume: number; tradeAmount: number }
const liveCache = new Map<string, { at: number; v: Live }>();
export async function naverRealtime(codes: string[]): Promise<Record<string, Live>> {
  const now = Date.now(), out: Record<string, Live> = {};
  const need = codes.filter(c => { const h = liveCache.get(c); if (h && now - h.at < 3_000) { out[c] = h.v; return false; } return true; });
  const chunks: string[][] = [];
  for (let i = 0; i < need.length; i += 50) chunks.push(need.slice(i, i + 50));
  await Promise.all(chunks.map(async c => {
    try {
      const r = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${c.join(",")}`, {
        headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" }, signal: AbortSignal.timeout(4000), cache: "no-store",
      });
      if (!r.ok) return;
      const j = await r.json() as { datas?: Record<string, unknown>[] };
      for (const d of j.datas ?? []) {
        const code = String(d.itemCode ?? "");
        const price = nNum(d.closePriceRaw ?? d.closePrice), pct = nNum(d.fluctuationsRatioRaw ?? d.fluctuationsRatio);
        if (!code || !price) continue;
        const ch = Math.abs(nNum(d.compareToPreviousClosePriceRaw ?? d.compareToPreviousClosePrice));
        // 거래대금: Raw 는 원, 표시값은 '백만' 단위
        const tvRaw = nNum(d.accumulatedTradingValueRaw), tvTxt = String(d.accumulatedTradingValue ?? "");
        const tradeAmount = tvRaw > 1e7 ? tvRaw : nNum(tvTxt) * (tvTxt.includes("억") ? 1e8 : 1e6);
        const v: Live = { price, change: pct < 0 ? -ch : ch, changePct: pct, volume: nNum(d.accumulatedTradingVolumeRaw ?? d.accumulatedTradingVolume), tradeAmount };
        liveCache.set(code, { at: now, v }); out[code] = v;
      }
    } catch { /* 이번엔 순위 값 그대로 */ }
  }));
  return out;
}
