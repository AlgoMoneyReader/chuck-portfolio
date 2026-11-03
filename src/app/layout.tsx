import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import PricePoller from "@/components/PricePoller";
import BottomTabBar from "@/components/BottomTabBar";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "알읽남 — 투자 대시보드",
  description: "실시간 시장 데이터 · 포트폴리오 관리 · AI 종목 분석",
  applicationName: "알읽남",
  appleWebApp: { capable: true, title: "알읽남", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#04091A",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 글꼴은 CSS @import 대신 link 로: 빌드 CSS 에서 @import 가 다른 규칙 뒤로 밀리면 브라우저가 무시한다 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="antialiased bg-navy min-h-screen pb-24">
        {/* 전역 실시간 시세 폴링 — 렌더링 없음, 5초마다 Zustand 스토어 업데이트 */}
        <PricePoller />
        <AuthProvider>
          <Navbar />
          {children}
          <BottomTabBar />
        </AuthProvider>
      </body>
    </html>
  );
}
