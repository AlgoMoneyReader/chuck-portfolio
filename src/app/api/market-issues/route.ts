import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface IssueSector { name: string; impact: "positive" | "negative" }
interface MarketIssue {
  rank: number;
  title: string;
  summary: string;
  direction: "up" | "down" | "mixed";
  sectors: IssueSector[];
  relatedStocks: string[];
}
interface IssueCache {
  issues: MarketIssue[];
  fetchedAt: string;
  sourceCount: number;
}

// ── 모듈 캐시 (15분) ──────────────────────────────────────────────────────────
let issueCache: IssueCache | null = null;
let issueCacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000;

// ── RSS 피드 목록 ─────────────────────────────────────────────────────────────
const RSS_FEEDS = [
  { url: "https://rss.mk.co.kr/rss/30000001/",         name: "매일경제" },
  { url: "https://www.hankyung.com/feed/stock",         name: "한국경제" },
  { url: "https://rss.etnews.com/Section901.xml",       name: "전자신문" },
  { url: "https://feeds.feedburner.com/yonhap-news-stock", name: "연합뉴스" },
];

const UA = "Mozilla/5.0 (compatible; NewsBot/1.0)";

// ── RSS 파싱 ──────────────────────────────────────────────────────────────────
async function fetchRSS(url: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "application/rss+xml, text/xml, */*" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const text = await res.text();

  // CDATA 형식과 일반 형식 모두 처리
  const cdataRe  = /<title><!\[CDATA\[(.*?)\]\]><\/title>/g;
  const plainRe  = /<title>([^<]{8,}?)<\/title>/g;
  const allMatches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cdataRe.exec(text)) !== null)  allMatches.push(m[1]);
  while ((m = plainRe.exec(text))  !== null)  allMatches.push(m[1]);

  const titles = allMatches
    .map(t => t.trim()
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    )
    .filter(t => t.length > 8 && !/^(RSS|Feed|뉴스|속보)/.test(t))
    .slice(0, 10);

  return titles;
}

// ── Gemini 호출 ───────────────────────────────────────────────────────────────
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
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(20000),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const j = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// ── 폴백: 헤드라인을 단순 이슈로 변환 ────────────────────────────────────────
function makeSimpleIssues(headlines: string[]): MarketIssue[] {
  return headlines.slice(0, 5).map((h, i) => ({
    rank: i + 1,
    title: h.slice(0, 15),
    summary: h.slice(0, 35),
    direction: "mixed" as const,
    sectors: [],
    relatedStocks: [],
  }));
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET() {
  // 캐시 히트
  if (issueCache && Date.now() - issueCacheTime < CACHE_TTL) {
    return NextResponse.json({ ...issueCache, cached: true });
  }

  // RSS 병렬 수집
  const rssResults = await Promise.allSettled(RSS_FEEDS.map(f => fetchRSS(f.url)));
  const headlines: string[] = [];
  for (const r of rssResults) {
    if (r.status === "fulfilled") headlines.push(...r.value);
  }

  if (headlines.length === 0) {
    return NextResponse.json({
      issues: [],
      error: "뉴스 수집 실패",
      fetchedAt: new Date().toISOString(),
      sourceCount: 0,
    });
  }

  // 중복 제거, 최대 25개
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const h of headlines) {
    if (!seen.has(h)) { seen.add(h); unique.push(h); }
    if (unique.length >= 25) break;
  }

  let issues: MarketIssue[] = [];

  try {
    const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
    const prompt = `오늘(${today}) 한국 주식 시장 뉴스 헤드라인입니다:
${unique.map((h, i) => `${i + 1}. ${h}`).join("\n")}

위 뉴스를 분석해 시장에 영향을 주는 주요 이슈 5개를 추출해주세요.
반드시 아래 JSON 배열만 반환하세요 (마크다운, 코드블록, 설명 없이):
[
  {
    "rank": 1,
    "title": "이슈 제목 15자 이내",
    "summary": "한 줄 설명 30자 이내",
    "direction": "up",
    "sectors": [
      { "name": "섹터명", "impact": "positive" }
    ],
    "relatedStocks": ["종목명1", "종목명2"]
  }
]
direction: 전반적으로 호재면 "up", 악재면 "down", 혼재면 "mixed".
sectors는 최대 3개, relatedStocks는 최대 4개 종목명만.`;

    const raw = await callGemini(prompt);

    // JSON 파싱 — 코드블록 래퍼 제거 후 시도
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      issues = parsed.filter(
        (item): item is MarketIssue =>
          typeof item === "object" && item !== null &&
          "rank" in item && "title" in item && "direction" in item
      );
    }
  } catch {
    issues = makeSimpleIssues(unique);
  }

  if (issues.length === 0) issues = makeSimpleIssues(unique);

  const result: IssueCache = {
    issues,
    fetchedAt: new Date().toISOString(),
    sourceCount: unique.length,
  };
  issueCache = result;
  issueCacheTime = Date.now();

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
