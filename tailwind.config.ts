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
          DEFAULT: "#07111E",
          sub: "#0E1B2D",
          card: "#111F30",
          border: "#1A2D42",
        },
        gold: {
          DEFAULT: "#C8A840",
          light: "#E2C060",
          dark: "#A08030",
        },
        cyan: {
          brand: "#00C8C8",
          light: "#40DEDE",
          dark: "#008A8A",
        },
        signal: {
          green: "#1D9E75",
          red: "#E24B4A",
          amber: "#EF9F27",
          blue: "#4A90E2",
        },
      },
      fontFamily: {
        sans: ["var(--font-noto)", "Noto Sans KR", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 4px 24px rgba(0, 0, 0, 0.4)",
        glow: "0 0 20px rgba(200, 168, 64, 0.2)",
        "glow-cyan": "0 0 20px rgba(0, 200, 200, 0.2)",
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
