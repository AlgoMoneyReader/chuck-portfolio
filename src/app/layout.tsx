import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import PricePoller from "@/components/PricePoller";

export const metadata: Metadata = {
  title: "알읽남 — 투자 대시보드",
  description: "실시간 시장 데이터 · 포트폴리오 관리 · AI 종목 분석",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased bg-navy min-h-screen">
        {/* 전역 실시간 시세 폴링 — 렌더링 없음, 5초마다 Zustand 스토어 업데이트 */}
        <PricePoller />
        <Navbar />
        {children}
      </body>
    </html>
  );
}
