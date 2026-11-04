"use client";

import { useEffect } from "react";

// 다른 탭에서 /flow#market 처럼 들어오면 해당 위치로 이동.
// 위쪽 카드가 데이터를 받으며 높이가 바뀌므로 몇 차례 다시 맞추고, 사용자가 직접 스크롤하면 멈춘다.
export default function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let stopped = false;
    const stop = () => { stopped = true; };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    const go = () => { if (!stopped) document.getElementById(id)?.scrollIntoView({ block: "start" }); };
    const timers = [50, 400, 1000, 2000, 3500].map(ms => setTimeout(go, ms));
    return () => { timers.forEach(clearTimeout); window.removeEventListener("wheel", stop); window.removeEventListener("touchmove", stop); };
  }, []);
  return null;
}
