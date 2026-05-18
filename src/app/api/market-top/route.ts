import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── 서버사이드 캐시 ──────────────────────────────────────────────────────────
interface CacheEntry {
  data: { market: string; topGainers: TopGainerRow[]; topLosers: TopGainerRow[]; topByAmount: TopGainerRow[]; timestamp: string };
  ts: number;
}
const serverCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 10_000; // 10초

// ── 종목명 매핑 ───────────────────────────────────────────────────────────────
const KR_NAMES: Record<string, string> = {
  "005930": "삼성전자",      "000660": "SK하이닉스",    "005380": "현대차",
  "035420": "NAVER",         "051910": "LG화학",         "207940": "삼성바이오로직스",
  "005490": "POSCO홀딩스",   "000270": "기아",           "006400": "삼성SDI",
  "068270": "셀트리온",      "096770": "SK이노베이션",   "035720": "카카오",
  "034730": "SK스퀘어",      "003550": "LG",             "012330": "현대모비스",
  "009150": "삼성전기",      "042700": "한미반도체",     "055550": "신한지주",
  "105560": "KB금융",        "086790": "하나금융지주",   "032830": "삼성생명",
  "066570": "LG전자",        "028260": "삼성물산",       "000810": "삼성화재",
  "003600": "SK",            "011200": "HMM",            "010130": "고려아연",
  "018260": "삼성SDS",       "003490": "대한항공",       "011070": "LG이노텍",
  "078930": "GS",            "033780": "KT&G",           "010950": "S-Oil",
  "036570": "엔씨소프트",    "090430": "아모레퍼시픽",   "024110": "기업은행",
  "097950": "CJ제일제당",    "019170": "신세계",         "047050": "포스코인터내셔널",
  "161390": "한국타이어",    "316140": "우리금융지주",   "032640": "LG유플러스",
  "030200": "KT",            "017670": "SK텔레콤",       "015760": "한국전력",
  // KOSDAQ
  "247540": "에코프로비엠",  "086520": "에코프로",       "196170": "알테오젠",
  "357780": "솔브레인",      "263750": "펄어비스",       "145020": "휴젤",
  "214150": "클래시스",      "041510": "SM엔터",         "035900": "JYP엔터",
  "122870": "와이지엔터",    "091990": "셀트리온헬스케어","005290": "동진쎄미켐",
  "059270": "해성디에스",    "112040": "위메이드",       "220100": "퓨처켐",
  "039030": "이오테크닉스",  "068760": "셀트리온제약",   "293490": "카카오게임즈",
  "067310": "하나마이크론",  "036810": "에프에스티",     "183300": "코미팜",
  "048260": "오스템임플란트","376300": "디어유",
};

// 시장별 종목 코드 (6자리, .KS/.KQ 없이)
const KOSPI_CODES = [
  "005930","000660","005380","035420","051910",
  "207940","005490","000270","006400","068270",
  "096770","035720","034730","003550","012330",
  "009150","042700","055550","105560","086790",
  "032830","066570","028260","000810","003600",
  "011200","010130","018260","003490","011070",
  "078930","033780","010950","036570","090430",
  "024110","097950","019170","047050","161390",
  "316140","032640","030200","017670","015760",
];
const KOSDAQ_CODES = [
  "247540","086520","196170","357780","263750",
  "145020","214150","041510","035900","122870",
  "091990","005290","059270","112040","220100",
  "039030","068760","293490","067310","036810",
  "183300","048260","376300",
];

interface TopGainerRow {
  rank: number; code: string; symbol: string;
  name: string; price: number; change: number;
  changePct: number; volume: number;
  tradeAmount: number;
}

// ── Naver Finance 실시간 현재가 API ──────────────────────────────────────────
// https://api.finance.naver.com/service/itemSummary.nhn?itemcode=005930
// 반환: { now, diff, rate, quant, amount, high, low, ... }
// now=현재가, diff=전일대비, rate=등락률(%), quant=거래량(주), amount=거래대금(백만원)

interface NaverSummary {
  now: number;      // 현재가
  diff: number;     // 전일대비
  rate: number;     // 등락률 (%)
  quant: number;    // 거래량 (주)
  amount: number;   // 거래대금 (백만원)
}

const NAVER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const REFERER  = "https://finance.naver.com/";

async function fetchNaverSummary(code: string): Promise<{ code: string; data: NaverSummary } | null> {
  try {
    const url = `https://api.finance.naver.com/service/itemSummary.nhn?itemcode=${code}`;
    const res = await fetch(url, {
      headers: { "User-Agent": NAVER_UA, "Referer": REFERER },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().length < 5) return null;
    const data = JSON.parse(text) as NaverSummary;
    if (!data.now || data.now === 0) return null;
    return { code, data };
  } catch {
    return null;
  }
}

// 청크 단위 병렬 수집 (한 번에 15개씩, 총 3~4 라운드)
async function fetchAllCodes(codes: string[]): Promise<Map<string, NaverSummary>> {
  const CHUNK = 15;
  const map = new Map<string, NaverSummary>();

  for (let i = 0; i < codes.length; i += CHUNK) {
    const chunk = codes.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(fetchNaverSummary));
    for (const r of results) {
      if (r) map.set(r.code, r.data);
    }
  }
  return map;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";

  // 서버사이드 캐시 HIT
  const cached = serverCache[market];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "no-store, no-cache", "X-Cache": "HIT" },
    });
  }

  try {
    const codes = market === "KOSDAQ" ? KOSDAQ_CODES : KOSPI_CODES;
    const mktSuffix = market === "KOSDAQ" ? ".KQ" : ".KS";

    const dataMap = await fetchAllCodes(codes);

    const valid: Omit<TopGainerRow, "rank">[] = [];
    for (const code of codes) {
      const d = dataMap.get(code);
      if (!d) continue;

      valid.push({
        symbol:      code + mktSuffix,
        code,
        name:        KR_NAMES[code] ?? code,
        price:       Math.round(d.now),
        change:      Math.round(d.diff),
        changePct:   parseFloat(d.rate.toFixed(2)),
        volume:      d.quant,
        tradeAmount: Math.round(d.now) * d.quant, // price × 거래량 (원)
      });
    }

    const topGainers: TopGainerRow[] = [...valid]
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 20)
      .map((r, i) => ({ rank: i + 1, ...r }));

    const topLosers: TopGainerRow[] = [...valid]
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, 20)
      .map((r, i) => ({ rank: i + 1, ...r }));

    const topByAmount: TopGainerRow[] = [...valid]
      .sort((a, b) => b.tradeAmount - a.tradeAmount)
      .slice(0, 20)
      .map((r, i) => ({ rank: i + 1, ...r }));

    const payload = { market, topGainers, topLosers, topByAmount, timestamp: new Date().toISOString() };
    serverCache[market] = { data: payload, ts: Date.now() };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, no-cache", "X-Cache": "MISS" },
    });
  } catch {
    return NextResponse.json({ error: "데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
