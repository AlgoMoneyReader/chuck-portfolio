import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomTabBar from "@/components/BottomTabBar";
import TourGuide from "@/components/TourGuide";
import InstallGuide from "@/components/InstallGuide";
import VisitTracker from "@/components/VisitTracker";
import ErrorReporter from "@/components/ErrorReporter";
import MarketTicker from "@/components/MarketTicker";
import StickyHeader from "@/components/StickyHeader";
import { AuthProvider } from "@/components/AuthProvider";
import { StockModalProvider } from "@/components/StockModal";
import { ThemeProvider } from "@/lib/theme";
import { THEME_INIT_SCRIPT, FONT_INIT_SCRIPT } from "@/lib/themeScript";

export const metadata: Metadata = {
  metadataBase: new URL("https://alliknam.vercel.app"),
  title: "알읽남 - 증시 레이더",
  description: "알고리즘이 읽어주는 시장 · 실시간 수급·시황·뉴스·실적 캘린더",
  openGraph: { title: "알읽남 - 증시 레이더", description: "알고리즘이 읽어주는 시장 · 실시간 수급·시황·뉴스·실적 캘린더", siteName: "알읽남 증시 레이더", locale: "ko_KR", type: "website" },
  twitter: { card: "summary_large_image", title: "알읽남 - 증시 레이더", description: "알고리즘이 읽어주는 시장 · 실시간 수급·시황·뉴스·실적 캘린더" },
  applicationName: "알읽남",
  keywords: ["주식", "증시", "코스피", "코스닥", "나스닥", "실시간 시세", "외국인 순매수", "기관 수급", "NXT", "애프터마켓", "경제 캘린더", "알읽남"],
  // 검색엔진 소유 확인: Vercel 환경변수에 값만 넣으면 됨 (네이버 서치어드바이저 · 구글 서치콘솔 'HTML 태그' 방식의 content 값)
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NAVER_SITE_VERIFICATION ? { "naver-site-verification": process.env.NAVER_SITE_VERIFICATION } : undefined,
  },
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
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 저장된 화면 테마(다크/라이트)를 첫 페인트 전에 적용 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: FONT_INIT_SCRIPT }} />
        {/* 글꼴은 CSS @import 대신 link 로: 빌드 CSS 에서 @import 가 다른 규칙 뒤로 밀리면 브라우저가 무시한다 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="antialiased bg-navy min-h-screen pb-24">
        {/* 전역 실시간 시세 폴링 — 렌더링 없음, 5초마다 Zustand 스토어 업데이트 */}
        <AuthProvider>
          <ThemeProvider>
           <StockModalProvider>
            <StickyHeader>
              <Navbar />
              <MarketTicker />
            </StickyHeader>
            {children}
            <BottomTabBar />
            <TourGuide />
            <InstallGuide />
            <VisitTracker />
            <ErrorReporter />
           </StockModalProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
