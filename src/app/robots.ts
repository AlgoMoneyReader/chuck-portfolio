import type { MetadataRoute } from "next";

// 검색엔진 수집 규칙 — 운영자·API·개인 화면은 제외
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/me", "/portfolio", "/prompts", "/auth/"] }],
    sitemap: "https://alliknam.vercel.app/sitemap.xml",
    host: "https://alliknam.vercel.app",
  };
}
