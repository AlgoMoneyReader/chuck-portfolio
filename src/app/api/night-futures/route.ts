import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ChartPoint { time: string; price: number; }

let cachedToken: { value: string; expiresAt: number } | null = null;
let cache: { data: object; at: number } | null = null;
const TTL = 60_000;

async function getKISToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;
  const res = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KIS token HTTP ${res.status}`);
  const data = await res.json();
  const token = data.access_token;
  cachedToken = { value: token, expiresAt: now + (data.expires_in ?? 86400) * 1000 };
  return token;
}

function getFrontMonthCode(): string {
  const kst   = new Date(Date.now() + 9 * 3600000);
  const year  = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const quarterly = [3, 6, 9, 12];
  // front month = first quarterly expiry > current month (next quarterly)
  let em = quarterly.find(m => m > month);
  let ey = year;
  if (!em) { em = 3; ey = year + 1; }
  // KIS month codes: 1-9 as digits, 10=A, 11=B, 12=C
  const mc = em <= 9 ? String(em) : String.fromCharCode(64 + em - 9);
  const yc = String(ey).slice(-2);
  return `101W${yc}${mc.padStart(2, "0")}`;
}

async function tryKIS(): Promise<object | null> {
  try {
    const token = await getKISToken();
    const code  = getFrontMonthCode();

    const priceRes = await fetch(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price` +
      `?FID_COND_MRKT_DIV_CODE=NF&FID_INPUT_ISCD=${code}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          appkey:    process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: "FHMIF10020000",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      }
    );
    if (!priceRes.ok) return null;
    const priceData = await priceRes.json();
    const output = priceData.output;
    if (!output || priceData.rt_cd !== "0") return null;

    const currentPrice = parseFloat((output.bstp_nmix_prpr ?? "0").replace(/,/g, ""));
    const prevClose    = parseFloat((output.stck_prdy_clpr ?? "0").replace(/,/g, ""));
    if (!currentPrice) return null;

    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    return {
      code,
      currentPrice,
      previousClose: prevClose,
      changePct: parseFloat(changePct.toFixed(2)),
      change: parseFloat((currentPrice - prevClose).toFixed(2)),
      marketState: "NIGHT",
      points: [] as ChartPoint[],
    };
  } catch { return null; }
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
      };
    } catch { continue; }
  }
  return null;
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  const data = (await tryKIS()) ?? (await tryYahoo());
  if (!data) {
    return NextResponse.json({ error: "야간선물 데이터를 불러올 수 없습니다" }, { status: 500 });
  }

  cache = { data, at: Date.now() };
  return NextResponse.json(data);
}
