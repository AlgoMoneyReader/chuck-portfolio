"use client";

import { useRef } from "react";

// 팝업 안에서 좌우로 밀어 옆 탭으로 이동 (휴대폰).
// 차트(canvas)·가로 스크롤 표·입력칸에서 시작한 손가락 움직임은 무시해서 그쪽 동작을 방해하지 않는다.
function blocked(el: EventTarget | null): boolean {
  let n = el as HTMLElement | null;
  while (n && n !== document.body) {
    if (n.tagName === "CANVAS" || n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.dataset?.noswipe !== undefined) return true;
    if (n.classList?.contains("tv-lightweight-charts")) return true;
    const ox = getComputedStyle(n).overflowX;
    if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth + 2) return true; // 가로로 스크롤되는 표·버튼줄
    n = n.parentElement;
  }
  return false;
}

export function useSwipeTabs<T>(tabs: readonly T[], current: T, set: (t: T) => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 1 || blocked(e.target)) { start.current = null; return; }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current; start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
      // 충분히 옆으로(70px+), 세로보다 확실히 크게, 너무 느리지 않게 — 세로 스크롤과 헷갈리지 않도록
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - s.t > 800) return;
      const i = tabs.indexOf(current);
      const next = dx < 0 ? tabs[i + 1] : tabs[i - 1];
      if (next !== undefined) set(next);
    },
  };
}
