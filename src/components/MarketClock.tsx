"use client";

import { useEffect, useRef, useState } from "react";
import { TbTimezone } from "react-icons/tb";
import { MARKETS, clockOf, upcomingHolidays, type ClockState } from "@/lib/marketClock";

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

// 한국시간 하루(06시~다음날 06시) 위에 각 시장 정규장 막대, 세로선 = 지금
function TimeBars({ clocks }: { clocks: ClockState[] }) {
  const k = new Date(Date.now() + 9 * 3_600_000);
  const nowM = ((k.getUTCHours() * 60 + k.getUTCMinutes()) - 360 + 1440) % 1440; // 06시 기준
  return (
    <div className="mt-2 px-1">
      <div className="relative ml-7 h-3 text-[9px] text-gray-600 num">
        {[6, 12, 18, 0].map(h => <span key={h} className="absolute -translate-x-1/2" style={{ left: `${(((h * 60 - 360) + 1440) % 1440) / 14.4}%` }}>{h}시</span>)}
      </div>
      <div className="relative space-y-1">
        {clocks.map(c => (
          <div key={c.def.key} className="flex items-center gap-1.5">
            <span className="w-5 text-center text-xs leading-none">{c.def.flag}</span>
            <div className="relative flex-1 h-2 rounded-full bg-navy-sub">
              {c.barsKst.map(([a, b], i) => {
                const s0 = (((a - 360) % 1440) + 1440) % 1440, len = b - a;
                const parts: [number, number][] = s0 + len > 1440 ? [[s0, 1440 - s0], [0, s0 + len - 1440]] : [[s0, len]];
                return parts.map(([x, w], j) => <span key={`${i}-${j}`} className={`absolute inset-y-0 rounded-full ${c.regular ? "bg-signal-green" : "bg-cyan-brand/50"}`} style={{ left: `${x / 14.4}%`, width: `${w / 14.4}%` }} />);
              })}
            </div>
          </div>
        ))}
        <span className="absolute top-0 bottom-0 w-px bg-gold" style={{ left: `calc(1.75rem + (100% - 1.75rem) * ${nowM / 1440})` }} />
      </div>
      <p className="text-[10px] text-gray-600 mt-1">막대 = 정규장(한국시간) · 노란 선 = 지금</p>
    </div>
  );
}

// 다가오는 3주 휴장일·조기폐장 (현지 날짜)
function HolidayList() {
  const list = upcomingHolidays(21);
  return (
    <div className="mt-2 px-1 border-t border-navy-border/50 pt-2">
      <p className="text-[11px] text-gray-500 mb-1">다가오는 휴장일 (3주 · 현지 날짜)</p>
      {list.length === 0 ? <p className="text-xs text-gray-600">예정된 휴장일이 없습니다</p> : (
        <ul className="space-y-0.5">
          {list.map(({ def, h, label }) => (
            <li key={`${def.key}-${h.date}`} className="flex items-center gap-2 text-xs">
              <span className="w-5 text-center leading-none">{def.flag}</span>
              <span className="w-16 text-gray-400 num">{label}</span>
              <span className="flex-1 min-w-0 truncate text-gray-200">{h.name}</span>
              <span className={`shrink-0 font-semibold ${h.early ? "text-amber-400" : "text-signal-red"}`}>{h.early ? `${h.early}(현지)` : "휴장"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const dot = (c: ClockState) => (c.regular ? "bg-signal-green" : c.open ? "bg-amber-400" : "bg-gray-600");
const tone = (c: ClockState) => (c.regular ? "text-signal-green" : c.open ? "text-amber-400" : "text-gray-500");

/** 증시 탭 맨 위 한 줄: 국기·도시·현지 시각·상태. 휴대폰은 옆으로 밀어서 */
export function MarketClockStrip() {
  const clocks = useClocks();
  const [sel, setSel] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // 국기를 누르면 설명 팝업, 다른 곳을 누르면 닫힘
  useEffect(() => {
    if (!sel) return;
    const close = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setSel(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [sel]);
  if (!clocks.length) return <div className="h-[52px]" />;
  const c0 = clocks.find(c => c.def.key === sel);
  return (
    <div ref={box} className="relative" data-tour="clock">
    {/* 휴대폰: 8칸 한 줄, 한국시간 기준 — 장중(초록)은 마감까지 남은 시간, 장 밖은 다음 개장 시각 */}
    <div className="md:hidden grid grid-cols-8 gap-1 rounded-xl border border-navy-border bg-navy-card px-1.5 py-2">
      {clocks.map(c => (
        <button key={c.def.key} onClick={() => setSel(k => (k === c.def.key ? null : c.def.key))}
          className={`flex flex-col items-center leading-none rounded-lg py-0.5 ${sel === c.def.key ? "bg-navy-sub" : ""}`}>
          <span className="relative text-base">
            {c.def.flag}
            <span className={`absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full ring-1 ring-navy-card ${dot(c)}`} />
          </span>
          {/* 장중: '-4:54'(D-day처럼 남은 시간) · 점심 직전은 노랑 · 점심 휴장 중엔 '점심' · 장 밖: 다음 개장 시각 */}
          <span className={`mt-1 text-[10px] font-semibold num whitespace-nowrap ${c.phase === "toClose" ? "text-signal-green" : c.phase === "toLunch" || c.phase === "lunch" ? "text-amber-400" : "text-gray-400"}`}>
            {c.regular ? `-${c.leftShort}` : c.phase === "lunch" ? "점심" : c.short.replace(" 개장", "").replace(/^[일월화수목금토] /, "")}
          </span>
        </button>
      ))}
    </div>
    {/* PC: 8칸 한 줄 — 위: 국기·나라·상태 점 / 아래: 한국시간 기준 문구 */}
    <div className="hidden md:grid grid-cols-8 gap-1.5">
      {clocks.map(c => (
        <button key={c.def.key} onClick={() => setSel(k => (k === c.def.key ? null : c.def.key))}
          className={`min-w-0 text-left rounded-xl border bg-navy-card px-2.5 py-1.5 ${sel === c.def.key ? "border-cyan-brand/60" : "border-navy-border"}`}>
          <p className="flex items-center gap-1.5 text-xs text-gray-400 leading-tight">
            <span className="text-sm leading-none">{c.def.flag}</span>
            <span className="truncate">{c.def.name}</span>
            <span className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${dot(c)} ${c.regular ? "animate-pulse" : ""}`} />
          </p>
          <p className={`mt-0.5 text-[13px] font-bold num truncate ${c.phase === "toClose" ? "text-white" : c.phase === "closed" ? "text-gray-400" : "text-amber-400"}`} title={c.short}>{c.short}</p>
        </button>
      ))}
    </div>
    {/* 설명 팝업 */}
    {c0 && (
      <div className="absolute left-0 right-0 md:left-auto md:w-[360px] top-full mt-1.5 z-40 rounded-xl border border-navy-border bg-navy-card shadow-2xl p-3 text-sm animate-fade-in">
        <p className="flex items-center gap-2 font-semibold text-white">
          <span className="text-lg leading-none">{c0.def.flag}</span>{c0.def.name} 증시
          <span className={`ml-auto flex items-center gap-1 text-xs ${tone(c0)}`}><span className={`w-1.5 h-1.5 rounded-full ${dot(c0)}`} />{c0.status}</span>
        </p>
        <p className="mt-1.5 text-gray-200">{
          c0.phase === "toClose" ? `지금 정규장 거래 중 · 마감까지 ${c0.left} 남음`
          : c0.phase === "toLunch" ? `지금 오전장 거래 중 · 점심 휴장까지 ${c0.left} 남음`
          : c0.phase === "lunch" ? `지금 점심 휴장 중 · 한국시간 ${c0.resumeKst}에 오후장 재개`
          : `다음 정규장 개장: ${c0.short.replace(" 개장", "")}`}</p>
        {c0.holiday && <p className="mt-1 text-xs text-signal-red">오늘 {c0.holiday}</p>}
        <p className="mt-1 text-xs text-gray-500">정규장(한국시간): {c0.barsKst.map(([a, b]) => `${String(Math.floor((a % 1440) / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}~${String(Math.floor((b % 1440) / 60)).padStart(2, "0")}:${String(b % 60).padStart(2, "0")}`).join(", ")}</p>
        {c0.lunchKst && <p className="text-xs text-gray-500">점심 휴장(한국시간): {c0.lunchKst}</p>}
        <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">시각은 모두 <b className="text-gray-300">한국시간</b> 기준입니다. <span className="text-signal-green">-4:54</span> = 마감까지 4시간 54분 남음, <span className="text-amber-400">노랑</span> = 점심 휴장 전후(중국·홍콩·일본), 회색 시각 = 다음 개장 시각. 점: 초록 장중 · 노랑 장외거래 · 회색 휴장</p>
      </div>
    )}
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
        <TbTimezone size={20} />
        {anyOpen && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-signal-green" />}
        {!open && <span className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-card border border-navy-border px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">세계 증시 시간</span>}
      </button>
      {open && (
        <div className="fixed left-3 right-3 top-[calc(var(--hdr,115px)+6px)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] rounded-2xl border border-navy-border bg-navy-card shadow-2xl z-[90] px-3 py-2.5">
          <p className="text-xs text-gray-500 px-1 mb-1">세계 증시 시간 · 모두 한국시간 기준</p>
          <ul className="divide-y divide-navy-border/50">
            {clocks.map(c => (
              <li key={c.def.key} className="flex items-center gap-2 py-1.5 px-1 text-sm">
                <span className="text-base leading-none w-5 text-center">{c.def.flag}</span>
                <span className="w-9 text-gray-300 whitespace-nowrap">{c.def.name}</span>
                <span className={`w-[4.5rem] flex items-center gap-1 text-xs font-semibold whitespace-nowrap ${tone(c)}`}><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot(c)}`} />{c.status}</span>
                <span className={`flex-1 min-w-0 text-right text-xs num truncate ${c.regular ? "text-white font-semibold" : "text-gray-400"}`}>{c.holiday ? <span className="text-signal-red mr-1">{c.holiday}</span> : null}{c.short}</span>
              </li>
            ))}
          </ul>
          <TimeBars clocks={clocks} />
          <HolidayList />
          <p className="text-[10px] text-gray-600 px-1 mt-1.5">서머타임·휴장일 반영 · 거래소 임시휴장은 다를 수 있습니다</p>
        </div>
      )}
    </div>
  );
}
