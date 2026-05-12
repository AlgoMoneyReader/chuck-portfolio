import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── 서버사이드 캐시 (Vercel warm instance 내 공유 — YF rate-limit 방어) ─────
interface CacheEntry {
  data: { market: string; topGainers: TopGainerRow[]; timestamp: string };
  ts: number;
}
const serverCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 15_000; // 15초: 클라이언트 10초 폴링에도 YF 호출은 최대 15초 1회

// ── 종목명 매핑 ───────────────────────────────────────────────────────────────
const KR_NAMES: Record<string, string> = {
  "005930.KS": "삼성전자",      "000660.KS": "SK하이닉스",    "005380.KS": "현대차",
  "035420.KS": "NAVER",         "051910.KS": "LG화학",         "207940.KS": "삼성바이오로직스",
  "005490.KS": "POSCO홀딩스",   "000270.KS": "기아",           "006400.KS": "삼성SDI",
  "068270.KS": "셀트리온",      "096770.KS": "SK이노베이션",   "035720.KS": "카카오",
  "034730.KS": "SK스퀘어",      "003550.KS": "LG",             "012330.KS": "현대모비스",
  "009150.KS": "삼성전기",      "042700.KS": "한미반도체",     "055550.KS": "신한지주",
  "105560.KS": "KB금융",        "086790.KS": "하나금융지주",   "032830.KS": "삼성생명",
  "066570.KS": "LG전자",        "028260.KS": "삼성물산",       "000810.KS": "삼성화재",
  "003600.KS": "SK",            "011200.KS": "HMM",            "010130.KS": "고려아연",
  "018260.KS": "삼성SDS",       "003490.KS": "대한항공",       "011070.KS": "LG이노텍",
  "078930.KS": "GS",            "033780.KS": "KT&G",           "010950.KS": "S-Oil",
  "036570.KS": "엔씨소프트",    "090430.KS": "아모레퍼시픽",   "024110.KS": "기업은행",
  "097950.KS": "CJ제일제당",    "019170.KS": "신세계",         "047050.KS": "포스코인터내셔널",
  "161390.KS": "한국타이어",    "316140.KS": "우리금융지주",   "032640.KS": "LG유플러스",
  "030200.KS": "KT",            "017670.KS": "SK텔레콤",       "015760.KS": "한국전력",
  // KOSDAQ
  "247540.KQ": "에코프로비엠",  "086520.KQ": "에코프로",       "196170.KQ": "알테오젠",
  "357780.KQ": "솔브레인",      "263750.KQ": "펄어비스",       "145020.KQ": "휴젤",
  "214150.KQ": "클래시스",      "041510.KQ": "SM엔터",         "035900.KQ": "JYP엔터",
  "122870.KQ": "와이지엔터",    "091990.KQ": "셀트리온헬스케어","005290.KQ": "동진쎄미켐",
  "059270.KQ": "해성디에스",    "112040.KQ": "위메이드",       "220100.KQ": "퓨처켐",
  "039030.KQ": "이오테크닉스",  "068760.KQ": "셀트리온제약",   "293490.KQ": "카카오게임즈",
  "067310.KQ": "하나마이크론",  "036810.KQ": "에프에스티",     "183300.KQ": "코미팜",
  "048260.KQ": "오스템임플란트","376300.KQ": "디어유",
};

const KOSPI_SYMBOLS = [
  "005930.KS","000660.KS","005380.KS","035420.KS","051910.KS",
  "207940.KS","005490.KS","000270.KS","006400.KS","068270.KS",
  "096770.KS","035720.KS","034730.KS","003550.KS","012330.KS",
  "009150.KS","042700.KS","055550.KS","105560.KS","086790.KS",
  "032830.KS","066570.KS","028260.KS","000810.KS","003600.KS",
  "011200.KS","010130.KS","018260.KS","003490.KS","011070.KS",
  "078930.KS","033780.KS","010950.KS","036570.KS","090430.KS",
  "024110.KS","097950.KS","019170.KS","047050.KS","161390.KS",
  "316140.KS","032640.KS","030200.KS","017670.KS","015760.KS",
];
const KOSDAQ_SYMBOLS = [
  "247540.KQ","086520.KQ","196170.KQ","357780.KQ","263750.KQ",
  "145020.KQ","214150.KQ","041510.KQ","035900.KQ","122870.KQ",
  "091990.KQ","005290.KQ","059270.KQ","112040.KQ","220100.KQ",
  "039030.KQ","068760.KQ","293490.KQ","067310.KQ","036810.KQ",
  "183300.KQ","048260.KQ","376300.KQ",
];

interface TopGainerRow {
  rank: number; code: string; symbol: string;
  name: string; price: number; change: number;
  changePct: number; volume: number;
}

async function fetchOneChart(symbol: string): Promise<Omit<TopGainerRow, "rank"> | null> {
  try {
    // 타임스탬프로 Yahoo Finance / CDN 캐시 완전 무효화
    const bust = Date.now();
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=1d&includePrePost=false&_=${bust}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price: number = meta.regularMarketPrice;
    const prev: number  = meta.chartPreviousClose ?? meta.previousClose;
    if (!price || !prev) return null;

    // ── 거래량 이중 폴백 (당일 누적 거래량, acml_vol 상당) ─────────────────
    // 1순위: meta.regularMarketVolume (실시간 누적)
    // 2순위: indicators.quote[0].volume 배열 마지막 유효값 (장 초반 meta=0일 때)
    const metaVol = (meta.regularMarketVolume as number | undefined) ?? 0;
    const indicatorVolumes: (number | null)[] =
      result.indicators?.quote?.[0]?.volume ?? [];
    const lastBarVol =
      [...indicatorVolumes].reverse().find(v => v !== null && v > 0) ?? 0;
    const volume = metaVol > 0 ? metaVol : (lastBarVol as number);

    const change    = price - prev;
    const changePct = (change / prev) * 100;

    return {
      symbol,
      code: symbol.replace(/\.(KS|KQ)$/, ""),
      name: KR_NAMES[symbol] ??
        (meta.longName ?? meta.shortName ?? symbol)
          .replace(/\s*(Co\.?|Ltd\.?|Corp\.?|Inc\.?|Holdings?|Hldgs?)\.?$/i, ""),
      price:     Math.round(price),
      change:    Math.round(change),
      changePct: parseFloat(changePct.toFixed(2)),
      volume,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";

  // 서버사이드 캐시 HIT → 즉시 반환 (YF 호출 생략)
  const cached = serverCache[market];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "no-store, no-cache", "X-Cache": "HIT" },
    });
  }

  try {
    const symbols = market === "KOSDAQ" ? KOSDAQ_SYMBOLS : KOSPI_SYMBOLS;
    const results  = await Promise.all(symbols.map(fetchOneChart));

    const topGainers: TopGainerRow[] = results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 10)
      .map((r, i) => ({ rank: i + 1, ...r }));

    const payload = { market, topGainers, timestamp: new Date().toISOString() };
    serverCache[market] = { data: payload, ts: Date.now() };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, no-cache", "X-Cache": "MISS" },
    });
  } catch {
    return NextResponse.json({ error: "데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
