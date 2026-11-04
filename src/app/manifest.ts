import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "알읽남 - 증시 레이더",
    short_name: "알읽남",
    description: "알고리즘이 읽어주는 시장 · 실시간 수급·시황·뉴스·실적 캘린더",
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
