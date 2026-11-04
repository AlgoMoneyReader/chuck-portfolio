import { kisGet, num } from "@/lib/kis";

// 미국 종목 시간외 시세 (목록·상세 공용)
// - 프리·애프터마켓: Yahoo 차트 API(includePrePost) — v7/quote 는 인증(crumb) 요구로 비는 경우가 많다
// - 데이마켓(한국 낮 주간거래): KIS 해외주식 현재가, 주간거래 거래소 코드 BAQ(나스닥)·BAY(뉴욕)·BAA(아멕스)
export interface ExtFields {
  code: string; price: number; marketState?: string;
  preMarketPrice?: number | null; preMarketChangePct?: number | null;
  postMarketPrice?: number | null; postMarketChangePct?: number | null;
  dayMarketPrice?: number | null; dayMarketChangePct?: number | null;
}

// ── 프리·애프터마켓: v7/quote 가 인증(crumb)을 요구해 비는 경우가 많아 차트 API(includePrePost)로 채운다 ──
type TP = { start: number; end: number };
export async function extendedOne<T extends ExtFields>(q: T): Promise<T> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(q.code)}?interval=5m&range=2d&includePrePost=true`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return q;
    const r = (await res.json())?.chart?.result?.[0];
    const m = r?.meta;
    const ts: number[] = r?.timestamp ?? [];
    const cl: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    const per = m?.currentTradingPeriod as { pre: TP; regular: TP; post: TP } | undefined;
    if (!m || !per || !ts.length) return q;
    const now = Date.now() / 1000;
    const state = now >= per.pre.start && now < per.pre.end ? "PRE"
      : now >= per.regular.start && now < per.regular.end ? "REGULAR"
      : now >= per.post.start && now < per.post.end ? "POST" : "CLOSED";
    // 마지막 체결가와 시각
    let lastI = -1;
    for (let i = ts.length - 1; i >= 0; i--) if (cl[i] != null) { lastI = i; break; }
    if (lastI < 0) return { ...q, marketState: state };
    const lastT = ts[lastI], last = cl[lastI] as number;
    const reg = (m.regularMarketPrice as number) ?? q.price;
    const pct = (v: number) => parseFloat((((v - reg) / reg) * 100).toFixed(2));
    const out: T = { ...q, marketState: state };
    if (lastT >= per.pre.start && lastT < per.regular.start) {          // 오늘 프리마켓 체결
      out.preMarketPrice = parseFloat(last.toFixed(2)); out.preMarketChangePct = pct(last);
    } else if (lastT >= per.regular.end || (lastT < per.pre.start && lastT >= per.regular.end - 86400)) { // 애프터마켓 체결
      out.postMarketPrice = parseFloat(last.toFixed(2)); out.postMarketChangePct = pct(last);
    }
    return out;
  } catch { return q; }
}
// ── 데이마켓(미국 주간거래, 한국 낮 시간): KIS 해외주식 현재가의 주간거래 거래소 코드(BAQ 나스닥·BAY 뉴욕·BAA 아멕스) ──
const dayExcd = new Map<string, string>(); // 종목 → 맞았던 거래소 코드
export function inDaySession(): boolean {
  const k = new Date(Date.now() + 9 * 3_600_000);
  const wd = k.getUTCDay(), m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return wd >= 1 && wd <= 5 && m >= 9 * 60 && m <= 18 * 60;   // 서머타임에 따라 09~17시 / 10~18시
}
export async function dayMarketOne<T extends ExtFields>(q: T): Promise<T> {
  const tries = dayExcd.get(q.code) ? [dayExcd.get(q.code)!] : ["BAQ", "BAY", "BAA"];
  for (const excd of tries) {
    try {
      const j = await kisGet("/uapi/overseas-price/v1/quotations/price", "HHDFS00000300", { AUTH: "", EXCD: excd, SYMB: q.code.replace("-", ".") });
      const o = j.output as Record<string, string> | undefined;
      const last = num(o?.last);
      if (!last) continue;
      dayExcd.set(q.code, excd);
      return { ...q, dayMarketPrice: last, dayMarketChangePct: parseFloat((((last - q.price) / q.price) * 100).toFixed(2)) };
    } catch { /* 다음 거래소 */ }
  }
  return q;
}
