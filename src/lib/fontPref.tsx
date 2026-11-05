"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { FONTS, FONT_KEY, FONT_SCALE_KEY } from "@/lib/themeScript";

// 글꼴·글자 크기: 이 기기(localStorage)에 저장하고, 로그인하면 계정(user_metadata)에도 저장해 다른 기기와 맞춘다
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
  const { user } = useAuth();
  const [font, setFontState] = useState("pretendard");
  const [scale, setScaleState] = useState<number | null>(null);
  const synced = useRef<string | null>(null);

  useEffect(() => { setFontState(readFont()); setScaleState(readScale()); }, []);

  // 계정에 저장된 값이 있으면 적용 (로그인 직후 한 번)
  const meta = user?.user_metadata as { font?: string; fontScale?: number | null } | undefined;
  useEffect(() => {
    if (!user || !meta) return;
    const key = `${user.id}:${meta.font}:${meta.fontScale}`;
    if (synced.current === key) return;
    synced.current = key;
    if (meta.font && FONTS.some(f => f.key === meta.font)) { applyFont(meta.font); setFontState(meta.font); }
    if (meta.fontScale !== undefined) { applyScale(meta.fontScale ?? null); setScaleState(meta.fontScale ?? null); }
  }, [user, meta]);

  const save = useCallback((patch: { font?: string; fontScale?: number | null }) => {
    if (!user) return;
    synced.current = `${user.id}:${patch.font ?? meta?.font}:${patch.fontScale !== undefined ? patch.fontScale : meta?.fontScale}`;
    getBrowserSupabase()?.auth.updateUser({ data: patch }).catch(() => { /* 로컬 설정은 유지 */ });
  }, [user, meta]);

  const setFont = useCallback((k: string) => { applyFont(k); setFontState(k); save({ font: k }); }, [save]);
  // 미리보기(드래그 중)는 적용만, 손을 떼면 저장
  const previewScale = useCallback((s: number | null) => { applyScale(s); setScaleState(s); }, []);
  const commitScale = useCallback((s: number | null) => { applyScale(s); setScaleState(s); save({ fontScale: s }); }, [save]);

  return { font, scale, setFont, previewScale, commitScale };
}

/** 레이아웃에 한 번: 로그인하면 계정에 저장된 글꼴·크기를 어느 화면에서든 적용 */
export function FontSync() { useFontPref(); return null; }
