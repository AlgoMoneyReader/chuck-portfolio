import type { MetadataRoute } from "next";
import { STOCK_MASTER_FILTERED } from "@/lib/stockMaster";
import { US_POPULAR } from "@/data/usPopular";

// 검색엔진용 사이트 지도 — 주요 화면 + 국내·미국 종목 화면 (/stock/005930 …)
const BASE = "https://alliknam.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "always", priority: 1 },
    { url: `${BASE}/flow`, lastModified: now, changeFrequency: "always", priority: 0.9 },
    { url: `${BASE}/news`, lastModified: now, changeFrequency: "always", priority: 0.8 },
    { url: `${BASE}/calendar`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/community`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
  ];
  const kr = STOCK_MASTER_FILTERED.map(s => ({ url: `${BASE}/stock/${s.code}`, lastModified: now, changeFrequency: "hourly" as const, priority: 0.6 }));
  const us = US_POPULAR.map(s => ({ url: `${BASE}/stock/${encodeURIComponent(s.code)}`, lastModified: now, changeFrequency: "hourly" as const, priority: 0.5 }));
  return [...pages, ...kr, ...us];
}
