import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";
export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// 시장별 캐시: 10분 또는 등락률이 0.3%p 넘게 바뀌면 새로 만든다
const cache: Record<string, { data: object; at: number; pct: number; day: string }> = {};
const TTL = 10 * 60 * 1000;

const KST = 9 * 3_600_000;
const kstNow = () => new Date(Date.now() + KST);
const kstDay = () => kstNow().toISOString().slice(0, 10);
const kstHM = () => kstNow().toISOString().slice(11, 16);

type Q = { price: number; change: number; changePct: number } | null;
const fmtEok = (v: number) => {
  const a = Math.abs(v), s = v >= 0 ? "+" : "-";
  return a >= 10000 ? `${s}${(a / 10000).toFixed(1)}조` : `${s}${a.toLocaleString("ko-KR")}억`;
};
const fmtQ = (name: string, q: Q, digits = 2) =>
  q ? `${name} ${q.price.toLocaleString("en-US", { maximumFractionDigits: digits })} (${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%)` : null;

async function getJson(url: string, ms = 12000) {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

type News = { title: string; desc?: string; url: string; source: string; publishedAt: string | null; category: string; stocks?: { name: string }[] };
export interface Reason { title: string; body: string; sources: { title: string; url: string; source: string }[] }

// 직전 거래일 장 마감(15:30 KST) 이후 기사 = 오늘 장에 반영된 뉴스. 밤사이 미국장 뉴스 포함
function sinceLastClose(): number {
  const now = Date.now();
  let t = Date.parse(`${kstDay()}T15:30:00+09:00`) - 86_400_000;
  // 주말 건너뛰기
  for (let i = 0; i < 4; i++) {
    const wd = new Date(t + KST).getUTCDay();
    if (wd !== 0 && wd !== 6) break;
    t -= 86_400_000;
  }
  return Math.max(t, now - 40 * 3_600_000);
}

const CAT_RANK: Record<string, number> = { 국내증시: 0, 해외증시: 1, 거시경제: 2, "정책·이슈": 3, 국내기업: 4 };

// 시세·수급(보조 근거)과 같은 시간대 뉴스(주 근거)
async function collect(origin: string, market: string, fallback?: string) {
  const [mkt, flow, feed] = await Promise.all([
    getJson(`${origin}/api/market`),
    getJson(`${origin}/api/investor-flow?market=${market}`),
    getJson(`${origin}/api/news-feed`),
  ]);
  const lines: string[] = [];
  const idx = market === "KOSDAQ" ? mkt?.kosdaq : mkt?.kospi;
  const other = market === "KOSDAQ" ? fmtQ("KOSPI", mkt?.kospi) : fmtQ("KOSDAQ", mkt?.kosdaq);
  if (idx) lines.push(`${market} 현재 ${fmtQ(market, idx)}`);
  else if (fallback) lines.push(`${market} 현재 ${fallback}`);
  if (other) lines.push(other);
  if (Array.isArray(flow?.flow)) {
    lines.push("오늘 투자자별 순매수: " + flow.flow.map((f: { label: string; netBuy: number }) => `${f.label} ${fmtEok(f.netBuy)}`).join(", "));
  }
  const fx = fmtQ("원/달러 환율", mkt?.usdKrw);
  if (fx) lines.push(fx);
  const us = [fmtQ("S&P500", mkt?.sp500), fmtQ("나스닥", mkt?.nasdaq), fmtQ("필라델피아 반도체", mkt?.sox)].filter(Boolean);
  if (us.length) lines.push("직전 미국장: " + us.join(", "));
  const fut = [fmtQ("나스닥 선물", mkt?.nqFut)].filter(Boolean);
  if (fut.length) lines.push("현재 " + fut.join(", "));

  const since = sinceLastClose();
  const news = ((feed?.items ?? []) as News[])
    .filter(n => n.publishedAt && Date.parse(n.publishedAt) >= since)
    .sort((a, b) => (CAT_RANK[a.category] ?? 9) - (CAT_RANK[b.category] ?? 9) || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 70);
  return { facts: lines, news, idxPct: idx?.changePct as number | undefined };
}

const hm = (iso: string | null) => (iso ? new Date(Date.parse(iso) + KST).toISOString().slice(5, 16).replace("T", " ").replace("-", "/") : "");

function parseJson(text: string) {
  const s = text.replace(/```json\n?|\n?```/g, "");
  const m = /\{[\s\S]*\}/.exec(s);
  return JSON.parse(m ? m[0] : s);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market = url.searchParams.get("market") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const qPct = parseFloat(url.searchParams.get("changePct") ?? "");
  const day = kstDay();

  const hit = cache[market];
  if (hit && hit.day === day && Date.now() - hit.at < TTL && (isNaN(qPct) || Math.abs(hit.pct - qPct) < 0.3)) {
    return NextResponse.json(hit.data);
  }

  const price = url.searchParams.get("price");
  const { facts, news, idxPct } = await collect(url.origin, market, price && !isNaN(qPct) ? `${price} (${qPct >= 0 ? "+" : ""}${qPct.toFixed(2)}%)` : undefined);
  const pct = idxPct ?? (isNaN(qPct) ? 0 : qPct);
  const up = pct >= 0;
  const dir = up ? "상승" : "하락";
  const title = up ? "왜 올랐을까" : "왜 내렸을까";
  const subtitle = `${market} ${Math.abs(pct).toFixed(2)}% ${up ? "▲" : "▼"}`;
  const updatedAt = `${day.slice(5).replace("-", "/")} ${kstHM()} 기준 · 뉴스 ${news.length}건 분석`;
  const ref = (ids: unknown) => (Array.isArray(ids) ? ids : [])
    .map(i => news[Number(i) - 1]).filter(Boolean).slice(0, 2)
    .map(n => ({ title: n.title, url: n.url, source: n.source }));

  const newsText = news.map((n, i) =>
    `[${i + 1}] (${hm(n.publishedAt)} ${n.source}/${n.category}) ${n.title}${n.desc ? ` — ${n.desc}` : ""}`).join("\n");

  const prompt = `당신은 한국 증시 시황 애널리스트입니다. 오늘은 ${day}, 지금은 한국시간 ${kstHM()}입니다.
${market} 지수가 오늘 ${Math.abs(pct).toFixed(2)}% ${dir} 중입니다.

[시세·수급 (보조 근거)]
${facts.join("\n") || "(없음)"}

[직전 거래일 장 마감 이후 수집된 뉴스 (주 근거)]
${newsText || "(없음)"}

과제: 위 뉴스를 읽고 오늘 ${market}가 ${dir}한 핵심 원인 3가지를 찾으세요.
- 숫자 나열이 아니라 "무슨 일이 있었고 → 그래서 어떤 업종·종목·투자자가 어떻게 움직였는지" 인과관계로 설명
- 여러 기사에 반복되는 이슈, 시총 상위·주도 업종 관련 이슈를 우선. 지수 ${dir} 방향과 맞지 않는 이슈는 제외
- 반드시 위 뉴스 번호로 근거를 달 것(refs). 뉴스에 없는 사건·수치를 지어내지 말 것
- 수치는 뉴스 본문이나 [시세·수급]에 있는 것만 사용
- title은 12자 이내 원인 키워드, body는 2문장 이내(120자 이내)
- summary는 오늘 장을 한 문장으로 요약(50자 이내)

JSON만 반환:
{"summary":"...","reasons":[{"title":"...","body":"...","refs":[1,5]},{"title":"...","body":"...","refs":[2]},{"title":"...","body":"...","refs":[3]}]}`;

  try {
    if (!news.length) throw new Error("no news");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json", temperature: 0.3 } });
    const result = await model.generateContent(prompt);
    const j = parseJson(result.response.text().trim());
    const reasons: Reason[] = (Array.isArray(j.reasons) ? j.reasons : []).slice(0, 3)
      .map((r: { title?: string; body?: string; refs?: unknown }) => ({ title: String(r.title ?? ""), body: String(r.body ?? ""), sources: ref(r.refs) }))
      .filter((r: Reason) => r.body);
    if (!reasons.length) throw new Error("empty");
    const data = { title, subtitle, summary: String(j.summary ?? ""), reasons, bullets: reasons.map(r => `${r.title}: ${r.body}`), updatedAt };
    cache[market] = { data, at: Date.now(), pct, day };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // AI 실패 시 같은 시간대 국내 증시 주요 기사를 그대로 보여준다
    const top = news.filter(n => n.category === "국내증시").slice(0, 3);
    const reasons: Reason[] = top.map(n => ({ title: n.source, body: n.title, sources: [{ title: n.title, url: n.url, source: n.source }] }));
    return NextResponse.json(
      { title, subtitle, summary: "", reasons, bullets: reasons.length ? reasons.map(r => r.body) : ["시황 분석을 준비 중입니다."], updatedAt },
      { headers: { "Cache-Control": "no-store" } });
  }
}
