import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#04091A",
          sub: "#080F24",
          card: "#0D1530",
          border: "#1A2545",
        },
        gold: {
          DEFAULT: "#F5B800",
          light: "#FFD040",
          dark: "#C89000",
        },
        cyan: {
          brand: "#2563FF",
          light: "#5B8FFF",
          dark: "#1A45CC",
        },
        electric: {
          blue: "#2563FF",
          purple: "#7C3AED",
        },
        signal: {
          green: "#1D9E75",
          red: "#E24B4A",
          amber: "#EF9F27",
          blue: "#2563FF",
        },
      },
      fontFamily: {
        sans: ["var(--font-pretendard)", "Pretendard Variable", "Pretendard", "-apple-system", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
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
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
