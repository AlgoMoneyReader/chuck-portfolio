import { NextResponse } from "next/server";
import { kisGet, num } from "@/lib/kis";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

interface BreadthData { advance: number; decline: number; unchanged: number; total: number; upLimit?: number; downLimit?: number; asOf?: string; }

// KIS 업종(지수) 현재가: 상승·하락·보합·상한·하한 종목 수를 실시간으로 준다
async function tryKIS(code: string): Promise<BreadthData | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-index-price", "FHPUP02100000", {
      FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: code === "KOSDAQ" ? "1001" : "0001",
    });
    const o = (Array.isArray(j.output) ? j.output[0] : j.output) as Record<string, string> | undefined;
    if (!o) return null;
    const advance = num(o.ascn_issu_cnt) ?? 0, decline = num(o.down_issu_cnt) ?? 0, unchanged = num(o.stnr_issu_cnt) ?? 0;
    if (advance + decline === 0) return null;
    return {
      advance, decline, unchanged, total: advance + decline + unchanged,
      upLimit: num(o.uplm_issu_cnt) ?? 0, downLimit: num(o.lslm_issu_cnt) ?? 0,
      asOf: new Date(Date.now() + 9 * 3_600_000).toISOString().slice(11, 16),
    };
  } catch { return null; }
}

const cache: Record<string, { key: string; data: BreadthData; at: number }> = {};
const TTL = 20_000;

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

async function tryNaverMobileAPI(code: string): Promise<BreadthData | null> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/index/${code}/basic`, {
      headers: { "User-Agent": UA, "Referer": "https://m.stock.naver.com/" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = await res.json();
    const advance  = parseInt(j.riseCount  ?? j.advancingCount  ?? j.riseStockCount  ?? "0", 10);
    const decline  = parseInt(j.fallCount  ?? j.decliningCount  ?? j.fallStockCount  ?? "0", 10);
    const unchanged = parseInt(j.holdCount ?? j.unchangedCount  ?? j.holdStockCount  ?? "0", 10);
    if (advance + decline === 0) return null;
    return { advance, decline, unchanged, total: advance + decline + unchanged };
  } catch { return null; }
}

async function tryNaverHTML(code: string): Promise<BreadthData | null> {
  try {
    const res = await fetch(`https://finance.naver.com/sise/sise_index.naver?code=${code}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://finance.naver.com/",
        "Accept": "text/html",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const buf  = await res.arrayBuffer();
    const html = new TextDecoder("euc-kr").decode(buf);

    // Pattern 1: <em class="up">456</em>
    const upMatch   = html.match(/class=["']up["'][^>]*>(\d[\d,]*)<\/em>/);
    const downMatch = html.match(/class=["']down["'][^>]*>(\d[\d,]*)<\/em>/);
    if (upMatch && downMatch) {
      const advance = parseInt(upMatch[1].replace(/,/g, ""), 10);
      const decline = parseInt(downMatch[1].replace(/,/g, ""), 10);
      if (advance + decline > 0) return { advance, decline, unchanged: 0, total: advance + decline };
    }

    // Pattern 2: 상승종목수 / 하락종목수
    const riseMatch = html.match(/상승종목수[^<]*<[^>]+>(\d+)/);
    const fallMatch = html.match(/하락종목수[^<]*<[^>]+>(\d+)/);
    if (riseMatch && fallMatch) {
      const advance = parseInt(riseMatch[1], 10);
      const decline = parseInt(fallMatch[1], 10);
      if (advance + decline > 0) return { advance, decline, unchanged: 0, total: advance + decline };
    }

    return null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";
  const code   = market === "KOSDAQ" ? "KOSDAQ" : "KOSPI";

  const cacheKey = `${code}-${Math.floor(Date.now() / TTL)}`;
  const hit = cache[code];
  if (hit && hit.key === cacheKey) {
    return NextResponse.json({ market, ...hit.data, cached: true });
  }

  const result =
    (await tryKIS(code)) ??
    (await tryNaverMobileAPI(code)) ??
    (await tryNaverHTML(code));

  if (!result) {
    return NextResponse.json({ error: "등락 데이터를 불러올 수 없습니다" }, { status: 500 });
  }

  cache[code] = { key: cacheKey, data: result, at: Date.now() };
  return NextResponse.json({ market, ...result, timestamp: new Date().toISOString() });
}
