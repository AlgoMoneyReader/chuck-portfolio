import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chuck Portfolio — 알읽남 투자 대시보드",
  description: "Chuck의 개인 주식 포트폴리오 현황판",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased bg-navy min-h-screen">
        {children}
      </body>
    </html>
  );
}
