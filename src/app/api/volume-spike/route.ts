import { NextResponse } from "next/server";
import { KOSPI_SYMBOLS, KOSDAQ_SYMBOLS, koreanName } from "@/lib/stockList";
import { kisGet, num } from "@/lib/kis";

export const dynamic = "force-dynamic";

interface VolumeResult {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePct: number;
  todayVolume: number;
  avgVolume: number;
  ratio: number; // todayVolume / avgVolume
}

async function fetchVolumeData(symbol: string): Promise<VolumeResult | null> {
  try {
    // 5일치 일봉 → 오늘 포함 최대 5개 데이터 포인트 (타임스탬프로 CDN 캐시 무효화)
    const bust = Date.now();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_=${bust}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const volumes: number[] = result.indicators?.quote?.[0]?.volume ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    if (volumes.length < 2) return null;

    const todayVolume = volumes[volumes.length - 1] ?? 0;
    const prevVolumes = volumes.slice(0, -1).filter((v) => v > 0);
    if (!prevVolumes.length || todayVolume === 0) return null;

    const avgVolume = prevVolumes.reduce((a, b) => a + b, 0) / prevVolumes.length;
    const ratio = todayVolume / avgVolume;

    const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2] ?? 0;
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

    return {
      rank: 0,
      code: symbol.replace(/\.(KS|KQ)$/, ""),
      name: koreanName(symbol),
      price: Math.round(price),
      changePct: parseFloat(changePct.toFixed(2)),
      todayVolume,
      avgVolume: Math.round(avgVolume),
      ratio: parseFloat(ratio.toFixed(1)),
    };
  } catch {
    return null;
  }
}

// KIS 거래량 순위의 '거래증가율' 정렬(FID_BLNG_CLS_CODE=1) — 시장 전체에서 평소보다 거래가 몰린 종목 (최대 30)
const ETF_RE = /^(KODEX|TIGER|KBSTAR|RISE|ACE|SOL|HANARO|KOSEF|ARIRANG|PLUS|TIMEFOLIO|KIWOOM|1Q|BNK|WON|파워|마이다스|에셋플러스|히어로즈|TRUSTON|UNICORN|FOCUS|KoAct|ITF)\b|ETN|스팩|SPAC/i;
async function kisSpikes(market: string): Promise<VolumeResult[] | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/volume-rank", "FHPST01710000", {
      FID_COND_MRKT_DIV_CODE: "J", FID_COND_SCR_DIV_CODE: "20171", FID_INPUT_ISCD: market === "KOSDAQ" ? "1001" : "0001",
      FID_DIV_CLS_CODE: "1", FID_BLNG_CLS_CODE: "1", FID_TRGT_CLS_CODE: "111111111",
      FID_TRGT_EXLS_CLS_CODE: "0000000000", FID_INPUT_PRICE_1: "", FID_INPUT_PRICE_2: "", FID_VOL_CNT: "100000", FID_INPUT_DATE_1: "",
    });
    const rows = ((j.output ?? []) as Record<string, string>[]).flatMap(r => {
      const code = (r.mksc_shrn_iscd ?? "").trim(), name = (r.hts_kor_isnm ?? "").trim();
      // avrg_vol 은 오늘 거래량과 같게 와서(배율 1x) 쓰지 않는다 → 전일 거래량(prdy_vol) 대비, 없으면 거래증가율(vol_inrt %)
      const vol = num(r.acml_vol) ?? 0, prev = num(r.prdy_vol) ?? 0, inrt = num(r.vol_inrt), price = num(r.stck_prpr) ?? 0;
      if (!/^[0-9][0-9A-Z]{5}$/.test(code) || !vol || !price || ETF_RE.test(name)) return [];
      const ratio = prev > 0 ? vol / prev : inrt != null ? 1 + inrt / 100 : 0;
      if (!ratio) return [];
      return [{ rank: 0, code, name, price, changePct: num(r.prdy_ctrt) ?? 0, todayVolume: vol, avgVolume: prev, ratio: Math.round(ratio * 10) / 10 }];
    });
    return rows.length ? rows : null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";
  const symbols = market === "KOSDAQ" ? KOSDAQ_SYMBOLS : KOSPI_SYMBOLS;

  const k = await kisSpikes(market);
  if (k) {
    const spikes = k.filter(r => r.ratio >= 1.5).sort((a, b) => b.ratio - a.ratio).slice(0, 30).map((r, i) => ({ ...r, rank: i + 1 }));
    if (spikes.length) return NextResponse.json({ market, spikes, source: "kis", basis: "전일 대비", timestamp: new Date().toISOString() });
  }

  try {
    const results = await Promise.all(symbols.map(fetchVolumeData));
    const sorted = results
      .filter((r): r is VolumeResult => r !== null && r.ratio >= 1)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 30)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return NextResponse.json({ market, spikes: sorted, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
