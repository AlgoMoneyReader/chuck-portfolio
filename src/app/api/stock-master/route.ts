import { NextResponse } from "next/server";
import { STOCK_MASTER_FILTERED } from "@/lib/stockMaster";

export const dynamic = "force-dynamic";

// ── 마스터 버전 태그 ──────────────────────────────────────────────────────────
// 종목 코드 변경 시 이 값을 올려 브라우저 캐시를 즉시 무효화
const MASTER_VERSION = "2026.05.12.1";

export async function GET() {
  return NextResponse.json(
    { version: MASTER_VERSION, stocks: STOCK_MASTER_FILTERED },
    {
      headers: {
        // 서버 측: 60초 후 재검증 / 브라우저·CDN: 절대 stale 반환 금지
        "Cache-Control": "public, max-age=60, stale-while-revalidate=30, must-revalidate",
        "X-Master-Version": MASTER_VERSION,
      },
    }
  );
}
