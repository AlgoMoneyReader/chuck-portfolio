import { NextResponse } from "next/server";
import { ASIA_SYMBOLS } from "@/lib/asiaMarkets";
import { kisGet, num } from "@/lib/kis";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

// 봉 단위: 1m 2m 5m 30m 60m D W M
const TF = ["1m", "2m", "5m", "30m", "60m", "D", "W", "M"] as const;
type Tf = typeof TF[number];

const YAHOO: Record<string, string> = {
  ...ASIA_SYMBOLS,
  KOSPI: "^KS11", KOSDAQ: "^KQ11", "S&P 500": "^GSPC", NASDAQ: "^IXIC", "다우존스": "^DJI", "러셀 2000": "^RUT", "필라델피아 반도체": "^SOX", VIX: "^VIX",
  "S&P500 선물": "ES=F", "나스닥 선물": "NQ=F", "다우 선물": "YM=F", "금": "GC=F", "WTI 원유": "CL=F", "USD/KRW": "KRW=X",
};
const KIS_INDEX: Record<string, string> = { KOSPI: "0001", KOSDAQ: "1001" };
const KIS_SEC: Partial<Record<Tf, string>> = { "1m": "60", "2m": "120", "5m": "300", "30m": "1800", "60m": "3600" };
// 차트를 왼쪽으로 끌거나 줄였을 때 과거가 비지 않도록 넉넉히 받는다 (Yahoo 한도: 1분 7일, 2·5·30분 60일, 1시간 2년)
const Y_INT: Record<Tf, [string, string]> = {
  "1m": ["1m", "5d"], "2m": ["2m", "1mo"], "5m": ["5m", "1mo"], "30m": ["30m", "60d"], "60m": ["60m", "6mo"],
  D: ["1d", "5y"], W: ["1wk", "max"], M: ["1mo", "max"],
};

// lightweight-charts 는 UTC 로 그리므로 한국 시간 벽시계 그대로 UTC 초로 바꿔 넣는다
interface Candle { time: number | string; open: number; high: number; low: number; close: number; volume?: number }
const KST = 9 * 3600;
const intraday = (tf: Tf) => !!KIS_SEC[tf];
const ymdStr = (d8: string) => `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}`;
const kstEpoch = (d8: string, hms: string) =>
  Date.UTC(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8), +hms.slice(0, 2), +hms.slice(2, 4)) / 1000;

// 홍콩·중국 지수는 Yahoo 분봉이 비거나 시가(open)가 빠져 오는 경우가 있다 → 좁은 구간이 비면 넓혀서 다시
async function yahoo(sym: string, tf: Tf): Promise<{ candles: Candle[]; prevClose: number | null }> {
  const first = await yahooOnce(sym, tf, Y_INT[tf]);
  if (first.candles.length || !intraday(tf)) return first;
  for (const alt of [[Y_INT[tf][0], "5d"], ["5m", "5d"], ["15m", "5d"]] as [string, string][]) {
    const r = await yahooOnce(sym, tf, alt).catch(() => null);
    if (r?.candles.length) return { ...r, prevClose: first.prevClose ?? r.prevClose };
  }
  return first;
}

async function yahooOnce(sym: string, tf: Tf, [interval, range]: [string, string]): Promise<{ candles: Candle[]; prevClose: number | null }> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`yahoo HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = [];
  let last: number | null = null;
  ts.forEach((t, i) => {
    const c = q.close?.[i];
    if (c == null) return;
    // 시가·고가·저가가 빠진 봉은 종가(또는 직전 종가)로 채운다
    const o = q.open?.[i] ?? last ?? c;
    const h = q.high?.[i] ?? Math.max(o, c), l = q.low?.[i] ?? Math.min(o, c);
    last = c;
    const time = intraday(tf) ? t + KST : new Date((t + KST) * 1000).toISOString().slice(0, 10);
    candles.push({ time, open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? undefined });
  });
  // 일·주·월봉은 같은 날짜가 두 번 올 수 있어(진행 중인 봉) 뒤의 것만 남긴다
  const dedup = new Map(candles.map(c => [String(c.time), c]));
  return { candles: Array.from(dedup.values()), prevClose: r?.meta?.chartPreviousClose ?? r?.meta?.previousClose ?? null };
}

async function kisIndexMinute(isc: string, tf: Tf): Promise<Candle[]> {
  const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice", "FHKUP03500200", {
    FID_COND_MRKT_DIV_CODE: "U", FID_ETC_CLS_CODE: "0", FID_INPUT_ISCD: isc, FID_INPUT_HOUR_1: KIS_SEC[tf]!, FID_PW_DATA_INCU_YN: "Y",
  });
  const rows = (j.output2 ?? []) as Record<string, string>[];
  const day = rows.reduce((m, r) => (r.stck_bsop_date > m ? r.stck_bsop_date : m), "");
  return rows.filter(r => r.stck_bsop_date === day && r.stck_cntg_hour >= "090000")
    .map(r => ({
      time: kstEpoch(r.stck_bsop_date, r.stck_cntg_hour),
      open: num(r.bstp_nmix_oprc)!, high: num(r.bstp_nmix_hgpr)!, low: num(r.bstp_nmix_lwpr)!, close: num(r.bstp_nmix_prpr)!,
      volume: num(r.cntg_vol) ?? undefined,
    }))
    .filter(c => c.open && c.close)
    .sort((a, b) => (a.time as number) - (b.time as number));
}

async function kisIndexDaily(isc: string, tf: Tf): Promise<Candle[]> {
  const back = tf === "D" ? 200 : tf === "W" ? 1100 : 3650;
  const from = new Date(Date.now() + KST * 1000 - back * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const to = new Date(Date.now() + KST * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice", "FHKUP03500100", {
    FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: isc, FID_INPUT_DATE_1: from, FID_INPUT_DATE_2: to, FID_PERIOD_DIV_CODE: tf,
  });
  return ((j.output2 ?? []) as Record<string, string>[])
    .filter(r => r.stck_bsop_date)
    .map(r => ({
      time: ymdStr(r.stck_bsop_date),
      open: num(r.bstp_nmix_oprc)!, high: num(r.bstp_nmix_hgpr)!, low: num(r.bstp_nmix_lwpr)!, close: num(r.bstp_nmix_prpr)!,
      volume: num(r.acml_vol) ?? undefined,
    }))
    .filter(c => c.open && c.close)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const label = sp.get("label") ?? "";
  const tf = (sp.get("tf") ?? "5m") as Tf;
  if (!TF.includes(tf)) return NextResponse.json({ error: "tf" }, { status: 400 });
  const sym = YAHOO[label] ?? label;
  const isc = KIS_INDEX[label];
  let source = "Yahoo";
  let candles: Candle[] = [];
  let prevClose: number | null = null;

  try {
    if (isc) {
      try {
        candles = intraday(tf) ? await kisIndexMinute(isc, tf) : await kisIndexDaily(isc, tf);
        source = "한국투자 (실시간)";
        // KIS 분봉은 최근 100개 안팎만 준다 → 그 앞 시간은 Yahoo 로 채움
        if (candles.length) {
          const y = await yahoo(sym, tf).catch(() => null);
          if (y) {
            if (intraday(tf)) prevClose = y.prevClose;
            const first = String(candles[0].time);
            const earlier = y.candles.filter(c => (intraday(tf) ? (c.time as number) < (candles[0].time as number) : String(c.time) < first));
            if (earlier.length) { candles = [...earlier, ...candles]; source = "한국투자 + Yahoo(과거 구간)"; }
          }
        }
      } catch { candles = []; }
    }
    if (!candles.length) {
      const y = await yahoo(sym, tf);
      candles = y.candles; prevClose = y.prevClose; source = "Yahoo";
    }
    return NextResponse.json({ label, tf, source, prevClose, candles }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ label, tf, candles: [], error: String(e).slice(0, 160) });
  }
}
