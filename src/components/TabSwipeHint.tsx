"use client";

import { useEffect, useState } from "react";

// 팝업을 처음 열었을 때 한 번만: "좌우로 밀어서 탭 이동" 힌트 (터치 기기에서만, 3초 뒤 사라짐)
const KEY = "hint:tabswipe";
export default function TabSwipeHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) || !window.matchMedia?.("(pointer: coarse)").matches) return;
      localStorage.setItem(KEY, "1");
    } catch { return; }
    setShow(true);
    const t = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="pointer-events-none flex justify-center py-1.5 animate-fade-in">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-brand/15 border border-cyan-brand/30 px-3 py-1 text-[11px] font-semibold text-cyan-brand">
        <span className="animate-pulse">‹</span> 차트 밖을 좌우로 밀면 옆 탭으로 넘어가요 <span className="animate-pulse">›</span>
      </span>
    </div>
  );
}
