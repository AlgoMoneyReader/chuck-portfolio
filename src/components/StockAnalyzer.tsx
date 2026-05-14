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

// ── 마크다운 → HTML (프린트용) ────────────────────────────────────────────────
function markdownToHTML(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith("## ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h2>${line.slice(3)}</h2>`);
    } else if (line.startsWith("### ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h3>${line.slice(4)}</h3>`);
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      const content = line.slice(2)
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      out.push(`<li>${content}</li>`);
    } else if (line === "---") {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push("<hr>");
    } else if (line === "") {
      if (inList) { out.push("</ul>"); inList = false; }
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      const formatted = line
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>");
      out.push(`<p>${formatted}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

// ── 추천 추출 ────────────────────────────────────────────────────────────────
function extractRecommendation(text: string): { label: string; color: string } {
  const m = text.match(/최종 추천[^:：]*[:：]\s*\*{0,2}(매수|보유|매도|Buy|Hold|Sell)\*{0,2}/i);
  const label = m?.[1] ?? "";
  if (!label) return { label: "", color: "#6b7280" };
  if (/매수|Buy/i.test(label)) return { label, color: "#16a34a" };
  if (/매도|Sell/i.test(label)) return { label, color: "#dc2626" };
  return { label, color: "#d97706" };
}

// ── PDF 프린트 창 생성 ────────────────────────────────────────────────────────
function printReport(result: AnalysisResult) {
  const { analysis, companyName, ticker, timestamp } = result;
  const date = new Date(timestamp).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
  const rec = extractRecommendation(analysis);
  const bodyHTML = markdownToHTML(analysis);

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${companyName} 리서치 리포트</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
  @page { margin: 18mm 22mm; size: A4; }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
    font-size: 10pt;
    line-height: 1.7;
    color: #1a1a1a;
    background: #fff;
  }

  /* ── 헤더 ── */
  .rp-header {
    border-bottom: 3px solid #1a3a5c;
    padding-bottom: 14px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .rp-brand {
    font-size: 8pt;
    color: #6b7280;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-weight: 500;
  }
  .rp-company {
    font-size: 20pt;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.2;
    margin-top: 6px;
  }
  .rp-meta {
    font-size: 8.5pt;
    color: #6b7280;
    margin-top: 4px;
  }
  .rp-rating {
    font-size: 14pt;
    font-weight: 700;
    color: #fff;
    background: ${rec.color};
    padding: 8px 20px;
    border-radius: 6px;
    text-align: center;
    min-width: 80px;
    letter-spacing: 0.03em;
  }

  /* ── 섹션 ── */
  h2 {
    font-size: 11pt;
    font-weight: 700;
    color: #1a3a5c;
    border-left: 4px solid #1a3a5c;
    padding: 5px 0 5px 10px;
    margin: 22px 0 10px;
    background: #f0f6ff;
    page-break-after: avoid;
  }
  h3 {
    font-size: 10pt;
    font-weight: 700;
    color: #374151;
    margin: 14px 0 6px;
    page-break-after: avoid;
  }
  p {
    font-size: 10pt;
    color: #374151;
    margin: 5px 0;
  }
  ul {
    margin: 6px 0 10px 18px;
    padding: 0;
  }
  li {
    font-size: 10pt;
    color: #374151;
    margin: 4px 0;
    line-height: 1.65;
  }
  li::marker { color: #1a3a5c; }
  strong { color: #0f172a; font-weight: 700; }
  em { font-style: italic; color: #4b5563; }
  hr {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 18px 0;
  }

  /* ── 면책 footer ── */
  .rp-footer {
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    font-size: 7.5pt;
    color: #9ca3af;
    line-height: 1.5;
  }

  /* ── 프린트 최적화 ── */
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2 { page-break-before: auto; }
    .rp-header { page-break-after: avoid; }
  }
</style>
</head>
<body>

<div class="rp-header">
  <div>
    <div class="rp-brand">알읽남 Investment Research · AI-Powered Report</div>
    <div class="rp-company">${companyName}</div>
    <div class="rp-meta">${ticker} &nbsp;|&nbsp; 발행일: ${date}</div>
  </div>
  ${rec.label ? `<div class="rp-rating">${rec.label}</div>` : ""}
</div>

${bodyHTML}

<div class="rp-footer">
  이 리포트는 알읽남 AI 분석 시스템(Gemini 2.5 Flash + Google Search Grounding)이 생성한 자료입니다.
  투자 의사결정의 참고 자료로만 활용하시기 바라며, 실제 투자에 따른 손익은 투자자 본인에게 귀속됩니다.
  본 리포트의 정보는 공개된 자료를 기반으로 하며, 투자 권유를 목적으로 하지 않습니다.
  © 알읽남 Investment Dashboard · ${date}
</div>

<script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=800");
  if (!w) { alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요."); return; }
  w.document.write(html);
  w.document.close();
}

// ── 마크다운 렌더러 (화면 표시용) ────────────────────────────────────────────
function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="text-sm font-bold text-white mt-6 mb-2 pt-2 pb-1.5 px-3
              border-l-4 border-cyan-brand bg-navy-sub/60 rounded-r-lg first:mt-0">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <h3 key={i} className="text-sm font-semibold text-cyan-brand/90 mt-4 mb-1">
              {line.slice(4)}
            </h3>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
          return (
            <div key={i} className="flex gap-2 ml-1">
              <span className="text-cyan-brand/60 mt-1.5 shrink-0 text-xs">›</span>
              <p className="text-gray-300 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: content }} />
            </div>
          );
        }
        if (line.startsWith("---")) {
          return <hr key={i} className="border-navy-border/60 my-3" />;
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
        return (
          <p key={i} className="text-gray-300 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatted }} />
        );
      })}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
interface StockAnalyzerProps {
  initialTicker?: string;
  initialName?: string;
}

export default function StockAnalyzer({ initialTicker = "", initialName = "" }: StockAnalyzerProps) {
  const [ticker, setTicker] = useState(initialTicker);
  const [companyName, setCompanyName] = useState(initialName);
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
          {/* 리포트 헤더 */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-white text-lg leading-tight">{result.companyName}</h2>
              <p className="text-xs text-gray-500 num mt-0.5">
                {result.ticker} · {new Date(result.timestamp).toLocaleDateString("ko-KR", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </p>
              {/* 추천 배지 */}
              {(() => {
                const rec = extractRecommendation(result.analysis);
                if (!rec.label) return null;
                const cls = /매수|Buy/i.test(rec.label)
                  ? "bg-signal-green/20 text-signal-green border-signal-green/40"
                  : /매도|Sell/i.test(rec.label)
                  ? "bg-signal-red/20 text-signal-red border-signal-red/40"
                  : "bg-gold/20 text-gold border-gold/40";
                return (
                  <span className={`inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded border ${cls}`}>
                    최종 추천: {rec.label}
                  </span>
                );
              })()}
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => printReport(result)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gold border border-navy-border hover:border-gold px-3 py-1.5 rounded-lg transition-all"
                title="PDF로 저장 (브라우저 인쇄 → PDF 저장)"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
                </svg>
                PDF 저장
              </button>
            </div>
          </div>

          {/* 구분선 + 리포트 본문 */}
          <div className="border-t border-navy-border/60 pt-4">
            <MarkdownRenderer text={result.analysis} />
          </div>

          {/* AI 정보 */}
          <p className="text-[10px] text-gray-600 pt-2 border-t border-navy-border/30">
            Gemini 2.5 Flash · Google Search Grounding · 실시간 웹 검색 반영
          </p>
        </div>
      )}

      {/* Usage hint */}
      {!result && !loading && (
        <div className="card bg-navy-sub/50 border-dashed">
          <p className="text-xs text-gray-600 text-center leading-relaxed">
            Gemini 2.5 Flash + Google Search Grounding으로<br />
            5개 섹션 (기본분석 · 논거검증 · 매크로 · 촉매 · 투자요약) 리포트를 생성합니다
          </p>
        </div>
      )}
    </div>
  );
}
