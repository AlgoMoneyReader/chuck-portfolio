import type { Metadata } from "next";
import { STOCK_MASTER } from "@/lib/stockMaster";

// 링크 미리보기 제목: '삼성전자(005930) 시세 · 알읽남 증시 레이더'
export function generateMetadata({ params }: { params: { code: string } }): Metadata {
  const code = decodeURIComponent(params.code).toUpperCase();
  const name = STOCK_MASTER.find(s => s.code === code)?.name;
  const title = `${name ? `${name}(${code})` : code} 시세 · 알읽남 증시 레이더`;
  const description = "실시간 시세 · 외국인·기관 수급 · 뉴스 · 공시 · AI 분석";
  return { title, description, openGraph: { title, description, type: "website" }, twitter: { card: "summary_large_image", title, description } };
}

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
