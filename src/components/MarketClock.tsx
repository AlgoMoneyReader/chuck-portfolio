"use client";

import { useEffect, useRef, useState } from "react";
import { FiClock } from "react-icons/fi";
import { MARKETS, clockOf, type ClockState } from "@/lib/marketClock";

// 30초마다 다시 계산 (분 단위 표시라 충분)
function useClocks(): ClockState[] {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);
  return now ? MARKETS.map(m => clockOf(m, now)) : [];
}

const dot = (c: ClockState) => (c.regular ? "bg-signal-green" : c.open ? "bg-amber-400" : "bg-gray-600");
const tone = (c: ClockState) => (c.regular ? "text-signal-green" : c.open ? "text-amber-400" : "text-gray-500");

/** 증시 탭 맨 위 한 줄: 국기·도시·현지 시각·상태. 휴대폰은 옆으로 밀어서 */
export function MarketClockStrip() {
  const clocks = useClocks();
  if (!clocks.length) return <div className="h-[52px]" />;
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
      {clocks.map(c => (
        <div key={c.def.key} title={c.next}
          className="shrink-0 flex items-center gap-2 rounded-xl border border-navy-border bg-navy-card px-3 py-1.5">
          <span className="text-base leading-none">{c.def.flag}</span>
          <div className="leading-tight">
            <p className="text-[11px] text-gray-500">{c.def.city}</p>
            <p className="text-sm font-bold text-white num">{c.time}</p>
          </div>
          <span className={`flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap ${tone(c)}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dot(c)} ${c.regular ? "animate-pulse" : ""}`} />{c.status}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 상단 메뉴바 시계 아이콘 → 세계 증시 시간표 */
export function MarketClockButton() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const clocks = useClocks();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [open]);
  const anyOpen = clocks.some(c => c.regular);
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label="세계 증시 시간"
        className="group relative flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
        <FiClock size={18} />
        {anyOpen && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-signal-green" />}
        {!open && <span className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-card border border-navy-border px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">세계 증시 시간</span>}
      </button>
      {open && (
        <div className="fixed left-3 right-3 top-[calc(var(--hdr,115px)+6px)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px] rounded-2xl border border-navy-border bg-navy-card shadow-2xl z-[90] p-3">
          <p className="text-xs text-gray-500 px-1 mb-2">세계 증시 시간 · 현지 시각</p>
          <ul className="divide-y divide-navy-border/60">
            {clocks.map(c => (
              <li key={c.def.key} className="flex items-center gap-3 py-2 px-1">
                <span className="text-lg leading-none">{c.def.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{c.def.name} <span className="text-xs text-gray-500">{c.def.city}</span></p>
                  <p className="text-xs text-gray-500 truncate">{c.next}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white num">{c.time}</p>
                  <p className={`text-[11px] font-semibold flex items-center justify-end gap-1 ${tone(c)}`}><span className={`w-1.5 h-1.5 rounded-full ${dot(c)}`} />{c.status}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-gray-600 px-1 mt-2">서머타임 자동 반영 · 나라별 공휴일 휴장은 반영되지 않습니다</p>
        </div>
      )}
    </div>
  );
}
