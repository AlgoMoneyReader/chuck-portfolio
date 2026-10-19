import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface FlowItem {
  type: "foreign" | "institution" | "individual";
  label: string;
  netBuy: number;
  buy: number;
  sell: number;
}

function parseKoreanNum(s: string): number {
  const clean = s.replace(/[,\s\+]/g, "");
  const n = parseInt(clean, 10);
  return isNaN(n) ? 0 : n;
}

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Referer": "https://m.stock.naver.com/",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

// Attempt 1: Naver mobile investorGroup API
async function fetchNaverMobileFlow(market: string): Promise<FlowItem[]> {
  const code = market === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const url = `https://m.stock.naver.com/api/index/${code}/investorGroup`;

  const res = await fetch(url, { headers: COMMON_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`mobile API HTTP ${res.status}`);
  const json = await res.json();

  // Expected: { investorGroup: [{ investorType: "INDIVIDUAL", netBuy: "1,234", ... }, ...] }
  const groups: { investorType: string; netBuy: string; buy?: string; sell?: string }[] =
    json?.investorGroup ?? json?.groups ?? [];

  if (!groups.length) throw new Error("empty investorGroup");

  const TYPE_MAP: Record<string, { type: FlowItem["type"]; label: string }> = {
    INDIVIDUAL:      { type: "individual",  label: "개인" },
    FOREIGN_RETAIL:  { type: "foreign",     label: "외국인" },
    FOREIGN:         { type: "foreign",     label: "외국인" },
    INSTITUTION:     { type: "institution", label: "기관" },
    INSTITUTION_SUM: { type: "institution", label: "기관" },
  };

  const result: FlowItem[] = [];
  const seen = new Set<string>();

  for (const g of groups) {
    const mapped = TYPE_MAP[g.investorType];
    if (!mapped || seen.has(mapped.type)) continue;
    seen.add(mapped.type);
    result.push({
      ...mapped,
      netBuy: parseKoreanNum(g.netBuy ?? "0"),
      buy:    parseKoreanNum(g.buy   ?? "0"),
      sell:   parseKoreanNum(g.sell  ?? "0"),
    });
  }

  if (!result.length) throw new Error("no recognized investor types");

  // Ensure order: foreign, institution, individual
  const ORDER: FlowItem["type"][] = ["foreign", "institution", "individual"];
  return ORDER.map(t => result.find(r => r.type === t)).filter(Boolean) as FlowItem[];
}

// Attempt 2: Naver mobile index investor API (alternate endpoint)
async function fetchNaverMobileFlow2(market: string): Promise<FlowItem[]> {
  const code = market === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const url = `https://m.stock.naver.com/api/index/${code}/investor`;

  const res = await fetch(url, { headers: COMMON_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`mobile investor HTTP ${res.status}`);
  const json = await res.json();

  // May return array directly or nested
  const items: { type?: string; investorType?: string; netBuy?: string | number }[] =
    Array.isArray(json) ? json : (json?.investors ?? json?.data ?? []);

  if (!items.length) throw new Error("empty investor response");

  const TYPE_MAP: Record<string, { type: FlowItem["type"]; label: string }> = {
    INDIVIDUAL:  { type: "individual",  label: "개인" },
    FOREIGN:     { type: "foreign",     label: "외국인" },
    INSTITUTION: { type: "institution", label: "기관" },
    individual:  { type: "individual",  label: "개인" },
    foreign:     { type: "foreign",     label: "외국인" },
    institution: { type: "institution", label: "기관" },
  };

  const result: FlowItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.investorType ?? item.type ?? "";
    const mapped = TYPE_MAP[key];
    if (!mapped || seen.has(mapped.type)) continue;
    seen.add(mapped.type);
    const nb = typeof item.netBuy === "number" ? item.netBuy : parseKoreanNum(String(item.netBuy ?? "0"));
    result.push({ ...mapped, netBuy: nb, buy: 0, sell: 0 });
  }

  if (!result.length) throw new Error("no recognized types in investor response");

  const ORDER: FlowItem["type"][] = ["foreign", "institution", "individual"];
  return ORDER.map(t => result.find(r => r.type === t)).filter(Boolean) as FlowItem[];
}

// Attempt 3: Fallback — parse Naver Finance HTML table (EUC-KR 디코딩)
// investor-ranking과 동일 방식: <tr> 전체 스캔, tbody 없어도 동작
async function fetchNaverHTMLFlow(market: string): Promise<FlowItem[]> {
  const sosok = market === "KOSDAQ" ? 1 : 0;
  const url = `https://finance.naver.com/sise/siseInvestorDealTrend.naver?sosok=${sosok}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": "https://finance.naver.com/",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Naver HTML HTTP ${res.status}`);

  // EUC-KR 디코딩 (investor-ranking과 동일)
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("euc-kr").decode(buf);

  // <tr> 전체 스캔 — tbody 유무에 관계없이 동작 (investor-ranking 방식)
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const tds: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdM: RegExpExecArray | null;
    while ((tdM = tdRe.exec(row)) !== null) {
      tds.push(
        tdM[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim()
      );
    }

    if (tds.length < 4) continue;

    // 날짜 패턴: YYYY.MM.DD / YY.MM.DD / MM.DD
    const isDateRow =
      /^\d{4}\.\d{2}\.\d{2}$/.test(tds[0]) ||
      /^\d{2}\.\d{2}\.\d{2}$/.test(tds[0]) ||
      /^\d{2}\.\d{2}$/.test(tds[0]);

    if (!isDateRow) continue;

    // Column order: 날짜(0), 개인(1), 외국인(2), 기관합계(3)
    const individual  = parseKoreanNum(tds[1] ?? "0");
    const foreign     = parseKoreanNum(tds[2] ?? "0");
    const institution = parseKoreanNum(tds[3] ?? "0");

    if (Math.abs(individual) + Math.abs(foreign) + Math.abs(institution) === 0) {
      continue; // 빈 행 스킵, 다음 날짜 행 탐색
    }

    return [
      { type: "foreign",     label: "외국인", netBuy: foreign,     buy: 0, sell: 0 },
      { type: "institution", label: "기관",   netBuy: institution, buy: 0, sell: 0 },
      { type: "individual",  label: "개인",   netBuy: individual,  buy: 0, sell: 0 },
    ];
  }

  throw new Error("no data row found in HTML");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";

  const attempts = [fetchNaverMobileFlow, fetchNaverMobileFlow2, fetchNaverHTMLFlow];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const flow = await attempt(market);
      if (flow.length) {
        return NextResponse.json({ market, flow, timestamp: new Date().toISOString() });
      }
    } catch (e) {
      errors.push(`${attempt.name}: ${String(e)}`);
    }
  }

  return NextResponse.json(
    { error: "투자자 동향 데이터를 불러올 수 없습니다", debug: errors },
    { status: 500 }
  );
}
