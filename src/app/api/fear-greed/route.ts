import { NextResponse } from "next/server";

// CNN Fear & Greed Index (비공개 API, 변경될 수 있음)
const CNN_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

export interface FearGreedData {
  score: number;           // 0~100
  rating: string;          // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
  ratingKo: string;
  prevClose: number;
  oneWeekAgo: number;
  oneMonthAgo: number;
  oneYearAgo: number;
  timestamp: string;
}

const RATING_KO: Record<string, string> = {
  "Extreme Fear": "극도 공포",
  "Fear": "공포",
  "Neutral": "중립",
  "Greed": "탐욕",
  "Extreme Greed": "극도 탐욕",
};

export async function GET() {
  try {
    const res = await fetch(CNN_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://edition.cnn.com/markets/fear-and-greed",
      },
      next: { revalidate: 300 }, // 5분 캐시
    });

    if (!res.ok) throw new Error(`CNN API ${res.status}`);
    const json = await res.json();
    const fg = json?.fear_and_greed;
    if (!fg) throw new Error("No data");

    const data: FearGreedData = {
      score: Math.round(fg.score),
      rating: fg.rating ?? "Unknown",
      ratingKo: RATING_KO[fg.rating] ?? fg.rating ?? "알 수 없음",
      prevClose: Math.round(fg.previous_close ?? fg.score),
      oneWeekAgo: Math.round(fg.previous_1_week ?? fg.score),
      oneMonthAgo: Math.round(fg.previous_1_month ?? fg.score),
      oneYearAgo: Math.round(fg.previous_1_year ?? fg.score),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Fear & Greed 데이터를 불러올 수 없습니다", detail: String(err) }, { status: 500 });
  }
}
