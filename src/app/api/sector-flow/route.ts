import { NextResponse } from "next/server";
import { getLiveFlow } from "@/lib/liveFlow";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 45;

/**
 * 업종 동향: 히트맵과 같은 업종 분류(KIS 업종명)로 시총 상위 종목의
 * 현재가·등락률과 오늘 투자자별 순매수(외국인=외국계 창구 실시간, 기관=거래소 가집계)를 보여준다.
 */
interface HeatItem { s: string; n: string; sec: string; cap: number; pct: number; price: number }
const norm = (s: string) => s.replace(/[\s·.,\-]/g, "");

async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k]); } }));
  return out;
}

const cache = new Map<string, { at: number; body: object }>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sector = url.searchParams.get("sector") ?? "";
  const market = url.searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  if (!sector) return NextResponse.json({ error: "sector" }, { status: 400 });
  const key = `${market}:${norm(sector)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return NextResponse.json(hit.body);

  const heat = await fetch(`${url.origin}/api/kr-heatmap?market=${market}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) })
    .then(r => r.json()).catch(() => null);
  const want = norm(sector);
  const items = ((heat?.items ?? []) as HeatItem[])
    .filter(i => { const s = norm(i.sec); return s === want || s.startsWith(want) || want.startsWith(s); })
    .sort((a, b) => b.cap - a.cap).slice(0, 10);
  if (!items.length) return NextResponse.json({ sector, market, stocks: [], note: "히트맵(시총 상위)에 이 업종 종목이 없습니다" });

  const stocks = await pool(items, 3, async i => {
    let f: Awaited<ReturnType<typeof getLiveFlow>> | null = null;
    try { f = await getLiveFlow(i.s); } catch { /* 수급 없이 시세만 */ }
    return {
      code: i.s, name: i.n, price: i.price, pct: i.pct, capEok: Math.round(i.cap),
      foreign: f ? (f.final ? f.foreignEok ?? null : f.globalEok ?? (f.available ? f.foreignEok ?? null : null)) : null,
      foreignBasis: f?.final ? "장마감 확정" : f?.globalEok != null ? "창구" : f?.available ? `${f.asOf} 가집계` : null,
      institution: f?.available ? f.institutionEok ?? null : null,
      instBasis: f?.final ? "장마감 확정" : f?.available ? `${f.asOf} 가집계` : null,
    };
  });

  const sum = (k: "foreign" | "institution") => stocks.reduce((a, s) => a + (s[k] ?? 0), 0);
  const capSum = stocks.reduce((a, s) => a + s.capEok, 0);
  const body = {
    sector, market, asOf: new Date(Date.now() + 9 * 3_600_000).toISOString().slice(11, 16),
    total: {
      foreign: sum("foreign"), institution: sum("institution"),
      // 시총 가중 평균 등락률
      pct: capSum ? parseFloat((stocks.reduce((a, s) => a + s.pct * s.capEok, 0) / capSum).toFixed(2)) : null,
      up: stocks.filter(s => s.pct > 0).length, down: stocks.filter(s => s.pct < 0).length,
    },
    stocks,
  };
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
