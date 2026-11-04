"use client";

import { useEffect, useRef } from "react";

// 한국 정규장(평일 09:00~15:40 KST, 장 마감 직후 확정 반영 여유 포함)
export function krxOpen(now = Date.now()): boolean {
  const k = new Date(now + 9 * 3_600_000);
  const day = k.getUTCDay();
  if (day === 0 || day === 6) return false;
  const m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return m >= 9 * 60 && m <= 15 * 60 + 40;
}

// 화면이 보이는 동안 ms 간격으로 fn 실행. krxOnly면 장중에만.
// 다른 탭에 갔다가 돌아오면 바로 한 번 갱신한다.
export function useMarketPoll(fn: () => void, ms: number, opts: { krxOnly?: boolean; enabled?: boolean } = {}) {
  const ref = useRef(fn);
  ref.current = fn;
  const { krxOnly = true, enabled = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (krxOnly && !krxOpen()) return;
      ref.current();
    };
    const id = setInterval(tick, ms);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [ms, krxOnly, enabled]);
}
