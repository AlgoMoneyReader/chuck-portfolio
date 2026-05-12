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

// ─── 반원형 계기판 SVG ────────────────────────────────────────────────────────
//
// ✅ 핵심 수학 규칙:
//    score 0 → 각도 -π   (9시 방향, 왼쪽 끝)
//    score 50 → 각도 -π/2 (12시 방향, 최상단)
//    score 100 → 각도 0   (3시 방향, 오른쪽 끝)
//
// ❌ 기존 버그:
//    1. score > 50 이면 large-arc-flag=1 → SVG가 하단 225° 경로를 선택
//       → overflow:visible 상태에서 계기판 아래로 거대한 원호가 튀어나옴
//    2. arc(0, 100) = 양 끝이 지름 위치 → SVG 스펙상 "degenerate" 케이스
//       → 브라우저마다 다른 반원을 선택, 두꺼운 전체 원처럼 렌더링
//
// ✅ 수정:
//    - large-arc-flag 항상 0 고정 (반원 내 어떤 부분 호도 0으로 충분)
//    - 배경 트랙은 90° × 2로 분리해 degenerate 케이스 완전 회피
//    - overflow:visible 제거, viewBox 안에 모든 요소 정확히 배치
//
function GaugeSVG({ score }: { score: number }) {
  // ── 레이아웃 상수 ─────────────────────────────────────────────────────────
  const CX  = 100;   // 중심 X
  const CY  = 70;    // 중심 Y (좌표계 기준)
  const R   = 58;    // 아크 중심선 반지름
  const SW  = 12;    // 트랙 스트로크 두께
  const NL  = 48;    // 바늘 길이 (트랙 안쪽: R - SW/2 - 여백 ≈ 52이므로 48로 안전)
  //
  // viewBox "0 0 200 110":
  //   트랙 상단 가장자리: CY - R - SW/2 = 70 - 58 - 6 = 6  → viewBox 안쪽 ✓
  //   트랙 양 끝 Y:       CY = 70                           → viewBox 안쪽 ✓
  //   점수 텍스트: CY+21 = 91, 레이블: CY+37 = 107         → viewBox 안쪽 ✓

  // score → 라디안 변환 (score 0.02, 99.98로 clamp → degenerate 양 끝점 회피)
  const toRad = (s: number) =>
    -Math.PI + (Math.max(0.02, Math.min(99.98, s)) / 100) * Math.PI;

  // SVG 아크 경로 생성
  // ⚠️ large-arc-flag 항상 0:
  //    반원(180°) 내부의 임의 부분 호는 시계 방향(sweep=1) + small-arc(large=0)로
  //    항상 상단 경로가 선택된다. score > 50 이어도 예외 없음.
  const arc = (s1: number, s2: number): string => {
    const a1 = toRad(s1);
    const a2 = toRad(s2);
    const x1 = (CX + R * Math.cos(a1)).toFixed(2);
    const y1 = (CY + R * Math.sin(a1)).toFixed(2);
    const x2 = (CX + R * Math.cos(a2)).toFixed(2);
    const y2 = (CY + R * Math.sin(a2)).toFixed(2);
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  };

  const color  = scoreColor(score);
  const label  = scoreLabel(score);
  const angle  = toRad(score);
  const nX     = (CX + NL * Math.cos(angle)).toFixed(2);
  const nY     = (CY + NL * Math.sin(angle)).toFixed(2);

  // 5단계 색상 구간
  const ZONES: [number, number, string][] = [
    [0,  25,  "#ef4444"],   // 극도 공포
    [25, 45,  "#f97316"],   // 공포
    [45, 55,  "#eab308"],   // 중립
    [55, 75,  "#84cc16"],   // 탐욕
    [75, 100, "#22c55e"],   // 극도 탐욕
  ];

  return (
    // overflow 기본값(hidden) — viewBox 바깥 렌더링 원천 차단
    <svg viewBox="0 0 200 110" width="192" height="105" style={{ display: "block" }}>

      {/* ① 배경 트랙: 90° × 2로 분리 → 180° degenerate 케이스 완전 회피 */}
      <path d={arc(0, 50)}   fill="none" stroke="#0d1a27" strokeWidth={SW + 4} strokeLinecap="butt" />
      <path d={arc(50, 100)} fill="none" stroke="#0d1a27" strokeWidth={SW + 4} strokeLinecap="butt" />

      {/* ② 5단계 색상 구간 배경 (낮은 opacity — 가이드용) */}
      {ZONES.map(([s1, s2, c]) => (
        <path key={s1}
          d={arc(s1, s2)}
          fill="none"
          stroke={c}
          strokeWidth={SW}
          strokeLinecap="butt"
          opacity="0.28"
        />
      ))}

      {/* ③ 현재 점수까지 활성 아크 (large=0 고정 → 항상 상단 반원 경로 유지) */}
      {score > 0.5 && (
        <path
          d={arc(0, score)}
          fill="none"
          stroke={color}
          strokeWidth={SW}
          strokeLinecap="round"
          opacity="0.9"
        />
      )}

      {/* ④ 눈금 마커 (0 / 25 / 50 / 75 / 100) */}
      {([0, 25, 50, 75, 100] as const).map(t => {
        const a = toRad(t);
        return (
          <line
            key={t}
            x1={(CX + (R - 7) * Math.cos(a)).toFixed(2)}
            y1={(CY + (R - 7) * Math.sin(a)).toFixed(2)}
            x2={(CX + (R + 6) * Math.cos(a)).toFixed(2)}
            y2={(CY + (R + 6) * Math.sin(a)).toFixed(2)}
            stroke="#2a3f52"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        );
      })}

      {/* ⑤ 바늘 */}
      <line
        x1={CX} y1={CY}
        x2={nX} y2={nY}
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.95"
      />

      {/* ⑥ 중앙 허브 */}
      <circle cx={CX} cy={CY} r="5"   fill="white" />
      <circle cx={CX} cy={CY} r="2.5" fill={color} />

      {/* ⑦ 점수 & 레이블 — SVG 내 중앙 배치로 HTML 겹침 완전 제거 */}
      <text
        x={CX} y={CY + 22}
        textAnchor="middle"
        fill={color}
        fontSize="22"
        fontWeight="bold"
        fontFamily="ui-monospace, monospace"
      >{score}</text>
      <text
        x={CX} y={CY + 38}
        textAnchor="middle"
        fill={color}
        fontSize="12"
        fontWeight="600"
      >{label}</text>
    </svg>
  );
}

// ─── 보조 통계 ────────────────────────────────────────────────────────────────

function MiniStat({ label, score }: { label: string; score: number }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-600 mb-0.5">{label}</p>
      <p className="text-sm font-bold num" style={{ color: scoreColor(score) }}>{score}</p>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

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

          {/* 게이지 — 점수·레이블 텍스트 SVG 내 임베드, HTML 겹침 없음 */}
          <div className="shrink-0">
            <GaugeSVG score={data.score} />
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
