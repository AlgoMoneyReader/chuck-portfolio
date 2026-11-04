import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 60;

/**
 * 업종별 실적: 히트맵과 같은 업종 분류(KIS bstp_kor_isnm)로 시가총액 상위 종목을 골라
 * 각 종목의 최근 분기 실적(DART, 잠정 포함)을 모아 보여준다.
 */
interface HeatItem { s: string; n: string; sec: string; cap: number; pct: number; price: number }
interface Q { period: string; prelim?: boolean; sales: number | null; op: number | null; net: number | null; salesYoY: number | null; opYoY: number | null }

const norm = (s: string) => s.replace(/[\s·.,\-]/g, "");

const cache = new Map<string, { at: number; body: object }>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sector = url.searchParams.get("sector") ?? "";
  const market = url.searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  if (!sector) return NextResponse.json({ error: "sector" }, { status: 400 });
  const key = `${market}:${norm(sector)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return NextResponse.json(hit.body);

  const heat = await fetch(`${url.origin}/api/kr-heatmap?market=${market}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) })
    .then(r => r.json()).catch(() => null);
  const items = ((heat?.items ?? []) as HeatItem[]);
  const want = norm(sector);
  // 업종 이름이 조금 달라도(예: '운송장비·부품' vs '운송장비') 앞부분이 같으면 같은 업종으로 본다
  const inSector = items.filter(i => { const s = norm(i.sec); return s === want || s.startsWith(want) || want.startsWith(s); })
    .sort((a, b) => b.cap - a.cap).slice(0, 8);
  if (!inSector.length) {
    return NextResponse.json({ sector, market, stocks: [], note: "히트맵(시총 상위)에 이 업종 종목이 없습니다" });
  }

  const stocks = await Promise.all(inSector.map(async i => {
    const q = await fetch(`${url.origin}/api/stock-quarterly?code=${i.s}`, { cache: "no-store", signal: AbortSignal.timeout(45_000) })
      .then(r => r.json()).catch(() => null);
    const quarters = (q?.quarters ?? []) as Q[];
    const latest = quarters[quarters.length - 1] ?? null;
    return { code: i.s, name: i.n, cap: i.cap, pct: i.pct, latest, recent: quarters.slice(-4).map(x => ({ period: x.period, op: x.op, sales: x.sales, prelim: !!x.prelim })) };
  }));

  // 업종 합계: 가장 많이 나온 최신 분기 기준으로만 더한다
  const periods = stocks.map(s => s.latest?.period).filter(Boolean) as string[];
  const period = periods.sort((a, b) => periods.filter(p => p === b).length - periods.filter(p => p === a).length || b.localeCompare(a))[0] ?? null;
  const same = stocks.filter(s => s.latest?.period === period && s.latest);
  const sum = (f: (q: Q) => number | null) => same.reduce((a, s) => a + (f(s.latest!) ?? 0), 0);
  // 전년 동기 합계는 각 종목 YoY 로 역산
  const prev = (f: (q: Q) => number | null, g: (q: Q) => number | null) => same.reduce((a, s) => {
    const v = f(s.latest!), y = g(s.latest!);
    return v != null && y != null && y > -100 ? a + v / (1 + y / 100) : a;
  }, 0);
  const salesSum = sum(q => q.sales), opSum = sum(q => q.op);
  const salesPrev = prev(q => q.sales, q => q.salesYoY), opPrev = prev(q => q.op, q => q.opYoY);
  const body = {
    sector, market, period, count: same.length,
    total: {
      sales: salesSum, op: opSum,
      salesYoY: salesPrev ? parseFloat((((salesSum - salesPrev) / Math.abs(salesPrev)) * 100).toFixed(1)) : null,
      opYoY: opPrev ? parseFloat((((opSum - opPrev) / Math.abs(opPrev)) * 100).toFixed(1)) : null,
      margin: salesSum ? parseFloat(((opSum / salesSum) * 100).toFixed(1)) : null,
    },
    stocks,
  };
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
