import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── 캐시 (30분) ───────────────────────────────────────────────────────────────
interface CacheEntry { summary: string; headlines: string[]; cachedAt: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36";

// ── Yahoo Finance 뉴스 fetch ──────────────────────────────────────────────────
async function fetchYahooNews(ticker: string): Promise<string[]> {
  try {
    // v1 news endpoint (crumb 불필요)
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/news?symbols=${encodeURIComponent(ticker)}&count=5`,
      {
        headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`${res.status}`);
    const j = await res.json() as {
      data?: { main?: { stream?: Array<{ content?: { title?: string } }> } };
      items?: Array<{ content?: { title?: string } }>;
    };
    const stream = j?.data?.main?.stream ?? j?.items ?? [];
    return stream
      .map(item => item?.content?.title ?? "")
      .filter(t => t.length > 5)
      .slice(0, 5);
  } catch {
    return [];
  }
}

// ── Naver Finance RSS (국내 종목 백업) ────────────────────────────────────────
async function fetchNaverNews(code: string): Promise<string[]> {
  // code = 005930 (ticker 앞부분, .KS/.KQ 제거)
  try {
    const res = await fetch(
      `https://finance.naver.com/item/news_news.naver?code=${code}&page=1&sm=title_entity_id.basic&clusterId=`,
      {
        headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", Referer: "https://finance.naver.com/" },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error();
    const html = await res.text();
    const titleRe = /class="title"[^>]*>([^<]+)</g;
    const titles: string[] = [];
    let tm: RegExpExecArray | null;
    while ((tm = titleRe.exec(html)) !== null && titles.length < 5) {
      const t = tm[1].trim();
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
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const j = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// ── 휴리스틱 폴백 ─────────────────────────────────────────────────────────────
function heuristic(changePct: number): string {
  if (changePct >= 7)  return "급등 모멘텀 폭발";
  if (changePct >= 3)  return "강한 매수세 유입";
  if (changePct >= 1)  return "외국인·기관 매수";
  if (changePct >= 0)  return "소폭 강보합";
  if (changePct >= -1) return "소폭 약보합";
  if (changePct >= -3) return "차익 실현 매물";
  if (changePct >= -7) return "기관 매물 출회";
  return "급락 패닉 매도";
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker    = searchParams.get("ticker") ?? "";
  const name      = searchParams.get("name")   ?? ticker;
  const changePct = parseFloat(searchParams.get("changePct") ?? "0");

  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // 캐시 확인
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL) {
    return NextResponse.json({ ...hit, cached: true });
  }

  // 뉴스 수집 — 국내: Naver 우선, 해외: Yahoo
  const isKR = ticker.includes(".KS") || ticker.includes(".KQ");
  let headlines: string[] = [];

  if (isKR) {
    const code = ticker.split(".")[0];
    headlines = await fetchNaverNews(code);
    if (headlines.length === 0) headlines = await fetchYahooNews(ticker);
  } else {
    headlines = await fetchYahooNews(ticker);
  }

  // Gemini 요약
  let summary = heuristic(changePct);

  if (headlines.length > 0 && process.env.GEMINI_API_KEY) {
    try {
      const dir   = changePct >= 0 ? "상승" : "하락";
      const pctAbs = Math.abs(changePct).toFixed(1);
      const prompt = `다음은 ${name}(${ticker}) 주식 관련 최신 뉴스 헤드라인입니다:
${headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}

이 종목이 오늘 ${pctAbs}% ${dir}한 이유를 8~15글자 한국어로 요약해주세요.
예시 형식: "차익실현 매물 출회", "실적 개선 기대감", "외국인 순매수", "관세 우려 매도"
한 줄만 반환. 인용부호나 부가설명 없이.`;

      const raw = await callGemini(prompt);
      // 따옴표 제거 + 30자 이하만 허용
      const cleaned = raw.replace(/^["']|["']$/g, "").trim();
      if (cleaned.length >= 4 && cleaned.length <= 30) summary = cleaned;
    } catch { /* fallback */ }
  } else if (headlines.length > 0) {
    // Gemini 없을 때: 첫 헤드라인 20자 절삭
    summary = headlines[0].slice(0, 20);
  }

  const entry: CacheEntry = { summary, headlines, cachedAt: Date.now() };
  cache.set(ticker, entry);

  return NextResponse.json(
    { summary, headlines, cached: false },
    { headers: { "Cache-Control": "no-store" } }
  );
}
