"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FiSearch, FiX } from "react-icons/fi";
import master from "@/data/stock_master.json";
import { logActivity } from "@/lib/activity";

type S = { code: string; name: string; market: string; type?: string };
const STOCKS = (master as { stocks: S[] }).stocks.filter(s => s.type !== "spac");
const RECENT_KEY = "recent-search";

function readRecent(): S[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}

// 상단 돋보기: 종목명·코드로 찾아 종목 상세로 이동
export default function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [recent, setRecent] = useState<S[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(readRecent());
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const starts: S[] = [], incl: S[] = [];
    for (const s of STOCKS) {
      const n = s.name.toLowerCase();
      if (n.startsWith(t) || s.code.startsWith(t)) starts.push(s);
      else if (n.includes(t)) incl.push(s);
    }
    // 정확히 같은 이름 → 짧은 이름(대표 종목일 가능성) → 일반 종목 우선
    const rank = (s: S) => (s.name.toLowerCase() === t ? -100 : 0) + s.name.length + (s.type && s.type !== "regular" ? 20 : 0);
    starts.sort((a, b) => rank(a) - rank(b));
    incl.sort((a, b) => rank(a) - rank(b));
    return [...starts, ...incl].slice(0, 20);
  }, [q]);

  const go = (s: S) => {
    logActivity("search", { q: q.trim() || null, code: s.code, name: s.name, from: "상단 검색" });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([s, ...readRecent().filter(r => r.code !== s.code)].slice(0, 8))); } catch { /* 무시 */ }
    onClose();
    router.push(`/stock/${s.code}`);
  };

  const list = q.trim() ? results : recent;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 flex justify-center items-start sm:pt-24" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-navy-card border-b sm:border border-navy-border sm:rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 h-14 border-b border-navy-border">
          <FiSearch className="text-gray-400 shrink-0" size={18} />
          <input ref={input} value={q} onChange={e => { setQ(e.target.value); setHi(0); }}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, list.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
              else if (e.key === "Enter" && list[hi]) go(list[hi]);
            }}
            placeholder="종목명 또는 코드 (예: 삼성전자, 005930)"
            className="flex-1 bg-transparent text-white text-base placeholder-gray-500 outline-none" />
          <button onClick={onClose} aria-label="닫기" className="p-1 text-gray-500 hover:text-white"><FiX size={20} /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!q.trim() && recent.length > 0 && <p className="px-4 pt-3 pb-1 text-[11px] text-gray-500">최근 검색</p>}
          {list.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">{q.trim() ? "검색 결과가 없습니다" : "국내 상장 종목 2,600여 개를 검색할 수 있습니다"}</p>
          ) : (
            <ul>
              {list.map((s, i) => (
                <li key={s.code}>
                  <button onClick={() => go(s)} onMouseEnter={() => setHi(i)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left ${i === hi ? "bg-cyan-brand/10" : ""}`}>
                    <span className="flex-1 text-sm font-semibold text-white truncate">{s.name}</span>
                    <span className="text-xs text-gray-500 num">{s.code}</span>
                    <span className="text-[10px] text-gray-500 w-12 text-right">{s.type === "etf" ? "ETF" : s.market === "KQ" ? "코스닥" : "코스피"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
