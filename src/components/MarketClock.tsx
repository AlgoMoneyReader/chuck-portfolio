"use client";

import { useEffect, useRef, useState } from "react";
import { TbTimezone } from "react-icons/tb";
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

// 한 줄에 들어가게: '프리마켓까지 3시간 8분' → '프리 3시간8분'
const shortNext = (t: string) => t.replace("마켓까지", "").replace("까지", "").replace(/시간 /, "시간").replace("일 ", "일");
const dot = (c: ClockState) => (c.regular ? "bg-signal-green" : c.open ? "bg-amber-400" : "bg-gray-600");
const tone = (c: ClockState) => (c.regular ? "text-signal-green" : c.open ? "text-amber-400" : "text-gray-500");

/** 증시 탭 맨 위 한 줄: 국기·도시·현지 시각·상태. 휴대폰은 옆으로 밀어서 */
export function MarketClockStrip() {
  const clocks = useClocks();
  if (!clocks.length) return <div className="h-[52px]" />;
  return (
    <>
    {/* 휴대폰: 국기·시각만 8칸 한 줄 (점 = 장중 초록 / 장외거래 노랑 / 휴장 회색) */}
    <div className="md:hidden grid grid-cols-8 gap-1 rounded-xl border border-navy-border bg-navy-card px-1.5 py-2">
      {clocks.map(c => (
        <div key={c.def.key} title={`${c.def.name} ${c.status} · ${c.next}`} className="flex flex-col items-center leading-none">
          <span className="relative text-base">
            {c.def.flag}
            <span className={`absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full ring-1 ring-navy-card ${dot(c)}`} />
          </span>
          <span className={`mt-1 text-[11px] font-semibold num ${c.regular ? "text-white" : "text-gray-400"}`}>{c.time}</span>
        </div>
      ))}
    </div>
    <div className="hidden md:flex gap-1.5 flex-wrap">
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
    </>
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
        <TbTimezone size={20} />
        {anyOpen && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-signal-green" />}
        {!open && <span className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-card border border-navy-border px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">세계 증시 시간</span>}
      </button>
      {open && (
        <div className="fixed left-3 right-3 top-[calc(var(--hdr,115px)+6px)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] rounded-2xl border border-navy-border bg-navy-card shadow-2xl z-[90] px-3 py-2.5">
          <p className="text-xs text-gray-500 px-1 mb-1">세계 증시 시간 · 현지 시각</p>
          <ul className="divide-y divide-navy-border/50">
            {clocks.map(c => (
              <li key={c.def.key} className="flex items-center gap-2 py-1.5 px-1 text-sm">
                <span className="text-base leading-none w-5 text-center">{c.def.flag}</span>
                <span className="w-9 text-gray-300 whitespace-nowrap">{c.def.name}</span>
                <span className="w-11 font-bold text-white num">{c.time}</span>
                <span className={`w-[4.5rem] flex items-center gap-1 text-xs font-semibold whitespace-nowrap ${tone(c)}`}><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot(c)}`} />{c.status}</span>
                <span className="flex-1 min-w-0 text-right text-[11px] text-gray-500 truncate" title={c.next}>{shortNext(c.next)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-gray-600 px-1 mt-1.5">서머타임 자동 반영 · 나라별 공휴일 휴장은 반영되지 않습니다</p>
        </div>
      )}
    </div>
  );
}
