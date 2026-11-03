import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "알읽남 — 투자 대시보드",
    short_name: "알읽남",
    description: "실시간 시장 데이터 · 뉴스 · 경제 캘린더 · 커뮤니티",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#04091A",
    theme_color: "#04091A",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
