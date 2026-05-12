/**
 * /api/stock-master
 *
 * 전체 상장 종목 목록 반환 (KIS volume-rank 전페이지 순회 → 정적 fallback)
 *
 * 응답 형식:
 *   { version, stocks: [{ code, name, market, type }], source, total }
 *   - code  : 6자리 숫자 문자열 (예: "039490")  ← ticker 포맷 기준
 *   - market: "KS" | "KQ"
 *   - .KS / .KQ suffix 는 Yahoo Finance 호출 시에만 백엔드에서 붙임
 */

import { NextResponse } from "next/server";
import { getKisMaster } from "@/lib/fetchKisMaster";

export const dynamic = "force-dynamic";

const MASTER_VERSION = "2026.05.12.3";

export async function GET() {
  const stocks = await getKisMaster(["regular", "etf"]);

  // 서버 콘솔에 총 종목 수 출력 (디버깅 + 사용자 요청)
  console.log(
    `[/api/stock-master] 응답 종목 수: ${stocks.length}개 (version ${MASTER_VERSION})`
  );

  return NextResponse.json(
    {
      version: MASTER_VERSION,
      stocks,
      total: stocks.length,
      source: "kis",
    },
    {
      headers: {
        // 브라우저는 1시간 캐시, CDN은 즉시 stale 시 재검증
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=300",
        "X-Master-Version": MASTER_VERSION,
        "X-Stock-Count": String(stocks.length),
      },
    }
  );
}
