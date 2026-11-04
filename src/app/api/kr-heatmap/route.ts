import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { kisGet, num } from "@/lib/kis";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 60;

type Market = "KOSPI" | "KOSDAQ";
const SIZE: Record<Market, number> = { KOSPI: 100, KOSDAQ: 60 };
interface Base { code: string; name: string; sector: string; capEok: number }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// KIS 초당 20건 제한 안에서 10개씩 나눠 조회
async function inBatches<T, R>(xs: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += 10) {
    out.push(...(await Promise.all(xs.slice(i, i + 10).map(fn))));
    if (i + 10 < xs.length) await sleep(600);
  }
  return out;
}

async function naverTop(market: Market, n: number): Promise<{ code: string; name: string }[]> {
  const out: { code: string; name: string }[] = [];
  for (let page = 1; page <= Math.ceil(n / 50) + 1 && out.length < n; page++) {
    const res = await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=50`, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" }, signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!res.ok) throw new Error(`naver HTTP ${res.status}`);
    const got = ((await res.json()).stocks ?? []) as Record<string, string>[];
    if (!got.length) break;
    for (const x of got) if (x.stockEndType === "stock" && !out.some(o => o.code === x.itemCode)) out.push({ code: x.itemCode, name: x.stockName });
  }
  return out.slice(0, n);
}

async function kisTop(market: Market): Promise<{ code: string; name: string }[]> {
  const j = await kisGet("/uapi/domestic-stock/v1/ranking/market-cap", "FHPST01740000", {
    fid_cond_mrkt_div_code: "J", fid_cond_scr_div_code: "20174", fid_div_cls_code: "0",
    fid_input_iscd: market === "KOSPI" ? "0001" : "1001", fid_trgt_cls_code: "0", fid_trgt_exls_cls_code: "0",
    fid_input_price_1: "", fid_input_price_2: "", fid_vol_cnt: "",
  });
  return ((j.output ?? []) as Record<string, string>[]).map(r => ({ code: r.mksc_shrn_iscd, name: (r.hts_kor_isnm ?? "").trim() }));
}

// 종목 목록 + 업종(KIS 현재가 조회의 bstp_kor_isnm). 업종은 거의 안 바뀌니 12시간 공유 캐시
const baseList = unstable_cache(async (market: Market): Promise<Base[]> => {
  let list: { code: string; name: string }[] = [];
  try { list = await naverTop(market, SIZE[market]); } catch { /* KIS 로 대체 */ }
  if (list.length < 30) {
    const k = await kisTop(market);
    for (const x of k) if (!list.some(l => l.code === x.code)) list.push(x);
  }
  const fetchOne = async (x: { code: string; name: string }): Promise<Base | null> => {
    try {
      const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: x.code });
      return { ...x, sector: (j.output?.bstp_kor_isnm ?? "").trim() || "기타", capEok: num(j.output?.hts_avls) ?? 0 };
    } catch { return null; }
  };
  let rows = await inBatches(list, fetchOne);
  const failed = list.filter((_, i) => !rows[i]);
  if (failed.length) {
    await sleep(1000);
    const retry = await inBatches(failed, fetchOne);
    rows = rows.map(r => r ?? retry.shift() ?? null);
  }
  const ok = rows.filter((r): r is Base => !!r);
  if (ok.length < list.length * 0.8) throw new Error(`업종 조회 ${ok.length}/${list.length}`);
  return ok;
}, ["kr-heatmap-base-v1"], { revalidate: 12 * 3600 });

// 실시간 등락률: 네이버 시가총액 순위 값, 안 되면 KIS 현재가
async function liveQuotes(market: Market, codes: string[]): Promise<Record<string, { price: number; pct: number; capEok?: number }>> {
  const out: Record<string, { price: number; pct: number; capEok?: number }> = {};
  try {
    for (let page = 1; page <= 4; page++) {
      const res = await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=50`, {
        headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" }, signal: AbortSignal.timeout(8000), cache: "no-store",
      });
      if (!res.ok) break;
      const got = ((await res.json()).stocks ?? []) as Record<string, string>[];
      for (const x of got) {
        const price = num(x.closePrice), pct = num(x.fluctuationsRatio);
        if (price && pct != null) out[x.itemCode] = { price, pct, capEok: num(x.marketValue) ?? undefined };
      }
      if (codes.every(c => out[c]) || !got.length) break;
    }
  } catch { /* KIS 로 */ }
  const missing = codes.filter(c => !out[c]);
  if (missing.length) {
    const rs = await inBatches(missing, async c => {
      try {
        const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: c });
        return { c, price: num(j.output?.stck_prpr) ?? 0, pct: num(j.output?.prdy_ctrt) ?? 0, capEok: num(j.output?.hts_avls) ?? undefined };
      } catch { return null; }
    });
    for (const r of rs) if (r && r.price) out[r.c] = { price: r.price, pct: r.pct, capEok: r.capEok };
  }
  return out;
}

const cache: Partial<Record<Market, { at: number; body: object }>> = {};

export async function GET(request: Request) {
  const market = ((new URL(request.url).searchParams.get("market") ?? "KOSPI").toUpperCase()) as Market;
  if (!(market in SIZE)) return NextResponse.json({ error: "market" }, { status: 400 });
  const hit = cache[market];
  if (hit && Date.now() - hit.at < 60_000) return NextResponse.json(hit.body);

  try {
    const base = await baseList(market);
    const live = await liveQuotes(market, base.map(b => b.code));
    const items = base.flatMap(b => {
      const q = live[b.code];
      if (!q) return [];
      return [{ s: b.code, n: b.name, sec: b.sector, ind: b.sector, cap: q.capEok || b.capEok || 1, pct: parseFloat(q.pct.toFixed(2)), price: q.price }];
    });
    const up = items.filter(i => i.pct > 0).length, down = items.filter(i => i.pct < 0).length;
    const body = {
      index: market, source: `${market} 시가총액 상위 ${base.length}종목 · 업종 한국투자 · 시세 네이버/한국투자`,
      asOf: new Date().toISOString(), total: base.length, items, breadth: { up, down, flat: items.length - up - down },
    };
    if (items.length) cache[market] = { at: Date.now(), body };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ index: market, items: [], error: String(e).slice(0, 200) });
  }
}
