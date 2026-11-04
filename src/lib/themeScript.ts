// 서버 컴포넌트(layout)에서 쓰는 값이라 "use client" 모듈(theme.tsx)과 분리해 둔다
export type Theme = "dark" | "light";
export const THEME_KEY = "theme";
export const THEME_COLOR: Record<Theme, string> = { dark: "#04091A", light: "#F4F6FB" };

// layout <head> 에 그대로 넣는 스크립트 — 첫 페인트 전에 data-theme 를 박아 깜빡임을 막는다
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;
