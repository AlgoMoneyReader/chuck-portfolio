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

// Attempt 3: Fallback — parse Naver Finance HTML table
async function fetchNaverHTMLFlow(market: string): Promise<FlowItem[]> {
  const sosok = market === "KOSDAQ" ? 1 : 0;
  const url = `https://finance.naver.com/sise/siseInvestorDealTrend.naver?sosok=${sosok}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": "https://finance.naver.com/sise/investorDealTrendDay.naver",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Naver HTML HTTP ${res.status}`);
  const html = await res.text();

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) throw new Error("tbody not found");

  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let cells: string[] = [];
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trPattern.exec(tbodyMatch[1])) !== null) {
    const innerHtml = trMatch[1];
    const localTds: string[] = [];
    const localTdPat = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = localTdPat.exec(innerHtml)) !== null) {
      localTds.push(tdMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    if (localTds.length >= 4 && /\d{4}\.\d{2}\.\d{2}/.test(localTds[0])) {
      cells = localTds;
      break;
    }
  }

  if (!cells.length) throw new Error("no data row found in HTML");

  // Column order: date(0) individual(1) foreign(2) institution(3) ...
  const individual  = parseKoreanNum(cells[1] ?? "0");
  const foreign     = parseKoreanNum(cells[2] ?? "0");
  const institution = parseKoreanNum(cells[3] ?? "0");

  return [
    { type: "foreign",     label: "외국인", netBuy: foreign,     buy: 0, sell: 0 },
    { type: "institution", label: "기관",   netBuy: institution, buy: 0, sell: 0 },
    { type: "individual",  label: "개인",   netBuy: individual,  buy: 0, sell: 0 },
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";

  const attempts = [fetchNaverMobileFlow, fetchNaverMobileFlow2, fetchNaverHTMLFlow];

  for (const attempt of attempts) {
    try {
      const flow = await attempt(market);
      if (flow.length) {
        return NextResponse.json({ market, flow, timestamp: new Date().toISOString() });
      }
    } catch {
      // try next
    }
  }

  return NextResponse.json(
    { error: "투자자 동향 데이터를 불러올 수 없습니다" },
    { status: 500 }
  );
}
