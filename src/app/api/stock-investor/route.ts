import { NextResponse } from "next/server";
import { getKisToken as getKISToken } from "@/lib/fetchKisMaster";
import { getLiveFlow } from "@/lib/liveFlow";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

// ─── KIS 토큰 캐시 (서버리스 웜 인스턴스 재사용) ─────────────────────────────

// ─── KIS 투자자별 거래실적 조회 (FHKST01010900) ─────────────────────────────
interface InvestorRow {
  stck_bsop_date: string;
  frgn_ntby_tr_pbmn: string; // 외국인 순매수 거래대금 (백만원)
  orgn_ntby_tr_pbmn: string; // 기관 순매수 거래대금 (백만원)
  prsn_ntby_tr_pbmn: string; // 개인 순매수 거래대금 (백만원)
  frgn_ntby_qty: string;     // 외국인 순매수 수량 (주)
  orgn_ntby_qty: string;     // 기관 순매수 수량 (주)
  prsn_ntby_qty: string;     // 개인 순매수 수량 (주)
}

/** 백만원 문자열 → 억원 정수 변환 */
function pbmnToUk(s: string): number {
  const n = parseInt((s ?? "").replace(/,/g, "") || "0", 10);
  return isNaN(n) ? 0 : Math.round(n / 100);
}

async function fetchKISInvestor(code: string): Promise<{
  foreign: number; institution: number; individual: number;
  foreignQty: number; institutionQty: number; individualQty: number;
  foreign5D: number; foreign10D: number; foreign20D: number;
  institution5D: number; institution10D: number; institution20D: number;
  date: string;
} | null> {
  const token = await getKISToken();
  const res = await fetch(
    `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor` +
      `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`,
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

  // 오늘 장중엔 빈값 → 데이터가 있는 가장 최근 영업일 사용
  const valid = rows.find(
    (r) =>
      r.frgn_ntby_tr_pbmn !== "" &&
      r.orgn_ntby_tr_pbmn !== "" &&
      r.prsn_ntby_tr_pbmn !== ""
  );
  if (!valid) return null;

  // 유효 행만 추출 (최대 20개)
  const validRows = rows
    .filter(r => r.frgn_ntby_tr_pbmn !== "" && r.orgn_ntby_tr_pbmn !== "")
    .slice(0, 20);

  const sumF = (rs: InvestorRow[]) => rs.reduce((s, r) => s + pbmnToUk(r.frgn_ntby_tr_pbmn), 0);
  const sumI = (rs: InvestorRow[]) => rs.reduce((s, r) => s + pbmnToUk(r.orgn_ntby_tr_pbmn), 0);

  return {
    date:           valid.stck_bsop_date,
    foreign:        pbmnToUk(valid.frgn_ntby_tr_pbmn),
    institution:    pbmnToUk(valid.orgn_ntby_tr_pbmn),
    individual:     pbmnToUk(valid.prsn_ntby_tr_pbmn),
    foreignQty:     parseInt(valid.frgn_ntby_qty ?? "0", 10) || 0,
    institutionQty: parseInt(valid.orgn_ntby_qty ?? "0", 10) || 0,
    individualQty:  parseInt(valid.prsn_ntby_qty ?? "0", 10) || 0,
    foreign5D:      sumF(validRows.slice(0, 5)),
    foreign10D:     sumF(validRows.slice(0, 10)),
    foreign20D:     sumF(validRows.slice(0, 20)),
    institution5D:  sumI(validRows.slice(0, 5)),
    institution10D: sumI(validRows.slice(0, 10)),
    institution20D: sumI(validRows.slice(0, 20)),
  };
}

// ─── 등급 계산 ───────────────────────────────────────────────────────────────
function calcGrade(score: number): string {
  if (score >= 80) return "S";
  if (score >= 65) return "A";
  if (score >= 50) return "B";
  if (score >= 35) return "C";
  return "D";
}

function gradeComment(grade: string, foreign: number, institution: number): string {
  if (grade === "S")
    return "외국인·기관 동반 순매수 확인. 수급 집중 구간으로 진보적 사고 관점의 강력 매수 시그널입니다.";
  if (grade === "A")
    return `수급 우위 구간. ${foreign > 0 ? "외국인" : "기관"} 주도 매수가 진행 중이며 추세 추종 관점에서 매수 검토 가능합니다.`;
  if (grade === "B")
    return "수급 중립. 뚜렷한 세력의 개입이 확인되지 않아 관망 또는 소량 포지션이 적절합니다.";
  if (grade === "C")
    return `수급 약세. ${foreign < 0 && institution < 0 ? "외국인·기관 동반 매도" : "수급 이탈"} 신호로 신중한 접근이 필요합니다.`;
  return "수급 이탈 상태. 진보적 사고 관점에서 회피 또는 매도 검토가 권고됩니다.";
}

// ─── 억원 포맷 ───────────────────────────────────────────────────────────────
function fmtUk(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) return `${(n / 10000).toFixed(1)}조`;
  return `${n.toLocaleString("ko-KR")}억`;
}

// ─── GET handler ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code   = searchParams.get("code")   ?? "";
  const market = searchParams.get("market") ?? "KS";
  const symbol = `${code}.${market}`;

  try {
    // ① 가격·거래량 데이터 (Yahoo Finance)
    const [dayRes, monthRes] = await Promise.all([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
      ),
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
      ),
    ]);

    const dayJson   = dayRes.ok   ? await dayRes.json()   : null;
    const monthJson = monthRes.ok ? await monthRes.json() : null;

    const dayMeta   = dayJson?.chart?.result?.[0]?.meta;
    const price     = dayMeta?.regularMarketPrice ?? 0;
    const prevClose = dayMeta?.chartPreviousClose ?? dayMeta?.previousClose ?? price;
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    const volume    = dayMeta?.regularMarketVolume ?? 0;

    // 5일 평균 거래량
    const monthQuote  = monthJson?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
    const monthVols: number[] = monthQuote.volume ?? [];
    const avg5Vol     = monthVols.slice(-6, -1).reduce((s: number, v: number) => s + (v ?? 0), 0) / 5 || 1;
    const volumeRatio = parseFloat((volume / avg5Vol).toFixed(2));

    // 52주 고가 대비
    const closes: number[] = (monthQuote.close ?? []).filter(Boolean);
    const week52High = closes.length > 0 ? Math.max(...closes) : price;
    const week52Pct  = week52High > 0 ? parseFloat(((price / week52High) * 100).toFixed(1)) : 50;

    // ② KIS API → 투자자별 순매수 (억원)
    const inv = await fetchKISInvestor(code);
    let foreign       = inv?.foreign     ?? 0;
    let institution   = inv?.institution ?? 0;
    let individual: number | null = inv?.individual ?? 0;
    const invDate     = inv?.date        ?? "";

    // 오늘 확정치가 아직 없으면(장중·마감 직후) 장중 가집계로 당일 수급을 쓴다
    const today8 = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
    let flowBasis = { type: "confirmed" as "confirmed" | "live", label: invDate ? `${invDate.slice(4, 6)}/${invDate.slice(6, 8)} 확정` : "확정" };
    if (invDate !== today8 && market !== "US") {
      try {
        const live = await getLiveFlow(code);
        if (live.available || live.globalEok != null) {
          // 외국인: 외국계 창구 실시간 우선, 기관: 거래소 가집계
          foreign = live.globalEok ?? live.foreignEok ?? 0;
          institution = live.available ? live.institutionEok ?? 0 : 0;
          individual = null; // 장중 개인 집계는 없다
          flowBasis = { type: "live", label: `오늘 장중 추정 (외국인 ${live.globalEok != null ? `${live.updatedAt} 창구` : `${live.asOf} 가집계`}${live.available ? ` · 기관 ${live.asOf} 가집계` : ""})` };
        }
      } catch { /* 확정치 그대로 */ }
    }

    // ③ 진보적 사고 점수 (0–100점)
    // 수급 강도 40점 (외국인 20 + 기관 20, 500억/300억 기준)
    let supplyScore = 0;
    if (foreign > 0)
      supplyScore += Math.min(20, 20 * Math.min(foreign / 500, 1));
    if (institution > 0)
      supplyScore += Math.min(20, 20 * Math.min(institution / 300, 1));

    // 가격 모멘텀 30점
    let momentumScore = 0;
    if      (changePct >= 3)   momentumScore = 30;
    else if (changePct >= 1)   momentumScore = 20;
    else if (changePct >= 0)   momentumScore = 10;
    else if (changePct >= -2)  momentumScore = 5;

    // 거래량 15점
    let volScore = 0;
    if      (volumeRatio >= 3)   volScore = 15;
    else if (volumeRatio >= 2)   volScore = 10;
    else if (volumeRatio >= 1.5) volScore = 6;

    // 52주 위치 15점
    let highScore = 0;
    if      (week52Pct >= 97) highScore = 15;
    else if (week52Pct >= 90) highScore = 10;
    else if (week52Pct >= 75) highScore = 6;
    else if (week52Pct >= 60) highScore = 3;

    const score   = Math.round(supplyScore + momentumScore + volScore + highScore);
    const grade   = calcGrade(score);
    const comment = gradeComment(grade, foreign, institution);

    return NextResponse.json(
      {
        foreign,
        institution,
        individual,
        foreignQty:     inv?.foreignQty     ?? 0,
        institutionQty: inv?.institutionQty ?? 0,
        individualQty:  inv?.individualQty  ?? 0,
        foreign5D:      inv?.foreign5D      ?? 0,
        foreign10D:     inv?.foreign10D     ?? 0,
        foreign20D:     inv?.foreign20D     ?? 0,
        institution5D:  inv?.institution5D  ?? 0,
        institution10D: inv?.institution10D ?? 0,
        institution20D: inv?.institution20D ?? 0,
        invDate,
        flowBasis,
        confirmed: { foreign: inv?.foreign ?? 0, institution: inv?.institution ?? 0, individual: inv?.individual ?? 0 },
        volumeRatio,
        week52Pct,
        grade,
        score,
        factors: [
          {
            label: "수급 강도",
            score: Math.round(supplyScore),
            max: 40,
            desc: `외국인 ${foreign >= 0 ? "+" : ""}${fmtUk(foreign)} · 기관 ${institution >= 0 ? "+" : ""}${fmtUk(institution)}`,
          },
          {
            label: "가격 모멘텀",
            score: momentumScore,
            max: 30,
            desc: `당일 ${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`,
          },
          {
            label: "거래량",
            score: volScore,
            max: 15,
            desc: `5일 평균 대비 ${volumeRatio}배`,
          },
          {
            label: "52주 위치",
            score: highScore,
            max: 15,
            desc: `52주 고가의 ${week52Pct}%`,
          },
        ],
        comment,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
