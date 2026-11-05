"use client";

import StockView from "@/components/StockView";

// 종목 상세 전체 화면 — 국내 6자리 코드, 미국은 티커(/stock/AAPL)
export default function StockPage({ params }: { params: { code: string } }) {
  return (
    <main>
      <StockView code={decodeURIComponent(params.code)} />
    </main>
  );
}
