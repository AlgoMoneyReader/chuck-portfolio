"use client";

import { useEffect, useState, useCallback } from "react";

interface FGData {
  score: number;
  rating: string;
  ratingKo: string;
  prevClose: number;
  oneWeekAgo: number;
  oneMonthAgo: number;
  oneYearAgo: number;
}

function scoreColor(score: number): string {
  if (score <= 25) return "#ef4444";
  if (score <= 45) return "#f97316";
  if (score <= 55) return "#eab308";
  if (score <= 75) return "#84cc16";
  return "#22c55e";
}

function scoreLabel(score: number): string {
  if (score <= 25) return "극도 공포";
  if (score <= 45) return "공포";
  if (score <= 55) return "중립";
  if (score <= 75) return "탐욕";
  return "극도 탐욕";
}

// 반원 게이지 — 점수·레이블은 SVG 밖 HTML로 분리
function GaugeSVG({ score }: { score: number }) {
  const color = scoreColor(score);
  const R  = 56;
  const cx = 80;
  const cy = 70;

  // 각도: -180deg(좌 끝) → 0deg(우 끝), 점수 0→100
  const angleRad = ((-180 + (score / 100) * 180) * Math.PI) / 180;
  const nX = cx + R * Math.cos(angleRad);
  const nY = cy + R * Math.sin(angleRad);

  function arcPath(from: number, to: number) {
    const a1 = ((-180 + (from / 100) * 180) * Math.PI) / 180;
    const a2 = ((-180 + (to   / 100) * 180) * Math.PI) / 180;
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    const x2 = cx + R * Math.cos(a2);
    const y2 = cy + R * Math.sin(a2);
    const large = (to - from) > 50 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  }

  // 현재 점수까지의 활성 아크
  const activeA1Rad = (-180 * Math.PI) / 180;
  const activeX1 = cx + R * Math.cos(activeA1Rad);
  const activeY1 = cy + R * Math.sin(activeA1Rad);
  const activeLarge = score > 50 ? 1 : 0;

  // 눈금 마커 (0, 25, 50, 75, 100)
  const ticks = [0, 25, 50, 75, 100];

  return (
    <svg viewBox="10 10 140 70" className="w-48 h-24" overflow="visible">
      <defs>
        {/* 게이지 배경용 그라디언트 (빨강→노랑→초록) */}
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ef4444" />
          <stop offset="25%"  stopColor="#f97316" />
          <stop offset="50%"  stopColor="#eab308" />
          <stop offset="75%"  stopColor="#84cc16" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>

      {/* ① 두꺼운 어두운 배경 트랙 */}
      <path d={arcPath(0, 100)} fill="none" stroke="#1e2a3a" strokeWidth="14" strokeLinecap="round" />

      {/* ② 그라디언트 컬러 트랙 (낮은 투명도 — 배경 가이드) */}
      <path d={arcPath(0, 100)} fill="none" stroke="url(#gaugeGrad)" strokeWidth="14"
        strokeLinecap="round" opacity="0.25" />

      {/* ③ 현재 점수까지 밝은 채우기 */}
      {score > 0 && (
        <path
          d={`M ${activeX1} ${activeY1} A ${R} ${R} 0 ${activeLarge} 1 ${nX} ${nY}`}
          fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" opacity="0.9"
        />
      )}

      {/* ④ 눈금 마커 */}
      {ticks.map((t) => {
        const a = ((-180 + (t / 100) * 180) * Math.PI) / 180;
        const inner = R - 10;
        const outer = R + 4;
        return (
          <line key={t}
            x1={cx + inner * Math.cos(a)} y1={cy + inner * Math.sin(a)}
            x2={cx + outer * Math.cos(a)} y2={cy + outer * Math.sin(a)}
            stroke="#334155" strokeWidth="1.5" strokeLinecap="round"
          />
        );
      })}

      {/* ⑤ 바늘 */}
      <line x1={cx} y1={cy} x2={nX} y2={nY}
        stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="white" />
      <circle cx={cx} cy={cy} r="2.5" fill={color} />
    </svg>
  );
}

function MiniStat({ label, score }: { label: string; score: number }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-600 mb-0.5">{label}</p>
      <p className="text-sm font-bold num" style={{ color: scoreColor(score) }}>{score}</p>
    </div>
  );
}

export default function FearGreedGauge() {
  const [data, setData] = useState<FGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/fear-greed", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const json: FGData = await res.json();
      if ("error" in json) throw new Error();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 300_000);
    return () => clearInterval(i);
  }, [fetchData]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">공포·탐욕 지수</h2>
        <span className="text-xs text-gray-600">CNN Fear & Greed</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-6 animate-pulse">
          <div className="w-48 h-24 bg-navy-border rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-navy-border rounded w-3/4" />
            <div className="h-3 bg-navy-border rounded w-1/2" />
          </div>
        </div>
      ) : error || !data ? (
        <div className="flex items-center justify-center h-16">
          <p className="text-xs text-gray-500">데이터를 불러올 수 없습니다</p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* 게이지 + 점수 (HTML로 분리) */}
          <div className="flex flex-col items-center shrink-0">
            <GaugeSVG score={data.score} />
            <div className="-mt-2 text-center">
              <p className="text-2xl font-bold num leading-none" style={{ color: scoreColor(data.score) }}>
                {data.score}
              </p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: scoreColor(data.score) }}>
                {scoreLabel(data.score)}
              </p>
            </div>
          </div>

          {/* 기간별 비교 */}
          <div className="flex-1 w-full space-y-3">
            <div className="grid grid-cols-4 gap-2 bg-navy-sub/40 rounded-xl px-3 py-3">
              <MiniStat label="전일"  score={data.prevClose}    />
              <MiniStat label="1주전" score={data.oneWeekAgo}  />
              <MiniStat label="1달전" score={data.oneMonthAgo} />
              <MiniStat label="1년전" score={data.oneYearAgo}  />
            </div>
            {/* 해석 */}
            <div className="px-3 py-2 bg-navy-sub/40 rounded-xl">
              <p className="text-xs text-gray-400 leading-relaxed">
                {data.score > data.oneWeekAgo
                  ? "📈 1주 전 대비 탐욕 심화 — 단기 과열 주의"
                  : data.score < data.oneWeekAgo
                  ? "📉 1주 전 대비 공포 심화 — 역발상 매수 검토"
                  : "➡ 1주 전과 유사한 심리 수준"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
