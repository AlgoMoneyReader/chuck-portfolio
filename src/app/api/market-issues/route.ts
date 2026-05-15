import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface IssueSector { name: string; impact: "positive" | "negative" }
interface MarketIssue {
  rank: number; title: string; summary: string;
  direction: "up" | "down" | "mixed";
  sectors: IssueSector[];
  relatedStocks: string[];
  sourceItems: Array<{ title: string; url: string }>;
}
interface IssueCache { issues: MarketIssue[]; fetchedAt: string; sourceCount: number }

// ── 모듈 캐시 (15분) ──────────────────────────────────────────────────────────
let issueCache: IssueCache | null = null;
let issueCacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000;

// ── 증권·경제 전용 RSS 피드 ────────────────────────────────────────────────────
const RSS_FEEDS = [
  "https://rss.mk.co.kr/rss/30200030/",          // 매경 증권
  "https://rss.mk.co.kr/rss/30200031/",          // 매경 기업·산업
  "https://www.hankyung.com/feed/economy",        // 한경 경제
  "https://www.hankyung.com/feed/finance",        // 한경 금융
  "https://www.yna.co.kr/rss/economy.xml",        // 연합뉴스 경제
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// ── 비금융 키워드 사전 필터 ────────────────────────────────────────────────────
const EXCLUDE = [
  "연예", "드라마", "영화", "가수", "배우", "아이돌", "스포츠", "야구", "축구",
  "농구", "올림픽", "살인", "사망", "범죄", "폭행", "성범죄", "사건", "사고",
  "화재", "지진", "태풍", "날씨",
];
const FINANCE_KW = [
  "주가", "증시", "코스피", "코스닥", "상장", "투자", "펀드", "채권", "금리",
  "기준금리", "주식", "매수", "매도", "실적", "영업이익", "매출", "수익", "배당",
  "시가총액", "공매도", "ETF", "IPO", "합병", "인수", "반도체", "배터리", "바이오",
  "경제", "수출", "무역", "관세", "환율", "달러", "원화", "유가", "증권", "지수",
  "섹터", "전기차", "자동차", "조선", "방산", "철강", "화학", "AI", "반도체",
  "기업", "산업", "제조", "수주", "공장", "영업", "상반기", "하반기", "분기",
];

function isFinance(title: string): boolean {
  const t = title;
  if (EXCLUDE.some(w => t.includes(w))) return false;
  return FINANCE_KW.some(w => t.includes(w));
}

// ── item 레벨 RSS 파싱 (채널 title 제외) ─────────────────────────────────────
interface RSSItem { title: string; url: string }

async function fetchRSSItems(feedUrl: string, max = 15): Promise<RSSItem[]> {
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml, */*" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const xml = await res.text();

  const items: RSSItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && items.length < max) {
    const block = m[1];

    // title — CDATA 우선
    const tc = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(block);
    const tp = /<title>([\s\S]*?)<\/title>/.exec(block);
    const raw = (tc?.[1] ?? tp?.[1] ?? "").trim()
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/<[^>]+>/g, "").trim();
    if (raw.length < 8) continue;

    // link — CDATA, 일반 text, 또는 href 속성
    const lc = /<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/.exec(block);
    const lt = /<link>([\s\S]*?)<\/link>/.exec(block);
    const lh = /<link[^>]+href="([^"]+)"/.exec(block);
    const url = (lc?.[1] ?? lt?.[1] ?? lh?.[1] ?? "").trim();

    items.push({ title: raw, url });
  }

  return items;
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
        generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
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

// ── 헤드라인 → issue 매칭 (URL 연결용) ────────────────────────────────────────
function matchSources(issueTitle: string, issueSummary: string, allItems: RSSItem[]): RSSItem[] {
  const keywords = (issueTitle + " " + issueSummary)
    .split(/[\s·,]+/)
    .filter(w => w.length >= 2)
    .slice(0, 6);

  return allItems
    .filter(item => keywords.some(kw => item.title.includes(kw)))
    .slice(0, 3);
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const bypass = new URL(request.url).searchParams.get("bypass");

  // 캐시 히트 (force refresh 제외)
  if (!bypass && issueCache && Date.now() - issueCacheTime < CACHE_TTL) {
    return NextResponse.json({ ...issueCache, cached: true });
  }

  // RSS 병렬 수집
  const rssResults = await Promise.allSettled(RSS_FEEDS.map(u => fetchRSSItems(u)));
  const allItems: RSSItem[] = [];
  for (const r of rssResults) {
    if (r.status === "fulfilled") allItems.push(...r.value);
  }

  // 금융 키워드 필터 + 중복 제거
  const seen = new Set<string>();
  const finItems: RSSItem[] = [];
  for (const item of allItems) {
    if (!seen.has(item.title) && isFinance(item.title)) {
      seen.add(item.title);
      finItems.push(item);
    }
    if (finItems.length >= 30) break;
  }

  if (finItems.length === 0) {
    return NextResponse.json({
      issues: [], error: "금융 뉴스 수집 실패",
      fetchedAt: new Date().toISOString(), sourceCount: 0,
    });
  }

  // ── Gemini: 이슈 클러스터링 ─────────────────────────────────────────────────
  let rawIssues: Array<{
    rank: number; title: string; summary: string;
    direction: "up" | "down" | "mixed";
    sectors: IssueSector[];
    relatedStocks: string[];
  }> = [];

  try {
    const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
    const prompt = `오늘(${today}) 한국 증권·경제 뉴스 헤드라인입니다:
${finItems.map((h, i) => `${i + 1}. ${h.title}`).join("\n")}

[규칙]
- 주식·경제·기업·산업에 직접 영향을 주는 이슈만 선택하세요.
- 연예, 스포츠, 정치인 개인사, 사건·사고는 절대 포함하지 마세요.
- 관련 뉴스가 없으면 그 수만큼만 반환하세요 (5개 미만도 가능).
- 한국 주식 투자자 관점에서 중요한 순서로 정렬하세요.

아래 JSON 배열만 반환 (마크다운·설명 없이):
[
  {
    "rank": 1,
    "title": "이슈 제목 15자 이내",
    "summary": "한 줄 설명 30자 이내",
    "direction": "up",
    "sectors": [{ "name": "반도체", "impact": "positive" }],
    "relatedStocks": ["삼성전자", "SK하이닉스"]
  }
]
direction: 호재→"up", 악재→"down", 혼재→"mixed"
sectors 최대 3개, relatedStocks 최대 4개`;

    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      rawIssues = parsed.filter(
        (item): item is typeof rawIssues[0] =>
          typeof item === "object" && item !== null &&
          "rank" in item && "title" in item && "direction" in item
      );
    }
  } catch {
    // Gemini 실패 시 finItems에서 단순 구성
    rawIssues = finItems.slice(0, 5).map((item, i) => ({
      rank: i + 1, title: item.title.slice(0, 15), summary: item.title.slice(0, 35),
      direction: "mixed" as const, sectors: [], relatedStocks: [],
    }));
  }

  // sourceItems 매칭
  const issues: MarketIssue[] = rawIssues.map(issue => ({
    ...issue,
    sourceItems: matchSources(issue.title, issue.summary, finItems),
  }));

  const result: IssueCache = {
    issues, fetchedAt: new Date().toISOString(), sourceCount: finItems.length,
  };
  issueCache = result;
  issueCacheTime = Date.now();

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
