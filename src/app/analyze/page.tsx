import StockAnalyzer from "@/components/StockAnalyzer";

export default function AnalyzePage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">AI 종목 분석</h1>
        <p className="text-sm text-gray-400 mt-1">
          종목을 입력하면 펀드매니저급 리서치 보고서를 즉시 생성합니다
        </p>
      </div>
      <StockAnalyzer />
    </main>
  );
}
