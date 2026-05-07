"use client";

import { useState } from "react";

interface AnalysisResult {
  analysis: string;
  ticker: string;
  companyName: string;
  timestamp: string;
}

const QUICK_PICKS = [
  { ticker: "005930.KS", name: "삼성전자" },
  { ticker: "000660.KS", name: "SK하이닉스" },
  { ticker: "316140.KS", name: "우리금융지주" },
  { ticker: "NVDA", name: "엔비디아" },
  { ticker: "GOOGL", name: "알파벳" },
  { ticker: "TSLA", name: "테슬라" },
];

function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return <h2 key={i} className="text-gold font-bold text-base mt-6 mb-2 border-b border-gold/20 pb-1">{line.slice(3)}</h2>;
        }
        if (line.startsWith("### ")) {
          return <h3 key={i} className="text-cyan-brand font-semibold text-sm mt-4 mb-1">{line.slice(4)}</h3>;
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return <p key={i} className="font-bold text-white text-sm my-1">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith("- ")) {
          const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
          return <li key={i} className="text-gray-300 text-sm ml-4 my-0.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: content }} />;
        }
        if (line.startsWith("---")) {
          return <hr key={i} className="border-navy-border my-4" />;
        }
        if (line.trim() === "") {
          return <br key={i} />;
        }
        const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
        return <p key={i} className="text-gray-300 text-sm leading-relaxed my-1" dangerouslySetInnerHTML={{ __html: formatted }} />;
      })}
    </div>
  );
}

export default function StockAnalyzer() {
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [thesis, setThesis] = useState("");
  const [goal, setGoal] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    if (!ticker && !companyName) {
      setError("티커 또는 종목명을 입력하세요");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, companyName, thesis, goal }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "분석 실패");
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  function applyQuickPick(q: { ticker: string; name: string }) {
    setTicker(q.ticker);
    setCompanyName(q.name);
  }

  return (
    <div className="space-y-4">
      {/* Input Card */}
      <div className="card space-y-4">
        <h2 className="card-title">분석 설정</h2>

        {/* Quick Picks */}
        <div>
          <p className="text-xs text-gray-500 mb-2">빠른 선택</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PICKS.map((q) => (
              <button key={q.ticker} onClick={() => applyQuickPick(q)}
                className={`px-3 py-1 text-xs rounded-full border transition-all ${
                  ticker === q.ticker
                    ? "border-gold text-gold bg-gold/10"
                    : "border-navy-border text-gray-400 hover:border-gray-500 hover:text-gray-300"
                }`}>
                {q.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">티커</label>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="005930 / NVDA / 000660.KS"
              className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">종목명 (선택)</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="삼성전자"
              className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">투자 논거 (선택)</label>
            <input
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="HBM 수요 급증으로 매출 고성장 기대"
              className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">분석 목표 (선택)</label>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="6개월 내 매수/보유/매도 결정"
              className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none"
            />
          </div>
        </div>

        {error && <p className="text-signal-red text-sm">{error}</p>}

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full py-3 bg-gold text-navy font-bold rounded-xl hover:bg-gold-light transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-navy/40 border-t-navy rounded-full animate-spin" />
              AI 분석 중... (15~30초 소요)
            </span>
          ) : (
            "◎ AI 리서치 보고서 생성"
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white text-lg">{result.companyName} 분석 리포트</h2>
              <p className="text-xs text-gray-500 num">{result.ticker} · {new Date(result.timestamp).toLocaleString("ko-KR")}</p>
            </div>
            <button
              onClick={() => {
                const blob = new Blob([result.analysis], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${result.ticker}_분석.txt`;
                a.click();
              }}
              className="text-xs text-gray-500 hover:text-gold border border-navy-border hover:border-gold px-3 py-1.5 rounded-lg transition-all"
            >
              ↓ 저장
            </button>
          </div>
          <div className="border-t border-navy-border pt-4">
            <MarkdownRenderer text={result.analysis} />
          </div>
        </div>
      )}

      {/* Usage hint */}
      {!result && !loading && (
        <div className="card bg-navy-sub/50 border-dashed">
          <p className="text-xs text-gray-600 text-center leading-relaxed">
            Claude Sonnet 4.6이 실시간 시장 지식을 바탕으로<br />
            5개 섹션 (기본분석 · 논거검증 · 매크로 · 촉매 · 투자요약) 리포트를 생성합니다
          </p>
        </div>
      )}
    </div>
  );
}
