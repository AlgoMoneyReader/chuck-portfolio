import { NextResponse } from "next/server";
import { getKisToken as getKISToken } from "@/lib/fetchKisMaster";
import { unstable_cache } from "next/cache";
import { unzipFirst } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

interface ChartPoint { time: string; price: number; full?: string; }

const cache: Partial<Record<"day" | "night", { data: object; at: number }>> = {};
const TTL = 60_000;


// ── KIS 지수선물 종목 마스터 (fo_idx_code_mts.mst, | 구분, cp949) ─────────────
// 열: 상품종류|단축코드|표준코드|한글종목명|ATM구분|행사가|월물구분코드|기초자산 단축코드|기초자산 명
type MstRow = string[];

const loadMaster = unstable_cache(async (): Promise<MstRow[]> => {
  const res = await fetch("https://new.real.download.dws.co.kr/common/master/fo_idx_code_mts.mst.zip", {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`master HTTP ${res.status}`);
  const text = new TextDecoder("euc-kr").decode(unzipFirst(Buffer.from(await res.arrayBuffer())));
  return text.split(/\r?\n/).filter(Boolean).map(l => l.split("|").map(x => x.trim()));
}, ["kis-fo-idx-master-v1"], { revalidate: 6 * 3600 });

// 코스피200 선물 최근월물 (일반, 미니). 옵션·스프레드 제외, 단축코드 순서가 만기 순서
function pickFutures(rows: MstRow[]): { code: string; name: string }[] {
  const fut = rows.filter(r => {
    const name = r[3] ?? "";
    const strike = parseFloat(r[5] ?? "");
    return /코스피\s*200|KOSPI\s*200/i.test(name + (r[8] ?? "")) &&
      !/SP|스프레드|C\s|P\s|콜|풋|위클리|변동성|섹터|배당/i.test(name) &&
      !(strike > 0);
  });
  const mini = fut.filter(r => /미니|MINI/i.test(r[3]));
  const regular = fut.filter(r => !/미니|MINI/i.test(r[3]));
  const first = (xs: MstRow[]) => xs.sort((x, y) => x[1].localeCompare(y[1]))[0];
  return [first(mini), first(regular)].filter(Boolean).map(r => ({ code: r[1], name: r[3] }));
}

const num = (v: unknown) => parseFloat(String(v ?? "").replace(/,/g, ""));

async function kisGet(path: string, trId: string, params: Record<string, string>) {
  const token = await getKISToken();
  const res = await fetch(`https://openapi.koreainvestment.com:9443${path}?${new URLSearchParams(params)}`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APP_KEY!,
      appsecret: process.env.KIS_APP_SECRET!,
      tr_id: trId,
      custtype: "P",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const j = await res.json().catch(() => null);
  if (!j || j.rt_cd !== "0") throw new Error(`${trId} ${j?.msg_cd ?? res.status} ${(j?.msg1 ?? "").trim()}`);
  return j;
}

// 야간장 시각은 거래일 기준 24:00~30:00 으로 온다(29:45 = 다음 날 05:45). 실제 날짜·시각으로 바꾼다
function toClock(bsop: string, raw: string): { time: string; full: string } {
  let hh = parseInt(raw.slice(0, 2), 10);
  const mm = raw.slice(2, 4);
  const d = new Date(Date.UTC(+bsop.slice(0, 4), +bsop.slice(4, 6) - 1, +bsop.slice(6, 8)));
  if (hh >= 24) { hh -= 24; d.setUTCDate(d.getUTCDate() + 1); }
  const time = `${String(hh).padStart(2, "0")}:${mm}`;
  return { time, full: `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${time}` };
}

function minusOneMinute(raw: string): string {
  let hh = parseInt(raw.slice(0, 2), 10), mm = parseInt(raw.slice(2, 4), 10) - 1;
  if (mm < 0) { mm = 59; hh -= 1; }
  return `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}00`;
}

// 분봉은 한 번에 100개 안팎이라, 가장 이른 봉 1분 전부터 다시 받아 18:00 세션 시작까지 이어붙인다
async function nightBars(mkt: string, code: string, d8: string, hms: string, sessionStart = "180000"): Promise<ChartPoint[]> {
  const bars = new Map<string, { bsop: string; raw: string; price: number }>();
  let session = "";
  let date = d8, hour = hms;
  for (let i = 0; i < 10; i++) {
    const ch = await kisGet("/uapi/domestic-futureoption/v1/quotations/inquire-time-fuopchartprice", "FHKIF03020200", {
      FID_COND_MRKT_DIV_CODE: mkt, FID_INPUT_ISCD: code, FID_HOUR_CLS_CODE: "60",
      FID_PW_DATA_INCU_YN: "Y", FID_FAKE_TICK_INCU_YN: "N", FID_INPUT_DATE_1: date, FID_INPUT_HOUR_1: hour,
    });
    const rows = ((ch.output2 ?? []) as Record<string, string>[])
      .map(r => ({ bsop: r.stck_bsop_date ?? "", raw: r.stck_cntg_hour ?? "", price: num(r.futs_prpr ?? r.stck_prpr) }))
      .filter(r => r.price > 0 && r.bsop && r.raw);
    if (!session && rows.length) session = rows.reduce((m, r) => (r.bsop > m ? r.bsop : m), "");
    const mine = rows.filter(r => r.bsop === session);
    const before = bars.size;
    for (const r of mine) bars.set(r.raw, r);
    if (!mine.length || bars.size === before) break;
    const earliest = mine.reduce((m, r) => (r.raw < m.raw ? r : m));
    if (earliest.raw <= sessionStart || mine.length < rows.length) break;
    date = session; hour = minusOneMinute(earliest.raw);
  }
  return Array.from(bars.values())
    .sort((x, y) => x.raw.localeCompare(y.raw))
    .map(r => ({ ...toClock(r.bsop, r.raw), price: r.price }));
}

async function tryKIS(debug: string[], session: "day" | "night"): Promise<object | null> {
  let cands: { code: string; name: string }[] = [];
  try {
    cands = pickFutures(await loadMaster());
    debug.push(`master: ${cands.map(c => `${c.code}(${c.name})`).join(", ") || "후보 없음"}`);
  } catch (e) {
    debug.push(`master: ${String(e)}`);
    return null;
  }

  const kst = new Date(Date.now() + 9 * 3_600_000);
  const d8 = kst.toISOString().slice(0, 10).replace(/-/g, "");
  const hms = kst.toISOString().slice(11, 19).replace(/:/g, "");

  // CM: 야간선물(구 유렉스 연계 시절 시장코드), F: 지수선물
  for (const mkt of session === "day" ? ["F"] : ["CM", "F"]) {
    for (const c of cands) {
      try {
        const j = await kisGet("/uapi/domestic-futureoption/v1/quotations/inquire-price", "FHMIF10000000",
          { FID_COND_MRKT_DIV_CODE: mkt, FID_INPUT_ISCD: c.code });
        const o = Array.isArray(j.output1) ? j.output1[0] : j.output1 ?? j.output;
        const price = num(o?.futs_prpr ?? o?.prpr);
        if (!price) { debug.push(`${mkt}/${c.code}: 현재가 없음`); continue; }
        const diff = num(o?.futs_prdy_vrss ?? o?.prdy_vrss);
        const prev = num(o?.futs_prdy_clpr) || (isNaN(diff) ? price : price - diff);

        let points: ChartPoint[] = [];
        try {
          points = await nightBars(mkt, c.code, d8, hms, session === "day" ? "084500" : "180000");
        } catch (e) { debug.push(`chart ${mkt}/${c.code}: ${String(e)}`); }

        return {
          code: c.code,
          market: mkt,
          label: mkt === "CM" ? `${c.name} 야간` : session === "day" ? `${c.name} 주간` : `${c.name} (주간 시세)`,
          currentPrice: price,
          previousClose: prev,
          change: parseFloat((price - prev).toFixed(2)),
          changePct: prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0,
          marketState: mkt === "CM" ? "NIGHT" : "DAY",
          points,
        };
      } catch (e) {
        debug.push(`${mkt}/${c.code}: ${String(e)}`);
      }
    }
  }
  return null;
}

async function tryYahoo(): Promise<object | null> {
  const symbols = ["KOS=F", "^KS200"];
  for (const symbol of symbols) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json   = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const meta       = result.meta;
      const timestamps: number[]          = result.timestamp ?? [];
      const closes:     (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
      if (!timestamps.length) continue;

      const points: ChartPoint[] = timestamps
        .map((ts, i) => ({
          time:  new Date(ts * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }),
          price: closes[i] ?? 0,
        }))
        .filter(p => p.price > 0);

      if (!points.length) continue;

      const currentPrice = meta.regularMarketPrice ?? points[points.length - 1]?.price ?? 0;
      const prevClose    = meta.chartPreviousClose  ?? meta.previousClose ?? currentPrice;
      const changePct    = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

      return {
        symbol,
        points,
        currentPrice: parseFloat(currentPrice.toFixed(2)),
        previousClose: parseFloat(prevClose.toFixed(2)),
        changePct: parseFloat(changePct.toFixed(2)),
        marketState: meta.marketState ?? "CLOSED",
        label: "코스피200 지수 (주간) · 야간선물 데이터 없음",
      };
    } catch { continue; }
  }
  return null;
}

export async function GET(request: Request) {
  const session = new URL(request.url).searchParams.get("session") === "day" ? "day" : "night";
  const hit = cache[session];
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json({ ...hit.data, cached: true });
  }

  const debug: string[] = [];
  const kis = await tryKIS(debug, session);
  const data = kis ?? (await tryYahoo());
  if (!data) {
    return NextResponse.json({ error: "야간선물 데이터를 불러올 수 없습니다", debug }, { status: 500 });
  }
  if (!kis) Object.assign(data, { debug });

  cache[session] = { data, at: Date.now() };
  return NextResponse.json(data);
}
