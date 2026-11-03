import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

// 주가에 영향이 큰 공시 (alliknam collect/dart.py KEYWORD 기준)
const KEYWORD = [
  "잠정)실적", "영업실적", "배당", "자기주식", "공정공시", "유상증자", "무상증자", "합병", "분할",
  "단일판매", "공급계약", "투자판단", "전환사채", "최대주주", "공개매수", "상장폐지", "매매거래정지",
];

interface DartRow {
  corp_name: string; corp_cls: string; stock_code: string;
  report_nm: string; rcept_no: string; rcept_dt: string;
}

let cache: { at: number; body: object } | null = null;
const TTL = 10 * 60 * 1000;

async function listing(key: string, day: string, cls: "Y" | "K"): Promise<DartRow[]> {
  const out: DartRow[] = [];
  for (let page = 1; page <= 3; page++) {
    const qs = new URLSearchParams({ crtfc_key: key, bgn_de: day, end_de: day, corp_cls: cls, page_no: String(page), page_count: "100" });
    const res = await fetch(`https://opendart.fss.or.kr/api/list.json?${qs}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const d = await res.json();
    if (d.status === "013") break;
    if (d.status !== "000") throw new Error(`DART ${d.status} ${d.message ?? ""}`);
    out.push(...(d.list ?? []));
    if (page >= Number(d.total_page ?? 1)) break;
  }
  return out;
}

export async function GET() {
  const key = process.env.DART_API_KEY;
  if (!key) return NextResponse.json({ items: [], error: "DART_API_KEY 미설정" });
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body);

  try {
    // 오늘 공시가 없으면(주말·이른 아침) 최근 영업일까지 거슬러 올라간다
    let rows: DartRow[] = [];
    for (let back = 0; back < 6 && !rows.length; back++) {
      const d = new Date(Date.now() + 9 * 3_600_000 - back * 86_400_000);
      if ([0, 6].includes(d.getUTCDay())) continue;
      const day = d.toISOString().slice(0, 10).replace(/-/g, "");
      const [ks, kq] = await Promise.all([listing(key, day, "Y"), listing(key, day, "K")]);
      rows = [...ks, ...kq];
    }

    const items = rows
      .filter(r => r.stock_code && KEYWORD.some(w => r.report_nm.includes(w)))
      .sort((a, b) => b.rcept_no.localeCompare(a.rcept_no))
      .slice(0, 12)
      .map(r => ({
        corp: r.corp_name,
        code: r.stock_code,
        market: r.corp_cls === "K" ? "KQ" : "KS",
        report: r.report_nm.replace(/\s+/g, " ").trim(),
        date: `${r.rcept_dt.slice(0, 4)}.${r.rcept_dt.slice(4, 6)}.${r.rcept_dt.slice(6, 8)}`,
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcept_no}`,
      }));

    const body = { items, total: rows.length, fetchedAt: new Date().toISOString() };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ items: [], error: String(e) });
  }
}
