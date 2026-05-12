/**
 * KRX 전체 상장 종목 마스터 조회
 *
 * 한국거래소(KRX)가 제공하는 공개 API를 사용해 KOSPI + KOSDAQ
 * 전 종목(2,000개+)을 페이지 제한 없이 한 번에 가져온다.
 * 인증 불필요 / 오픈 데이터.
 *
 * 서버 메모리 캐시 24시간 유지 → 빈번한 API 호출 방지.
 */

export interface KrxStock {
  code: string;        // 6자리 숫자 코드
  name: string;        // 한글 종목명
  market: "KS" | "KQ"; // KS=KOSPI, KQ=KOSDAQ
  type: "regular" | "etf" | "preferred" | "spac";
}

interface KrxRow {
  ISU_SRT_CD?: string;  // "005930"
  ISU_ABBRV?: string;   // "삼성전자"
  ISU_NM?: string;      // "삼성전자보통주"
  MKT_NM?: string;      // "KOSPI" | "KOSDAQ"
  ISU_ETP_TP_NM?: string; // ETF 여부 — "ETF" | ""
  SECT_TP_NM?: string;  // 종목 구분
}

interface CacheEntry {
  data: KrxStock[];
  fetchedAt: number;
}

// 서버 재시작 전까지 24시간 유지
let _cache: CacheEntry | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** 종목명으로 우선주·SPAC 분류 */
function classifyType(name: string, isEtf: boolean): KrxStock["type"] {
  if (isEtf) return "etf";
  if (/[0-9]우[BC]?$/.test(name) || /우선주/.test(name)) return "preferred";
  if (/SPAC|스팩/.test(name)) return "spac";
  return "regular";
}

async function fetchMarket(
  mktId: "STK" | "KSQ"
): Promise<KrxStock[]> {
  const market: "KS" | "KQ" = mktId === "STK" ? "KS" : "KQ";

  // KRX data portal: 전 종목 현재가 리스트
  const res = await fetch(
    "https://data.krx.co.kr/comm/bldAttachFile/getList.cmd",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Referer: "https://data.krx.co.kr/",
      },
      body: new URLSearchParams({
        bld: "dbms/MDC/STAT/standard/MDCSTAT01901",
        mktId,
        share: "1",
        csvxls_isNo: "false",
      }).toString(),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    console.error(`[krx-master] ${mktId} fetch failed: ${res.status}`);
    return [];
  }

  const json = (await res.json()) as { OutBlock_1?: KrxRow[] };
  const rows = json.OutBlock_1 ?? [];

  const stocks: KrxStock[] = rows
    .map((r) => {
      const code = (r.ISU_SRT_CD ?? "").trim();
      const name = (r.ISU_ABBRV ?? r.ISU_NM ?? "").trim();
      if (!code || !name || !/^\d{6}$/.test(code)) return null;

      const isEtf =
        (r.ISU_ETP_TP_NM ?? "").trim().toUpperCase() === "ETF" ||
        /^[A-Z]+\s/.test(name) === false && /ETF|인버스|레버리지/.test(name);

      return {
        code,
        name,
        market,
        type: classifyType(name, isEtf),
      } satisfies KrxStock;
    })
    .filter((x): x is KrxStock => x !== null);

  return stocks;
}

/**
 * 전체 상장 종목 배열 반환 (캐시 우선, 만료 시 재조회)
 * @param includeTypes  포함할 type 목록 (기본: regular + etf)
 */
export async function getKrxMaster(
  includeTypes: KrxStock["type"][] = ["regular", "etf"]
): Promise<KrxStock[]> {
  const now = Date.now();

  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    const filtered = _cache.data.filter((s) => includeTypes.includes(s.type));
    console.log(
      `[krx-master] cache hit — total=${_cache.data.length}  filtered=${filtered.length}`
    );
    return filtered;
  }

  console.log("[krx-master] fetching KOSPI + KOSDAQ from KRX …");

  const [kospi, kosdaq] = await Promise.all([
    fetchMarket("STK"),
    fetchMarket("KSQ"),
  ]);

  const all = [...kospi, ...kosdaq];
  _cache = { data: all, fetchedAt: now };

  console.log(
    `[krx-master] ✅ 전체 상장 종목 수: KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length} = ${all.length}개`
  );

  const filtered = all.filter((s) => includeTypes.includes(s.type));
  console.log(
    `[krx-master] 필터 후 (${includeTypes.join("+")}) = ${filtered.length}개`
  );

  return filtered;
}

/** 캐시 강제 무효화 (개발·테스트용) */
export function invalidateKrxCache() {
  _cache = null;
}
