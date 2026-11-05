import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * 미국 종목 공시 — SEC EDGAR 최근 제출 서류 (최근 6개월, 최대 40건)
 * 티커 → CIK 는 SEC company_tickers.json (하루 캐시)
 */
const UA = { "User-Agent": "Alliknam Market Radar (alliknam.vercel.app)", Accept: "application/json" };

const tickerMap = unstable_cache(async (): Promise<Record<string, number>> => {
  const r = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`sec tickers ${r.status}`);
  const j = await r.json() as Record<string, { cik_str: number; ticker: string }>;
  const m: Record<string, number> = {};
  for (const x of Object.values(j)) m[x.ticker.toUpperCase()] = x.cik_str;
  return m;
}, ["sec-tickers-v1"], { revalidate: 86400 });

const FORM_KO: Record<string, string> = {
  "10-K": "연간보고서", "10-Q": "분기보고서", "8-K": "수시공시(주요 사항)", "6-K": "수시공시(해외기업)", "20-F": "연간보고서(해외기업)",
  "4": "내부자 지분 변동", "3": "내부자 최초 보유 신고", "144": "내부자 매도 예정", "S-1": "증권 신고서", "S-3": "증권 신고서(일괄)",
  "DEF 14A": "주주총회 위임장", "SC 13G": "5% 이상 지분 보유", "SC 13G/A": "5% 이상 지분 보유(변경)", "SC 13D": "5% 이상 지분(경영참여)",
  "13F-HR": "기관 보유 현황", "424B2": "증권 발행 설명서", "11-K": "임직원 저축제도 보고",
};

const filings = unstable_cache(async (sym: string) => {
  const cik = (await tickerMap())[sym];
  if (!cik) return { items: [], error: "SEC 등록 종목을 찾지 못했습니다" };
  const pad = String(cik).padStart(10, "0");
  const r = await fetch(`https://data.sec.gov/submissions/CIK${pad}.json`, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return { items: [], error: `SEC ${r.status}` };
  const j = await r.json() as { name?: string; filings?: { recent?: Record<string, string[]> } };
  const rc = j.filings?.recent ?? {};
  const since = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
  const items: { report: string; url: string; filer: string; date: string }[] = [];
  (rc.form ?? []).forEach((form, i) => {
    const date = rc.filingDate?.[i] ?? "";
    if (date < since || items.length >= 40) return;
    const acc = (rc.accessionNumber?.[i] ?? "").replace(/-/g, "");
    const doc = rc.primaryDocument?.[i] ?? "";
    const desc = rc.primaryDocDescription?.[i] ?? "";
    items.push({
      report: `${form}${FORM_KO[form] ? ` · ${FORM_KO[form]}` : ""}${desc && desc.toUpperCase() !== form ? ` — ${desc}` : ""}`,
      url: acc && doc ? `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${doc}` : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${pad}`,
      filer: j.name ?? sym,
      date: date.replace(/-/g, "."),
    });
  });
  return { items };
}, ["sec-filings-v1"], { revalidate: 1800 });

export async function GET(request: Request) {
  const sym = (new URL(request.url).searchParams.get("ticker") ?? "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!sym) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json(await filings(sym.replace(".", "-")));
  } catch (e) {
    return NextResponse.json({ items: [], error: `공시를 불러오지 못했습니다 (${String(e).slice(0, 60)})` });
  }
}
