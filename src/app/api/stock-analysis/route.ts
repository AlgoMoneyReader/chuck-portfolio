import { NextResponse } from "next/server";
import { gemini, GeminiError } from "@/lib/gemini";
import { requestUser } from "@/lib/supabase/requestUser";

export const dynamic = "force-dynamic";

export const maxDuration = 60;
const ANALYSIS_CACHE = new Map<string, Record<string, unknown>>();

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

  if (!(await requestUser(request))) {
    return NextResponse.json({ error: "로그인 후 이용할 수 있습니다", needLogin: true }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code   = searchParams.get("code") ?? "";
  const name   = searchParams.get("name") ?? "";
  const market = searchParams.get("market") ?? "KS";
  // 화면의 '진보적 사고 Grade'(단기 수급·모멘텀 점수). AI 의견이 이와 따로 놀지 않도록 함께 넘긴다
  const grade  = (searchParams.get("grade") ?? "").slice(0, 2);
  const gradeScore = searchParams.get("score") ?? "";
  const gradeNote  = (searchParams.get("gnote") ?? "").slice(0, 200);

  if (!code || !name) {
    return NextResponse.json({ error: "code, name required" }, { status: 400 });
  }

  // 같은 종목은 하루 한 번만 AI 호출 (한도 절약)
  const ck = `${code}-${grade}-${new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)}`;
  const hit = ANALYSIS_CACHE.get(ck);
  if (hit) return NextResponse.json({ ...hit, cached: true });

  const isUS   = market === "US";
  const symbol = isUS ? code.toUpperCase() : `${code}.${market}`;
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
  const priceUnit = isUS ? "달러(USD)" : "원(KRW)";
  const priceStr  = priceInfo
    ? isUS
      ? `$${priceInfo.price.toFixed(2)}`
      : `${priceInfo.price.toLocaleString("ko-KR")}원`
    : "조회 실패";
  const currentPriceLine = priceInfo
    ? `현재가 (${priceInfo.fetchedAt} Yahoo Finance 실시간): ${priceStr}\n※ 밸류에이션 분석의 기준 주가로 이 값을 사용하세요. 주가 검색 불필요.`
    : `현재가: Yahoo Finance 조회 실패 — Google Search로 당일 종가(${priceUnit}) 검색 후 사용`;

  const marketLabel = isUS ? "NASDAQ/NYSE" : (market === "KS" ? "KOSPI" : "KOSDAQ");

  // 검색 키워드: 미국주식은 영어로
  const searchKeywords = isUS ? `
   - "${name} ${year} earnings results"
   - "${name} Q1 ${year} revenue guidance"
   - "${name} stock price target ${year} analyst"
   - "${name} ${year} outlook"` : `
   - "${name} ${year}년 실적"
   - "${name} ${year}년 1분기 실적"
   - "${name} 주가 전망 ${year}"
   - "${name} 애널리스트 목표주가 ${year}"`;

  const userPrompt = `
오늘 날짜: ${today}
종목: ${name} (${code}, ${marketLabel})
${currentPriceLine}
Yahoo Finance 재무 데이터: ${finData || "조회 불가"}
최근 뉴스 헤드라인:
${newsData || "없음"}
${grade ? `알읽남 진보적 사고 Grade(단기 수급·모멘텀 정량 점수): ${grade} (${gradeScore}/100점) — ${gradeNote}` : ""}

[지시사항 — 반드시 준수]
1. Google Search로 아래 키워드를 검색해 최신 정보를 반드시 반영하세요:${searchKeywords}
2. ${year}년 데이터를 최우선 사용. 없으면 ${prevY}년 4분기 데이터 사용.
3. 각 수치에 날짜(예: ${year}년 1분기 / Q1 ${year})를 반드시 명시. 학습 데이터 기반 추정은 "(추정)" 표기.
4. valuation 의 최종 의견은 펀더멘털(중장기) 관점이고, Grade 는 단기 수급 관점이다.${grade ? ` 두 관점이 다르면(예: Grade D인데 펀더멘털 매수) 모순처럼 보이지 않게 verdict 에서 "중장기 ○○ / 단기 ○○ → 대응: 분할매수·관망 등"으로 반드시 조율해서 한 문장으로 쓰세요. Grade D·C면 즉시 '강력 매수' 같은 표현은 쓰지 마세요.` : ""}
5. 아래 JSON 형식 그대로만 반환하세요 (코드블록 없이).

{
  "businessModel": "한 문장: 핵심 비즈니스 모델 (무엇으로 돈을 버는가)",
  "pros": ["성장동력1 — 최신 수치·날짜 근거", "성장동력2 — 최신 수치·날짜 근거", "성장동력3 — 최신 수치·날짜 근거"],
  "cons": ["리스크1 — 구체적 위험·날짜", "리스크2 — 구체적 위험·날짜", "리스크3 — 구체적 위험·날짜"],
  "financialHealth": "최신 실적 기준 영업이익률·부채비율·현금흐름 2~3문장 (분기·연도 명시)",
  "valuation": "현재 주가 저평가/고평가 여부 + 최종 의견 (매수/보유/매도) — 최신 목표주가·밸류에이션 근거",
  "verdict": "단기 수급 Grade와 펀더멘털을 종합한 최종 대응 한 문장 (예: 중장기 매수 / 단기 수급 약세 → 분할 접근)",
  "summary": ["알읽남 톤의 핵심 한줄 (최신 정보 반영)", "핵심 한줄2", "핵심 한줄3"]
}`.trim();

  try {
    const { text } = await gemini({ prompt: userPrompt, system: SYSTEM_PROMPT, search: true, timeoutMs: 50_000 });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("🚨 [Gemini] JSON 파싱 실패, raw:", text.slice(0, 300));
      return NextResponse.json({ error: "parse error", raw: text }, { status: 500 });
    }

    const analysis = JSON.parse(jsonMatch[0]);
    analysis.generatedAt = new Date().toISOString();
    ANALYSIS_CACHE.set(ck, analysis);
    if (ANALYSIS_CACHE.size > 300) ANALYSIS_CACHE.delete(ANALYSIS_CACHE.keys().next().value as string);
    return NextResponse.json(analysis, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("🚨 [Gemini API ERROR] /api/stock-analysis:", msg);
    return NextResponse.json({ error: msg }, { status: error instanceof GeminiError && error.quota ? 429 : 500 });
  }
}
