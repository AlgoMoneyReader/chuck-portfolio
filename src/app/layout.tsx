import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

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
        <Navbar />
        {children}
      </body>
    </html>
  );
}
