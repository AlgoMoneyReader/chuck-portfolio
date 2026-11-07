"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiSearch, FiX } from "react-icons/fi";
import master from "@/data/stock_master.json";
import { logActivity, trackSearch } from "@/lib/activity";
import { US_POPULAR } from "@/data/usPopular";
import { searchAsia } from "@/data/asiaStocks";
import { useStockModal } from "./StockModal";

type S = { code: string; name: string; market: string; type?: string };
const KR = (master as { stocks: S[] }).stocks.filter(s => s.type !== "spac");
// 미국 인기 종목·ETF: 한글 이름·별칭(ko)으로도 찾는다
const US: (S & { ko: string })[] = US_POPULAR.map(u => ({ code: u.code, name: u.name, market: "US", type: u.type === "etf" ? "us-etf" : "us", ko: u.ko }));
const RECENT_KEY = "recent-search";

function readRecent(): S[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}

// 상단 돋보기: 종목명·코드로 찾아 종목 상세로 이동
export default function SearchOverlay({ onClose }: { onClose: () => void }) {
  const stockModal = useStockModal();
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
    for (const s of KR) {
      const n = s.name.toLowerCase();
      if (n.startsWith(t) || s.code.startsWith(t)) starts.push(s);
      else if (n.includes(t)) incl.push(s);
    }
    for (const s of US) {
      const n = s.name.toLowerCase(), c = s.code.toLowerCase(), ko = s.ko.toLowerCase();
      if (c === t || c.startsWith(t) || ko.split(" ").some(w => w.startsWith(t))) starts.push(s);
      else if (n.includes(t) || ko.includes(t)) incl.push(s);
    }
    // 목록에 없는 미국 티커도 직접 입력해 볼 수 있게
    const raw = q.trim().toUpperCase();
    if (/^[A-Z][A-Z.\-]{0,5}$/.test(raw) && !US.some(u => u.code === raw)) incl.push({ code: raw, name: `${raw} (미국 티커 직접 입력)`, market: "US", type: "us" });
    // 정확히 같은 이름 → 짧은 이름(대표 종목일 가능성) → 일반 종목 우선
    const rank = (s: S) => (s.name.toLowerCase() === t || s.code.toLowerCase() === t ? -100 : 0) + (s.market === "US" ? 3 : s.name.length) + (s.type && s.type !== "regular" && s.market !== "US" ? 20 : 0);
    starts.sort((a, b) => rank(a) - rank(b));
    incl.sort((a, b) => rank(a) - rank(b));
    // 아시아(일본·대만·홍콩·중국): 한글 이름·코드, 목록 밖 종목은 접미사(.T/.TW/.HK/.SS/.SZ)로 직접 입력
    const asia: S[] = searchAsia(q, 8).map(h => ({ code: h.code, name: h.name, market: "ASIA", type: h.label }));
    return [...starts, ...incl].slice(0, 16).concat(asia).slice(0, 24);
  }, [q]);

  const go = (s: S) => {
    logActivity("search", { q: q.trim() || null, code: s.code, name: s.name, from: "상단 검색" });
    trackSearch(q.trim() || s.name);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([s, ...readRecent().filter(r => r.code !== s.code)].slice(0, 8))); } catch { /* 무시 */ }
    onClose();
    // 국내·미국 모두 종목 팝업(현황·정보·뉴스·공시·레이더)
    stockModal({ code: s.code, market: s.market === "US" || s.market === "ASIA" ? "US" : undefined, name: s.name.replace(/ \((미국 티커 )?직접 입력\)$/, "") });
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
            placeholder="종목명·코드·티커 (예: 삼성전자, 테슬라, TSMC, 키옥시아)"
            className="flex-1 bg-transparent text-white text-base placeholder-gray-500 outline-none" />
          <button onClick={onClose} aria-label="닫기" className="p-1 text-gray-500 hover:text-white"><FiX size={20} /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!q.trim() && recent.length > 0 && <p className="px-4 pt-3 pb-1 text-[11px] text-gray-500">최근 검색</p>}
          {list.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">{q.trim() ? "검색 결과가 없습니다" : "국내 2,600여 종목, 미국 인기 종목·ETF, 일본·대만·홍콩·중국 대표 종목을 검색할 수 있습니다 (예: 7203.T, 2330.TW, 0700.HK)"}</p>
          ) : (
            <ul>
              {list.map((s, i) => (
                <li key={s.code}>
                  <button onClick={() => go(s)} onMouseEnter={() => setHi(i)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left ${i === hi ? "bg-cyan-brand/10" : ""}`}>
                    <span className="flex-1 text-sm font-semibold text-white truncate">{s.name}</span>
                    <span className="text-xs text-gray-500 num">{s.code}</span>
                    <span className="text-[10px] text-gray-500 w-14 text-right">{s.market === "ASIA" ? s.type : s.type === "us-etf" ? "미국 ETF" : s.market === "US" ? "미국" : s.type === "etf" ? "ETF" : s.market === "KQ" ? "코스닥" : "코스피"}</span>
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
