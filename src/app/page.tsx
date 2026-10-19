import LiveMarketPulse from "@/components/LiveMarketPulse";
import MarketSummary from "@/components/MarketSummary";
import StockSearchPanel from "@/components/StockSearchPanel";
import DualBuyWidget from "@/components/DualBuyWidget";
import MarketIssueWidget from "@/components/MarketIssueWidget";
import Link from "next/link";

const FEATURES = [
  {
    href: "/portfolio",
    icon: "◉",
    title: "포트폴리오 관리",
    desc: "보유 종목 입력하면 실시간 손익 자동 계산. 국내·해외 통합 관리.",
    color: "border-cyan-brand/30 hover:border-cyan-brand",
    badge: "무료",
    badgeColor: "text-cyan-brand bg-cyan-brand/10",
  },
  {
    href: "/analyze",
    icon: "◎",
    title: "AI 종목 분석",
    desc: "티커 하나면 펀드매니저급 리서치 보고서 즉시 생성. 매수·보유·매도 의견까지.",
    color: "border-gold/30 hover:border-gold",
    badge: "AI",
    badgeColor: "text-gold bg-gold/10",
  },
];

export default function Home() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 animate-fade-in space-y-6">

      {/* 실시간 시장 현황 */}
      <LiveMarketPulse />

      {/* 실시간 이슈 + 쌍끌이 — 2컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <MarketIssueWidget />
        </div>
        <div className="lg:col-span-2">
          <DualBuyWidget />
        </div>
      </div>

      {/* 종목 검색 + 수급 분석 */}
      <StockSearchPanel />

      {/* 시장 요약 */}
      <MarketSummary />

      {/* 히어로 */}
      <div className="text-center space-y-4 py-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric-blue/10 border border-electric-blue/30 text-xs text-cyan-brand font-semibold tracking-widest mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-brand animate-pulse" />
          ALGORITHM · AI · INVESTMENT
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight leading-tight">
          알고리즘으로 읽어주는 남자
        </h1>
        <p className="text-gray-400 text-sm max-w-lg mx-auto leading-relaxed">
          복잡한 시장, 알읽남이 먼저 읽어드립니다.<br />
          실시간 시황 · AI 종목 분석 · 포트폴리오 손익을 한 화면에서.
        </p>
      </div>

      {/* 기능 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href}
            className={`card border-2 ${f.color} transition-all group cursor-pointer`}>
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl text-gray-400 group-hover:text-white transition-colors">{f.icon}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.badgeColor}`}>{f.badge}</span>
            </div>
            <h2 className="text-white font-bold text-lg mb-1">{f.title}</h2>
            <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            <div className="mt-4 text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
              바로가기 →
            </div>
          </Link>
        ))}
      </div>

      {/* 채널 소개 */}
      <div className="card bg-navy-sub/50 border border-electric-blue/20">
        <h2 className="card-title mb-3">알읽남 채널 소개</h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-4">
          <span className="text-gold font-bold">알읽남</span>은 <span className="text-white font-semibold">알고리즘으로 읽어주는 남자</span>의 줄임말입니다.<br />
          매일 쏟아지는 뉴스와 시장 데이터를 AI가 분석해 핵심 인사이트만 전달합니다.<br />
          주식이 어렵게 느껴졌다면, 이제 알읽남과 함께 읽어보세요.
        </p>
        <div className="flex flex-wrap gap-2">
          {["실시간 시황", "AI 종목 분석", "포트폴리오 전략", "퀀트 투자", "ETF 분석"].map((tag) => (
            <span key={tag} className="text-xs px-3 py-1 bg-navy-card border border-navy-border rounded-full text-gray-400 hover:border-electric-blue/40 hover:text-gray-200 transition-colors cursor-default">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <footer className="text-center text-xs text-gray-600 py-4 border-t border-navy-border">
        알읽남 Investment Dashboard · Yahoo Finance 실시간 데이터 · Claude AI 분석
      </footer>
    </main>
  );
}
