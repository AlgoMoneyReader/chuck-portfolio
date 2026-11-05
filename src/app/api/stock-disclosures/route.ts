import { NextResponse } from "next/server";
import { dartCorpMap as corpMap } from "@/lib/dart";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 60;

function ymd(offsetDays: number): string {
  return new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
}

// DART 가 느리거나 실패할 때: 네이버 증권 종목 공시 목록(DART 공시를 그대로 옮긴 목록)
async function naverNotices(code: string) {
  const res = await fetch(`https://finance.naver.com/item/news_notice.naver?code=${code}&page=1`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: `https://finance.naver.com/item/main.naver?code=${code}` },
    signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  if (!res.ok) throw new Error(`naver HTTP ${res.status}`);
  const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer());
  const clean = (t: string) => t.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)).flatMap(m => {
    const a = /href="([^"]*news_notice_read[^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(m[1]);
    if (!a) return [];
    const date = /class="date"[^>]*>([\s\S]*?)<\/td>/.exec(m[1])?.[1];
    const href = a[1].replace(/&amp;/g, "&");
    return [{ report: clean(a[2]), filer: "", date: clean(date ?? "").slice(0, 10), url: href.startsWith("http") ? href : `https://finance.naver.com${href}` }];
  }).slice(0, 30);
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const key = process.env.DART_API_KEY;
  if (!key) return NextResponse.json({ items: [], error: "DART_API_KEY 미설정" });
  if (!/^[0-9][0-9A-Z]{5}$/.test(code)) return NextResponse.json({ items: [], error: "종목코드 6자리가 필요합니다" });

  try {
    const corp = (await corpMap())[code];
    if (!corp) return NextResponse.json({ items: [], error: "DART에 등록된 상장사가 아닙니다" });
    const qs = new URLSearchParams({ crtfc_key: key, corp_code: corp, bgn_de: ymd(-180), end_de: ymd(0), page_count: "30" });
    const res = await fetch(`https://opendart.fss.or.kr/api/list.json?${qs}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const d = await res.json();
    if (d.status === "013") return NextResponse.json({ items: [] });
    if (d.status !== "000") throw new Error(`DART ${d.status} ${d.message ?? ""}`);
    const items = (d.list ?? []).map((r: Record<string, string>) => ({
      report: r.report_nm.replace(/\s+/g, " ").trim(),
      filer: r.flr_nm,
      date: `${r.rcept_dt.slice(0, 4)}.${r.rcept_dt.slice(4, 6)}.${r.rcept_dt.slice(6, 8)}`,
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcept_no}`,
    }));
    return NextResponse.json({ items });
  } catch (e) {
    try {
      const items = await naverNotices(code);
      if (items.length) return NextResponse.json({ items, source: "네이버 증권 공시 (DART 지연)" });
    } catch { /* 아래 오류 반환 */ }
    return NextResponse.json({ items: [], error: `공시를 불러오지 못했습니다 (${String(e).slice(0, 80)})` });
  }
}
