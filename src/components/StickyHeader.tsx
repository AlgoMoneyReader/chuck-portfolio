"use client";

import { useEffect, useRef } from "react";

// 상단 묶음(로고 바 + 티커)의 실제 높이를 --hdr 로 알려, 페이지 안의 고정 탭바가 그 아래에 붙게 한다
export default function StickyHeader({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const set = () => document.documentElement.style.setProperty("--hdr", `${ref.current?.offsetHeight ?? 0}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return <header ref={ref} className="sticky top-0 z-50">{children}</header>;
}
