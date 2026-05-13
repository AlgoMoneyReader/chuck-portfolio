/**
 * GET /api/stock-master
 *
 * 정적 JSON 파일(src/data/stock_master.json) 서빙
 * KIS API 호출 없음 — KRX KIND에서 수집한 KOSPI+KOSDAQ 전종목
 *
 * 업데이트: scripts/generate-stock-master.py 실행 후 커밋
 */

import { NextResponse } from "next/server";
import stockMaster from "@/data/stock_master.json";

export const dynamic = "force-static"; // 정적 응답 캐시

export async function GET() {
  return NextResponse.json(
    {
      version: stockMaster.generated,
      source: "krx-kind-static",
      total: stockMaster.total,
      stocks: stockMaster.stocks,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "X-Stock-Count": String(stockMaster.total),
        "X-Source": "krx-kind-static",
      },
    }
  );
}
