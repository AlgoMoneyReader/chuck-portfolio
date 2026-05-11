import LiveMarketPulse from "@/components/LiveMarketPulse";
import MarketSummary from "@/components/MarketSummary";
import Link from "next/link";

const FEATURES = [
  {
    href: "/portfolio",
    icon: "◉",
    title: "포트폴리오 관리",
    desc: "보유 종목 입력 시 실시간 손익 자동 계산. 국내·해외 통합 관리.",
    color: "border-cyan-brand/30 hover:border-cyan-brand",
    badge: "무료",
    badgeColor: "text-cyan-brand bg-cyan-brand/10",
  },
  {
    href: "/analyze",
    icon: "◎",
    title: "AI 종목 분석",
    desc: "티커 입력 시 펀드매니저급 리서치 보고서 즉시 생성. 매수/보유/매도 추천.",
    color: "border-gold/30 hover:border-gold",
    badge: "AI",
    badgeColor: "text-gold bg-gold/10",
  },
];

export default function Home() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-8 animate-fade-in">

      {/* 실시간 시장 */}
      <LiveMarketPulse />

      {/* 국내 시장 동향 */}
      <MarketSummary />

      {/* 히어로 */}
      <div className="text-center space-y-3 py-4">
        <h1 className="text-3xl font-bold text-white">
          알고리즘이 읽어주는 돈
        </h1>
        <p className="text-gray-400 text-sm max-w-xl mx-auto leading-relaxed">
          실시간 시장 데이터 · AI 종목 분석 · 포트폴리오 손익 추적<br />
          투자 의사결정에 필요한 모든 것을 한 곳에서
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

      {/* 오늘의 시장 코멘트 */}
      <div className="card bg-navy-sub/50">
        <h2 className="card-title mb-3">알읽남 채널 소개</h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-4">
          국내외 증시 핵심 정보를 AI와 함께 분석하는 투자 채널입니다.<br />
          복잡한 시장 데이터를 누구나 이해할 수 있는 인사이트로 전달합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {["실시간 시황", "AI 종목 분석", "포트폴리오 전략", "퀀트 투자", "ETF 분석"].map((tag) => (
            <span key={tag} className="text-xs px-3 py-1 bg-navy-card border border-navy-border rounded-full text-gray-400">
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
