import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── 캐시 (30분) ───────────────────────────────────────────────────────────────
interface CacheEntry { summary: string; headlines: string[]; cachedAt: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36";

// ── Yahoo Finance RSS (국내/해외 모두 작동) ───────────────────────────────────
async function fetchYahooRSS(ticker: string): Promise<string[]> {
  // Yahoo Finance RSS — 인증 불필요, 국내 종목도 지원
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const xml = await res.text();

    // item 레벨 파싱
    const titles: string[] = [];
    const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null && titles.length < 5) {
      const tc = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(m[1]);
      const tp = /<title>([\s\S]*?)<\/title>/.exec(m[1]);
      const t  = (tc?.[1] ?? tp?.[1] ?? "").trim()
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/<[^>]+>/g, "").trim();
      if (t.length > 8) titles.push(t);
    }
    return titles;
  } catch {
    return [];
  }
}

// ── Naver Finance 뉴스 (국내 종목 백업) ──────────────────────────────────────
async function fetchNaverRSS(code: string): Promise<string[]> {
  // 네이버 금융 종목 뉴스 RSS
  const url = `https://finance.naver.com/item/news_news.naver?code=${code}&page=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ko-KR,ko;q=0.9",
        Referer: "https://finance.naver.com/",
      },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) throw new Error();
    const html = await res.text();

    // 뉴스 제목 추출 (네이버 종목 뉴스 HTML 구조)
    const titles: string[] = [];
    const re = /class="title"[^>]*>\s*<[^>]+>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && titles.length < 5) {
      const t = m[1].replace(/<[^>]+>/g, "").trim();
      if (t.length > 5) titles.push(t);
    }
    return titles;
  } catch {
    return [];
  }
}

// ── Gemini AI 요약 ────────────────────────────────────────────────────────────
async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no GEMINI_API_KEY");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 50 },
      }),
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const j = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// ── 가격 방향 휴리스틱 ────────────────────────────────────────────────────────
function heuristic(c: number): string {
  if (c >= 7)   return "급등 모멘텀 폭발";
  if (c >= 3)   return "강한 매수세 유입";
  if (c >= 1)   return "외국인·기관 매수";
  if (c >= 0)   return "소폭 강보합";
  if (c >= -1)  return "소폭 약보합";
  if (c >= -3)  return "차익 실현 매물";
  if (c >= -7)  return "기관 매물 출회";
  return "급락 패닉 매도";
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker    = searchParams.get("ticker")    ?? "";
  const name      = searchParams.get("name")      ?? ticker;
  const changePct = parseFloat(searchParams.get("changePct") ?? "0");

  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // 캐시 확인
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL) {
    return NextResponse.json({ ...hit, cached: true });
  }

  // 항상 응답을 보장하는 outer try-catch
  try {
    const isKR = ticker.includes(".KS") || ticker.includes(".KQ");

    // 뉴스 수집: Yahoo RSS 우선, 국내는 Naver 병행 (각 2.5s 제한, 병렬)
    let headlines: string[] = [];
    if (isKR) {
      const code = ticker.split(".")[0];
      const [yahoo, naver] = await Promise.all([
        fetchYahooRSS(ticker),
        fetchNaverRSS(code),
      ]);
      headlines = naver.length > 0 ? naver : yahoo;
    } else {
      headlines = await fetchYahooRSS(ticker);
    }

    // Gemini 요약 (5s 제한 — 합계 최대 7.5s < Vercel 10s)
    let summary = heuristic(changePct);

    if (headlines.length > 0 && process.env.GEMINI_API_KEY) {
      try {
        const dir    = changePct >= 0 ? "상승" : "하락";
        const pctAbs = Math.abs(changePct).toFixed(1);
        const prompt = `다음은 ${name}(${ticker}) 주식 관련 최신 뉴스 헤드라인입니다:
${headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}

이 종목이 오늘 ${pctAbs}% ${dir}한 핵심 이유를 8~15글자 한국어 명사형으로 요약하세요.
예시: "로봇사업 기대감", "관세 우려 매도", "실적 서프라이즈", "기관 차익실현"
인용부호나 마침표 없이 한 줄만 반환.`;

        const raw = await callGemini(prompt);
        const cleaned = raw.replace(/^["'.]+|["'.]+$/g, "").trim();
        if (cleaned.length >= 4 && cleaned.length <= 25) summary = cleaned;
      } catch { /* Gemini 실패 → heuristic 유지 */ }
    } else if (headlines.length > 0) {
      summary = headlines[0].slice(0, 20);
    }

    const entry: CacheEntry = { summary, headlines, cachedAt: Date.now() };
    cache.set(ticker, entry);

    return NextResponse.json(
      { summary, headlines, cached: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // 예외 발생 시에도 heuristic 기반 응답 반환 (뱃지는 반드시 표시)
    const summary = heuristic(changePct);
    return NextResponse.json(
      { summary, headlines: [], cached: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
