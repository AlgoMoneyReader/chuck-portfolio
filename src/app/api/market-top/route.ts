import { NextResponse } from "next/server";
import { kisGet, num } from "@/lib/kis";
import { krSession } from "@/lib/krSession";
import { nxtQuotes } from "@/lib/nxtPrice";
import { naverRealtime, type Live } from "@/lib/krLive";

export const dynamic = "force-dynamic";

// ── 서버사이드 캐시 ──────────────────────────────────────────────────────────
interface CacheEntry {
  data: object;
  ts: number;
}
const serverCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 4_000; // 4초 (화면은 5초마다 갱신)

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
  nxtPrice?: number | null; nxtPct?: number | null;   // 넥스트레이드 프리·애프터마켓 시세
  capEok?: number;                                     // 시가총액(억원)
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

// ── 네이버 증권 시장 전체 순위: 상승(up)·하락(down)·시가총액(marketValue) — 100위까지 ──
const TOP_N = 100;
const nNum = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(x) ? 0 : x; };
async function naverRank(kind: "up" | "down" | "marketValue", market: string, n: number, suffix: string): Promise<TopGainerRow[] | null> {
  try {
    const out: TopGainerRow[] = [];
    for (let page = 1; out.length < n && page <= Math.ceil(n / 100) + 1; page++) {
      const res = await fetch(`https://m.stock.naver.com/api/stocks/${kind}/${market}?page=${page}&pageSize=100`, {
        headers: { "User-Agent": "Mozilla/5.0", Referer: "https://m.stock.naver.com/" }, signal: AbortSignal.timeout(8000), cache: "no-store",
      });
      if (!res.ok) break;
      const got = ((await res.json()).stocks ?? []) as Record<string, unknown>[];
      if (!got.length) break;
      for (const x of got) {
        if (x.stockEndType && x.stockEndType !== "stock") continue; // ETF·ETN 제외
        const code = String(x.itemCode ?? ""), price = nNum(x.closePrice), pct = nNum(x.fluctuationsRatio);
        if (!/^\w{6}$/.test(code) || !price || out.some(o => o.code === code)) continue;
        const ch = Math.abs(nNum(x.compareToPreviousClosePrice));
        out.push({
          rank: out.length + 1, code, symbol: code + suffix, name: String(x.stockName ?? code),
          price, change: pct < 0 ? -ch : ch, changePct: pct,
          volume: nNum(x.accumulatedTradingVolume), tradeAmount: nNum(x.accumulatedTradingValue) * 1e6, // 백만원 → 원
          capEok: nNum(x.marketValue) || undefined, // 억원
        });
      }
    }
    return out.length ? out.slice(0, n) : null;
  } catch { return null; }
}
const reRank = (rows: TopGainerRow[]) => rows.slice(0, TOP_N).map((r, i) => ({ ...r, rank: i + 1 }));

// ── KIS 시장 전체 순위 (실패하면 null → 고정 목록 계산으로 대체) ─────────────────
type KisRow = Record<string, string>;

function toRow(r: KisRow, i: number, suffix: string): TopGainerRow | null {
  const code = (r.mksc_shrn_iscd ?? r.stck_shrn_iscd ?? "").trim();
  const price = num(r.stck_prpr) ?? 0;
  if (!/^\d{6}$/.test(code) || !price) return null;
  const sign = r.prdy_vrss_sign;
  const diff = Math.abs(num(r.prdy_vrss) ?? 0) * (sign === "4" || sign === "5" ? -1 : 1);
  const vol = num(r.acml_vol) ?? 0;
  return {
    rank: i + 1, code, symbol: code + suffix, name: (r.hts_kor_isnm ?? "").trim(),
    price, change: diff, changePct: num(r.prdy_ctrt) ?? 0, volume: vol,
    tradeAmount: num(r.acml_tr_pbmn) ?? price * vol,
  };
}

async function kisAmountRank(isc: string, suffix: string): Promise<TopGainerRow[] | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/quotations/volume-rank", "FHPST01710000", {
      FID_COND_MRKT_DIV_CODE: "J", FID_COND_SCR_DIV_CODE: "20171", FID_INPUT_ISCD: isc,
      FID_DIV_CLS_CODE: "0", FID_BLNG_CLS_CODE: "3", FID_TRGT_CLS_CODE: "111111111",
      FID_TRGT_EXLS_CLS_CODE: "0000000000", FID_INPUT_PRICE_1: "", FID_INPUT_PRICE_2: "",
      FID_VOL_CNT: "", FID_INPUT_DATE_1: "",
    });
    const rows = ((j.output ?? []) as KisRow[]).map((r, i) => toRow(r, i, suffix)).filter((r): r is TopGainerRow => !!r);
    return rows.length ? rows.sort((a, b) => b.tradeAmount - a.tradeAmount).slice(0, 30).map((r, i) => ({ ...r, rank: i + 1 })) : null;
  } catch { return null; }
}

async function kisFluctuation(isc: string, suffix: string, sort: "0000" | "0001"): Promise<TopGainerRow[] | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/ranking/fluctuation", "FHPST01700000", {
      fid_cond_mrkt_div_code: "J", fid_cond_scr_div_code: "20170", fid_input_iscd: isc,
      fid_rank_sort_cls_code: sort, fid_input_cnt_1: "0", fid_prc_cls_code: "0",
      fid_input_price_1: "", fid_input_price_2: "", fid_vol_cnt: "10000",
      fid_trgt_cls_code: "0", fid_trgt_exls_cls_code: "0", fid_div_cls_code: "0",
      fid_rsfl_rate1: "", fid_rsfl_rate2: "",
    });
    const rows = ((j.output ?? []) as KisRow[]).map((r, i) => toRow(r, i, suffix)).filter((r): r is TopGainerRow => !!r);
    const ok = sort === "0000" ? rows.filter(r => r.changePct > 0) : rows.filter(r => r.changePct < 0);
    if (!ok.length) return null;
    return ok.sort((a, b) => (sort === "0000" ? b.changePct - a.changePct : a.changePct - b.changePct))
      .slice(0, 30).map((r, i) => ({ ...r, rank: i + 1 }));
  } catch { return null; }
}

// 시가총액 순위 (KIS FHPST01740000, 최대 30)
async function kisCapRank(isc: string, suffix: string): Promise<TopGainerRow[] | null> {
  try {
    const j = await kisGet("/uapi/domestic-stock/v1/ranking/market-cap", "FHPST01740000", {
      fid_cond_mrkt_div_code: "J", fid_cond_scr_div_code: "20174", fid_div_cls_code: "0", fid_input_iscd: isc,
      fid_trgt_cls_code: "0", fid_trgt_exls_cls_code: "0", fid_input_price_1: "", fid_input_price_2: "", fid_vol_cnt: "",
    });
    const rows: TopGainerRow[] = [];
    ((j.output ?? []) as KisRow[]).forEach((r, i) => {
      const row = toRow(r, i, suffix);
      if (row) rows.push({ ...row, capEok: num(r.stck_avls) ?? num(r.hts_avls) ?? 0 });
    });
    return rows.length ? rows.slice(0, 30).map((r, i) => ({ ...r, rank: i + 1 })) : null;
  } catch { return null; }
}

const withLive = (live: Record<string, Live>) => (r: TopGainerRow): TopGainerRow => {
  const l = live[r.code];
  if (!l) return r;
  return { ...r, ...l, volume: l.volume || r.volume, tradeAmount: l.tradeAmount || r.tradeAmount, capEok: r.capEok && r.price ? Math.round(r.capEok * (l.price / r.price)) : r.capEok };
};

// 순위 목록(시장 전체 순위 + 대체용 고정 목록) — 20초 보관
const rankCache: Record<string, { at: number; v: Awaited<ReturnType<typeof loadRanks>> }> = {};
async function loadRanks(market: string) {
  const codes = market === "KOSDAQ" ? KOSDAQ_CODES : KOSPI_CODES;
  const mktSuffix = market === "KOSDAQ" ? ".KQ" : ".KS";
  const isc = market === "KOSDAQ" ? "1001" : "0001";
  const [kAmount, kUp0, kDown0, kCap0, nUp, nDown, nCap] = await Promise.all([
    kisAmountRank(isc, mktSuffix),
    kisFluctuation(isc, mktSuffix, "0000"),
    kisFluctuation(isc, mktSuffix, "0001"),
    kisCapRank(isc, mktSuffix),
    naverRank("up", market, TOP_N, mktSuffix),
    naverRank("down", market, TOP_N, mktSuffix),
    naverRank("marketValue", market, 400, mktSuffix),
  ]);
  // 시장 전체 순위를 하나도 못 받았을 때만 고정 목록을 하나씩 조회 (느림)
  const valid: TopGainerRow[] = [];
  if (!(nUp?.length || kUp0?.length) || !(nCap?.length || kCap0?.length)) {
    const dataMap = await fetchAllCodes(codes);
    for (const code of codes) {
      const d = dataMap.get(code);
      if (!d) continue;
      valid.push({ rank: 0, symbol: code + mktSuffix, code, name: KR_NAMES[code] ?? code, price: Math.round(d.now), change: Math.round(d.diff),
        changePct: parseFloat(d.rate.toFixed(2)), volume: d.quant, tradeAmount: Math.round(d.now) * d.quant });
    }
  }
  return { kAmount, kUp0, kDown0, kCap0, nUp, nDown, nCap, valid };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";
  // 정규장 밖 시세(NXT·애프터)를 붙일 목록: 보고 있는 목록만
  const nxList = (searchParams.get("nx") ?? "all") as "gainers" | "losers" | "amount" | "cap" | "all";
  const cacheKey = `${market}:${nxList}`;

  const cached = serverCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "no-store, no-cache", "X-Cache": "HIT" } });
  }

  try {
    const rk = rankCache[market] && Date.now() - rankCache[market].at < 20_000 ? rankCache[market].v : await loadRanks(market);
    rankCache[market] = rankCache[market] && Date.now() - rankCache[market].at < 20_000 ? rankCache[market] : { at: Date.now(), v: rk };
    const { kAmount, kUp0, kDown0, kCap0, nUp, nDown, nCap, valid } = rk;

    const upOnly = (rows: TopGainerRow[]) => rows.filter(r => r.changePct > 0).sort((a, b) => b.changePct - a.changePct);
    const downOnly = (rows: TopGainerRow[]) => rows.filter(r => r.changePct < 0).sort((a, b) => a.changePct - b.changePct);
    const byAmount = (rows: TopGainerRow[]) => [...rows].sort((a, b) => b.tradeAmount - a.tradeAmount);
    const amountPool = new Map<string, TopGainerRow>();
    for (const r of [...(kAmount ?? []), ...(nCap ?? [])]) if (!amountPool.has(r.code)) amountPool.set(r.code, r);

    let gainers: TopGainerRow[] = (nUp?.length ? nUp : kUp0 ?? upOnly(valid)).slice(0, TOP_N);
    let losers: TopGainerRow[] = (nDown?.length ? nDown : kDown0 ?? downOnly(valid)).slice(0, TOP_N);
    let amount: TopGainerRow[] = (amountPool.size ? byAmount(Array.from(amountPool.values())) : byAmount(valid)).slice(0, TOP_N);
    let cap: TopGainerRow[] = (nCap?.length ? nCap : kCap0 ?? []).slice(0, TOP_N);

    // 실시간 시세 덧입히기 (보고 있는 목록, 'all' 이면 네 목록 모두)
    const want = nxList === "all" ? [...gainers, ...losers, ...amount, ...cap] : { gainers, losers, amount, cap }[nxList] ?? gainers;
    const live = await naverRealtime(Array.from(new Set(want.map(r => r.code))));
    const L = withLive(live);
    gainers = reRank(upOnly(gainers.map(L)));
    losers = reRank(downOnly(losers.map(L)));
    amount = reRank(byAmount(amount.map(L)));
    cap = reRank(cap.map(L));

    // ── 정규장 밖(프리·애프터·장 종료): 넥스트레이드 시세를 붙인다 ──
    const sess = krSession();
    let basis = sess.key === "regular" || sess.key === "auction-close" ? "KRX 정규장" : "KRX 직전 정규장 종가 기준";
    const base = cap.length ? cap : valid;
    const allZero = base.length > 0 && base.every(v => v.changePct === 0);
    if (sess.key !== "regular") {
      const pickFor = { gainers, losers, amount, cap, all: [...gainers.slice(0, 20), ...losers.slice(0, 20), ...amount.slice(0, 20), ...cap.slice(0, 20)] }[nxList] ?? gainers;
      const preRows = allZero && (nxList === "gainers" || nxList === "losers" || nxList === "all") ? base : [];
      const codes = Array.from(new Set([...pickFor, ...preRows].map(r => r.code)));
      const nx = await nxtQuotes(codes);
      const withNx = <T extends Omit<TopGainerRow, "rank">>(r: T): T => {
        const q = nx[r.code];
        return q ? { ...r, nxtPrice: q.price, nxtPct: parseFloat(q.pct.toFixed(2)) } : r;
      };
      gainers = gainers.map(withNx); losers = losers.map(withNx); amount = amount.map(withNx); cap = cap.map(withNx);
      // 개장 전엔 KRX 등락률이 0% → 주요 종목을 NXT 등락률로 순위
      if (allZero) {
        const nxRows = base.map(withNx).filter(r => r.nxtPct != null);
        if (nxRows.length) {
          gainers = reRank([...nxRows].filter(r => (r.nxtPct ?? 0) > 0).sort((a, b) => (b.nxtPct ?? 0) - (a.nxtPct ?? 0)));
          losers = reRank([...nxRows].filter(r => (r.nxtPct ?? 0) < 0).sort((a, b) => (a.nxtPct ?? 0) - (b.nxtPct ?? 0)));
          basis = "NXT 시세 기준 (시총 상위 종목, KRX 개장 전)";
        }
      }
    }

    const payload = {
      market, session: sess, basis,
      topGainers: gainers, topLosers: losers, topByAmount: amount, topByCap: cap,
      live: Object.keys(live).length,
      source: { gainers: nUp?.length ? "네이버 시장 전체" : kUp0 ? "KIS 시장 전체" : "주요 종목 목록", losers: nDown?.length ? "네이버 시장 전체" : kDown0 ? "KIS 시장 전체" : "주요 종목 목록", cap: nCap?.length ? "네이버" : "KIS", amount: amountPool.size ? "시장 전체" : "주요 종목 목록" },
      timestamp: new Date().toISOString(),
    };
    serverCache[cacheKey] = { data: payload, ts: Date.now() };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, no-cache", "X-Cache": "MISS" } });
  } catch {
    return NextResponse.json({ error: "데이터를 불러올 수 없습니다" }, { status: 500 });
  }
}
