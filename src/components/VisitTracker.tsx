"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { markAdminDevice, trackVisit } from "@/lib/activity";
import { useAuth } from "./AuthProvider";

// 페이지 이동마다 방문 통계 1회 (운영자 대시보드용). 운영자 본인 방문은 세지 않는다
export default function VisitTracker() {
  const path = usePathname() ?? "/";
  const { loading, isAdmin } = useAuth();
  useEffect(() => { if (isAdmin) markAdminDevice(); }, [isAdmin]);
  useEffect(() => {
    if (loading || isAdmin) return; // 로그인 확인이 끝난 뒤에, 운영자가 아니면
    const t = setTimeout(() => trackVisit(path), 800);
    return () => clearTimeout(t);
  }, [path, loading, isAdmin]);
  return null;
}
