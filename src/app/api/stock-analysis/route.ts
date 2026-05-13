import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SYSTEM_PROMPT = `당신은 '진보를 위한 주식투자' 철학을 기반으로 한 냉철한 퀀트 투자 분석가입니다.
알읽남(알고리즘이 읽어주는 돈) 채널의 분석 톤앤매너: 감정 배제, 데이터 중심, 직접적 판단, 짧고 강렬한 문장.
모든 판단은 수치로 근거를 제시하고, 체리피킹 없이 장단점을 균형있게 평가하세요.
JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요. 마크다운 코드블록(\`\`\`json)도 쓰지 마세요.`;

export async function GET(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const code   = searchParams.get("code") ?? "";
  const name   = searchParams.get("name") ?? "";
  const market = searchParams.get("market") ?? "KS";

  if (!code || !name) {
    return NextResponse.json({ error: "code, name required" }, { status: 400 });
  }

  // Yahoo Finance 재무 데이터 조회
  const symbol = `${code}.${market}`;
  let finData = "";
  try {
    const summaryRes = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
        `?modules=financialData,defaultKeyStatistics,summaryDetail,earningsTrend`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );

    if (summaryRes.ok) {
      const j = await summaryRes.json();
      const fd = j?.quoteSummary?.result?.[0]?.financialData ?? {};
      const ks = j?.quoteSummary?.result?.[0]?.defaultKeyStatistics ?? {};
      const sd = j?.quoteSummary?.result?.[0]?.summaryDetail ?? {};

      finData = JSON.stringify({
        currentPrice:       fd.currentPrice?.raw,
        targetMeanPrice:    fd.targetMeanPrice?.raw,
        recommendationKey:  fd.recommendationKey,
        revenueGrowth:      fd.revenueGrowth?.raw,
        grossMargins:       fd.grossMargins?.raw,
        operatingMargins:   fd.operatingMargins?.raw,
        profitMargins:      fd.profitMargins?.raw,
        debtToEquity:       fd.debtToEquity?.raw,
        freeCashflow:       fd.freeCashflow?.raw,
        returnOnEquity:     fd.returnOnEquity?.raw,
        trailingPE:         sd.trailingPE?.raw,
        forwardPE:          sd.forwardPE?.raw,
        priceToBook:        ks.priceToBook?.raw,
        enterpriseToEbitda: ks.enterpriseToEbitda?.raw,
        beta:               sd.beta?.raw,
        marketCap:          sd.marketCap?.raw,
        dividendYield:      sd.dividendYield?.raw,
        fiftyTwoWeekLow:    sd.fiftyTwoWeekLow?.raw,
        fiftyTwoWeekHigh:   sd.fiftyTwoWeekHigh?.raw,
      });
    }
  } catch { /* 재무 데이터 없어도 진행 */ }

  const userPrompt = `
종목: ${name} (${code}.${market === "KS" ? "KOSPI" : "KOSDAQ"})
재무 데이터: ${finData || "unavailable"}

위 종목에 대해 '진보를 위한 주식투자' 관점의 냉철한 분석을 아래 JSON 형식으로 반환하세요.
데이터가 없는 항목은 일반 지식 기반으로 작성하되, 확실하지 않은 수치는 쓰지 마세요.

{
  "businessModel": "한 문장으로: 핵심 비즈니스 모델 (무엇으로 돈을 버는가)",
  "pros": ["성장동력1 — 수치 근거", "성장동력2 — 수치 근거", "성장동력3 — 수치 근거"],
  "cons": ["리스크1 — 구체적 위험", "리스크2 — 구체적 위험", "리스크3 — 구체적 위험"],
  "financialHealth": "영업이익률·부채비율·현금흐름 3년 추이 2~3문장 요약",
  "valuation": "현재 주가 저평가/고평가 여부 + 최종 의견 (매수/보유/매도) — 근거 포함",
  "summary": ["알읽남 톤의 핵심 한줄1", "핵심 한줄2", "핵심 한줄3"]
}`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text().trim();

    // JSON 블록 추출 (혹시 마크다운 코드블록이 붙는 경우 방어)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("🚨 [Gemini] JSON 파싱 실패, raw:", text.slice(0, 300));
      return NextResponse.json({ error: "parse error", raw: text }, { status: 500 });
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json(analysis, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("🚨 [Gemini API ERROR] /api/stock-analysis:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
