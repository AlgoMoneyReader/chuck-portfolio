"use client";

import { getBrowserSupabase } from "./supabase/client";

// 로그인한 회원의 활동 기록 (운영자 대시보드용). 게스트는 기록하지 않는다. 실패해도 무시.
export type ActivityKind = "login" | "search" | "view" | "watch" | "portfolio" | "analyze" | "post" | "theme";

export async function logActivity(kind: ActivityKind, detail: Record<string, unknown> = {}) {
  try {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    await sb.from("activity_logs").insert({ user_id: uid, kind, detail });
  } catch { /* 무시 */ }
}
