import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SYSTEM_PROMPT = `Act as an elite equity research analyst at a top-tier investment fund.

Your task is to analyze a company using both fundamental and macroeconomic perspectives.
Always respond in Korean.
IMPORTANT: Use Google Search to find the LATEST news, earnings reports, analyst reports, and market data before writing. Always cite dates and sources. Do NOT rely solely on training data.

Structure your response using this exact framework:

## 1. 기본 분석 (Fundamental Analysis)
- 최신 실적 기준 매출 성장, 총이익·순이익 마진 추이, 잉여현금흐름 분석 (분기/연도 명시)
- 섹터 피어 대비 밸류에이션 비교 (P/E, EV/EBITDA 등) — 현재 시점 기준
- 내부자 보유 지분 및 최근 내부자 거래 현황

## 2. 투자 논거 검증 (Thesis Validation)
- **지지 논거 3가지**: 최신 데이터·뉴스 기반 핵심 근거 (날짜 명시)
- **반박 논거 2가지**: 최신 리스크 및 카운터 아규먼트
- **최종 판정**: 강세(Bullish) / 약세(Bearish) / 중립(Neutral) — 이유 포함

## 3. 섹터 & 매크로 관점
- 섹터 최신 동향 (현재 사이클, 최근 모멘텀)
- 관련 거시경제 트렌드 — 최신 지표 반영
- 경쟁 포지셔닝 분석

## 4. 촉매 모니터링 (Catalyst Watch)
- 예정된 이벤트 (다음 실적 발표일, 신제품, 규제 이슈 등) — 구체적 일정 포함
- **단기 촉매** (1~3개월)
- **장기 촉매** (6~18개월)

## 5. 투자 요약
- 핵심 투자 논거 5개 불릿 (최신 데이터 기반)
- **최종 추천**: 매수(Buy) / 보유(Hold) / 매도(Sell)
- **확신 레벨**: 높음(High) / 보통(Medium) / 낮음(Low)
- **예상 기간**: (예: 6~12개월)

---
마크다운 형식으로 작성. 불릿 포인트 적극 활용. 간결하고 전문적으로. 분석 과정 설명 없이 결과만 전달.
데이터 출처와 날짜를 괄호로 명시하세요. 학습 데이터 기반 추정은 "(추정)" 표기.`;

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

    const today = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric",
    });

    const userMessage = `
오늘 날짜: ${today}
**분석 대상**: ${companyName ?? ticker} ${ticker ? `(${ticker})` : ""}
**투자 논거**: ${thesis ?? "종합적인 투자 관점에서 분석해주세요"}
**목표**: ${goal ?? "투자 의사결정을 위한 종합 분석"}

[지시사항]
1. Google Search로 "${companyName ?? ticker} 최신 실적", "${companyName ?? ticker} 주가 전망 2025", "${companyName ?? ticker} 애널리스트 목표주가" 등을 검색하세요.
2. 검색 결과의 날짜를 반드시 확인하고, 가장 최신 정보를 우선 사용하세요.
3. 오래된 데이터(6개월 이상)는 "(구 데이터)" 표기 후 사용하세요.

위 정보를 바탕으로 엘리트 주식 리서치 보고서를 작성해주세요.
    `.trim();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      // Google Search Grounding — 실시간 웹 검색으로 최신 데이터 반영
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} } as any],
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
