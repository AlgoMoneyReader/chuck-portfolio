import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // 색은 globals.css 의 CSS 변수(RGB 채널)로 정의 → html[data-theme="light"] 에서 한꺼번에 바뀐다.
      // <alpha-value> 덕분에 bg-navy-sub/60 같은 투명도 표기도 그대로 동작.
      colors: {
        white: v("white"),
        gray: {
          50: v("gray-50"), 100: v("gray-100"), 200: v("gray-200"), 300: v("gray-300"), 400: v("gray-400"),
          500: v("gray-500"), 600: v("gray-600"), 700: v("gray-700"), 800: v("gray-800"), 900: v("gray-900"), 950: v("gray-950"),
        },
        navy: {
          DEFAULT: v("navy"),
          sub: v("navy-sub"),
          card: v("navy-card"),
          border: v("navy-border"),
        },
        gold: {
          DEFAULT: v("gold"),
          light: v("gold-light"),
          dark: v("gold-dark"),
        },
        cyan: {
          brand: v("cyan-brand"),
          light: v("cyan-light"),
          dark: v("cyan-dark"),
        },
        electric: {
          blue: v("cyan-brand"),
          purple: v("electric-purple"),
        },
        signal: {
          green: v("signal-green"),
          red: v("signal-red"),
          amber: v("signal-amber"),
          blue: v("cyan-brand"),
        },
      },
      fontFamily: {
        sans: ["var(--font-pretendard)", "Pretendard Variable", "Pretendard", "-apple-system", "sans-serif"],
        mono: ["var(--font-pretendard)", "Pretendard Variable", "Pretendard", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 24px rgba(0, 0, 0, 0.4)",
        glow: "0 0 24px rgba(245, 184, 0, 0.25)",
        "glow-cyan": "0 0 24px rgba(37, 99, 255, 0.25)",
        "glow-purple": "0 0 24px rgba(124, 58, 237, 0.2)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        tick: {
          "0%": { backgroundColor: "var(--tick-flash)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        tick: "tick 0.8s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
