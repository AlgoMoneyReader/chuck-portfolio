import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ─── KIS 토큰 캐시 ────────────────────────────────────────────────────────────
let cachedToken: { value: string; expiresAt: number } | null = null;

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
  cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 86400) * 1000 };
  return data.access_token;
}

interface InvestorRow {
  stck_bsop_date: string;
  frgn_ntby_tr_pbmn: string;
  orgn_ntby_tr_pbmn: string;
  prsn_ntby_tr_pbmn: string;
  frgn_ntby_qty: string;
  orgn_ntby_qty: string;
  prsn_ntby_qty: string;
}

function pbmnToUk(s: string): number {
  const n = parseInt((s ?? "").replace(/,/g, "") || "0", 10);
  return isNaN(n) ? 0 : Math.round(n / 100);
}

async function fetchKISInvestor(code: string, market: string): Promise<{
  foreign: number; institution: number; individual: number;
  foreignQty: number; institutionQty: number; individualQty: number;
  date: string;
} | null> {
  try {
    const token = await getKISToken();
    const marketDiv = market === "KQ" ? "Q" : "J";
    const res = await fetch(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor` +
        `?FID_COND_MRKT_DIV_CODE=${marketDiv}&FID_INPUT_ISCD=${code}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: "FHKST01010900",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows: InvestorRow[] = data.output ?? [];
    const valid = rows.find(r =>
      r.frgn_ntby_tr_pbmn !== "" && r.orgn_ntby_tr_pbmn !== "" && r.prsn_ntby_tr_pbmn !== ""
    );
    if (!valid) return null;
    return {
      date: valid.stck_bsop_date,
      foreign: pbmnToUk(valid.frgn_ntby_tr_pbmn),
      institution: pbmnToUk(valid.orgn_ntby_tr_pbmn),
      individual: pbmnToUk(valid.prsn_ntby_tr_pbmn),
      foreignQty: parseInt(valid.frgn_ntby_qty ?? "0", 10) || 0,
      institutionQty: parseInt(valid.orgn_ntby_qty ?? "0", 10) || 0,
      individualQty: parseInt(valid.prsn_ntby_qty ?? "0", 10) || 0,
    };
  } catch {
    return null;
  }
}

async function fetchYahooData(code: string, market: string): Promise<{
  changePct: number; volumeRatio: number; week52Pct: number;
}> {
  try {
    const sym = `${code}.${market}`;
    const [dayRes, monthRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1mo`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }),
    ]);
    const dayJson = dayRes.ok ? await dayRes.json() : null;
    const monthJson = monthRes.ok ? await monthRes.json() : null;

    const dayMeta = dayJson?.chart?.result?.[0]?.meta;
    const price = dayMeta?.regularMarketPrice ?? 0;
    const prevClose = dayMeta?.chartPreviousClose ?? dayMeta?.previousClose ?? price;
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    const volume = dayMeta?.regularMarketVolume ?? 0;

    const monthQuote = monthJson?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
    const monthVols: number[] = monthQuote.volume ?? [];
    const avg5Vol = monthVols.slice(-6, -1).reduce((s: number, v: number) => s + (v ?? 0), 0) / 5 || 1;
    const volumeRatio = parseFloat((volume / avg5Vol).toFixed(2));

    const closes: number[] = (monthQuote.close ?? []).filter(Boolean);
    const week52High = closes.length > 0 ? Math.max(...closes) : price;
    const week52Pct = week52High > 0 ? parseFloat(((price / week52High) * 100).toFixed(1)) : 50;

    return { changePct, volumeRatio, week52Pct };
  } catch {
    return { changePct: 0, volumeRatio: 1, week52Pct: 50 };
  }
}

function calcGrade(score: number): string {
  if (score >= 80) return "S";
  if (score >= 65) return "A";
  if (score >= 50) return "B";
  if (score >= 35) return "C";
  return "D";
}

interface HoldingInput {
  ticker: string;
  name: string;
  evalAmount: number;
  sector: string;
  changePct?: number;
}

function extractCodeAndMarket(ticker: string): { code: string; market: string } | null {
  // Format: "005930.KS" or "005930.KQ"
  const dotMatch = ticker.match(/^(\d{6})\.(KS|KQ)$/);
  if (dotMatch) return { code: dotMatch[1], market: dotMatch[2] };
  // Format: raw 6-digit
  if (/^\d{6}$/.test(ticker)) return { code: ticker, market: "KS" };
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const holdings: HoldingInput[] = body.holdings ?? [];

    if (holdings.length === 0) {
      return NextResponse.json({ error: "No holdings provided" }, { status: 400 });
    }

    // Filter Korean stocks
    const koreanHoldings = holdings
      .map(h => ({ ...h, parsed: extractCodeAndMarket(h.ticker) }))
      .filter(h => h.parsed !== null) as (HoldingInput & { parsed: { code: string; market: string } })[];

    const totalEval = holdings.reduce((s, h) => s + (h.evalAmount ?? 0), 0);
    const totalKoreanEval = koreanHoldings.reduce((s, h) => s + h.evalAmount, 0);

    // Process in batches of 10 with 80ms delay
    const BATCH = 10;
    type StockResult = {
      code: string; name: string; market: string; evalAmount: number;
      sector: string; changePct: number; volumeRatio: number; week52Pct: number;
      foreign: number; institution: number; supplyScore: number;
      momentumScore: number; volScore: number; highScore: number;
      score: number; grade: string;
    };

    const stockResults: StockResult[] = [];

    for (let i = 0; i < koreanHoldings.length; i += BATCH) {
      const batch = koreanHoldings.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(async (h) => {
        const { code, market } = h.parsed;
        const [yahooData, invData] = await Promise.all([
          fetchYahooData(code, market),
          fetchKISInvestor(code, market),
        ]);

        const changePct = h.changePct ?? yahooData.changePct;
        const { volumeRatio, week52Pct } = yahooData;
        const foreign = invData?.foreign ?? 0;
        const institution = invData?.institution ?? 0;

        let supplyScore = 0;
        if (foreign > 0) supplyScore += Math.min(20, 20 * Math.min(foreign / 500, 1));
        if (institution > 0) supplyScore += Math.min(20, 20 * Math.min(institution / 300, 1));

        let momentumScore = 0;
        if      (changePct >= 3)  momentumScore = 30;
        else if (changePct >= 1)  momentumScore = 20;
        else if (changePct >= 0)  momentumScore = 10;
        else if (changePct >= -2) momentumScore = 5;

        let volScore = 0;
        if      (volumeRatio >= 3)   volScore = 15;
        else if (volumeRatio >= 2)   volScore = 10;
        else if (volumeRatio >= 1.5) volScore = 6;

        let highScore = 0;
        if      (week52Pct >= 97) highScore = 15;
        else if (week52Pct >= 90) highScore = 10;
        else if (week52Pct >= 75) highScore = 6;
        else if (week52Pct >= 60) highScore = 3;

        const score = Math.round(supplyScore + momentumScore + volScore + highScore);
        const grade = calcGrade(score);

        return {
          code, name: h.name, market, evalAmount: h.evalAmount, sector: h.sector,
          changePct, volumeRatio, week52Pct, foreign, institution,
          supplyScore: Math.round(supplyScore), momentumScore, volScore, highScore,
          score, grade,
        };
      }));
      stockResults.push(...batchResults);
      if (i + BATCH < koreanHoldings.length) await new Promise(r => setTimeout(r, 80));
    }

    // Weighted average score
    const weightedScore = totalKoreanEval > 0
      ? stockResults.reduce((s, r) => s + r.score * (r.evalAmount / totalKoreanEval), 0)
      : 0;

    const score = Math.round(weightedScore);
    const grade = calcGrade(score);

    // Factor averages weighted by evalAmount
    const wSum = totalKoreanEval || 1;
    const factors = {
      supply:   stockResults.reduce((s, r) => s + r.supplyScore * (r.evalAmount / wSum), 0),
      momentum: stockResults.reduce((s, r) => s + r.momentumScore * (r.evalAmount / wSum), 0),
      volume:   stockResults.reduce((s, r) => s + r.volScore * (r.evalAmount / wSum), 0),
      week52:   stockResults.reduce((s, r) => s + r.highScore * (r.evalAmount / wSum), 0),
    };

    // Sector analysis
    const sectorMap = new Map<string, { evalAmount: number; changePcts: number[] }>();
    for (const h of holdings) {
      const key = h.sector || "기타";
      const existing = sectorMap.get(key) ?? { evalAmount: 0, changePcts: [] };
      existing.evalAmount += h.evalAmount ?? 0;
      if (h.changePct != null) existing.changePcts.push(h.changePct);
      sectorMap.set(key, existing);
    }

    const sectorWeights = Array.from(sectorMap.entries())
      .map(([sector, data]) => ({
        sector,
        weight: totalEval > 0 ? parseFloat(((data.evalAmount / totalEval) * 100).toFixed(1)) : 0,
        avgChangePct: data.changePcts.length > 0
          ? parseFloat((data.changePcts.reduce((a, b) => a + b, 0) / data.changePcts.length).toFixed(2))
          : 0,
      }))
      .sort((a, b) => b.weight - a.weight);

    // Build comment lines
    const topSector = sectorWeights[0];
    const overweightDecliningSectors = sectorWeights.filter(s => s.weight > 25 && s.avgChangePct < 0);

    let line1: string;
    if (grade === "S") line1 = `포트폴리오 종합 진보적 사고 등급 S — 현재 수급과 모멘텀이 매우 강력한 상태입니다. (${score}점)`;
    else if (grade === "A") line1 = `포트폴리오 종합 진보적 사고 등급 A — 전반적으로 양호한 수급 흐름이 유지되고 있습니다. (${score}점)`;
    else if (grade === "B") line1 = `포트폴리오 종합 진보적 사고 등급 B — 수급 중립 구간, 선별적 관리가 필요합니다. (${score}점)`;
    else if (grade === "C") line1 = `포트폴리오 종합 진보적 사고 등급 C — 수급 약세 신호가 감지됩니다. 포지션 점검을 권고드립니다. (${score}점)`;
    else line1 = `포트폴리오 종합 진보적 사고 등급 D — 수급 이탈 상태. 리밸런싱 검토가 시급합니다. (${score}점)`;

    const line2 = topSector
      ? `최대 비중 섹터: ${topSector.sector} (${topSector.weight}%), 당일 평균 ${topSector.avgChangePct >= 0 ? "+" : ""}${topSector.avgChangePct}%`
      : "섹터 데이터 없음";

    let line3: string;
    if (overweightDecliningSectors.length > 0) {
      const s = overweightDecliningSectors[0];
      line3 = `${s.sector} 섹터 비중(${s.weight}%)이 높은데 하락세(${s.avgChangePct}%)입니다. 비중 축소 또는 손절 라인 점검을 권고합니다.`;
    } else if (sectorWeights.length >= 3 && sectorWeights.every(s => s.weight < 40)) {
      line3 = "섹터 분산이 양호합니다. 현재 배분을 유지하면서 수급 강도가 높은 종목 중심으로 비중을 조절하세요.";
    } else {
      line3 = "수급 흐름을 주시하며 외국인·기관 동반 매수 종목의 비중을 적극 확대하는 전략을 권장합니다.";
    }

    return NextResponse.json({
      score,
      grade,
      factors: {
        supply: parseFloat(factors.supply.toFixed(1)),
        momentum: parseFloat(factors.momentum.toFixed(1)),
        volume: parseFloat(factors.volume.toFixed(1)),
        week52: parseFloat(factors.week52.toFixed(1)),
      },
      stockScores: stockResults.map(r => ({
        code: r.code,
        name: r.name,
        score: r.score,
        grade: r.grade,
        weight: totalKoreanEval > 0 ? parseFloat(((r.evalAmount / totalKoreanEval) * 100).toFixed(1)) : 0,
      })),
      sectorWeights,
      comment: [line1, line2, line3],
      analyzedCount: stockResults.length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
