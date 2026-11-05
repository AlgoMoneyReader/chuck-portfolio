"use client";

import { useCallback, useEffect, useState } from "react";
import { FONTS, FONT_KEY, FONT_SCALE_KEY } from "@/lib/themeScript";

// 글꼴·글자 크기: 기기마다 따로 저장(localStorage). 첫 화면 적용은 layout 의 FONT_INIT_SCRIPT 가 한다
/** 글꼴 목록을 열면 미리보기용으로 CSS 만 불러온다 (글자는 쓰인 만큼만 내려받음) */
export function loadFontCss(key: string) {
  const f = FONTS.find(x => x.key === key);
  if (!f?.css || document.getElementById(`font-css-${f.key}`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = f.css; l.id = `font-css-${f.key}`;
  document.head.appendChild(l);
}

export function applyFont(key: string) {
  const f = FONTS.find(x => x.key === key) ?? FONTS[1];
  const root = document.documentElement;
  if (f.key === "pretendard") root.style.removeProperty("--font-pretendard");
  else root.style.setProperty("--font-pretendard", f.stack);
  loadFontCss(f.key);
  try { localStorage.setItem(FONT_KEY, f.key); } catch { /* 무시 */ }
}

/** scale null = 시스템 설정(브라우저·기기 글자 크기 그대로) */
export function applyScale(scale: number | null) {
  const root = document.documentElement;
  if (scale == null) { root.style.removeProperty("font-size"); root.style.removeProperty("--fs"); }
  else { root.style.fontSize = `${scale * 100}%`; root.style.setProperty("--fs", String(scale)); }
  try { if (scale == null) localStorage.removeItem(FONT_SCALE_KEY); else localStorage.setItem(FONT_SCALE_KEY, String(scale)); } catch { /* 무시 */ }
  window.dispatchEvent(new Event("resize")); // 차트 등 크기 다시 계산
}

const readFont = () => { try { return localStorage.getItem(FONT_KEY) || "pretendard"; } catch { return "pretendard"; } };
const readScale = () => { try { const s = parseFloat(localStorage.getItem(FONT_SCALE_KEY) || ""); return s > 0.5 && s < 2 ? s : null; } catch { return null; } };

export function useFontPref() {
  // 글꼴·글자 크기는 기기마다 따로 (PC는 표준, 휴대폰은 작게 등) — 이 기기(localStorage)에만 저장
  const [font, setFontState] = useState("pretendard");
  const [scale, setScaleState] = useState<number | null>(null);

  useEffect(() => { setFontState(readFont()); setScaleState(readScale()); }, []);

  const setFont = useCallback((k: string) => { applyFont(k); setFontState(k); }, []);
  const previewScale = useCallback((s: number | null) => { applyScale(s); setScaleState(s); }, []);
  const commitScale = previewScale;

  return { font, scale, setFont, previewScale, commitScale };
}
