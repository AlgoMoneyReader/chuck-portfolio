import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SYSTEM_PROMPT = `Act as an elite equity research analyst at a top-tier investment fund.

Your task is to analyze a company using both fundamental and macroeconomic perspectives.
Always respond in Korean.

Structure your response using this exact framework:

## 1. 기본 분석 (Fundamental Analysis)
- 매출 성장, 총이익·순이익 마진 추이, 잉여현금흐름 분석
- 섹터 피어 대비 밸류에이션 비교 (P/E, EV/EBITDA 등)
- 내부자 보유 지분 및 최근 내부자 거래 현황

## 2. 투자 논거 검증 (Thesis Validation)
- **지지 논거 3가지**: 투자 thesis를 뒷받침하는 핵심 근거
- **반박 논거 2가지**: 주요 리스크 및 카운터 아규먼트
- **최종 판정**: 강세(Bullish) / 약세(Bearish) / 중립(Neutral) — 이유 포함

## 3. 섹터 & 매크로 관점
- 섹터 개요 (현재 사이클, 모멘텀)
- 관련 거시경제 트렌드
- 경쟁 포지셔닝 분석

## 4. 촉매 모니터링 (Catalyst Watch)
- 예정된 이벤트 (실적 발표, 신제품, 규제 이슈 등)
- **단기 촉매** (1~3개월)
- **장기 촉매** (6~18개월)

## 5. 투자 요약
- 핵심 투자 논거 5개 불릿
- **최종 추천**: 매수(Buy) / 보유(Hold) / 매도(Sell)
- **확신 레벨**: 높음(High) / 보통(Medium) / 낮음(Low)
- **예상 기간**: (예: 6~12개월)

---
마크다운 형식으로 작성. 불릿 포인트 적극 활용. 간결하고 전문적으로. 분석 과정 설명 없이 결과만 전달.`;

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY가 설정되지 않았습니다. Vercel → Settings → Environment Variables에서 추가하세요." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const { ticker, companyName, thesis, goal } = body;

    if (!ticker && !companyName) {
      return NextResponse.json({ error: "ticker 또는 companyName이 필요합니다" }, { status: 400 });
    }

    const userMessage = `
**분석 대상**: ${companyName ?? ticker} ${ticker ? `(${ticker})` : ""}
**투자 논거**: ${thesis ?? "종합적인 투자 관점에서 분석해주세요"}
**목표**: ${goal ?? "투자 의사결정을 위한 종합 분석"}

위 정보를 바탕으로 엘리트 주식 리서치 보고서를 작성해주세요.
최신 시장 상황과 섹터 트렌드를 반영하여 실질적이고 실행 가능한 인사이트를 제공해주세요.
    `.trim();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(userMessage);
    const text = result.response.text();

    return NextResponse.json({
      analysis: text,
      ticker,
      companyName,
      timestamp: new Date().toISOString(),
      model: "gemini-2.5-flash",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("🚨 [Gemini API ERROR] /api/analyze:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
