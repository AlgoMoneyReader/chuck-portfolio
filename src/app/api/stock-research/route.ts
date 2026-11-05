import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

// 네이버 증권 리서치(종목분석 리포트) 목록: 증권사·제목·PDF·날짜
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const listUrl = `https://finance.naver.com/research/company_list.naver?searchType=itemCode&itemCode=${code}`;
  if (!/^[0-9][0-9A-Z]{5}$/.test(code)) return NextResponse.json({ items: [], listUrl });
  try {
    const res = await fetch(listUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: "https://finance.naver.com/research/", "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer());
    const clean = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
    const items = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)).flatMap(m => {
      const row = m[1];
      const read = /href="(company_read\.naver\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
      if (!read) return [];
      const tds = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map(t => t[1]);
      const pdf = /href="(https?:\/\/[^"]+\.pdf)"/.exec(row)?.[1] ?? null;
      return [{
        title: clean(read[2]),
        broker: clean(tds[2] ?? ""),
        date: clean(tds[4] ?? ""),
        url: `https://finance.naver.com/research/${read[1].replace(/&amp;/g, "&")}`,
        pdf,
      }];
    }).slice(0, 8);
    return NextResponse.json({ items, listUrl });
  } catch (e) {
    return NextResponse.json({ items: [], listUrl, error: String(e).slice(0, 120) });
  }
}
