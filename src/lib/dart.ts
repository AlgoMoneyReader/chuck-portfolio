import { unstable_cache } from "next/cache";
import { unzipFirst } from "@/lib/zip";

// DART 고유번호 목록(corpCode.xml)에서 상장사만 종목코드 → 고유번호로 줄여 6시간 공유 캐시
export const dartCorpMap = unstable_cache(async (): Promise<Record<string, string>> => {
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

export async function dartGet(path: string, params: Record<string, string>) {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error("DART_API_KEY 미설정");
  const res = await fetch(`https://opendart.fss.or.kr/api/${path}?${new URLSearchParams({ crtfc_key: key, ...params })}`,
    { signal: AbortSignal.timeout(10000), cache: "no-store" });
  return res.json();
}
