// 서버 컴포넌트(layout)에서 쓰는 값이라 "use client" 모듈(theme.tsx)과 분리해 둔다
export type Theme = "dark" | "light";
export type ThemePref = Theme | "system";
export const THEME_KEY = "theme";
export const THEME_COLOR: Record<Theme, string> = { dark: "#04091A", light: "#F4F6FB" };

// layout <head> 에 그대로 넣는 스크립트 — 첫 페인트 전에 data-theme 를 박아 깜빡임을 막는다
// 직접 고른 적이 없으면(또는 '시스템') 폰·PC의 라이트/다크 설정을 따른다
export const THEME_INIT_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem("${THEME_KEY}");}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.dataset.theme=t;var c=t==="light"?"${"#F4F6FB"}":"${"#04091A"}";var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",c);}catch(e){}})();`;

// ── 글꼴·글자 크기 (My > 설정) ─────────────────────────────────────────────
export const FONT_KEY = "font";
export const FONT_SCALE_KEY = "fontScale";
export interface FontDef { key: string; label: string; desc: string; stack: string; css?: string }
const KR_FALLBACK = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const GF = (family: string) => `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
export const FONTS: FontDef[] = [
  { key: "system", label: "시스템 설정", desc: "기기 기본 글꼴 (애플 SD 산돌고딕·맑은 고딕 등)", stack: KR_FALLBACK },
  { key: "pretendard", label: "Pretendard", desc: "기본 · 숫자가 또렷한 앱 글꼴", stack: `'Pretendard Variable', 'Pretendard', ${KR_FALLBACK}` },
  { key: "nanum", label: "나눔고딕", desc: "익숙하고 편안한 기본 고딕", stack: `'Nanum Gothic', ${KR_FALLBACK}`, css: GF("Nanum+Gothic:wght@400;700;800") },
  { key: "suit", label: "SUIT", desc: "증권·금융 앱에서 많이 쓰는 단정한 고딕", stack: `'SUIT Variable', 'SUIT', ${KR_FALLBACK}`, css: "https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css" },
  { key: "noto", label: "본고딕 (Noto Sans KR)", desc: "구글·어도비 표준 고딕, 안정적인 가독성", stack: `'Noto Sans KR', ${KR_FALLBACK}`, css: GF("Noto+Sans+KR:wght@400;500;600;700;800") },
  { key: "plex", label: "IBM Plex Sans KR", desc: "기술적인 느낌, 숫자 구분이 분명", stack: `'IBM Plex Sans KR', ${KR_FALLBACK}`, css: GF("IBM+Plex+Sans+KR:wght@400;500;600;700") },
  { key: "gothica1", label: "Gothic A1", desc: "획이 가늘고 깔끔한 고딕", stack: `'Gothic A1', ${KR_FALLBACK}`, css: GF("Gothic+A1:wght@400;500;600;700;800") },
  { key: "gowun", label: "고운돋움", desc: "부드럽고 따뜻한 손글씨풍 돋움", stack: `'Gowun Dodum', ${KR_FALLBACK}`, css: GF("Gowun+Dodum") },
];
// 글자 크기 단계 (1 = 표준). null(=시스템 설정)은 브라우저·기기 글자 크기를 그대로 따른다
export const FONT_SCALES = [0.875, 0.9375, 1, 1.0625, 1.125, 1.25];
export const FONT_SCALE_LABELS = ["작게", "조금 작게", "표준", "조금 크게", "크게", "아주 크게"];

// 첫 페인트 전에 글꼴·크기를 적용 (깜빡임 방지). 글꼴 CSS 는 고른 것만 불러온다
export const FONT_INIT_SCRIPT = `(function(){try{var F=${JSON.stringify(Object.fromEntries(FONTS.map(f => [f.key, [f.stack, f.css || ""]])))};var d=document.documentElement;var k=localStorage.getItem("${FONT_KEY}");if(k&&F[k]&&k!=="pretendard"){d.style.setProperty("--font-pretendard",F[k][0]);if(F[k][1]){var l=document.createElement("link");l.rel="stylesheet";l.href=F[k][1];l.id="font-css-"+k;document.head.appendChild(l);}}var s=parseFloat(localStorage.getItem("${FONT_SCALE_KEY}")||"");if(s>0.5&&s<2){d.style.fontSize=(s*100)+"%";d.style.setProperty("--fs",String(s));}}catch(e){}})();`;
