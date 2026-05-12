import StockAnalyzer from "@/components/StockAnalyzer";

interface Props {
  // Next.js App Router: searchParams는 서버 컴포넌트에서 동기적으로 접근 가능
  searchParams: { ticker?: string; name?: string };
}

export default function AnalyzePage({ searchParams }: Props) {
  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">AI 종목 분석</h1>
        <p className="text-sm text-gray-400 mt-1">
          종목을 입력하면 펀드매니저급 리서치 보고서를 즉시 생성합니다
        </p>
      </div>
      {/* initialTicker / initialName: 쌍끌이 위젯·섹터 모달에서 종목 클릭 시 자동 채워짐 */}
      <StockAnalyzer
        initialTicker={searchParams.ticker ?? ""}
        initialName={searchParams.name ?? ""}
      />
    </main>
  );
}
