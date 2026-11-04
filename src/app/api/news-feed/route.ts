import { NextResponse } from "next/server";
import master from "@/data/stock_master.json";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

export type NewsCategory = "거시경제" | "국내증시" | "국내기업" | "정책·이슈" | "해외증시";

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  category: NewsCategory;
  stocks: { code: string; name: string; market: "KS" | "KQ" }[];
}

interface Feed { url: string; source: string; defaultCat: NewsCategory; marketOnly?: boolean; google?: boolean }

const FEEDS: Feed[] = [
  { url: "https://kr.investing.com/rss/news_25.rss", source: "Investing.com", defaultCat: "해외증시", marketOnly: true },
  { url: "https://kr.investing.com/rss/news_14.rss", source: "Investing.com", defaultCat: "거시경제", marketOnly: true },
  { url: "https://kr.investing.com/rss/news_1.rss",  source: "Investing.com", defaultCat: "거시경제", marketOnly: true },
  { url: "https://rss.mk.co.kr/rss/30200030/",       source: "매일경제",      defaultCat: "국내증시" },
  { url: "https://rss.mk.co.kr/rss/30200031/",       source: "매일경제",      defaultCat: "국내기업" },
  { url: "https://www.hankyung.com/feed/finance",    source: "한국경제",      defaultCat: "국내증시" },
  { url: "https://www.hankyung.com/feed/economy",    source: "한국경제",      defaultCat: "거시경제" },
  { url: "https://www.yna.co.kr/rss/economy.xml",    source: "연합뉴스",      defaultCat: "거시경제" },
  // 자체 RSS 가 불안정한 매체는 구글 뉴스 검색 RSS 로 (최근 1일, 매체 사이트 한정)
  { url: gnews("site:fnnews.com 증권 OR 증시 OR 주가 when:1d"), source: "파이낸셜뉴스", defaultCat: "국내증시", google: true },
  { url: gnews("site:biz.chosun.com when:1d"),                  source: "조선비즈",     defaultCat: "국내기업", google: true },
  { url: gnews("site:mt.co.kr 증시 OR 주가 when:1d"),           source: "머니투데이",   defaultCat: "국내증시", google: true },
  { url: gnews("site:sedaily.com 증권 OR 증시 when:1d"),        source: "서울경제",     defaultCat: "국내증시", google: true },
  { url: gnews("site:reuters.com markets when:1d", "en"),       source: "로이터",       defaultCat: "해외증시", google: true, marketOnly: true },
];

function gnews(q: string, lang: "ko" | "en" = "ko"): string {
  const loc = lang === "ko" ? "hl=ko&gl=KR&ceid=KR:ko" : "hl=en-US&gl=US&ceid=US:en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${loc}`;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 일반 경제·사회 기사는 빼고 시장에 직접 영향이 있는 헤드라인만 (Investing.com 피드는 전부 시장 기사라 통과)
const MARKET_RE = /주가|증시|코스피|코스닥|지수|상장|공모|IPO|주식|ETF|채권|국채|금리|연준|FOMC|환율|달러|원화|엔화|유가|원유|실적|영업이익|매출|순이익|목표가|외국인|기관|순매수|순매도|공매도|시가총액|배당|자사주|증자|수주|반도체|2차전지|배터리|엔비디아|나스닥|S&P|다우|밸류업|물가|CPI|고용지표|GDP|수출|관세|인수|합병|비트코인|가상자산/;

const EXCLUDE = ["연예", "드라마", "영화", "가수", "배우", "아이돌", "야구", "축구", "농구", "살인", "폭행", "성범죄", "날씨"];

// 순서대로 검사, 처음 맞는 분류 사용. 해외 키워드가 국내 증시 키워드보다 먼저
const RULES: [NewsCategory, RegExp][] = [
  ["정책·이슈", /정부|금융위|금감원|국회|법안|규제|세제|과세|공매도|밸류업|정책|대통령|선거/],
  ["해외증시", /미국|뉴욕|나스닥|S&P|다우|월가|엔비디아|테슬라|애플|중국|일본|유럽|홍콩|닛케이/],
  ["거시경제", /금리|연준|Fed|FOMC|한은|기준금리|물가|CPI|고용|GDP|환율|달러|유가|국채|인플레/],
  ["국내증시", /코스피|코스닥|증시|외국인|기관|순매수|순매도|지수|상한가|하한가|공모주|IPO/],
  ["국내기업", /실적|영업이익|매출|수주|인수|합병|투자|목표가|공장|출시|계약/],
];

function classify(title: string, fallback: NewsCategory): NewsCategory {
  for (const [cat, re] of RULES) if (re.test(title)) return cat;
  return fallback;
}

// 종목명 매칭: 3글자 이상 이름 + 자주 쓰는 약칭
type Stock = { code: string; name: string; market: string; type?: string };
const STOCKS = (master as { stocks: Stock[] }).stocks
  .filter(s => s.name.length >= 3 && (s.market === "KS" || s.market === "KQ"))
  .sort((a, b) => b.name.length - a.name.length);
const ALIASES: [RegExp, string][] = [
  [/삼전|삼성전자/, "삼성전자"],
  [/하이닉스|SK하닉|삼전닉스/, "SK하이닉스"],
  [/현대차(?!증권)/, "현대자동차"],
  [/네이버/, "NAVER"],
  [/엘솔|LG엔솔/, "LG에너지솔루션"],
];
const BY_NAME = new Map((master as { stocks: Stock[] }).stocks.map(s => [s.name, s]));

function matchStocks(title: string): NewsItem["stocks"] {
  const found = new Map<string, NewsItem["stocks"][number]>();
  for (const [re, name] of ALIASES) {
    const s = BY_NAME.get(name);
    if (s && re.test(title)) found.set(s.code, { code: s.code, name: s.name, market: s.market as "KS" | "KQ" });
  }
  let rest = title;
  for (const s of STOCKS) {
    if (found.size >= 3) break;
    if (rest.includes(s.name)) {
      found.set(s.code, { code: s.code, name: s.name, market: s.market as "KS" | "KQ" });
      rest = rest.split(s.name).join(" ");
    }
  }
  return Array.from(found.values()).slice(0, 3);
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .trim();
}

function parseDate(s: string): string | null {
  if (!s) return null;
  let t = Date.parse(s);
  // Investing.com: "2026-11-04 05:30:00" (UTC)
  if (isNaN(t) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) t = Date.parse(s.replace(" ", "T") + "Z");
  return isNaN(t) ? null : new Date(t).toISOString();
}

async function fetchFeed(f: Feed): Promise<NewsItem[]> {
  const res = await fetch(f.url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*", "Accept-Language": "ko-KR,ko;q=0.9" },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const out: NewsItem[] = [];
  for (const m of Array.from(xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/g))) {
    const block = m[1];
    const rawTitle = decode(/<title[^>]*>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? "");
    const title = f.google ? rawTitle.replace(/\s+-\s+[^-]+$/, "") : rawTitle;
    const url = decode(/<link[^>]*>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? /<link[^>]+href="([^"]+)"/.exec(block)?.[1] ?? "");
    const date = decode(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1] ?? /<dc:date>([\s\S]*?)<\/dc:date>/.exec(block)?.[1] ?? "");
    if (title.length < 8 || !url || EXCLUDE.some(w => title.includes(w))) continue;
    const stocks = matchStocks(title);
    if (!f.marketOnly && !stocks.length && !MARKET_RE.test(title)) continue;
    out.push({
      title,
      url,
      source: f.source,
      publishedAt: parseDate(date),
      category: classify(title, f.defaultCat),
      stocks,
    });
  }
  return out;
}

let cache: { at: number; body: object } | null = null;
const TTL = 5 * 60 * 1000;

export async function GET(request: Request) {
  const bypass = new URL(request.url).searchParams.get("bypass");
  if (!bypass && cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body);

  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const sourceStats: Record<string, number | string> = {};
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  results.forEach((r, i) => {
    const f = FEEDS[i];
    if (r.status === "rejected") {
      if (!(f.source in sourceStats)) sourceStats[f.source] = `실패 (${String(r.reason).slice(0, 40)})`;
      return;
    }
    const prev = typeof sourceStats[f.source] === "number" ? (sourceStats[f.source] as number) : 0;
    sourceStats[f.source] = prev + r.value.length;
    for (const it of r.value) {
      const key = it.title.replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
    }
  });

  items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const body = { items: items.slice(0, 120), sourceStats, fetchedAt: new Date().toISOString() };
  if (items.length) cache = { at: Date.now(), body };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
