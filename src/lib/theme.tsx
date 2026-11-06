"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";

import { THEME_COLOR, THEME_KEY, type Theme, type ThemePref } from "@/lib/themeScript";

// 화면 테마: 기본은 시스템 설정(폰·PC 라이트/다크) 따름. 로그인 사용자는 user_metadata.theme 에 저장해 기기 간 공유, 비로그인은 localStorage.
export type { Theme, ThemePref };

const isTheme = (v: unknown): v is Theme => v === "dark" || v === "light";
const isPref = (v: unknown): v is ThemePref => isTheme(v) || v === "system";
const systemTheme = (): Theme => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");

// 고른 값 저장 + 실제 화면 테마 적용. '시스템'은 저장값을 지워 다음 방문에도 기기 설정을 따르게 한다
function applyTheme(p: ThemePref): Theme {
  const t = p === "system" ? systemTheme() : p;
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", THEME_COLOR[t]));
  try { if (p === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, p); } catch { /* 사파리 사생활 보호 모드 등 */ }
  return t;
}
function readPref(): ThemePref {
  try { const v = localStorage.getItem(THEME_KEY); return isTheme(v) ? v : "system"; } catch { return "system"; }
}

function readCurrent(): Theme {
  if (typeof document === "undefined") return "dark";
  const t = document.documentElement.dataset.theme;
  return isTheme(t) ? t : "dark";
}

interface ThemeState { theme: Theme; pref: ThemePref; setTheme: (p: ThemePref) => void }
const Ctx = createContext<ThemeState>({ theme: "dark", pref: "system", setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>("dark");
  const [pref, setPref] = useState<ThemePref>("system");
  const synced = useRef<string | null>(null);

  // 하이드레이션 후 인라인 스크립트가 정한 값을 읽어온다
  useEffect(() => {
    const t = readCurrent();
    setThemeState(t);
    setPref(readPref());
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", THEME_COLOR[t]));
  }, []);

  // 로그인/세션 로드 시 계정에 저장된 테마를 우선 적용 (값이 바뀔 때만)
  const saved = user?.user_metadata?.theme;
  useEffect(() => {
    if (!user || !isPref(saved)) return;
    const key = `${user.id}:${saved}`;
    if (synced.current === key) return;
    synced.current = key;
    setThemeState(applyTheme(saved));
    setPref(saved);
  }, [user, saved]);

  // '시스템'일 때 기기 설정이 바뀌면(밤에 자동 다크 등) 바로 따라간다
  useEffect(() => {
    if (pref !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => setThemeState(applyTheme("system"));
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [pref]);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(applyTheme(t));
    setPref(t);
    if (user) {
      synced.current = `${user.id}:${t}`;
      getBrowserSupabase()?.auth.updateUser({ data: { theme: t } }).catch(() => { /* 저장 실패해도 로컬 설정은 유지 */ });
    }
  }, [user]);

  return <Ctx.Provider value={{ theme, pref, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

// 차트 라이브러리(lightweight-charts 등)처럼 CSS 클래스를 못 쓰는 곳에 넘길 색
export const CHART_COLORS: Record<Theme, {
  text: string; grid: string; border: string; refLine: string; up: string; down: string; upVol: string; downVol: string; crosshair: string; dot: string;
}> = {
  dark: {
    text: "#8B93A7", grid: "rgba(26,37,69,0.6)", border: "#1A2545", refLine: "#9CA3AF",
    up: "#1D9E75", down: "#E24B4A", upVol: "rgba(29,158,117,0.35)", downVol: "rgba(226,75,74,0.35)", crosshair: "", dot: "#0D1530",
  },
  light: {
    text: "#64748B", grid: "rgba(220,226,238,0.9)", border: "#DCE2EE", refLine: "#94A3B8",
    up: "#0C8A62", down: "#DC3232", upVol: "rgba(12,138,98,0.3)", downVol: "rgba(220,50,50,0.3)", crosshair: "#94A3B8", dot: "#FFFFFF",
  },
};

export const useChartColors = () => CHART_COLORS[useTheme().theme];
