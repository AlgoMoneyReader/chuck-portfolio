import LiveMarketPulse from "@/components/LiveMarketPulse";
import AdminLogout from "@/components/AdminLogout";
import DeadlineCountdown from "@/components/DeadlineCountdown";
import PortfolioManager from "@/components/PortfolioManager";

export default function AdminPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      {/* 운영자 전용 배지 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-gold/20 border border-gold/40 text-gold text-xs font-bold rounded-full">
            🔒 운영자 전용 대시보드
          </span>
          <span className="text-xs text-gray-500">래미안 엘라비네 자금 조달 현황</span>
        </div>
        <AdminLogout />
      </div>

      {/* 실시간 시장 현황 */}
      <LiveMarketPulse />

      {/* 분양대금 납입 현황 */}
      <DeadlineCountdown />

      {/* 포트폴리오 + 자금계획 분석 */}
      <PortfolioManager />

      <footer className="text-center text-xs text-gray-600 py-4 border-t border-navy-border">
        알읽남 Investment Dashboard · Admin View
      </footer>
    </main>
  );
}
