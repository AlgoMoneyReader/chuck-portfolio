"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackVisit } from "@/lib/activity";

// 페이지 이동마다 방문 통계 1회 (운영자 대시보드용)
export default function VisitTracker() {
  const path = usePathname() ?? "/";
  useEffect(() => { const t = setTimeout(() => trackVisit(path), 800); return () => clearTimeout(t); }, [path]);
  return null;
}
