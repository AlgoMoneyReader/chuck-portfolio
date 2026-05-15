"use client";

import { useEffect, useState } from "react";

// ── 타입 정의 ─────────────────────────────────────────────────────────────────
type Grade = "S" | "A" | "B" | "C" | "D" | "F";

interface FinMetric {
  label: string;
  formatted: string;
  grade: Grade;
  raw: number | null;
}

interface Valuation {
  trailingPE: string;
  forwardPE: string;
  pb: string;
  evEbitda: string;
  mktCap: string;
  divYield: string;
  fcf: string;
}

interface FinData {
  metrics: FinMetric[];
  valuation: Valuation;
  finScore: number;
  finGrade: Grade;
}

interface TechIndicator {
  key: string;
  value: number;
  grade: Grade;
  label: string;
  display: string;
}

interface TechData {
  indicators: TechIndicator[];
  techScore: number;
  techGrade: Grade;
}

interface InvData {
  foreign: number;
  institution: number;
  individual: number;
  foreign5D: number;
  foreign10D: number;
  foreign20D: number;
  institution5D: number;
  institution10D: number;
  institution20D: number;
  grade: string;
  score: number;
  comment: string;
  invDate: string;
  factors: { label: string; score: number; max: number; desc: string }[];
}

// ── 지표 설명 사전 ─────────────────────────────────────────────────────────────
const TECH_DESC: Record<string, string> = {
  tv5_20:  "TV5/20 — 최근 5일 거래대금의 20일 평균 대비 배율. 값이 클수록 자금 유입이 증가하는 추세.",
  v5_20:   "V5/20 — 최근 5일 거래량의 20일 평균 대비 배율. 거래량 급증은 추세 전환 신호일 수 있음.",
  adx14:   "ADX(14) — Average Directional Index. 추세 강도를 0~100으로 나타냄. 25 이상이면 추세 형성, 40 이상이면 강한 추세.",
  mfi14:   "MFI(14) — Money Flow Index. 거래량 가중 RSI. 80 이상 과매수, 20 이하 과매도 신호.",
  cmf20:   "CMF(20) — Chaikin Money Flow. +0.1 이상이면 매집, -0.1 이하면 분산(매도) 압력.",
  clv:     "CLV — Close Location Value. 당일 고가/저가 범위 내 종가 위치. +1이면 고가 마감, -1이면 저가 마감.",
  vwap20:  "VWAP20 편차 — 20일 거래량 가중 평균 가격 대비 현재 가격의 괴리율(%). 양수일수록 강세.",
  udvr60:  "UDVR60 — 최근 60일 상승거래량 / 하락거래량 비율. 1보다 클수록 매수 우위.",
  squeeze: "TTM Squeeze — 볼린저밴드 폭이 켈트너채널 폭보다 좁을 때 ON. 변동성 수축 후 큰 추세 출발 가능성.",
};

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function gradeColor(g: Grade): string {
  return {
    S: "text-cyan-400 border-cyan-400/40 bg-cyan-400/10",
    A: "text-green-400 border-green-400/40 bg-green-400/10",
    B: "text-blue-400 border-blue-400/40 bg-blue-400/10",
    C: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
    D: "text-orange-400 border-orange-400/40 bg-orange-400/10",
    F: "text-red-400 border-red-400/40 bg-red-400/10",
  }[g] ?? "text-gray-400 border-gray-400/40 bg-gray-400/10";
}

function gradeRing(g: Grade): string {
  return {
    S: "border-cyan-400 text-cyan-400",
    A: "border-green-400 text-green-400",
    B: "border-blue-400 text-blue-400",
    C: "border-yellow-400 text-yellow-400",
    D: "border-orange-400 text-orange-400",
    F: "border-red-400 text-red-400",
  }[g] ?? "border-gray-500 text-gray-400";
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-cyan-400";
  if (score >= 65) return "bg-green-400";
  if (score >= 50) return "bg-blue-400";
  if (score >= 35) return "bg-yellow-400";
  return "bg-orange-400";
}

function fmtUk(n: number): string {
  if (n === 0) return "0억";
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : "−";
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}조`;
  return `${sign}${abs.toLocaleString("ko-KR")}억`;
}

// ── InfoTip 컴포넌트 ──────────────────────────────────────────────────────────
function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group/tip inline-flex items-center ml-1">
      <button
        type="button"
        className="w-3.5 h-3.5 rounded-full border border-gray-600 text-gray-500
          hover:border-cyan-400/70 hover:text-cyan-400 flex items-center justify-center
          text-[8px] font-bold leading-none transition-colors shrink-0"
        aria-label="설명 보기"
      >
        i
      </button>
      {/* tooltip */}
      <span
        className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5
          w-56 rounded-lg bg-gray-900 border border-gray-700 px-2.5 py-2
          text-[11px] text-gray-200 leading-relaxed shadow-xl
          opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150"
      >
        {text}
        {/* 말풍선 꼬리 */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px
          border-4 border-transparent border-t-gray-700" />
      </span>
    </span>
  );
}

// ── GradeBadge ────────────────────────────────────────────────────────────────
function GradeBadge({ grade, size = "sm" }: { grade: Grade; size?: "sm" | "lg" | "xl" }) {
  const sizeClass = size === "xl"
    ? "text-3xl w-14 h-14 border-2"
    : size === "lg"
    ? "text-lg w-9 h-9 border-2"
    : "text-xs w-6 h-6 border";
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold border ${sizeClass} ${gradeRing(grade)}`}>
      {grade}
    </span>
  );
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────
function ScoreRing({ score, grade, label }: { score: number; grade: Grade; label: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  const strokeColor = {
    S: "#22d3ee", A: "#4ade80", B: "#60a5fa",
    C: "#facc15", D: "#fb923c", F: "#f87171",
  }[grade] ?? "#6b7280";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
          <circle cx="44" cy="44" r={r} fill="none" stroke="#1e293b" strokeWidth="7" />
          <circle
            cx="44" cy="44" r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth="7"
            strokeDasharray={`${filled} ${circ - filled}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white font-bold text-xl leading-none">{score}</span>
          <span className="text-gray-500 text-[9px] mt-0.5">/ 100</span>
        </div>
      </div>
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}

// ── 수급 바 차트 ──────────────────────────────────────────────────────────────
function InvestorBars({
  foreign5D, foreign10D, foreign20D,
  institution5D, institution10D, institution20D,
}: {
  foreign5D: number; foreign10D: number; foreign20D: number;
  institution5D: number; institution10D: number; institution20D: number;
}) {
  const allVals = [foreign5D, foreign10D, foreign20D, institution5D, institution10D, institution20D];
  const maxAbs = Math.max(...allVals.map(Math.abs), 1);

  function Bar({ value, color }: { value: number; color: string }) {
    const pct = Math.min(Math.abs(value) / maxAbs * 100, 100);
    const pos = value >= 0;
    return (
      <div className="flex items-center gap-1.5 h-5">
        {/* 음수 쪽 */}
        <div className="flex-1 flex justify-end">
          {!pos && (
            <div
              className={`h-3 rounded-l ${color === "cyan" ? "bg-red-500/70" : "bg-red-400/60"}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        {/* 중앙 선 */}
        <div className="w-px h-4 bg-gray-700 shrink-0" />
        {/* 양수 쪽 */}
        <div className="flex-1">
          {pos && (
            <div
              className={`h-3 rounded-r ${color === "cyan" ? "bg-cyan-400/80" : "bg-green-400/80"}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      </div>
    );
  }

  const rows: { period: string; fv: number; iv: number }[] = [
    { period: "5일", fv: foreign5D, iv: institution5D },
    { period: "10일", fv: foreign10D, iv: institution10D },
    { period: "20일", fv: foreign20D, iv: institution20D },
  ];

  return (
    <div className="space-y-3">
      {/* 범례 */}
      <div className="flex gap-4 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400/80 inline-block" />외국인
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-400/80 inline-block" />기관
        </span>
        <span className="flex items-center gap-1 ml-auto text-gray-600">← 매도 / 매수 →</span>
      </div>

      {rows.map(({ period, fv, iv }) => (
        <div key={period} className="space-y-0.5">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-500 w-8">{period}</span>
            <div className="flex-1" />
            <div className="flex gap-3 text-[10px]">
              <span className={fv >= 0 ? "text-cyan-400" : "text-red-400"}>{fmtUk(fv)}</span>
              <span className={iv >= 0 ? "text-green-400" : "text-red-400"}>{fmtUk(iv)}</span>
            </div>
          </div>
          <Bar value={fv} color="cyan" />
          <Bar value={iv} color="green" />
        </div>
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
interface StockSignalReportProps {
  ticker: string;   // e.g. "005930" or "NVDA"
  market?: string;  // "KS" | "KQ" | "US"
}

export default function StockSignalReport({ ticker, market = "KS" }: StockSignalReportProps) {
  const isUS = market === "US";
  const yahoTicker = isUS ? ticker : `${ticker}.${market}`;

  const [fin, setFin] = useState<FinData | null>(null);
  const [tech, setTech] = useState<TechData | null>(null);
  const [inv, setInv] = useState<InvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError("");
    setFin(null); setTech(null); setInv(null);

    const safeJson = async <T,>(url: string, setter: (v: T) => void, check: (v: unknown) => boolean) => {
      try {
        const r = await fetch(url);
        const j = await r.json();
        if (check(j)) setter(j as T);
      } catch { /* ignore */ }
    };

    const promises: Promise<void>[] = [
      safeJson<FinData>(
        `/api/stock-financials?ticker=${encodeURIComponent(yahoTicker)}`,
        setFin,
        (j) => Array.isArray((j as FinData).metrics),
      ),
      safeJson<TechData>(
        `/api/stock-technicals?ticker=${encodeURIComponent(yahoTicker)}`,
        setTech,
        (j) => Array.isArray((j as TechData).indicators),
      ),
    ];

    // 수급 데이터는 국내주식만
    if (!isUS) {
      promises.push(
        safeJson<InvData>(
          `/api/stock-investor?code=${encodeURIComponent(ticker)}&market=${market}`,
          setInv,
          (j) => typeof (j as InvData).foreign === "number",
        )
      );
    }

    Promise.all(promises).finally(() => setLoading(false));
  }, [ticker, market, yahoTicker, isUS]);

  // ── 종합 점수 계산 (재무 없어도 가용 데이터로 계산) ─────────────────────────
  function compositeScore(): { score: number; grade: Grade; partial: boolean } | null {
    if (!tech) return null; // 기술 지표는 필수
    if (isUS) {
      if (fin) {
        const s = Math.round(fin.finScore * 0.60 + tech.techScore * 0.40);
        const grade: Grade = s >= 80 ? "S" : s >= 65 ? "A" : s >= 50 ? "B" : s >= 35 ? "C" : s >= 20 ? "D" : "F";
        return { score: s, grade, partial: false };
      }
      // 재무 없으면 기술만으로
      const s = tech.techScore;
      const grade: Grade = s >= 80 ? "S" : s >= 65 ? "A" : s >= 50 ? "B" : s >= 35 ? "C" : s >= 20 ? "D" : "F";
      return { score: s, grade, partial: true };
    } else {
      const invScore = inv ? inv.score : null;
      if (fin && invScore !== null) {
        const s = Math.round(fin.finScore * 0.40 + invScore * 0.35 + tech.techScore * 0.25);
        const grade: Grade = s >= 80 ? "S" : s >= 65 ? "A" : s >= 50 ? "B" : s >= 35 ? "C" : s >= 20 ? "D" : "F";
        return { score: s, grade, partial: false };
      }
      if (invScore !== null) {
        // 재무 없음 → 수급 50% + 기술 50%
        const s = Math.round(invScore * 0.50 + tech.techScore * 0.50);
        const grade: Grade = s >= 80 ? "S" : s >= 65 ? "A" : s >= 50 ? "B" : s >= 35 ? "C" : s >= 20 ? "D" : "F";
        return { score: s, grade, partial: true };
      }
      // 기술만
      const s = tech.techScore;
      const grade: Grade = s >= 80 ? "S" : s >= 65 ? "A" : s >= 50 ? "B" : s >= 35 ? "C" : s >= 20 ? "D" : "F";
      return { score: s, grade, partial: true };
    }
  }

  const composite = compositeScore();

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-10 gap-3">
        <div className="w-5 h-5 border-2 border-gray-700 border-t-cyan-400 rounded-full animate-spin" />
        <span className="text-sm text-gray-500">종목 신호 분석 중…</span>
      </div>
    );
  }

  if (error) {
    return <div className="card text-sm text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-4">

      {/* ── 종합 점수 ───────────────────────────────────────────────────────── */}
      {composite && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="card-title">종합 투자 신호</h3>
            {composite.partial && (
              <span className="text-[9px] text-yellow-500/70 border border-yellow-500/30 rounded px-1 py-0.5">재무 제외</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            {/* 원형 게이지 */}
            <ScoreRing
              score={composite.score}
              grade={composite.grade}
              label="종합 점수"
            />

            {/* 세부 점수 */}
            <div className="flex-1 min-w-[180px] space-y-2">
              {fin && (
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-gray-400">재무 ({isUS ? "60%" : "40%"})</span>
                    <span className={`text-[11px] font-bold ${gradeColor(fin.finGrade).split(" ")[0]}`}>
                      {fin.finScore}점
                    </span>
                  </div>
                  <div className="h-1.5 bg-navy-border/50 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBarColor(fin.finScore)}`}
                      style={{ width: `${fin.finScore}%` }} />
                  </div>
                </div>
              )}
              {!isUS && inv && (
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-gray-400">수급 (35%)</span>
                    <span className={`text-[11px] font-bold ${gradeColor(inv.grade as Grade).split(" ")[0]}`}>
                      {inv.score}점
                    </span>
                  </div>
                  <div className="h-1.5 bg-navy-border/50 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBarColor(inv.score)}`}
                      style={{ width: `${inv.score}%` }} />
                  </div>
                </div>
              )}
              {tech && (
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-gray-400">기술 ({isUS ? "40%" : "25%"})</span>
                    <span className={`text-[11px] font-bold ${gradeColor(tech.techGrade).split(" ")[0]}`}>
                      {tech.techScore}점
                    </span>
                  </div>
                  <div className="h-1.5 bg-navy-border/50 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBarColor(tech.techScore)}`}
                      style={{ width: `${tech.techScore}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* 등급 배지 */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <GradeBadge grade={composite.grade} size="xl" />
              <span className="text-[10px] text-gray-500">종합 등급</span>
            </div>
          </div>

          {/* 수급 코멘트 */}
          {!isUS && inv?.comment && (
            <p className="mt-4 text-xs text-gray-400 leading-relaxed border-t border-navy-border/40 pt-3">
              {inv.comment}
            </p>
          )}
        </div>
      )}

      {/* ── 재무 등급 (없으면 안내 카드) ───────────────────────────────────── */}
      {!fin && (
        <div className="card border-dashed border-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="card-title text-gray-600">재무 등급</h3>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            재무 데이터를 불러오는 중입니다. 잠시 후 다시 시도하거나,<br />
            Yahoo Finance에서 직접 확인하세요.
          </p>
        </div>
      )}
      {fin && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="card-title">재무 등급</h3>
            <GradeBadge grade={fin.finGrade} size="lg" />
          </div>

          {/* 지표 테이블 */}
          <div className="space-y-1.5">
            {fin.metrics.map((m) => (
              <div key={m.label}
                className="flex items-center justify-between py-1.5 border-b border-navy-border/30 last:border-0">
                <span className="text-xs text-gray-400 w-24 shrink-0">{m.label}</span>
                <span className="text-xs text-white num font-medium flex-1 text-center">{m.formatted}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${gradeColor(m.grade)}`}>
                  {m.grade}
                </span>
              </div>
            ))}
          </div>

          {/* 밸류에이션 */}
          <div className="mt-4 pt-3 border-t border-navy-border/40">
            <p className="text-[10px] text-gray-500 mb-2">밸류에이션</p>
            <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
              {[
                { label: "PER(현재)", val: fin.valuation.trailingPE },
                { label: "PER(선행)", val: fin.valuation.forwardPE },
                { label: "PBR", val: fin.valuation.pb },
                { label: "EV/EBITDA", val: fin.valuation.evEbitda },
                { label: "시가총액", val: fin.valuation.mktCap },
                { label: "배당수익률", val: fin.valuation.divYield },
                { label: "FCF", val: fin.valuation.fcf },
              ].map(({ label, val }) => (
                <div key={label} className="bg-navy-sub/60 rounded-lg px-2 py-1.5">
                  <p className="text-[9px] text-gray-600">{label}</p>
                  <p className="text-[11px] text-white num font-medium mt-0.5">{val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 수급 바 차트 (국내 전용) ─────────────────────────────────────────── */}
      {!isUS && inv && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="card-title">수급 흐름</h3>
            {inv.invDate && (
              <span className="text-[10px] text-gray-600 num">
                {inv.invDate.slice(0, 4)}.{inv.invDate.slice(4, 6)}.{inv.invDate.slice(6, 8)} 기준
              </span>
            )}
          </div>

          {/* 당일 수급 */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "외국인", val: inv.foreign },
              { label: "기관", val: inv.institution },
              { label: "개인", val: inv.individual },
            ].map(({ label, val }) => (
              <div key={label} className="bg-navy-sub/60 rounded-lg px-2 py-2 text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
                <p className={`text-sm font-bold num ${val >= 0 ? "text-cyan-400" : "text-red-400"}`}>
                  {val >= 0 ? "+" : ""}{val.toLocaleString("ko-KR")}억
                </p>
              </div>
            ))}
          </div>

          {/* 기간별 바 차트 */}
          <InvestorBars
            foreign5D={inv.foreign5D}
            foreign10D={inv.foreign10D}
            foreign20D={inv.foreign20D}
            institution5D={inv.institution5D}
            institution10D={inv.institution10D}
            institution20D={inv.institution20D}
          />
        </div>
      )}

      {/* ── 기술 지표 체크보드 ──────────────────────────────────────────────── */}
      {tech && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="card-title">기술 지표</h3>
            <GradeBadge grade={tech.techGrade} size="lg" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {tech.indicators.map((ind) => (
              <div key={ind.key}
                className="bg-navy-sub/60 rounded-xl p-2.5 flex flex-col gap-1 border border-navy-border/30">
                {/* 레이블 + 인포팁 */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 leading-tight">
                    {ind.label}
                    {TECH_DESC[ind.key] && <InfoTip text={TECH_DESC[ind.key]} />}
                  </span>
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded border leading-tight ${gradeColor(ind.grade)}`}>
                    {ind.grade}
                  </span>
                </div>
                {/* 값 */}
                <span className="text-sm font-bold text-white num">{ind.display}</span>
              </div>
            ))}
          </div>

          <p className="text-[9px] text-gray-700 mt-3">
            데이터: Yahoo Finance 3개월 일봉 · 서버 계산 ({new Date().toLocaleDateString("ko-KR")})
          </p>
        </div>
      )}
    </div>
  );
}
