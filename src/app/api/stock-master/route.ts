/**
 * GET /api/stock-master
 *
 * KIS 오픈 API 전페이지 순회로 수집한 전체 상장 종목 목록을 반환.
 * 하드코딩 데이터 일절 없음 — 순수 KIS API 연동.
 *
 * 응답 JSON:
 *   { version, source:"kis", total: N, stocks: [{ code, name, market, type }] }
 *   code  = 6자리 숫자 문자열 (예: "039490")
 *   market = "KS" | "KQ"
 *   (Yahoo Finance suffix .KS/.KQ 는 백엔드 내부 전용)
 */

import { NextResponse } from "next/server";
import { getKisMaster } from "@/lib/fetchKisMaster";

export const dynamic = "force-dynamic";

const VERSION = "2026.05.12.4";

export async function GET() {
  try {
    const stocks = await getKisMaster(["regular", "etf"]);

    console.log(
      `[/api/stock-master] v${VERSION} 응답: ${stocks.length}개`
    );

    return NextResponse.json(
      { version: VERSION, source: "kis", total: stocks.length, stocks },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=300",
          "X-Stock-Count": String(stocks.length),
          "X-Version": VERSION,
        },
      }
    );
  } catch (err) {
    const msg = String(err);
    console.error("[/api/stock-master] KIS 오류:", msg);

    // 환경변수 미설정 여부 알림
    if (msg.includes("KIS_APP_KEY")) {
      return NextResponse.json(
        {
          error: "KIS API 인증정보 미설정",
          detail:
            "Vercel 대시보드 → Settings → Environment Variables 에서 " +
            "KIS_APP_KEY, KIS_APP_SECRET 을 추가하세요.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "KIS API 조회 실패", detail: msg },
      { status: 502 }
    );
  }
}
