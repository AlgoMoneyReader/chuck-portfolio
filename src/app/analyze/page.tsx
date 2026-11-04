import StockSearchPanel from "@/components/StockSearchPanel";
import RequireLogin from "@/components/RequireLogin";

interface Props {
  searchParams: { ticker?: string; name?: string };
}

// 레이더(AI 종목분석) = 종목 검색 + 차트 + 수급 + AI 레이더 분석
export default function AnalyzePage({ searchParams }: Props) {
  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">AI 레이더 분석</h1>
        <p className="text-sm text-gray-400 mt-1">
          수급·흐름 신호(레이더)와 실적·밸류·뉴스(AI)를 합쳐 매수/관망/매도 판단과 대응 전략을 드립니다 · 회원 하루 5회
        </p>
      </div>
      <RequireLogin title="AI 레이더 분석은 로그인 후 이용할 수 있습니다">
        <StockSearchPanel initialTicker={searchParams.ticker ?? ""} initialName={searchParams.name ?? ""} />
      </RequireLogin>
    </main>
  );
}
