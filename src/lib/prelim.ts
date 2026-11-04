import { unzipFirst } from "@/lib/zip";

// 잠정실적(공정공시) 원문 파싱: '당해실적' 행의 [당기, 전기, 전기대비%, 전년동기, 전년동기대비%] → 억원
const UNIT: Record<string, number> = { 조원: 1e4, 억원: 1, 백만원: 0.01, 천원: 1e-5, 원: 1e-8 };

// 칸 원문이 증감률(%)처럼 생겼는지: '%' 가 있거나, 천 단위 쉼표 없이 소수점이 있는 수(12.5, -3.40, △1.2)
const looksPct = (t: string) => /%/.test(t) || /^[\s(]*[-△+]?\d{1,5}\.\d+\)?\s*$/.test(t.trim());

// "1,234" "-12.3" "△1,234" "(1,234)" → 숫자, "-" 나 빈 칸 → null
export function cellNum(t: string): number | null {
  const v = t.trim();
  if (!v || /^[-–—]$/.test(v)) return null;
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return null;
  return /^[-△]/.test(v) || /^\(.*\)$/.test(v) ? -n : n;
}

export interface PrelimResult {
  sales: number | null; op: number | null; net: number | null;
  salesYoY: number | null; opYoY: number | null; netYoY: number | null;
  opTurn?: "흑자전환" | "적자전환" | "적자지속" | null;   // 전년 동기 대비 손익 전환
}

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
        // 칸 순서가 회사마다 달라(증감액 칸 유무 등) 위치로 읽지 않는다.
        // 첫 숫자 = 당기, 이후 '금액처럼 보이는' 숫자(당기와 자릿수가 비슷)를 전기·전년동기 순으로 본다
        const vals = cells.slice(i + 1).map(t => ({ t, n: cellNum(t) })).filter((x): x is { t: string; n: number } => x.n != null);
        const cur = vals[0]?.n ?? null;
        if (cur == null) return null;
        // 금액 칸: 증감률처럼 생기지 않았고 당기와 자릿수가 크게 다르지 않은 것
        const amounts = vals.slice(1)
          .filter(x => !looksPct(x.t) && (Math.abs(cur) < 50 || Math.abs(x.n) >= Math.abs(cur) * 0.02))
          .map(x => x.n);
        // 증감액 칸(당기 − 전기)이 끼어 있으면 빼고, 그다음 금액을 전년동기로 본다
        const prevQ = amounts[0];
        const rest = prevQ == null ? [] : amounts.slice(1).filter(n => Math.abs(n - (cur - prevQ)) > Math.max(1, Math.abs(cur) * 0.001));
        const prevYear = rest[0] ?? null;
        return { cur, prevYear };
      }
    }
    return null;
  };
  const sales = pick(/^(매출액|영업수익|수익\(매출액\))/), op = pick(/^영업이익/), net = pick(/^당기순이익/);
  if (!sales && !op) return null;
  const toE = (v: number | null | undefined) => (v == null ? null : Math.round(v * f));
  // 증감률은 금액으로 직접 계산. 전년이 0 이하(적자)면 % 대신 흑자전환·적자지속 등으로
  const yy = (x: typeof sales) => (x?.cur != null && x.prevYear != null && x.prevYear > 0 ? parseFloat((((x.cur - x.prevYear) / x.prevYear) * 100).toFixed(1)) : null);
  const turn = (x: typeof op): PrelimResult["opTurn"] => {
    if (x?.cur == null || x.prevYear == null) return null;
    if (x.prevYear <= 0 && x.cur > 0) return "흑자전환";
    if (x.prevYear > 0 && x.cur < 0) return "적자전환";
    if (x.prevYear <= 0 && x.cur <= 0) return "적자지속";
    return null;
  };
  return { sales: toE(sales?.cur), op: toE(op?.cur), net: toE(net?.cur), salesYoY: yy(sales), opYoY: turn(op) ? null : yy(op), netYoY: yy(net), opTurn: turn(op) };
}

export async function fetchPrelim(rceptNo: string, timeoutMs = 12000): Promise<PrelimResult | null> {
  const key = process.env.DART_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://opendart.fss.or.kr/api/document.xml?crtfc_key=${key}&rcept_no=${rceptNo}`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const xml = unzipFirst(Buffer.from(await res.arrayBuffer())).toString("utf-8");
  return parsePrelimXml(xml);
}
