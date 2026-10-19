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

// finance.naver.com HTML 스크래핑 (EUC-KR, investor-ranking과 동일 방식)
async function fetchFlow(market: string): Promise<{ label: string; netBuy: number }[]> {
  const sosok = market === "KOSDAQ" ? 1 : 0;
  const url = `https://finance.naver.com/sise/siseInvestorDealTrend.naver?sosok=${sosok}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://finance.naver.com/",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buf = await res.arrayBuffer();
  const html = new TextDecoder("euc-kr").decode(buf);

  // <tr> 전체 스캔 — tbody 유무에 관계없이 동작
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const tds: string[] = [];
    const tdPat = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdPat.exec(m[1])) !== null) {
      tds.push(tdMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim());
    }
    if (tds.length < 4) continue;
    const isDateRow =
      /^\d{4}\.\d{2}\.\d{2}$/.test(tds[0]) ||
      /^\d{2}\.\d{2}\.\d{2}$/.test(tds[0]) ||
      /^\d{2}\.\d{2}$/.test(tds[0]);
    if (!isDateRow) continue;
    const individual = parseNum(tds[1] ?? "0");
    const foreign    = parseNum(tds[2] ?? "0");
    const institution = parseNum(tds[3] ?? "0");
    if (Math.abs(individual) + Math.abs(foreign) + Math.abs(institution) === 0) continue;
    return [
      { label: "개인",   netBuy: individual },
      { label: "외국인", netBuy: foreign },
      { label: "기관",   netBuy: institution },
    ];
  }
  throw new Error("no data row");
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
