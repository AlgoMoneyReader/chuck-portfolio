import type { Metadata } from "next";
import { STOCK_MASTER } from "@/lib/stockMaster";
import { US_POPULAR } from "@/data/usPopular";

// 종목 화면의 검색·공유용 정보 (화면 자체는 브라우저에서 그려지므로, 검색엔진이 읽을 글은 여기서 서버가 넣는다)
function info(raw: string) {
  const code = decodeURIComponent(raw).toUpperCase();
  const kr = STOCK_MASTER.find(s => s.code === code);
  const us = US_POPULAR.find(s => s.code === code);
  const name = kr?.name ?? (us ? `${us.ko}(${us.name})` : undefined);
  const market = kr ? (kr.market === "KQ" ? "코스닥" : "코스피") : us ? "미국" : /^[0-9][0-9A-Z]{5}$/.test(code) ? "국내" : "해외";
  return { code, name, market, isKr: !!kr || /^[0-9][0-9A-Z]{5}$/.test(code) };
}

export function generateMetadata({ params }: { params: { code: string } }): Metadata {
  const { code, name, market, isKr } = info(params.code);
  const label = name ? `${name}${isKr ? `(${code})` : ""}` : code;
  const title = `${label} 주가 · 실시간 시세 · 수급 | 알읽남 증시 레이더`;
  const description = isKr
    ? `${label} 실시간 주가, 오늘 외국인·기관 순매수, 차트, 뉴스, 공시, AI 분석을 한 화면에서. ${market} 상장 종목.`
    : `${label} 실시간 주가, 프리·애프터마켓 시세, 차트, 뉴스, SEC 공시, AI 분석을 한 화면에서.`;
  return {
    title, description,
    keywords: [label, `${name ?? code} 주가`, `${name ?? code} 수급`, `${name ?? code} 외국인`, `${name ?? code} 뉴스`, "실시간 시세", "알읽남"],
    alternates: { canonical: `/stock/${encodeURIComponent(code)}` },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function StockLayout({ children, params }: { children: React.ReactNode; params: { code: string } }) {
  const { code, name, market, isKr } = info(params.code);
  return (
    <>
      {/* 검색엔진·화면낭독기용 요약 (화면에는 보이지 않음) */}
      <div className="sr-only">
        <h1>{name ?? code} {isKr ? `(${code})` : ""} 주가 · 실시간 시세</h1>
        <p>{name ?? code} {market} 종목의 실시간 주가, 등락률, 거래량, {isKr ? "외국인·기관·개인 순매수 수급, " : "프리마켓·애프터마켓 시세, "}일봉·분봉 차트, 최신 뉴스와 공시, AI 종목 분석을 알읽남 증시 레이더에서 확인하세요.</p>
      </div>
      {children}
    </>
  );
}
