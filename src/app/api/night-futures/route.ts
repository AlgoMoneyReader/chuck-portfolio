import { NextResponse } from "next/server";
import { getKisToken as getKISToken } from "@/lib/fetchKisMaster";
import { unstable_cache } from "next/cache";
import { inflateRawSync } from "zlib";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

interface ChartPoint { time: string; price: number; }

let cache: { data: object; at: number } | null = null;
const TTL = 60_000;


// ── KIS 지수선물 종목 마스터 (fo_idx_code_mts.mst, | 구분, cp949) ─────────────
// 열: 상품종류|단축코드|표준코드|한글종목명|ATM구분|행사가|월물구분코드|기초자산 단축코드|기초자산 명
type MstRow = string[];

function unzipFirst(buf: Buffer): Buffer {
  // 로컬 파일 헤더(0x04034b50) 하나짜리 zip. 크기가 0이면 중앙 디렉터리 값 사용
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("zip: bad header");
  const method = buf.readUInt16LE(8);
  let size = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26), extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  if (!size) {
    const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (cd < 0) throw new Error("zip: no central dir");
    size = buf.readUInt32LE(cd + 20);
  }
  const data = buf.subarray(start, start + size);
  return method === 0 ? data : inflateRawSync(data);
}

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

async function tryKIS(debug: string[]): Promise<object | null> {
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
  for (const mkt of ["CM", "F"]) {
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
          const ch = await kisGet("/uapi/domestic-futureoption/v1/quotations/inquire-time-fuopchartprice", "FHKIF03020200", {
            FID_COND_MRKT_DIV_CODE: mkt, FID_INPUT_ISCD: c.code, FID_HOUR_CLS_CODE: "60",
            FID_PW_DATA_INCU_YN: "Y", FID_FAKE_TICK_INCU_YN: "N", FID_INPUT_DATE_1: d8, FID_INPUT_HOUR_1: hms,
          });
          points = ((ch.output2 ?? []) as Record<string, string>[])
            .map(r => ({
              key: `${r.stck_bsop_date ?? ""}${r.stck_cntg_hour ?? ""}`,
              time: `${(r.stck_cntg_hour ?? "").slice(0, 2)}:${(r.stck_cntg_hour ?? "").slice(2, 4)}`,
              price: num(r.futs_prpr ?? r.stck_prpr),
            }))
            .filter(p => p.price > 0)
            .sort((x, y) => x.key.localeCompare(y.key))
            .map(({ time, price }) => ({ time, price }));
        } catch (e) { debug.push(`chart ${mkt}/${c.code}: ${String(e)}`); }

        return {
          code: c.code,
          market: mkt,
          label: mkt === "CM" ? `${c.name} 야간` : `${c.name} (주간 시세)`,
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

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  const debug: string[] = [];
  const kis = await tryKIS(debug);
  const data = kis ?? (await tryYahoo());
  if (!data) {
    return NextResponse.json({ error: "야간선물 데이터를 불러올 수 없습니다", debug }, { status: 500 });
  }
  if (!kis) Object.assign(data, { debug });

  cache = { data, at: Date.now() };
  return NextResponse.json(data);
}
