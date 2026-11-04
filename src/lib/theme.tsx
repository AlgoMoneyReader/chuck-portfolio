"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";

import { THEME_COLOR, THEME_KEY, type Theme } from "@/lib/themeScript";

// 화면 테마: 기본 다크. 로그인 사용자는 user_metadata.theme 에 저장해 기기 간 공유, 비로그인은 localStorage.
export type { Theme };

const isTheme = (v: unknown): v is Theme => v === "dark" || v === "light";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", THEME_COLOR[t]));
  try { localStorage.setItem(THEME_KEY, t); } catch { /* 사파리 사생활 보호 모드 등 */ }
}

function readCurrent(): Theme {
  if (typeof document === "undefined") return "dark";
  const t = document.documentElement.dataset.theme;
  return isTheme(t) ? t : "dark";
}

interface ThemeState { theme: Theme; setTheme: (t: Theme) => void }
const Ctx = createContext<ThemeState>({ theme: "dark", setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>("dark");
  const synced = useRef<string | null>(null);

  // 하이드레이션 후 인라인 스크립트가 정한 값을 읽어온다
  useEffect(() => {
    const t = readCurrent();
    setThemeState(t);
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", THEME_COLOR[t]));
  }, []);

  // 로그인/세션 로드 시 계정에 저장된 테마를 우선 적용 (값이 바뀔 때만)
  const saved = user?.user_metadata?.theme;
  useEffect(() => {
    if (!user || !isTheme(saved)) return;
    const key = `${user.id}:${saved}`;
    if (synced.current === key) return;
    synced.current = key;
    applyTheme(saved);
    setThemeState(saved);
  }, [user, saved]);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    setThemeState(t);
    if (user) {
      synced.current = `${user.id}:${t}`;
      getBrowserSupabase()?.auth.updateUser({ data: { theme: t } }).catch(() => { /* 저장 실패해도 로컬 설정은 유지 */ });
    }
  }, [user]);

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
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
