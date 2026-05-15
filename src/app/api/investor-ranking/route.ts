import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface RankItem {
  rank: number;
  code: string;
  name: string;
  price: number;
  changePct: number;
  netBuyAmount: number; // 억원 (양수=순매수, 음수=순매도)
  netBuyQty: number;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Naver Finance 투자자별 종목 순매수 현황 스크래핑
 * URL: https://finance.naver.com/sise/investorStock.naver?sosok=0
 * 외국인(frgn)/기관(orgn)/개인(prsn) 순매수 TOP10 각각 반환
 */
async function fetchNaverInvestorStock(sosok: "0" | "1"): Promise<{
  foreignBuy: RankItem[]; foreignSell: RankItem[];
  instBuy: RankItem[];    instSell: RankItem[];
  indivBuy: RankItem[];   indivSell: RankItem[];
}> {
  const url = `https://finance.naver.com/sise/investorStock.naver?sosok=${sosok}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "Referer": "https://finance.naver.com/sise/",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Naver investorStock HTTP ${res.status}`);
  const html = await res.text();

  // Parse rows from the investor stock table
  // The page has a table with: 종목명 | 현재가 | 등락률 | 외국인순매수 | 기관순매수 | 개인순매수
  const rows: Array<{
    code: string; name: string; price: number; changePct: number;
    frgn: number; orgn: number; prsn: number;
  }> = [];

  // Extract stock links for codes: /item/main.naver?code=XXXXXX
  const rowRe = /<tr[^>]*class="[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];

    // Extract code from link
    const codeM = /code=(\d{6})/.exec(row);
    if (!codeM) continue;
    const code = codeM[1];

    // Extract stock name
    const nameM = /title="([^"]+)"/.exec(row);
    if (!nameM) continue;
    const name = nameM[1].trim();

    // Extract all numbers from td cells
    const tds: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdM: RegExpExecArray | null;
    while ((tdM = tdRe.exec(row)) !== null) {
      tds.push(tdM[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim());
    }
    if (tds.length < 6) continue;

    const parseNum = (s: string) => {
      const clean = s.replace(/[,\+\s]/g, "");
      const n = parseInt(clean, 10);
      return isNaN(n) ? 0 : n;
    };
    const parsePct = (s: string) => {
      const clean = s.replace(/[,%\s]/g, "").replace("▲", "").replace("▼", s.includes("▼") ? "-" : "");
      return parseFloat(clean) || 0;
    };

    const price = parseNum(tds[1] ?? "0");
    const changePct = parsePct(tds[2] ?? "0");
    const frgn = parseNum(tds[3] ?? "0"); // 외국인 순매수 (백만원)
    const orgn = parseNum(tds[4] ?? "0"); // 기관 순매수 (백만원)
    const prsn = parseNum(tds[5] ?? "0"); // 개인 순매수 (백만원)

    if (price > 0) {
      rows.push({ code, name, price, changePct, frgn, orgn, prsn });
    }
  }

  // If we couldn't parse any rows, the HTML structure is different
  // Return empty arrays to trigger graceful error handling
  if (rows.length === 0) {
    return { foreignBuy: [], foreignSell: [], instBuy: [], instSell: [], indivBuy: [], indivSell: [] };
  }

  const toItem = (r: typeof rows[0], amount: number, rank: number): RankItem => ({
    rank, code: r.code, name: r.name, price: r.price, changePct: r.changePct,
    netBuyAmount: Math.round(amount / 100), // 백만원 → 억원
    netBuyQty: 0,
  });

  const sortDesc = (fn: (r: typeof rows[0]) => number) =>
    [...rows].sort((a, b) => fn(b) - fn(a)).slice(0, 10).map((r, i) => toItem(r, fn(r), i + 1));
  const sortAsc = (fn: (r: typeof rows[0]) => number) =>
    [...rows].sort((a, b) => fn(a) - fn(b)).slice(0, 10).map((r, i) => toItem(r, fn(r), i + 1));

  return {
    foreignBuy:  sortDesc(r => r.frgn),
    foreignSell: sortAsc(r => r.frgn),
    instBuy:     sortDesc(r => r.orgn),
    instSell:    sortAsc(r => r.orgn),
    indivBuy:    sortDesc(r => r.prsn),
    indivSell:   sortAsc(r => r.prsn),
  };
}

export async function GET() {
  try {
    const result = await fetchNaverInvestorStock("0"); // KOSPI

    const kst = new Date(Date.now() + 9 * 3_600_000);
    const hh = String(kst.getUTCHours()).padStart(2, "0");
    const mm = String(kst.getUTCMinutes()).padStart(2, "0");
    const dataDateLabel = `오늘 ${hh}:${mm} 기준`;

    // If parsing returned empty (HTML structure changed), return error
    const total = result.foreignBuy.length + result.instBuy.length + result.indivBuy.length;
    if (total === 0) {
      return NextResponse.json({ error: "파싱 실패 — HTML 구조 변경" }, { status: 500 });
    }

    return NextResponse.json(
      {
        buy:  { foreign: result.foreignBuy,  institution: result.instBuy,  individual: result.indivBuy  },
        sell: { foreign: result.foreignSell, institution: result.instSell, individual: result.indivSell },
        dataDateLabel,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("🚨 [investor-ranking]:", String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
