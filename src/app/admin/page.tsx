import AdminGate from "@/components/AdminGate";
import AdminHealth from "@/components/AdminHealth";
import AdminStats from "@/components/AdminStats";
import AdminErrors from "@/components/AdminErrors";
import DeadlineCountdown from "@/components/DeadlineCountdown";
import PortfolioManager from "@/components/PortfolioManager";
import AdminConsole from "@/components/AdminConsole";

export default function AdminPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <AdminGate>
      {/* 운영자 전용 배지 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-gold/20 border border-gold/40 text-gold text-xs font-bold rounded-full">
            🔒 운영자 전용 대시보드
          </span>
          <span className="text-xs text-gray-500">래미안 엘라비네 자금 조달 현황</span>
        </div>
      </div>

      {/* 방문자 · 인기 종목 · 알림 구독 */}
      <AdminStats />

      {/* 회원 · AI 사용 현황 */}
      <AdminConsole />

      {/* 사용자 화면 오류 */}
      <AdminErrors />

      {/* 서버 설정 점검 */}
      <AdminHealth />

      {/* 분양대금 납입 현황 */}
      <DeadlineCountdown />

      {/* 포트폴리오 + 자금계획 분석 */}
      <PortfolioManager />

      <footer className="text-center text-xs text-gray-600 py-4 border-t border-navy-border">
        알읽남 증시 레이더 · Admin View
      </footer>
      </AdminGate>
    </main>
  );
}
