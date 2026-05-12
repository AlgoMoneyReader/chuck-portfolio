/**
 * KIS(한국투자증권) 오픈 API 기반 전체 상장 종목 마스터
 *
 * ── 페이지네이션 핵심 원리 ────────────────────────────────────────────────────
 * KIS API는 ctx(연속 조회 키)를 **응답 BODY**에 담아 돌려준다.
 * (응답 헤더가 아님)
 *
 * Request Header   : tr_cont ("N"=신규 / "Y"=연속)
 *                    ctx_area_fk100 / ctx_area_nk100 (이전 응답 body 값)
 * Response Header  : tr_cont ("F"|"M"=더 있음 / "D"|"G"|""=마지막)
 * Response Body    : ctx_area_fk100, ctx_area_nk100 ← 다음 요청에 사용
 *
 * ── 수집 전략 ─────────────────────────────────────────────────────────────────
 *  FHPST01710000 (거래량 순위): KOSPI("J") 전용 TR_ID
 *    → KOSDAQ "Q" / "K" 모두 ERROR INVALID FID_COND_MRKT_DIV_CODE
 *    → 시장 마감 후에는 tr_cont="N"(단 1페이지)으로 제한되며,
 *      장중에는 F/M 연속조회로 전 종목 순회 가능
 *
 *  FHPST01700000 (가격 순위): KOSPI("J") 보완용 — 거래량 순위 결과 부족 시 추가
 *
 *  KOSDAQ 종목: rt_cd 체크로 INVALID 오류 감지 → 빈 배열 반환 (graceful)
 *
 * ── 캐시 ──────────────────────────────────────────────────────────────────────
 * 서버 인메모리 캐시 24시간 (Vercel warm instance 재활용)
 */

export interface MasterStock {
  code: string;          // 6자리 숫자 문자열 (예: "039490")
  name: string;          // 한글 종목명
  market: "KS" | "KQ";
  type: "regular" | "etf" | "preferred" | "spac";
}

interface CacheEntry {
  data: MasterStock[];
  fetchedAt: number;
}

let _cache: CacheEntry | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ── KIS OAuth 토큰 ────────────────────────────────────────────────────────────
let _tok: { value: string; exp: number } | null = null;

export async function getKisToken(): Promise<string> {
  const now = Date.now();

  // ── 2. 환경변수 로드 상태 점검 ─────────────────────────────────────────────
  console.log(
    "🔑 KIS Key Load Status:",
    process.env.KIS_APP_KEY    ? `Loaded (${process.env.KIS_APP_KEY.slice(0, 6)}…)`    : "❌ Missing",
    "|",
    process.env.KIS_APP_SECRET ? `Loaded (${process.env.KIS_APP_SECRET.slice(0, 6)}…)` : "❌ Missing"
  );

  if (_tok && _tok.exp > now + 60_000) {
    console.log("🎟️  Token Status: Valid (cached, exp in", Math.round((_tok.exp - now) / 1000), "s)");
    return _tok.value;
  }

  console.log("🎟️  Token Status: Fetching new token…");

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

  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    console.error(`🚨 [KIS API ERROR] 토큰 발급 실패: HTTP ${res.status}`, body);
    throw new Error(`[kis-master] 토큰 발급 실패: HTTP ${res.status} — ${body}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    console.error("🚨 [KIS API ERROR] 토큰 응답에 access_token 없음:", JSON.stringify(data));
    throw new Error("[kis-master] access_token 없음");
  }

  console.log("🎟️  Token Status: Valid (new, exp in", data.expires_in ?? 86400, "s)");
  _tok = { value: data.access_token, exp: now + (data.expires_in ?? 86400) * 1000 };
  return _tok.value;
}

// ── 종목 타입 분류 ────────────────────────────────────────────────────────────
function classifyType(name: string): MasterStock["type"] {
  if (/ETF|인버스|레버리지|KODEX|TIGER|KBSTAR|ARIRANG|KOSEF|HANARO|SOL |ACE |TIMEFOLIO/.test(name))
    return "etf";
  if (/[0-9]우[BC]?$/.test(name)) return "preferred";
  if (/SPAC|스팩/.test(name)) return "spac";
  return "regular";
}

// ── 단일 엔드포인트 전체 페이지 순회 ─────────────────────────────────────────
//
// NOTE: FHPST01710000 거래량순위는 KOSPI("J") 전용
//   - "Q"(KOSDAQ) → ERROR INVALID FID_COND_MRKT_DIV_CODE
//   - "K"         → 동일 오류
//   → rt_cd !== "0" 이면 즉시 종료 (빈 배열 반환)
//   장 마감 후: tr_cont="N" → 1페이지(~30개)만 반환
//   장중:       tr_cont="F"/"M" → 연속 조회로 전 종목 순회
//
async function sweepEndpoint(
  token: string,
  mktDiv: "J" | "Q",   // J=KOSPI, Q=KOSDAQ(현재 INVALID — graceful bail-out)
  trId: "FHPST01710000" | "FHPST01700000",
  label: string
): Promise<MasterStock[]> {
  const market: "KS" | "KQ" = mktDiv === "J" ? "KS" : "KQ";
  const stocks: MasterStock[] = [];
  const seen = new Set<string>();

  let ctxFk = "";
  let ctxNk = "";
  let trCont = "N";     // 신규 조회
  let page = 0;
  const MAX_PAGES = 150; // KOSDAQ 1,700개 ÷ 30개/페이지 ≈ 57페이지, 여유 2.5배

  while (page < MAX_PAGES) {
    page++;

    // ── 공통 쿼리 파라미터 ──────────────────────────────────────────────────
    const paramObj: Record<string, string> = {
      FID_COND_MRKT_DIV_CODE: mktDiv,
      FID_COND_SCR_DIV_CODE: trId === "FHPST01710000" ? "20171" : "20170",
      FID_INPUT_ISCD: "0000",       // 전체 종목
      FID_DIV_CLS_CODE: "0",
      FID_BLNG_CLS_CODE: "0",
      FID_TRGT_CLS_CODE: "111111111",
      FID_TRGT_EXLS_CLS_CODE: "0000000",
      FID_INPUT_PRICE_1: "0",
      FID_INPUT_PRICE_2: "999999999",
      FID_VOL_CNT: "0",
      FID_INPUT_DATE_1: "",
    };
    // FHPST01700000(가격순위)는 FID_RANK_SORT_CLS_CODE 필수 (없으면 ERROR INPUT FIELD NOT FOUND)
    if (trId === "FHPST01700000") paramObj["FID_RANK_SORT_CLS_CODE"] = "0";
    const params = new URLSearchParams(paramObj);

    // EGW00201(초당 초과) 재시도 — 최대 3회, 1s/2s/4s 백오프
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetch(
          `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/volume-rank?${params}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              appkey: process.env.KIS_APP_KEY!,
              appsecret: process.env.KIS_APP_SECRET!,
              tr_id: trId,
              custtype: "P",
              tr_cont: trCont,
              ctx_area_fk100: ctxFk,
              ctx_area_nk100: ctxNk,
            } as Record<string, string>,
            cache: "no-store",
          }
        );
        if (res.ok) break; // 성공 시 재시도 루프 탈출
        // 서버 에러(500)일 때만 재시도
        if (res.status < 500) break;
        console.warn(`[kis-master] ${label} p${page} HTTP ${res.status} attempt ${attempt}/3 — retrying…`);
        await new Promise((r) => setTimeout(r, attempt * 1000));
      } catch (err) {
        console.error(`[kis-master] ${label} p${page} 네트워크 오류 attempt ${attempt}/3:`, String(err));
        if (attempt === 3) { res = null; }
        else await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }

    if (!res || !res.ok) {
      let errBody = "";
      if (res) { try { errBody = await res.text(); } catch { /* ignore */ } }
      console.error(
        `🚨 [KIS API ERROR] ${label} p${page}`,
        res ? `HTTP ${res.status}` : "network error",
        errBody.slice(0, 300)
      );
      break;
    }

    // ── 응답 파싱 ────────────────────────────────────────────────────────────
    // ★ tr_cont  → 응답 HEADER
    // ★ ctx_area → 응답 BODY
    const body = await res.json();

    // KIS 비즈니스 오류 — INVALID 시장코드 등 즉시 종료
    // ★ rt_cd는 숫자(0) 또는 문자열("0") 모두 반환되므로 String() 변환 필수
    const rtCd = String(body.rt_cd ?? "0");
    if (rtCd !== "0") {
      console.error(
        `🚨 [KIS API ERROR] ${label} p${page}`,
        `rt_cd=${rtCd}`,
        `msg1="${body.msg1 ?? ""}"`,
        `msg_cd="${body.msg_cd ?? ""}"`
      );
      break;
    }

    const respTrCont = (res.headers.get("tr_cont") ?? "").trim();

    // ctx는 반드시 body에서 읽는다
    const nextFk = (body.ctx_area_fk100 ?? "").trim();
    const nextNk = (body.ctx_area_nk100 ?? "").trim();

    // ★ KIS 거래량순위(FHPST01710000) 실제 응답 필드:
    //   mksc_shrn_iscd = 종목 단축코드 (6자리)  ← stck_shrn_iscd 아님!
    //   hts_kor_isnm   = 한글 종목명
    const rows: { mksc_shrn_iscd?: string; stck_shrn_iscd?: string; hts_kor_isnm?: string }[] =
      body.output ?? [];

    let added = 0;
    for (const r of rows) {
      // mksc_shrn_iscd 우선, 없으면 stck_shrn_iscd fallback (API 버전 차이 대응)
      const code = (r.mksc_shrn_iscd ?? r.stck_shrn_iscd ?? "").trim();
      const name = (r.hts_kor_isnm ?? "").trim();
      if (!code || !name || !/^\d{6}$/.test(code) || seen.has(code)) continue;
      seen.add(code);
      stocks.push({ code, name, market, type: classifyType(name) });
      added++;
    }

    console.log(
      `[kis-master] ${label} p${page} ` +
      `rows=${rows.length} added=${added} total=${stocks.length} ` +
      `tr_cont="${respTrCont}" ctx="${nextFk.slice(0, 8)}…"`
    );

    // ── 종료 조건 ─────────────────────────────────────────────────────────────
    // tr_cont "F" 또는 "M" = 다음 페이지 있음 / 그 외("D","G","N","") = 마지막
    const hasMore = respTrCont === "F" || respTrCont === "M";
    if (!hasMore) break;
    if (!nextFk && !nextNk) break; // ctx가 비어있으면 순환 방지

    // 다음 페이지 준비
    ctxFk = nextFk;
    ctxNk = nextNk;
    trCont = "Y"; // 연속 조회

    await new Promise((r) => setTimeout(r, 80)); // rate-limit 방지
  }

  console.log(`[kis-master] ${label} 완료: ${stocks.length}개 (${page}페이지)`);
  return stocks;
}

// ── 전체 수집 ─────────────────────────────────────────────────────────────────
async function fetchAllStocks(token: string): Promise<MasterStock[]> {
  // 거래량 순위 — 순차 실행 (병렬 시 EGW00201 초당 거래건수 초과)
  // NOTE: KOSDAQ("Q")는 FHPST01710000에서 INVALID → rt_cd 체크로 즉시 종료
  const ksVol = await sweepEndpoint(token, "J", "FHPST01710000", "KOSPI-거래량");
  await new Promise((r) => setTimeout(r, 200));
  const kqVol = await sweepEndpoint(token, "Q", "FHPST01710000", "KOSDAQ-거래량");

  // 중복 제거 병합
  const seen = new Set<string>();
  const all: MasterStock[] = [];

  for (const s of [...ksVol, ...kqVol]) {
    if (!seen.has(s.code)) {
      seen.add(s.code);
      all.push(s);
    }
  }

  // KOSPI 300개 미만이면 가격 순위 API로 보완
  // (장 마감 후 1페이지 30개만 반환되는 경우 — 장중에는 연속조회로 충분)
  if (all.length < 300) {
    console.warn(
      `[kis-master] 거래량 순위만으로 ${all.length}개 — ` +
      `가격 순위 API 보완 실행… (장 마감 후 제한일 수 있음)`
    );

    // 가격 순위도 순차 실행 (초당 초과 방지)
    const ksPrc = await sweepEndpoint(token, "J", "FHPST01700000", "KOSPI-가격");
    await new Promise((r) => setTimeout(r, 200));
    const kqPrc = await sweepEndpoint(token, "Q", "FHPST01700000", "KOSDAQ-가격");

    for (const s of [...ksPrc, ...kqPrc]) {
      if (!seen.has(s.code)) {
        seen.add(s.code);
        all.push(s);
      }
    }

    console.log(`[kis-master] 보완 후 총 ${all.length}개`);
  }

  return all;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * KIS 전체 상장 종목 배열 반환 (24h 서버 캐시)
 * 캐시 히트 시 즉시 반환, 미스 시 KIS API 전페이지 순회
 */
export async function getKisMaster(
  includeTypes: MasterStock["type"][] = ["regular", "etf"]
): Promise<MasterStock[]> {
  const now = Date.now();

  // 캐시가 유효하고 최소 30개 이상이면 재사용 (장 마감 후 소량도 허용)
  if (_cache && now - _cache.fetchedAt < CACHE_TTL && _cache.data.length >= 30) {
    const filtered = _cache.data.filter((s) => includeTypes.includes(s.type));
    console.log(
      `[kis-master] 캐시 히트 — 전체=${_cache.data.length} ` +
      `필터(${includeTypes.join("+")})=${filtered.length}`
    );
    return filtered;
  }

  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    throw new Error(
      "[kis-master] KIS_APP_KEY / KIS_APP_SECRET 환경변수가 설정되지 않았습니다. " +
      "Vercel 프로젝트 설정 → Environment Variables 에서 추가하세요."
    );
  }

  console.log("[kis-master] KIS API 전종목 순회 시작 …");
  const token = await getKisToken();
  const all = await fetchAllStocks(token);

  console.log(
    `[System] 한국투자증권 전체 마스터 종목 로드 완료: 총 ${all.length}개` +
    (all.length < 300 ? " (장 마감 후 제한 — 장중에는 전 종목 조회됨)" : "")
  );

  if (all.length === 0) {
    throw new Error("[kis-master] KIS API에서 종목을 하나도 가져오지 못했습니다.");
  }

  _cache = { data: all, fetchedAt: now };
  return all.filter((s) => includeTypes.includes(s.type));
}

/**
 * 캐시된 데이터만 반환 (KIS API 호출 없음)
 * → stock-search 에서 캐시 미적재 시 Yahoo Finance fallback 결정에 사용
 */
export function getKisMasterCached(
  includeTypes: MasterStock["type"][] = ["regular", "etf"]
): MasterStock[] | null {
  if (!_cache || Date.now() - _cache.fetchedAt >= CACHE_TTL) return null;
  return _cache.data.filter((s) => includeTypes.includes(s.type));
}

/** 캐시 즉시 무효화 */
export function invalidateKisMasterCache() {
  _cache = null;
  console.log("[kis-master] 캐시 무효화됨");
}
