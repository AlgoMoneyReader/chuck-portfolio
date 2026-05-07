import PortfolioManager from "@/components/PortfolioManager";

export default function PortfolioPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">포트폴리오 관리</h1>
        <p className="text-sm text-gray-400 mt-1">보유 종목을 입력하면 실시간 손익을 자동 계산합니다</p>
      </div>
      <PortfolioManager />
    </main>
  );
}
