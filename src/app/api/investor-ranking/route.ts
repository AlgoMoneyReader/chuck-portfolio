import { NextResponse } from "next/server";
import { getKisToken } from "@/lib/fetchKisMaster"; // 공유 토큰 (EGW00133 방지)

export const dynamic = "force-dynamic";

// ─── 조회 대상 종목 (KOSPI/KOSDAQ 주요 60개+) ──────────────────────────────
const MAJOR_STOCKS: Record<string, string> = {
  // KOSPI 시총 상위
  "005930": "삼성전자",       "005935": "삼성전자우",     "000660": "SK하이닉스",
  "005380": "현대차",         "035420": "NAVER",          "051910": "LG화학",
  "207940": "삼성바이오로직스","005490": "POSCO홀딩스",   "000270": "기아",
  "006400": "삼성SDI",        "068270": "셀트리온",       "096770": "SK이노베이션",
  "035720": "카카오",         "034730": "SK스퀘어",       "003550": "LG",
  "012330": "현대모비스",     "009150": "삼성전기",       "042700": "한미반도체",
  "055550": "신한지주",       "105560": "KB금융",         "086790": "하나금융지주",
  "066570": "LG전자",         "028260": "삼성물산",       "003600": "SK",
  "011200": "HMM",            "010130": "고려아연",       "018260": "삼성SDS",
  "003490": "대한항공",       "011070": "LG이노텍",       "033780": "KT&G",
  "010950": "S-Oil",          "036570": "엔씨소프트",     "090430": "아모레퍼시픽",
  "032640": "LG유플러스",     "030200": "KT",             "017670": "SK텔레콤",
  "015760": "한국전력",       "316140": "우리금융지주",   "024110": "기업은행",
  "032830": "삼성생명",       "000810": "삼성화재",       "047050": "포스코인터내셔널",
  "078930": "GS",             "161390": "한국타이어앤테크놀로지","097950": "CJ제일제당",
  "047810": "한국항공우주",
  // 추가 종목
  "042660": "한화오션",       "010140": "삼성중공업",     "012450": "한화에어로스페이스",
  "003620": "KG모빌리티",     "018880": "한온시스템",     "329180": "HD현대중공업",
  "267250": "HD현대",         "028050": "삼성E&A",        "009830": "한화솔루션",
  "003670": "포스코퓨처엠",   "034020": "두산에너빌리티", "064350": "현대로템",
  "011170": "롯데케미칼",     "000720": "현대건설",       "086280": "현대글로비스",
  "241560": "두산밥캣",       "010620": "HD현대미포",     "000100": "유한양행",
  // KOSDAQ 주요
  "032560": "대한광통신",     "247540": "에코프로비엠",   "086520": "에코프로",
  "196170": "알테오젠",       "277810": "레인보우로보틱스","278470": "에이피알",
  "145020": "휴젤",           "214150": "클래시스",       "041510": "SM엔터",
};

export interface RankItem {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePct: number;
  netBuyAmount: number; // 억원
  netBuyQty: number;    // 주
}

interface KISRow {
  stck_bsop_date: string;  // 영업일자 YYYYMMDD
  stck_clpr: string;       // 종가 (전일 종가)
  prdy_vrss: string;
  prdy_vrss_sign: string;
  frgn_ntby_tr_pbmn: string;
  orgn_ntby_tr_pbmn: string;
  prsn_ntby_tr_pbmn: string;
  frgn_ntby_qty: string;
  orgn_ntby_qty: string;
  prsn_ntby_qty: string;
}

/** 백만원 → 억원 */
function toUk(s: string): number {
  const n = parseInt((s ?? "").replace(/,/g, "") || "0", 10);
  return isNaN(n) ? 0 : Math.round(n / 100);
}

/** 주 수량 파싱 */
function toQty(s: string): number {
  const n = parseInt((s ?? "").replace(/,/g, "") || "0", 10);
  return isNaN(n) ? 0 : n;
}

/** 오늘 날짜 KST 기준 YYYYMMDD */
function todayKST(): string {
  return new Date(Date.now() + 9 * 3_600_000)
    .toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchStockInvestor(code: string, token: string): Promise<{
  code: string;
  price: number; changePct: number;
  frgn: number; frgnQty: number;
  orgn: number; orgnQty: number;
  prsn: number; prsnQty: number;
} | null> {
  try {
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
    const rows: KISRow[] = data.output ?? [];
    if (!rows.length) return null;

    // ── 당일 row 우선 선택 ────────────────────────────────────────────────────
    // inquire-investor는 최신 영업일부터 내림차순으로 여러 row를 반환.
    // 장중에는 rows[0]이 당일이지만 flow가 아직 소수일 수 있고,
    // 장 개시 전에는 rows[0]가 전일인 경우도 있음.
    const today = todayKST();
    const r = rows.find((x) => x.stck_bsop_date === today)
           ?? rows.find((x) => x.frgn_ntby_tr_pbmn !== "" || x.orgn_ntby_tr_pbmn !== "")
           ?? rows[0];
    if (!r) return null;

    // 가격: stck_clpr는 종가 → 장중에는 전일 종가.
    // 실시간 주가는 이후 Yahoo Finance 배치 조회로 덮어씀.
    const price = parseInt(r.stck_clpr, 10) || 0;
    const vrss  = parseInt(r.prdy_vrss, 10) || 0;
    const sign  = r.prdy_vrss_sign;
    const signed = ["1","2"].includes(sign) ? vrss : ["4","5"].includes(sign) ? -vrss : 0;
    const prevPrice = price - signed;
    const changePct = prevPrice > 0 ? parseFloat(((signed / prevPrice) * 100).toFixed(2)) : 0;

    return {
      code, price, changePct,
      frgn:    toUk(r.frgn_ntby_tr_pbmn), frgnQty: toQty(r.frgn_ntby_qty),
      orgn:    toUk(r.orgn_ntby_tr_pbmn), orgnQty: toQty(r.orgn_ntby_qty),
      prsn:    toUk(r.prsn_ntby_tr_pbmn), prsnQty: toQty(r.prsn_ntby_qty),
    };
  } catch {
    return null;
  }
}

// ── Yahoo Finance 실시간 주가 배치 조회 (50개씩) ──────────────────────────────
async function fetchYFPrices(
  codes: string[]
): Promise<Record<string, { price: number; changePct: number }>> {
  const symbols = codes.map((c) => `${c}.KS`);
  const map: Record<string, { price: number; changePct: number }> = {};

  // 50개씩 분할
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    try {
      const res = await fetch(
        `https://query2.finance.yahoo.com/v7/finance/spark` +
          `?symbols=${encodeURIComponent(chunk.join(","))}&range=1d&interval=5m`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
      );
      if (!res.ok) continue;
      const j = await res.json();
      for (const item of j?.spark?.result ?? []) {
        const meta = item?.response?.[0]?.meta ?? {};
        const price: number = meta.regularMarketPrice ?? 0;
        const prev: number  = meta.chartPreviousClose ?? meta.previousClose ?? price;
        if (price > 0) {
          const code = (item.symbol as string).replace(".KS", "");
          map[code] = {
            price,
            changePct: prev > 0 ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0,
          };
        }
      }
    } catch { /* silent */ }
  }
  return map;
}

export async function GET() {
  try {
    const token = await getKisToken();
    const codes = Object.keys(MAJOR_STOCKS);

    // 1. KIS 투자자 동향 (BATCH=10, 80ms 간격)
    const BATCH = 10;
    const results: Awaited<ReturnType<typeof fetchStockInvestor>>[] = [];
    for (let i = 0; i < codes.length; i += BATCH) {
      const batch = codes.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map((c) => fetchStockInvestor(c, token)));
      results.push(...batchResults);
      if (i + BATCH < codes.length) await new Promise((r) => setTimeout(r, 80));
    }
    const valid = results.filter(Boolean) as NonNullable<typeof results[0]>[];

    // 2. Yahoo Finance 실시간 주가로 가격 덮어쓰기 (stck_clpr = 전일 종가 보정)
    const yfPrices = await fetchYFPrices(valid.map((v) => v.code));
    for (const v of valid) {
      const yf = yfPrices[v.code];
      if (yf) { v.price = yf.price; v.changePct = yf.changePct; }
    }

    const toItem = (
      r: NonNullable<typeof valid[0]>, amount: number, qty: number, rank: number
    ): RankItem => ({
      rank,
      code:         r.code,
      name:         MAJOR_STOCKS[r.code] ?? r.code,
      price:        r.price,
      changePct:    r.changePct,
      netBuyAmount: amount,
      netBuyQty:    qty,
    });

    const sortDesc = (arr: typeof valid, fn: (x: typeof valid[0]) => number) =>
      [...arr].sort((a, b) => fn(b) - fn(a));
    const sortAsc = (arr: typeof valid, fn: (x: typeof valid[0]) => number) =>
      [...arr].sort((a, b) => fn(a) - fn(b));

    const foreignBuy  = sortDesc(valid, (x) => x.frgn).slice(0, 10).map((r, i) => toItem(r, r.frgn, r.frgnQty, i+1));
    const instBuy     = sortDesc(valid, (x) => x.orgn).slice(0, 10).map((r, i) => toItem(r, r.orgn, r.orgnQty, i+1));
    const indivBuy    = sortDesc(valid, (x) => x.prsn).slice(0, 10).map((r, i) => toItem(r, r.prsn, r.prsnQty, i+1));
    const foreignSell = sortAsc(valid,  (x) => x.frgn).slice(0, 10).map((r, i) => toItem(r, r.frgn, r.frgnQty, i+1));
    const instSell    = sortAsc(valid,  (x) => x.orgn).slice(0, 10).map((r, i) => toItem(r, r.orgn, r.orgnQty, i+1));
    const indivSell   = sortAsc(valid,  (x) => x.prsn).slice(0, 10).map((r, i) => toItem(r, r.prsn, r.prsnQty, i+1));

    return NextResponse.json(
      { buy:  { foreign: foreignBuy,  institution: instBuy,  individual: indivBuy  },
        sell: { foreign: foreignSell, institution: instSell, individual: indivSell } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("🚨 [investor-ranking] 오류:", String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
