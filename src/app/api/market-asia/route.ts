import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { ASIA_STOCKS, type AsiaMkt } from "@/data/asiaStocks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 매매동향 · 아시아: 시장별 대표 대형주 30 시세 (Yahoo spark, 20초 캐시)
 *  type = cap(대형주 순) | gainers | losers | amount(거래대금) | foreign(대만 외국인 순매수)
 * 대만은 증권거래소(TWSE) 공개 자료로 외국인·투신·자기매매 순매수도 붙인다 (시장 전체 + 종목별)
 */
interface Row { rank: number; code: string; name: string; price: number; change: number; changePct: number; volume: number; amount: number; foreignNet?: number | null }

async function spark(symbols: string[]) {
  const out: Record<string, { price: number; prev: number; volume: number }> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 15) chunks.push(symbols.slice(i, i + 15));
  await Promise.all(chunks.map(async c => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${c.map(encodeURIComponent).join(",")}&range=1d&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const j = await r.json();
      for (const x of (j?.spark?.result ?? []) as Record<string, unknown>[]) {
        const resp = (x.response as Record<string, unknown>[])?.[0];
        const m = (resp?.meta ?? {}) as Record<string, number>;
        const vols = ((resp?.indicators as { quote?: { volume?: (number | null)[] }[] })?.quote?.[0]?.volume ?? []).filter((v): v is number => typeof v === "number");
        const p = m.regularMarketPrice, prev = m.chartPreviousClose ?? m.previousClose;
        if (p && prev) out[x.symbol as string] = { price: p, prev, volume: m.regularMarketVolume ?? vols[vols.length - 1] ?? 0 };
      }
    } catch { /* 건너뜀 */ }
  }));
  return out;
}

// ── 대만 증권거래소: 투자주체별 순매수 ──
const TW_HEAD = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };
const twNum = (s: unknown) => Number(String(s ?? "").replace(/,/g, "")) || 0;

const twMarketFlow = unstable_cache(async () => {
  const r = await fetch("https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&response=json", { headers: TW_HEAD, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = await r.json() as { date?: string; data?: string[][] };
  if (!Array.isArray(j.data)) return null;
  const pick = (re: RegExp) => j.data!.filter(x => re.test(x[0]) && !/合計/.test(x[0])).reduce((a, x) => a + twNum(x[3]), 0);
  return {
    date: j.date ?? null,
    foreign: pick(/外資/),   // 외국인(외국인 자기매매 포함)
    trust: pick(/投信/),     // 투신
    dealer: pick(/自營商/),  // 자기매매
  };
}, ["tw-bfi82u-v1"], { revalidate: 600 });

const twStockFlow = unstable_cache(async () => {
  const r = await fetch("https://www.twse.com.tw/rwd/zh/fund/T86?selectType=ALLBUT0999&response=json", { headers: TW_HEAD, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return {} as Record<string, number>;
  const j = await r.json() as { fields?: string[]; data?: string[][] };
  const f = j.fields ?? [];
  const ci = f.findIndex(x => /證券代號/.test(x));
  const fi = f.findIndex(x => /外陸資買賣超股數/.test(x) && /不含/.test(x));
  if (ci < 0 || fi < 0 || !Array.isArray(j.data)) return {} as Record<string, number>;
  return Object.fromEntries(j.data.map(d => [String(d[ci]).trim(), twNum(d[fi])]));
}, ["tw-t86-v1"], { revalidate: 600 });

const quotes = unstable_cache(async (mkt: AsiaMkt) => spark(ASIA_STOCKS[mkt].map(x => x.s)), ["asia-quotes-v1"], { revalidate: 6 });

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const mkt = (["JP", "TW", "HK", "CN"].includes(sp.get("mkt") ?? "") ? sp.get("mkt") : "JP") as AsiaMkt;
  const type = sp.get("type") ?? "cap";
  try {
    const [q, flow, sflow] = await Promise.all([
      quotes(mkt),
      mkt === "TW" ? twMarketFlow().catch(() => null) : Promise.resolve(null),
      mkt === "TW" ? twStockFlow().catch(() => ({} as Record<string, number>)) : Promise.resolve({} as Record<string, number>),
    ]);
    let rows: Row[] = ASIA_STOCKS[mkt].flatMap((x, i) => {
      const v = q[x.s];
      if (!v) return [];
      const code = x.s.replace(/\.(TW|T|HK|SS|SZ)$/, "");
      const fs = mkt === "TW" ? sflow[code] : undefined;
      return [{
        rank: i + 1, code: x.s, name: x.ko, price: v.price, change: v.price - v.prev, changePct: ((v.price - v.prev) / v.prev) * 100,
        volume: v.volume, amount: v.volume * v.price,
        foreignNet: fs != null ? fs * v.price : mkt === "TW" ? null : undefined,
      }];
    });
    if (type === "gainers") rows = rows.filter(r => r.changePct > 0).sort((a, b) => b.changePct - a.changePct);
    else if (type === "losers") rows = rows.filter(r => r.changePct < 0).sort((a, b) => a.changePct - b.changePct);
    else if (type === "amount") rows = rows.sort((a, b) => b.amount - a.amount);
    else if (type === "foreign") rows = rows.filter(r => r.foreignNet != null).sort((a, b) => (b.foreignNet ?? 0) - (a.foreignNet ?? 0));
    rows = rows.slice(0, 30).map((r, i) => ({ ...r, rank: i + 1 }));
    return NextResponse.json({ mkt, type, stocks: rows, flow, timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ mkt, type, stocks: [], error: String(e).slice(0, 120) });
  }
}
