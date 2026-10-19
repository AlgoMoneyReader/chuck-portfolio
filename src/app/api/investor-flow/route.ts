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
  const n = parseInt(String(s).replace(/[,\s]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// investor-ranking.route.ts의 fetchRankPage와 완전히 동일한 로직
async function fetchRankPage(
  sosok: string,
  gubun: "9000" | "1000" | "8000",
  buyOrSell: "buy" | "sell"
): Promise<{ amount: number }[]> {
  const url =
    `https://finance.naver.com/sise/sise_deal_rank_iframe.naver` +
    `?sosok=${sosok}&investor_gubun=${gubun}&type=${buyOrSell}`;

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
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);

  const buf = await res.arrayBuffer();
  const html = new TextDecoder("euc-kr").decode(buf);

  const items: { amount: number }[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    if (!/code=\d{6}/.test(row)) continue;

    const tds: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdM: RegExpExecArray | null;
    while ((tdM = tdRe.exec(row)) !== null) {
      tds.push(
        tdM[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .trim()
      );
    }
    if (tds.length < 3) continue;

    const name = tds[0].trim();
    if (!name || name.length < 2) continue;

    const amount = parseNum(tds[2]); // 금액(백만원) → investor-ranking 동일
    if (amount === 0) continue;

    items.push({ amount });
    if (items.length >= 20) break;
  }

  return items;
}

async function getNetBuy(
  sosok: string,
  gubun: "9000" | "1000" | "8000"
): Promise<number> {
  const [buyItems, sellItems] = await Promise.all([
    fetchRankPage(sosok, gubun, "buy").catch(() => [] as { amount: number }[]),
    fetchRankPage(sosok, gubun, "sell").catch(() => [] as { amount: number }[]),
  ]);

  const buyTotal  = buyItems.reduce((s, r) => s + r.amount, 0);
  const sellTotal = sellItems.reduce((s, r) => s + r.amount, 0);

  // 백만원 → 억원, sell은 음수
  return Math.round((buyTotal - sellTotal) / 100);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";
  const sosok = market === "KOSDAQ" ? "02" : "01";

  try {
    const [foreign, institution, individual] = await Promise.all([
      getNetBuy(sosok, "9000"),
      getNetBuy(sosok, "1000"),
      getNetBuy(sosok, "8000"),
    ]);

    if (Math.abs(foreign) + Math.abs(institution) + Math.abs(individual) === 0) {
      throw new Error(`all zero (sosok=${sosok})`);
    }

    const flow: FlowItem[] = [
      { type: "foreign",     label: "외국인", netBuy: foreign,     buy: 0, sell: 0 },
      { type: "institution", label: "기관",   netBuy: institution, buy: 0, sell: 0 },
      { type: "individual",  label: "개인",   netBuy: individual,  buy: 0, sell: 0 },
    ];

    return NextResponse.json({ market, flow, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: "투자자 동향 데이터를 불러올 수 없습니다", debug: String(e) },
      { status: 500 }
    );
  }
}
