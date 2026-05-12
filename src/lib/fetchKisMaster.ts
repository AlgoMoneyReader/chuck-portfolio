/**
 * KIS(한국투자증권) 오픈 API 기반 전체 상장 종목 마스터
 *
 * ── 조회 전략 ─────────────────────────────────────────────────────────────────
 * 1. volume-rank 엔드포인트 (FHPST01710000) — ctx_area_fk100/nk100 While 루프
 *    → KOSPI + KOSDAQ 전 종목을 거래량 순으로 페이지 순회 (30개/페이지)
 *    → tr_cont 응답 헤더 "F" = 더 있음 / "D"|"" = 마지막 페이지
 * 2. KIS 토큰 없거나 실패 시 → STATIC_FALLBACK 반환
 *
 * ── 캐시 ──────────────────────────────────────────────────────────────────────
 * 서버 인메모리 캐시 24시간 유지 → 빈번한 API 호출 방지
 * 단, 종목 수가 STATIC 수준(< 300)이면 캐시 불신하고 재조회
 */

import { STOCK_MASTER } from "./stockMaster";

export interface MasterStock {
  code: string;        // 6자리 숫자 (예: "039490")
  name: string;        // 한글 종목명 (예: "키움증권")
  market: "KS" | "KQ";
  type: "regular" | "etf" | "preferred" | "spac";
}

interface CacheEntry {
  data: MasterStock[];
  fetchedAt: number;
}

let _cache: CacheEntry | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const MIN_STOCK_COUNT = 300; // 이 미만이면 KIS 결과를 신뢰하지 않음

// ── KIS 토큰 ──────────────────────────────────────────────────────────────────
let _kisToken: { value: string; expiresAt: number } | null = null;

async function getKisToken(): Promise<string | null> {
  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) return null;
  const now = Date.now();
  if (_kisToken && _kisToken.expiresAt > now + 60_000) return _kisToken.value;
  try {
    const res = await fetch(
      "https://openapi.koreainvestment.com:9443/oauth2/tokenP",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          appkey: process.env.KIS_APP_KEY,
          appsecret: process.env.KIS_APP_SECRET,
        }),
        cache: "no-store",
      }
    );
    const data = await res.json();
    if (!data.access_token) return null;
    _kisToken = {
      value: data.access_token,
      expiresAt: now + (data.expires_in ?? 86400) * 1000,
    };
    return _kisToken.value;
  } catch {
    return null;
  }
}

// ── KIS Volume-Rank 한 시장 전체 페이지 순회 ──────────────────────────────────
async function fetchKisMarket(
  token: string,
  mktDiv: "J" | "Q"  // J=KOSPI, Q=KOSDAQ
): Promise<MasterStock[]> {
  const market: "KS" | "KQ" = mktDiv === "J" ? "KS" : "KQ";
  const stocks: MasterStock[] = [];
  const seen = new Set<string>();

  let ctxFk = "";
  let ctxNk = "";
  let trCont = "N"; // 최초: N, 연속: Y
  let page = 0;
  const MAX_PAGES = 120; // KOSPI ~800종목 / 30 ≈ 27페이지, 여유 4배

  while (page < MAX_PAGES) {
    page++;

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: mktDiv,
      FID_COND_SCR_DIV_CODE: "20171",
      FID_INPUT_ISCD: "0000",          // 전체 종목
      FID_DIV_CLS_CODE: "0",
      FID_BLNG_CLS_CODE: "0",
      FID_TRGT_CLS_CODE: "111111111",
      FID_TRGT_EXLS_CLS_CODE: "0000000",
      FID_INPUT_PRICE_1: "0",
      FID_INPUT_PRICE_2: "999999999",
      FID_VOL_CNT: "0",
      FID_INPUT_DATE_1: "",
    });

    let res: Response;
    try {
      res = await fetch(
        `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/volume-rank?${params}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            appkey: process.env.KIS_APP_KEY!,
            appsecret: process.env.KIS_APP_SECRET!,
            tr_id: "FHPST01710000",
            custtype: "P",
            tr_cont: trCont,
            ctx_area_fk100: ctxFk,
            ctx_area_nk100: ctxNk,
          } as Record<string, string>,
          cache: "no-store",
        }
      );
    } catch (err) {
      console.error(`[kis-master] ${market} 페이지${page} 네트워크 오류:`, err);
      break;
    }

    if (!res.ok) {
      console.error(`[kis-master] ${market} 페이지${page} HTTP ${res.status}`);
      break;
    }

    const body = await res.json();

    // 응답 헤더에서 연속 조회 여부 + ctx 키 추출
    const respTrCont = (res.headers.get("tr_cont") ?? "").trim();
    const nextFk = (res.headers.get("ctx_area_fk100") ?? "").trim();
    const nextNk = (res.headers.get("ctx_area_nk100") ?? "").trim();

    const rows: { stck_shrn_iscd?: string; hts_kor_isnm?: string }[] =
      body.output ?? [];

    let added = 0;
    for (const r of rows) {
      const code = (r.stck_shrn_iscd ?? "").trim();
      const name = (r.hts_kor_isnm ?? "").trim();
      if (!code || !name || !/^\d{6}$/.test(code) || seen.has(code)) continue;
      seen.add(code);
      // 우선주/SPAC 간단 분류
      const type: MasterStock["type"] =
        /[0-9]우[BC]?$/.test(name) ? "preferred" :
        /SPAC|스팩/.test(name) ? "spac" :
        /ETF|인버스|레버리지/.test(name) ? "etf" :
        "regular";
      stocks.push({ code, name, market, type });
      added++;
    }

    console.log(
      `[kis-master] ${market} p${page} rows=${rows.length} added=${added} ` +
      `total=${stocks.length} tr_cont="${respTrCont}"`
    );

    // 마지막 페이지 판정: tr_cont가 "F"이면 연속, 그 외("D","M","") 이면 종료
    if (respTrCont !== "F") break;
    if (!nextFk && !nextNk) break; // ctx가 모두 비어있어도 종료

    ctxFk = nextFk;
    ctxNk = nextNk;
    trCont = "Y"; // 이후는 연속 조회

    // Rate limit 방지
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`[kis-master] ${market} 완료: 총 ${stocks.length}개 (${page}페이지)`);
  return stocks;
}

// ── 정적 Fallback ─────────────────────────────────────────────────────────────
function getStaticFallback(): MasterStock[] {
  return STOCK_MASTER.map((s) => ({
    code: s.code,
    name: s.name,
    market: s.market,
    type: s.type,
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * 전체 상장 종목 배열 반환 (캐시 우선)
 * @param includeTypes 포함할 type (기본: regular + etf)
 */
export async function getKisMaster(
  includeTypes: MasterStock["type"][] = ["regular", "etf"]
): Promise<MasterStock[]> {
  const now = Date.now();

  if (
    _cache &&
    now - _cache.fetchedAt < CACHE_TTL &&
    _cache.data.length >= MIN_STOCK_COUNT
  ) {
    const filtered = _cache.data.filter((s) => includeTypes.includes(s.type));
    console.log(
      `[kis-master] 캐시 히트 — 전체=${_cache.data.length} 필터 후=${filtered.length}`
    );
    return filtered;
  }

  // KIS API 시도
  const token = await getKisToken();
  if (token) {
    try {
      console.log("[kis-master] KIS volume-rank 전종목 순회 시작 …");
      const [kospi, kosdaq] = await Promise.all([
        fetchKisMarket(token, "J"),
        fetchKisMarket(token, "Q"),
      ]);

      const all = [...kospi, ...kosdaq];

      // 정적 마스터에만 있는 종목을 추가로 합산 (KIS 누락 보완)
      const kisCodes = new Set(all.map((s) => s.code));
      const staticExtra = getStaticFallback().filter(
        (s) => !kisCodes.has(s.code)
      );
      const merged = [...all, ...staticExtra];

      console.log(
        `[kis-master] ✅ 총 종목 수: KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length}` +
        ` + 정적 보완 ${staticExtra.length} = 합계 ${merged.length}개`
      );

      _cache = { data: merged, fetchedAt: now };

      return merged.filter((s) => includeTypes.includes(s.type));
    } catch (err) {
      console.error("[kis-master] KIS 조회 실패, 정적 fallback 사용:", err);
    }
  } else {
    console.warn("[kis-master] KIS 인증정보 없음 → 정적 fallback 사용");
  }

  // 정적 fallback
  const fallback = getStaticFallback();
  _cache = { data: fallback, fetchedAt: now };
  console.log(`[kis-master] 정적 fallback: ${fallback.length}개`);
  return fallback.filter((s) => includeTypes.includes(s.type));
}

/** 캐시 즉시 무효화 (관리자 페이지 등에서 호출) */
export function invalidateKisMasterCache() {
  _cache = null;
}
