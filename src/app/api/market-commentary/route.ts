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

// 실제 데이터 묶음. AI는 여기 있는 숫자만 쓸 수 있다
async function collectFacts(origin: string, market: string, fallback?: string) {
  const [mkt, flow, news] = await Promise.all([
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
  const us = [fmtQ("S&P500", mkt?.sp500), fmtQ("나스닥", mkt?.nasdaq), fmtQ("다우", mkt?.dow), fmtQ("필라델피아 반도체", mkt?.sox)].filter(Boolean);
  if (us.length) lines.push("직전 미국 정규장 마감: " + us.join(", "));
  const fut = [fmtQ("S&P500 선물", mkt?.esFut), fmtQ("나스닥 선물", mkt?.nqFut)].filter(Boolean);
  if (fut.length) lines.push("현재 미국 지수 선물: " + fut.join(", "));
  const cmd = [fmtQ("WTI", mkt?.oil), fmtQ("금", mkt?.gold)].filter(Boolean);
  if (cmd.length) lines.push(cmd.join(", "));

  // 최근 12시간 헤드라인
  const since = Date.now() - 12 * 3_600_000;
  const heads = ((news?.items ?? []) as { title: string; publishedAt?: string | null }[])
    .filter(n => !n.publishedAt || Date.parse(n.publishedAt) >= since)
    .slice(0, 25)
    .map(n => `- ${n.title}`);
  return { facts: lines, heads, idxPct: idx?.changePct as number | undefined };
}

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
  const { facts, heads, idxPct } = await collectFacts(url.origin, market, price && !isNaN(qPct) ? `${price} (${qPct >= 0 ? "+" : ""}${qPct.toFixed(2)}%)` : undefined);
  const pct = idxPct ?? (isNaN(qPct) ? 0 : qPct);
  const up = pct >= 0;
  const title = up ? "왜 올랐을까" : "왜 내렸을까";
  const subtitle = `${market} ${Math.abs(pct).toFixed(2)}% ${up ? "▲" : "▼"}`;
  const updatedAt = `${day.slice(5).replace("-", "/")} ${kstHM()} 기준`;

  const prompt = `오늘은 ${day} (한국시간 ${kstHM()})입니다. ${market} 지수가 오늘 ${Math.abs(pct).toFixed(2)}% ${up ? "상승" : "하락"} 중입니다.

[실시간 데이터 — 숫자는 반드시 여기서만 인용]
${facts.join("\n") || "(데이터 없음)"}

[최근 12시간 뉴스 헤드라인]
${heads.join("\n") || "(없음)"}

필요하면 구글 검색으로 "${day} 코스피" 등 오늘 날짜 한국 증시 기사만 확인하세요. 오늘 날짜가 아닌 기사·과거 수치는 절대 쓰지 마세요.
위 데이터와 오늘 뉴스를 근거로 오늘 ${market}가 ${up ? "오른" : "내린"} 이유를 3가지로 정리하세요.

규칙
- 각 항목 "키워드: 설명" 형식, 한 문장 60자 안팎
- 수치는 위 [실시간 데이터]에 있는 값만 사용. 데이터에 없는 금리·환율·지수 수치를 지어내지 말 것
- 근거가 없는 추측(금리 인하 기대 등) 금지. 수급·주도 업종/종목·해외 요인 위주
- 감정 배제, 마크다운 없이 JSON만 반환

{"bullets":["...","...","..."]}`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} } as any],
    });
    const result = await model.generateContent(prompt);
    const j = parseJson(result.response.text().trim());
    const bullets = (Array.isArray(j.bullets) ? j.bullets : []).map(String).filter(Boolean).slice(0, 3);
    if (!bullets.length) throw new Error("empty");
    const data = { title, subtitle, bullets, updatedAt };
    cache[market] = { data, at: Date.now(), pct, day };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // AI 실패 시 실제 데이터만 보여준다
    const bullets = facts.slice(0, 3).length ? facts.slice(0, 3) : ["시황 분석을 준비 중입니다."];
    return NextResponse.json({ title, subtitle, bullets, updatedAt }, { headers: { "Cache-Control": "no-store" } });
  }
}
