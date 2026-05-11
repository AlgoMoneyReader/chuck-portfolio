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

// 점수에 따른 색상
function scoreColor(score: number): string {
  if (score <= 25) return "#ef4444"; // 극도공포 - red
  if (score <= 45) return "#f97316"; // 공포 - orange
  if (score <= 55) return "#eab308"; // 중립 - yellow
  if (score <= 75) return "#84cc16"; // 탐욕 - lime
  return "#22c55e";                  // 극도탐욕 - green
}

function scoreLabel(score: number): string {
  if (score <= 25) return "극도 공포";
  if (score <= 45) return "공포";
  if (score <= 55) return "중립";
  if (score <= 75) return "탐욕";
  return "극도 탐욕";
}

// 반원 게이지 SVG
function GaugeSVG({ score }: { score: number }) {
  const color = scoreColor(score);
  const radius = 60;
  const cx = 80;
  const cy = 80;
  // 반원: -180도(좌) ~ 0도(우), 점수 0=좌 100=우
  const angle = -180 + (score / 100) * 180; // degrees
  const rad = (angle * Math.PI) / 180;
  const needleX = cx + radius * Math.cos(rad);
  const needleY = cy + radius * Math.sin(rad);

  return (
    <svg viewBox="0 0 160 90" className="w-40 h-24">
      {/* 배경 반원 트랙 */}
      <path
        d="M 20 80 A 60 60 0 0 1 140 80"
        fill="none"
        stroke="#1e2a3a"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {/* 색상 오버레이 (5구간) */}
      {[
        { color: "#ef4444", from: 0,  to: 20 },
        { color: "#f97316", from: 20, to: 40 },
        { color: "#eab308", from: 40, to: 60 },
        { color: "#84cc16", from: 60, to: 80 },
        { color: "#22c55e", from: 80, to: 100 },
      ].map(({ color: c, from, to }) => {
        const a1 = ((-180 + (from / 100) * 180) * Math.PI) / 180;
        const a2 = ((-180 + (to   / 100) * 180) * Math.PI) / 180;
        const x1 = cx + radius * Math.cos(a1);
        const y1 = cy + radius * Math.sin(a1);
        const x2 = cx + radius * Math.cos(a2);
        const y2 = cy + radius * Math.sin(a2);
        const large = to - from > 50 ? 1 : 0;
        return (
          <path
            key={from}
            d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`}
            fill="none"
            stroke={c}
            strokeWidth="12"
            strokeLinecap="butt"
            opacity="0.4"
          />
        );
      })}
      {/* 현재 점수까지 채우기 */}
      {score > 0 && (() => {
        const a1 = ((-180) * Math.PI) / 180;
        const a2 = rad;
        const x1 = cx + radius * Math.cos(a1);
        const y1 = cy + radius * Math.sin(a1);
        const large = score > 50 ? 1 : 0;
        return (
          <path
            d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${needleX} ${needleY}`}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
          />
        );
      })()}
      {/* 바늘 */}
      <line
        x1={cx} y1={cy}
        x2={needleX} y2={needleY}
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="5" fill="white" />
      {/* 점수 텍스트 */}
      <text x={cx} y={cy + 20} textAnchor="middle" fill={color} fontSize="22" fontWeight="bold">
        {score}
      </text>
    </svg>
  );
}

function MiniStat({ label, score }: { label: string; score: number }) {
  const color = scoreColor(score);
  return (
    <div className="text-center">
      <p className="text-xs text-gray-600 mb-0.5">{label}</p>
      <p className="text-xs font-semibold" style={{ color }}>{score}</p>
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
    const interval = setInterval(fetchData, 300_000); // 5분 갱신
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-widest">공포·탐욕 지수</h2>
        <span className="text-xs text-gray-600">CNN Fear & Greed</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-28 animate-pulse">
          <div className="w-40 h-24 bg-navy-border rounded" />
        </div>
      ) : error || !data ? (
        <div className="flex items-center justify-center h-20">
          <p className="text-xs text-gray-500">데이터를 불러올 수 없습니다</p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* 게이지 */}
          <div className="flex flex-col items-center">
            <GaugeSVG score={data.score} />
            <p className="text-sm font-bold mt-1" style={{ color: scoreColor(data.score) }}>
              {scoreLabel(data.score)}
            </p>
          </div>

          {/* 시계열 비교 */}
          <div className="flex-1 w-full">
            <p className="text-xs text-gray-500 mb-3">기간별 비교</p>
            <div className="grid grid-cols-4 gap-2">
              <MiniStat label="전일" score={data.prevClose} />
              <MiniStat label="1주전" score={data.oneWeekAgo} />
              <MiniStat label="1달전" score={data.oneMonthAgo} />
              <MiniStat label="1년전" score={data.oneYearAgo} />
            </div>
            {/* 방향성 해석 */}
            <div className="mt-3 p-2 bg-navy-sub/50 rounded-lg">
              <p className="text-xs text-gray-400">
                {data.score > data.oneWeekAgo
                  ? "📈 1주 전 대비 탐욕 심화 — 단기 과열 주의"
                  : data.score < data.oneWeekAgo
                  ? "📉 1주 전 대비 공포 심화 — 역발상 매수 타이밍 검토"
                  : "➡ 1주 전과 유사한 심리 수준"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
