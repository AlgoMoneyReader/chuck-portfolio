import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface FlowItem {
  type: "foreign" | "institution" | "individual";
  label: string;
  netBuy: number;
  buy: number;
  sell: number;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function parseNum(s: string): number {
  const n = parseInt(String(s ?? "").replace(/[,\s+]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// investor-ranking과 동일한 방식 — sise_deal_rank_iframe.naver (Vercel에서 작동 확인)
type Gubun = "9000" | "1000" | "8000";

async function fetchRankAmounts(
  sosok: string,
  gubun: Gubun,
  type: "buy" | "sell"
): Promise<number> {
  const url =
    `https://finance.naver.com/sise/sise_deal_rank_iframe.naver` +
    `?sosok=${sosok}&investor_gubun=${gubun}&type=${type}`;

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
  if (!res.ok) throw new Error(`rank HTTP ${res.status}`);

  const buf = await res.arrayBuffer();
  const html = new TextDecoder("euc-kr").decode(buf);

  let total = 0;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    if (!/code=\d{6}/.test(row)) continue;

    const tds: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdM: RegExpExecArray | null;
    while ((tdM = tdRe.exec(row)) !== null) {
      tds.push(tdM[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
    }
    if (tds.length < 3) continue;

    // tds[2] = 금액(백만원)
    const amount = parseNum(tds[2]);
    if (amount > 0) total += Math.round(amount / 100); // 백만원 → 억원
    if (tds.length >= 3 && total > 0 && tds.length > 20) break; // 충분히 수집
  }

  return type === "sell" ? -total : total;
}

// sosok: "01"=KOSPI, "02"=KOSDAQ  (sise_deal_rank_iframe 기준)
async function fetchFlowFromRanking(market: string): Promise<FlowItem[]> {
  const sosok = market === "KOSDAQ" ? "02" : "01";

  const [frgnBuy, frgnSell, instBuy, instSell, indivBuy, indivSell] =
    await Promise.all([
      fetchRankAmounts(sosok, "9000", "buy"),
      fetchRankAmounts(sosok, "9000", "sell"),
      fetchRankAmounts(sosok, "1000", "buy"),
      fetchRankAmounts(sosok, "1000", "sell"),
      fetchRankAmounts(sosok, "8000", "buy"),
      fetchRankAmounts(sosok, "8000", "sell"),
    ]);

  const foreign     = frgnBuy  + frgnSell;
  const institution = instBuy  + instSell;
  const individual  = indivBuy + indivSell;

  if (Math.abs(foreign) + Math.abs(institution) + Math.abs(individual) === 0) {
    throw new Error("all zero from ranking");
  }

  return [
    { type: "foreign",     label: "외국인", netBuy: foreign,     buy: frgnBuy,  sell: frgnSell  },
    { type: "institution", label: "기관",   netBuy: institution, buy: instBuy,  sell: instSell  },
    { type: "individual",  label: "개인",   netBuy: individual,  buy: indivBuy, sell: indivSell },
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";

  try {
    const flow = await fetchFlowFromRanking(market);
    return NextResponse.json({ market, flow, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: "투자자 동향 데이터를 불러올 수 없습니다", debug: String(e) },
      { status: 500 }
    );
  }
}
