import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface RankItem {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePct: number;
  netBuyAmount: number; // 억원 (양수=순매수, 음수=순매도)
  netBuyQty: number;    // 천주
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Naver Finance 투자자별 순매수 TOP 스크래핑
 * URL: https://finance.naver.com/sise/sise_deal_rank_iframe.naver
 *      ?sosok=01&investor_gubun=9000&type=buy
 *
 * investor_gubun 확인된 매핑:
 *   9000 = 외국인 (foreign)
 *   1000 = 기관합계 (institutional)
 *   8000 = 개인 (individual)
 *
 * type: buy=순매수, sell=순매도
 * 인코딩: EUC-KR → ArrayBuffer + TextDecoder
 * 단위: 수량=천주, 금액=백만원
 */
type Gubun = "9000" | "1000" | "8000";

async function fetchRankPage(
  gubun: Gubun,
  type: "buy" | "sell"
): Promise<RankItem[]> {
  const url =
    `https://finance.naver.com/sise/sise_deal_rank_iframe.naver` +
    `?sosok=01&investor_gubun=${gubun}&type=${type}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "Referer": "https://finance.naver.com/sise/sise_deal_rank.naver",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Naver sise_deal_rank HTTP ${res.status}`);

  // EUC-KR 디코딩
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("euc-kr").decode(buf);

  const items: RankItem[] = [];

  // <tr> 행 파싱 — code= 링크가 있는 행만 처리
  // 이 페이지는 2일치 데이터를 나란히 표시하므로 첫 번째 날(최신일) 20개만 수집
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];

    // 종목코드 확인
    const codeM = /code=(\d{6})/.exec(row);
    if (!codeM) continue;
    const code = codeM[1];

    // td 텍스트 추출 (HTML 태그·엔티티 제거)
    const tds: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdM: RegExpExecArray | null;
    while ((tdM = tdRe.exec(row)) !== null) {
      const clean = tdM[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim();
      tds.push(clean);
    }

    // 최소 3개 td: [0]종목명 [1]수량(천주) [2]금액(백만원) ...
    if (tds.length < 3) continue;

    const name = tds[0].trim();
    if (!name || name.length < 2) continue;

    const parseNum = (s: string): number => {
      const n = parseInt(s.replace(/[,\s]/g, ""), 10);
      return isNaN(n) ? 0 : n;
    };

    const qty    = parseNum(tds[1]);  // 수량 (천주)
    const amount = parseNum(tds[2]);  // 금액 (백만원)

    if (amount === 0 && qty === 0) continue;

    const sign = type === "sell" ? -1 : 1;

    items.push({
      rank:          items.length + 1,
      code,
      name,
      price:         0,
      changePct:     0,
      netBuyAmount:  sign * Math.round(amount / 100), // 백만원 → 억원
      netBuyQty:     sign * qty,
    });

    // 1페이지 = 최신일 TOP 20
    if (items.length >= 20) break;
  }

  return items.map((item, i) => ({ ...item, rank: i + 1 }));
}

// ── 모듈 캐시 (2분) ──────────────────────────────────────────────────────────
interface CacheEntry {
  data: {
    buy:  { foreign: RankItem[]; institution: RankItem[]; individual: RankItem[] };
    sell: { foreign: RankItem[]; institution: RankItem[]; individual: RankItem[] };
    dataDateLabel: string;
  };
  ts: number;
}
let cache: CacheEntry | null = null;
const CACHE_TTL = 2 * 60 * 1000;

export async function GET() {
  // 캐시 히트
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, cached: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    // 외국인(9000)·기관(1000)·개인(8000) 순매수/순매도 병렬 수집
    const [frgnBuy, frgnSell, instBuy, instSell, indivBuy, indivSell] =
      await Promise.all([
        fetchRankPage("9000", "buy"),
        fetchRankPage("9000", "sell"),
        fetchRankPage("1000", "buy"),
        fetchRankPage("1000", "sell"),
        fetchRankPage("8000", "buy"),
        fetchRankPage("8000", "sell"),
      ]);

    const kst = new Date(Date.now() + 9 * 3_600_000);
    const hh  = String(kst.getUTCHours()).padStart(2, "0");
    const mm  = String(kst.getUTCMinutes()).padStart(2, "0");
    const dataDateLabel = `오늘 ${hh}:${mm} 기준`;

    const total = frgnBuy.length + instBuy.length + indivBuy.length;
    if (total === 0) {
      return NextResponse.json(
        { error: "데이터 파싱 실패 (0건)" },
        { status: 500 }
      );
    }

    const payload = {
      buy:  { foreign: frgnBuy,  institution: instBuy,  individual: indivBuy  },
      sell: { foreign: frgnSell, institution: instSell, individual: indivSell },
      dataDateLabel,
    };
    cache = { data: payload, ts: Date.now() };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("🚨 [investor-ranking]:", String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
