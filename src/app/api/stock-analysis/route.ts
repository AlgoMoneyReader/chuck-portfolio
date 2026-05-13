import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SYSTEM_PROMPT = `당신은 '진보를 위한 주식투자' 철학을 기반으로 한 냉철한 퀀트 투자 분석가입니다.
알읽남(알고리즘이 읽어주는 돈) 채널의 분석 톤앤매너: 감정 배제, 데이터 중심, 직접적 판단, 짧고 강렬한 문장.
모든 판단은 수치로 근거를 제시하고, 체리피킹 없이 장단점을 균형있게 평가하세요.
반드시 Google Search를 통해 해당 종목의 최신 뉴스, 최근 실적, 최신 애널리스트 리포트를 검색한 뒤 분석에 반영하세요.
JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요. 마크다운 코드블록(\`\`\`json)도 쓰지 마세요.`;

// Yahoo Finance 당일 실시간 주가 (spark API)
async function fetchCurrentPrice(symbol: string): Promise<{ price: number; fetchedAt: string } | null> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(symbol)}&range=1d&interval=5m`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const j = await res.json();
    const price: number | undefined =
      j?.spark?.result?.[0]?.response?.[0]?.meta?.regularMarketPrice;
    if (!price) return null;
    const fetchedAt = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric",
    });
    return { price, fetchedAt };
  } catch {
    return null;
  }
}

// Yahoo Finance 뉴스 최근 헤드라인 수집
async function fetchRecentNews(symbol: string, name: string): Promise<string> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search` +
        `?q=${encodeURIComponent(name)}&lang=ko-KR&region=KR&quotesCount=0&newsCount=6`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return "";
    const j = await res.json();
    const news: Array<{ title: string; publishTime?: number }> = j.news ?? [];
    if (!news.length) return "";
    return news
      .slice(0, 6)
      .map((n) => {
        const date = n.publishTime
          ? new Date(n.publishTime * 1000).toLocaleDateString("ko-KR")
          : "최근";
        return `- [${date}] ${n.title}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

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

  const symbol = `${code}.${market}`;
  const now    = new Date();
  const today  = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const year   = now.getFullYear();   // 2026
  const prevY  = year - 1;           // 2025

  // ── 병렬: Yahoo Finance 재무 데이터 + 실시간 주가 + 최신 뉴스 ────────────
  const [finResult, priceResult, newsResult] = await Promise.allSettled([
    (async () => {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
          `?modules=financialData,defaultKeyStatistics,summaryDetail`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
      );
      if (!res.ok) return "";
      const j = await res.json();
      const fd = j?.quoteSummary?.result?.[0]?.financialData ?? {};
      const ks = j?.quoteSummary?.result?.[0]?.defaultKeyStatistics ?? {};
      const sd = j?.quoteSummary?.result?.[0]?.summaryDetail ?? {};
      return JSON.stringify({
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
    })(),
    fetchCurrentPrice(symbol),
    fetchRecentNews(symbol, name),
  ]);

  const finData    = finResult.status   === "fulfilled" ? finResult.value   : "";
  const priceInfo  = priceResult.status === "fulfilled" ? priceResult.value : null;
  const newsData   = newsResult.status  === "fulfilled" ? newsResult.value  : "";

  // 실시간 주가 문자열 (프롬프트 주입용)
  const currentPriceLine = priceInfo
    ? `현재가 (${priceInfo.fetchedAt} Yahoo Finance 실시간): ${priceInfo.price.toLocaleString("ko-KR")}원\n※ 밸류에이션 분석의 기준 주가로 이 값을 사용하세요. 주가 검색 불필요.`
    : `현재가: Yahoo Finance 조회 실패 — Google Search로 당일 종가 검색 후 사용`;

  const userPrompt = `
오늘 날짜: ${today}
종목: ${name} (${code}.${market === "KS" ? "KOSPI" : "KOSDAQ"})
${currentPriceLine}
Yahoo Finance 재무 데이터: ${finData || "조회 불가"}
최근 뉴스 헤드라인:
${newsData || "없음"}

[지시사항 — 반드시 준수]
1. Google Search로 아래 키워드를 검색해 최신 정보를 반드시 반영하세요:
   - "${name} ${year}년 실적"
   - "${name} ${year}년 1분기 실적"
   - "${name} 주가 전망 ${year}"
   - "${name} 애널리스트 목표주가 ${year}"
2. ${year}년 데이터를 최우선 사용. 없으면 ${prevY}년 4분기 데이터 사용.
3. 각 수치에 날짜(예: ${year}년 1분기)를 반드시 명시. 학습 데이터 기반 추정은 "(추정)" 표기.
4. 아래 JSON 형식 그대로만 반환하세요 (코드블록 없이).

{
  "businessModel": "한 문장: 핵심 비즈니스 모델 (무엇으로 돈을 버는가)",
  "pros": ["성장동력1 — 최신 수치·날짜 근거", "성장동력2 — 최신 수치·날짜 근거", "성장동력3 — 최신 수치·날짜 근거"],
  "cons": ["리스크1 — 구체적 위험·날짜", "리스크2 — 구체적 위험·날짜", "리스크3 — 구체적 위험·날짜"],
  "financialHealth": "최신 실적 기준 영업이익률·부채비율·현금흐름 2~3문장 (분기·연도 명시)",
  "valuation": "현재 주가 저평가/고평가 여부 + 최종 의견 (매수/보유/매도) — 최신 목표주가·밸류에이션 근거",
  "summary": ["알읽남 톤의 핵심 한줄 (최신 정보 반영)", "핵심 한줄2", "핵심 한줄3"]
}`.trim();

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      // Google Search Grounding — 실시간 웹 검색으로 최신 데이터 반영
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} } as any],
    });

    const result = await model.generateContent(userPrompt);
    const text   = result.response.text().trim();

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
