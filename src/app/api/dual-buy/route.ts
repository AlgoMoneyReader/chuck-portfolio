/**
 * /api/dual-buy
 *
 * 외국인 + 기관 동반 순매수 TOP 10 (쌍끌이)
 *
 * 종목 풀(universe) 전략:
 *  - KRX 공개 API로 전체 상장 종목 마스터 로드 (2,000개+)
 *  - 단, investor-flow API 호출 부하를 줄이기 위해
 *    시가총액 상위 / 유동성 있는 종목을 1차 필터로 사용
 *  - MAJOR_STOCKS_KS · KQ 는 최우선 스캔 대상으로 유지
 *  - KRX 마스터 로드 실패 시 MAJOR_STOCKS 로만 스캔
 */

import { NextResponse } from "next/server";
import { getKrxMaster } from "@/lib/fetchKrxMaster";

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
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 86400) * 1000 };
  return data.access_token;
}

// ─── 핵심 스캔 대상 (반드시 포함) ─────────────────────────────────────────────
const MAJOR_STOCKS_KS: Record<string, string> = {
  "005930": "삼성전자",        "000660": "SK하이닉스",      "005380": "현대차",
  "035420": "NAVER",           "051910": "LG화학",           "207940": "삼성바이오로직스",
  "005490": "POSCO홀딩스",     "000270": "기아",             "006400": "삼성SDI",
  "068270": "셀트리온",        "096770": "SK이노베이션",     "035720": "카카오",
  "034730": "SK스퀘어",        "003550": "LG",               "012330": "현대모비스",
  "009150": "삼성전기",        "042700": "한미반도체",       "055550": "신한지주",
  "105560": "KB금융",          "086790": "하나금융지주",     "066570": "LG전자",
  "028260": "삼성물산",        "003600": "SK",               "011200": "HMM",
  "010130": "고려아연",        "018260": "삼성SDS",          "003490": "대한항공",
  "011070": "LG이노텍",        "033780": "KT&G",             "010950": "S-Oil",
  "036570": "엔씨소프트",      "090430": "아모레퍼시픽",     "032640": "LG유플러스",
  "030200": "KT",              "017670": "SK텔레콤",         "015760": "한국전력",
  "316140": "우리금융지주",    "024110": "기업은행",         "032830": "삼성생명",
  "000810": "삼성화재",        "047050": "포스코인터내셔널", "097950": "CJ제일제당",
  "047810": "한국항공우주",    "042660": "한화오션",         "010140": "삼성중공업",
  "012450": "한화에어로스페이스","003620": "KG모빌리티",     "329180": "HD현대중공업",
  "267250": "HD현대",          "028050": "삼성E&A",          "009830": "한화솔루션",
  "003670": "포스코퓨처엠",    "034020": "두산에너빌리티",   "064350": "현대로템",
  "086280": "현대글로비스",    "000720": "현대건설",
  "004020": "현대제철",        "011790": "SKC",              "088350": "한화생명",
  "071050": "한국금융지주",    "023530": "롯데쇼핑",         "000150": "두산",
  "138040": "메리츠금융지주",  "005830": "DB손해보험",       "014680": "한솔케미칼",
  "009540": "한국조선해양",    "298040": "효성중공업",       "298050": "효성첨단소재",
  "034310": "NICE",            "006800": "미래에셋증권",     "033640": "한국콜마",
  "002790": "아모레G",         "000080": "하이트진로",       "002380": "KCC",
  "010060": "OCI홀딩스",       "036460": "한국가스공사",     "192820": "코스맥스",
  "003410": "쌍용씨앤이",      "178920": "PI첨단소재",       "004170": "신세계I&C",
  "373220": "LG에너지솔루션",  "259960": "크래프톤",         "323410": "카카오뱅크",
  "377300": "카카오페이",      "079550": "LIG넥스원",        "016360": "삼성증권",
  "005940": "NH투자증권",      "011780": "금호석유화학",     "036490": "SK케미칼",
  "039490": "키움증권",        "023590": "다우기술",         "032190": "다우데이타",
  "084690": "대상홀딩스",
};

const MAJOR_STOCKS_KQ: Record<string, string> = {
  "247540": "에코프로비엠",    "086520": "에코프로",         "196170": "알테오젠",
  "357780": "솔브레인",        "263750": "펄어비스",         "145020": "휴젤",
  "214150": "클래시스",        "041510": "SM엔터",           "035900": "JYP엔터",
  "122870": "와이지엔터",      "032560": "대한광통신",       "278470": "에이피알",
  "277810": "레인보우로보틱스","108380": "로보티즈",         "095660": "네오위즈",
  "053800": "안랩",            "028300": "에이치엘비",       "058470": "리노공업",
  "064760": "티씨케이",        "352820": "하이브",
};

export interface DualBuyItem {
  code: string;
  name: string;
  market: "KS" | "KQ";
  price: number;
  changePct: number;
  foreign: number;
  institution: number;
  combined: number;
}

interface KISRow {
  stck_clpr: string;
  prdy_vrss: string;
  prdy_vrss_sign: string;
  frgn_ntby_tr_pbmn: string;
  orgn_ntby_tr_pbmn: string;
}

function toUk(s: string): number {
  const n = parseInt((s ?? "").replace(/,/g, "") || "0", 10);
  return isNaN(n) ? 0 : Math.round(n / 100);
}

async function fetchStockInvestor(
  code: string,
  token: string,
  marketDiv: "J" | "Q" = "J"
): Promise<{
  code: string;
  price: number;
  changePct: number;
  frgn: number;
  orgn: number;
} | null> {
  try {
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
    const rows: KISRow[] = data.output ?? [];

    const r = rows.find((x) => x.frgn_ntby_tr_pbmn !== "");
    if (!r) return null;

    const price = parseInt(r.stck_clpr, 10) || 0;
    const vrss  = parseInt(r.prdy_vrss, 10) || 0;
    const sign  = r.prdy_vrss_sign;
    const signed = ["1", "2"].includes(sign) ? vrss : ["4", "5"].includes(sign) ? -vrss : 0;
    const prevPrice = price - signed;
    const changePct = prevPrice > 0 ? parseFloat(((signed / prevPrice) * 100).toFixed(2)) : 0;

    return {
      code,
      price,
      changePct,
      frgn: toUk(r.frgn_ntby_tr_pbmn),
      orgn: toUk(r.orgn_ntby_tr_pbmn),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const token = await getKISToken();

    // ── 종목 풀 구성 ─────────────────────────────────────────────────────────
    // 1) 고정 주요 종목 (KOSPI + KOSDAQ)
    const ksMap = new Map<string, string>(Object.entries(MAJOR_STOCKS_KS));
    const kqMap = new Map<string, string>(Object.entries(MAJOR_STOCKS_KQ));

    // 2) KRX 마스터로 풀 확장 (regular 종목만 — ETF·우선주 제외)
    try {
      const krxAll = await getKrxMaster(["regular"]);
      console.log(`[dual-buy] KRX master loaded: ${krxAll.length}개`);

      for (const s of krxAll) {
        if (s.market === "KS" && !ksMap.has(s.code)) {
          ksMap.set(s.code, s.name);
        } else if (s.market === "KQ" && !kqMap.has(s.code)) {
          kqMap.set(s.code, s.name);
        }
      }
    } catch (err) {
      console.warn("[dual-buy] KRX 로드 실패, 주요 종목만 스캔:", err);
    }

    const ksEntries = Array.from(ksMap.entries());
    const kqEntries = Array.from(kqMap.entries());

    console.log(
      `[dual-buy] 스캔 대상: KOSPI ${ksEntries.length}개 + KOSDAQ ${kqEntries.length}개 = 합계 ${ksEntries.length + kqEntries.length}개`
    );

    // ── 배치 병렬 처리 (10개씩, rate limit 방지) ────────────────────────────
    const BATCH = 10;
    const results: Awaited<ReturnType<typeof fetchStockInvestor>>[] = [];

    for (let i = 0; i < ksEntries.length; i += BATCH) {
      const batch = ksEntries.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(([c]) => fetchStockInvestor(c, token, "J")));
      results.push(...batchResults);
      if (i + BATCH < ksEntries.length) await new Promise((r) => setTimeout(r, 80));
    }

    for (let i = 0; i < kqEntries.length; i += BATCH) {
      const batch = kqEntries.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(([c]) => fetchStockInvestor(c, token, "Q")));
      results.push(...batchResults);
      if (i + BATCH < kqEntries.length) await new Promise((r) => setTimeout(r, 80));
    }

    const allStocks = new Map<string, string>([
      ...Array.from(ksMap.entries()),
      ...Array.from(kqMap.entries()),
    ]);
    const kqCodes = new Set(kqMap.keys());
    const valid = results.filter(Boolean) as NonNullable<(typeof results)[0]>[];

    const dualBuy: DualBuyItem[] = valid
      .filter((r) => r.frgn > 0 && r.orgn > 0)
      .map((r) => ({
        code: r.code,
        name: allStocks.get(r.code) ?? r.code,
        market: (kqCodes.has(r.code) ? "KQ" : "KS") as "KS" | "KQ",
        price: r.price,
        changePct: r.changePct,
        foreign: r.frgn,
        institution: r.orgn,
        combined: r.frgn + r.orgn,
      }))
      .sort((a, b) => b.combined - a.combined)
      .slice(0, 10);

    console.log(
      `[dual-buy] 쌍끌이 포착: ${dualBuy.length}개 / 응답 ${valid.length}개`
    );

    return NextResponse.json(
      { stocks: dualBuy, timestamp: new Date().toISOString(), threshold: 0 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
