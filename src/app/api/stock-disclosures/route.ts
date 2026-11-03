import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { unzipFirst } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

// DART 고유번호 목록(corpCode.xml)에서 상장사만 종목코드 → 고유번호로 줄여 6시간 공유 캐시
const corpMap = unstable_cache(async (): Promise<Record<string, string>> => {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error("DART_API_KEY 미설정");
  const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`corpCode HTTP ${res.status}`);
  const xml = unzipFirst(Buffer.from(await res.arrayBuffer())).toString("utf-8");
  const map: Record<string, string> = {};
  for (const m of Array.from(xml.matchAll(/<list>([\s\S]*?)<\/list>/g))) {
    const corp = /<corp_code>(\d{8})<\/corp_code>/.exec(m[1])?.[1];
    const stock = /<stock_code>\s*(\d{6})\s*<\/stock_code>/.exec(m[1])?.[1];
    if (corp && stock) map[stock] = corp;
  }
  if (Object.keys(map).length < 1000) throw new Error("corpCode 파싱 실패");
  return map;
}, ["dart-corp-map-v1"], { revalidate: 6 * 3600 });

function ymd(offsetDays: number): string {
  return new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const key = process.env.DART_API_KEY;
  if (!key) return NextResponse.json({ items: [], error: "DART_API_KEY 미설정" });
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ items: [], error: "종목코드 6자리가 필요합니다" });

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
    return NextResponse.json({ items: [], error: String(e) });
  }
}
