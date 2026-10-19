import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

let cache: { key: string; data: object; at: number } | null = null;
const TTL = 5 * 60 * 1000;

function parseNum(s: string): number {
  const n = parseInt(s.replace(/[,\s+]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

async function fetchFlow(market: string) {
  const code = market === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Referer": "https://m.stock.naver.com/",
    "Accept": "application/json",
  };
  const res = await fetch(`https://m.stock.naver.com/api/index/${code}/investorGroup`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error("flow fetch failed");
  const json = await res.json();
  const groups: { investorType: string; netBuy: string }[] = json?.investorGroup ?? [];
  const TYPE_MAP: Record<string, string> = {
    INDIVIDUAL: "개인", FOREIGN_RETAIL: "외국인", FOREIGN: "외국인",
    INSTITUTION: "기관", INSTITUTION_SUM: "기관",
  };
  const seen = new Set<string>();
  const result: { label: string; netBuy: number }[] = [];
  for (const g of groups) {
    const label = TYPE_MAP[g.investorType];
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push({ label, netBuy: parseNum(g.netBuy ?? "0") });
  }
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "KOSPI";
  const price = searchParams.get("price") ?? "0";
  const changePct = parseFloat(searchParams.get("changePct") ?? "0");

  const cacheKey = `${market}-${new Date().toISOString().slice(0, 13)}`;
  if (cache && cache.key === cacheKey && Date.now() - cache.at < TTL) {
    return NextResponse.json(cache.data);
  }

  let flowText = "데이터 없음";
  try {
    const flow = await fetchFlow(market);
    if (flow.length) {
      flowText = flow.map(f => {
        const abs = Math.abs(f.netBuy);
        const sign = f.netBuy >= 0 ? "+" : "-";
        const fmt = abs >= 10000 ? `${sign}${(abs / 10000).toFixed(1)}조` : `${sign}${abs.toLocaleString("ko-KR")}억`;
        return `${f.label} ${fmt}`;
      }).join(", ");
    }
  } catch { /* silent */ }

  const direction = changePct >= 0 ? "상승" : "하락";
  const title = changePct >= 0 ? "왜 올랐을까" : "왜 내렸을까";
  const subtitle = `${market} ${Math.abs(changePct).toFixed(2)}% ${changePct >= 0 ? "▲" : "▼"}`;
  const updatedAt = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) + " 기준";

  const prompt = `${market} 지수가 오늘 ${Math.abs(changePct).toFixed(2)}% ${direction}했습니다.
현재가: ${price}, 투자자별 순매수: ${flowText}

알읽남 채널 스타일로 오늘 ${market} ${direction} 이유를 3가지로 분석하세요.
규칙: 수치 근거 포함, 짧고 직접적, 감정 배제, 마크다운 없이 JSON만 반환.

반환 형식: {"title":"${title}","subtitle":"${subtitle}","bullets":["...","...","..."],"updatedAt":"${updatedAt}"}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/```json\n?|\n?```/g, "");
    const json = JSON.parse(text);
    cache = { key: cacheKey, data: json, at: Date.now() };
    return NextResponse.json(json);
  } catch {
    const fallback = { title, subtitle, bullets: ["수급 데이터 분석 중입니다."], updatedAt };
    return NextResponse.json(fallback);
  }
}
