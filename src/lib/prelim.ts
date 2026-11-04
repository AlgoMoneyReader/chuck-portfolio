import { unzipFirst } from "@/lib/zip";

// 잠정실적(공정공시) 원문 파싱: '당해실적' 행의 [당기, 전기, 전기대비%, 전년동기, 전년동기대비%] → 억원
const UNIT: Record<string, number> = { 조원: 1e4, 억원: 1, 백만원: 0.01, 천원: 1e-5, 원: 1e-8 };

// "1,234" "-12.3" "△1,234" "(1,234)" → 숫자, "-" 나 빈 칸 → null
export function cellNum(t: string): number | null {
  const v = t.trim();
  if (!v || /^[-–—]$/.test(v)) return null;
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return null;
  return /^[-△]/.test(v) || /^\(.*\)$/.test(v) ? -n : n;
}

export interface PrelimResult { sales: number | null; op: number | null; net: number | null; salesYoY: number | null; opYoY: number | null; netYoY: number | null }

export function parsePrelimXml(xml: string): PrelimResult | null {
  const unitName = /단위\s*[:：]?\s*(조원|억원|백만원|천원|원)/.exec(xml.replace(/<[^>]+>/g, " "))?.[1] ?? "억원";
  const f = UNIT[unitName];
  const rows = Array.from(xml.matchAll(/<TR[^>]*>([\s\S]*?)<\/TR>/gi)).map(m =>
    Array.from(m[1].matchAll(/<(TD|TE|TU|TH)[^>]*>([\s\S]*?)<\/\1>/gi)).map(c => c[2].replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim()));
  // 계정 행(첫 칸이 계정 이름)과 '당해실적' 칸이 같은 행이거나 바로 다음 행에 온다
  const pick = (re: RegExp) => {
    let pending = false;
    for (const cells of rows) {
      const label = (cells[0] ?? "").replace(/\s/g, "");
      const isAccount = label && !/당해|누계|구분|단위|^\(/.test(label);
      if (isAccount) pending = re.test(label);
      const i = cells.findIndex(c => /당해실적/.test(c));
      if (pending && i >= 0) {
        const nums = cells.slice(i + 1).map(cellNum);
        return { cur: nums[0] ?? null, prevYear: nums[3] ?? null, yoy: nums[4] ?? null };
      }
    }
    return null;
  };
  const sales = pick(/^(매출액|영업수익|수익\(매출액\))/), op = pick(/^영업이익/), net = pick(/^당기순이익/);
  if (!sales && !op) return null;
  const toE = (v: number | null | undefined) => (v == null ? null : Math.round(v * f));
  const yy = (x: typeof sales) => (x?.yoy != null ? x.yoy : x?.cur != null && x.prevYear ? parseFloat((((x.cur - x.prevYear) / Math.abs(x.prevYear)) * 100).toFixed(1)) : null);
  return { sales: toE(sales?.cur), op: toE(op?.cur), net: toE(net?.cur), salesYoY: yy(sales), opYoY: yy(op), netYoY: yy(net) };
}

export async function fetchPrelim(rceptNo: string, timeoutMs = 12000): Promise<PrelimResult | null> {
  const key = process.env.DART_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://opendart.fss.or.kr/api/document.xml?crtfc_key=${key}&rcept_no=${rceptNo}`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const xml = unzipFirst(Buffer.from(await res.arrayBuffer())).toString("utf-8");
  return parsePrelimXml(xml);
}
