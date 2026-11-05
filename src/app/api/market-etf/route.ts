import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

/**
 * 매매동향 · ETF·ETN (레버리지·인버스 포함)
 *  sort = cap(시가총액) | up(상승) | down(하락) | amount(거래대금),  kind = all | lev(레버리지) | inv(인버스) | etn
 * 1순위 네이버 금융 ETF·ETN 전체 목록, 실패하면 네이버 모바일 시가총액 순위에서 ETF·ETN 만 골라 쓴다. 5초 보관
 */
interface Row {
  rank: number; code: string; symbol: string; name: string; price: number; change: number; changePct: number;
  volume: number; tradeAmount: number; capEok?: number; type: "ETF" | "ETN";
}
const n = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(x) ? 0 : x; };

// 네이버 금융 API 는 EUC-KR 로 올 때가 있다 → 깨지면 EUC-KR 로 다시 읽는다
async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://finance.naver.com/" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) return null;
  const buf = await r.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("euc-kr").decode(buf);
  try { return JSON.parse(text); } catch { return null; }
}

async function naverList(kind: "etf" | "etn"): Promise<Row[]> {
  const j = await getJson(`https://finance.naver.com/api/sise/${kind}ItemList.nhn`);
  const list = ((j?.result as Record<string, unknown> | undefined)?.[`${kind}ItemList`] ?? []) as Record<string, unknown>[];
  return list.flatMap(x => {
    const code = String(x.itemcode ?? "").trim(), price = n(x.nowVal), pct = n(x.changeRate);
    if (!/^\w{6}$/.test(code) || !price) return [];
    const ch = Math.abs(n(x.changeVal));
    return [{
      rank: 0, code, symbol: `${code}.KS`, name: String(x.itemname ?? code), price, change: pct < 0 ? -ch : ch, changePct: pct,
      volume: n(x.quant), tradeAmount: n(x.amonut ?? x.amount) * 1e6, capEok: n(x.marketSum) || undefined, type: kind === "etf" ? "ETF" : "ETN",
    } as Row];
  });
}

// 대체: 네이버 모바일 시가총액 순위(코스피)에서 ETF·ETN 만
async function mobileFallback(): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page <= 6; page++) {
    const j = await getJson(`https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=${page}&pageSize=100`).catch(() => null);
    const got = (j?.stocks ?? []) as Record<string, unknown>[];
    if (!got.length) break;
    for (const x of got) {
      const t = String(x.stockEndType ?? "");
      if (t !== "etf" && t !== "etn") continue;
      const code = String(x.itemCode ?? ""), price = n(x.closePrice), pct = n(x.fluctuationsRatio), ch = Math.abs(n(x.compareToPreviousClosePrice));
      out.push({ rank: 0, code, symbol: `${code}.KS`, name: String(x.stockName ?? code), price, change: pct < 0 ? -ch : ch, changePct: pct,
        volume: n(x.accumulatedTradingVolume), tradeAmount: n(x.accumulatedTradingValue) * 1e6, capEok: n(x.marketValue) || undefined, type: t === "etf" ? "ETF" : "ETN" });
    }
  }
  return out;
}

const LEV = /레버리지|2X|울트라|\b2x\b/i, INV = /인버스|곱버스|bear|숏/i;
let cache: { at: number; rows: Row[]; source: string } | null = null;

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const sort = sp.get("sort") ?? "cap", kind = sp.get("kind") ?? "all";
  try {
    if (!cache || Date.now() - cache.at > 5_000) {
      const [etf, etn] = await Promise.all([naverList("etf").catch(() => [] as Row[]), naverList("etn").catch(() => [] as Row[])]);
      let rows = [...etf, ...etn], source = "네이버 금융";
      if (!rows.length) { rows = await mobileFallback(); source = "네이버 증권(시가총액 순위)"; }
      if (rows.length) cache = { at: Date.now(), rows, source };
    }
    let rows = cache?.rows ?? [];
    if (kind === "lev") rows = rows.filter(r => LEV.test(r.name) && !INV.test(r.name));
    else if (kind === "inv") rows = rows.filter(r => INV.test(r.name));
    else if (kind === "etn") rows = rows.filter(r => r.type === "ETN");
    rows = sort === "up" ? rows.filter(r => r.changePct > 0).sort((a, b) => b.changePct - a.changePct)
      : sort === "down" ? rows.filter(r => r.changePct < 0).sort((a, b) => a.changePct - b.changePct)
      : sort === "amount" ? [...rows].sort((a, b) => b.tradeAmount - a.tradeAmount)
      : [...rows].sort((a, b) => (b.capEok ?? 0) - (a.capEok ?? 0));
    const out = rows.slice(0, 100).map((r, i) => ({ ...r, rank: i + 1 }));
    return NextResponse.json({ rows: out, total: cache?.rows.length ?? 0, source: cache?.source ?? "", timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ rows: [], error: String(e).slice(0, 120) });
  }
}
