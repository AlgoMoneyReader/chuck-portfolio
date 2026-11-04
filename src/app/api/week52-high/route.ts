import { NextResponse } from "next/server";
import { KOSPI_SYMBOLS, KOSDAQ_SYMBOLS, koreanName } from "@/lib/stockList";
import { kisGet, num } from "@/lib/kis";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 30;

/**
 * 52주 신고가 돌파·근접 종목
 * 1순위: KIS 순위분석 '신고/신저근접종목 상위'(FHPST01870000) — 시장 전체 종목 대상
 * 2순위: 주요 종목 목록을 Yahoo 주봉으로 직접 계산 (KIS 실패 시)
 * 결과는 5분 보관 (매 요청마다 수십 건씩 외부 호출하지 않도록)
 */

interface Week52Result {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePct: number;
  week52High: number;
  distFromHigh: number; // (price - high52) / high52 * 100, 양수 = 신고가 돌파
  isNewHigh: boolean;
}

async function fetch52WeekData(symbol: string): Promise<Week52Result | null> {
  try {
    // 1년치 주봉 데이터 (52개 포인트, 빠르게 로드됨)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=1y`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const highs: number[] = result.indicators?.quote?.[0]?.high ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    if (!highs.length || !closes.length) return null;

    const currentPrice = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prevClose = meta.chartPreviousClose ?? closes[closes.length - 2];
    if (!currentPrice || !prevClose) return null;

    // 52주 고가: 지난 52주 중 최고값 (오늘 제외)
    const pastHighs = highs.slice(0, -1).filter((v) => v && v > 0);
    if (!pastHighs.length) return null;
    const week52High = Math.max(...pastHighs);

    const distFromHigh = ((currentPrice - week52High) / week52High) * 100;
    const changePct = ((currentPrice - prevClose) / prevClose) * 100;

    return {
      rank: 0,
      code: symbol.replace(/\.(KS|KQ)$/, ""),
      name: koreanName(symbol),
      price: Math.round(currentPrice),
      changePct: parseFloat(changePct.toFixed(2)),
      week52High: Math.round(week52High),
      distFromHigh: parseFloat(distFromHigh.toFixed(1)),
      isNewHigh: distFromHigh >= 0,
    };
  } catch {
    return null;
  }
}

type KisRow = Record<string, string>;

async function fromKis(market: string): Promise<Week52Result[] | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/ranking/near-new-highlow", "FHPST01870000", {
      fid_aply_rang_vol: "0", fid_cond_mrkt_div_code: "J", fid_cond_scr_div_code: "20187",
      fid_div_cls_code: "0", fid_input_cnt_1: "0", fid_input_cnt_2: "3",
      fid_prc_cls_code: "0", // 0: 신고근접
      fid_input_iscd: market === "KOSDAQ" ? "1001" : "0001",
      fid_trgt_cls_code: "0", fid_trgt_exls_cls_code: "0",
      fid_aply_rang_prc_1: "", fid_aply_rang_prc_2: "",
    });
    const rows = (Array.isArray(j.output) ? j.output : []) as KisRow[];
    const out: Week52Result[] = [];
    for (const r of rows) {
      const code = String(r.mksc_shrn_iscd ?? r.stck_shrn_iscd ?? "").trim();
      const price = num(r.stck_prpr) ?? 0, high = num(r.new_hgpr) ?? 0;
      if (!/^\w{6}$/.test(code) || !price || !high) continue;
      // ETF·ETN·스팩 등은 제외 (종목명 기준)
      const name = String(r.hts_kor_isnm ?? "").trim();
      if (/^(KODEX|TIGER|KBSTAR|RISE|ACE|SOL|HANARO|KOSEF|ARIRANG|PLUS|TIMEFOLIO|KIWOOM|1Q|BNK|WON|파워|마이다스|에셋플러스|히어로즈|TRUSTON|UNICORN|VITA|DAISHIN343|FOCUS|KoAct|ITF)\b|ETN|스팩|SPAC/i.test(name)) continue;
      // prdy_ctrt 는 부호 포함. 부호 없이 오는 경우를 대비해 전일대비 부호(4·5=하락)로 맞춘다
      const raw = num(r.prdy_ctrt) ?? 0;
      const pct = (r.prdy_vrss_sign === "4" || r.prdy_vrss_sign === "5") ? -Math.abs(raw) : raw;
      // 이미 고가를 넘었으면 new_hgpr 가 현재가와 같아진다 → 0% (돌파)
      const dist = ((price - high) / high) * 100;
      out.push({ rank: 0, code, name, price, changePct: Math.round(pct * 100) / 100,
        week52High: high, distFromHigh: Math.round(dist * 10) / 10, isNewHigh: dist >= 0 });
    }
    return out.length ? out : null;
  } catch { return null; }
}

async function fromYahoo(market: string): Promise<Week52Result[]> {
  const symbols = market === "KOSDAQ" ? KOSDAQ_SYMBOLS : KOSPI_SYMBOLS;
  const results = await Promise.all(symbols.map(fetch52WeekData));
  return results.filter((r): r is Week52Result => r !== null && r.distFromHigh >= -3);
}

const cache: Record<string, { at: number; body: object }> = {};
const TTL = 5 * 60_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const hit = cache[market];
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  try {
    const kis = await fromKis(market);
    const list = kis ?? await fromYahoo(market);
    const candidates = list
      .filter(r => r.distFromHigh >= -3)
      .sort((a, b) => b.distFromHigh - a.distFromHigh || b.changePct - a.changePct)
      .slice(0, 30)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    const body = { market, candidates, source: kis ? "kis" : "yahoo", timestamp: new Date().toISOString() };
    if (candidates.length) cache[market] = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
