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

// ── 운영 통계 (로그인 여부와 상관없이 숫자만 센다 · supabase/stats.sql) ──
// 운영자가 한 번이라도 로그인한 기기는 통계에서 뺀다 (로그아웃 상태로 둘러봐도 계속 제외)
const noTrack = () => { try { return localStorage.getItem("notrack") === "1"; } catch { return false; } };
function rpc(fn: string, args: Record<string, unknown>, always = false) {
  if (!always && noTrack()) return;
  try { getBrowserSupabase()?.rpc(fn, args).then(() => {}, () => {}); } catch { /* 무시 */ }
}
/** 브라우저마다 무작위 방문자 ID (개인정보 아님, 이 기기에만 저장) */
function visitorId(): string {
  try {
    let v = localStorage.getItem("vid");
    if (!v) { v = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40); localStorage.setItem("vid", v); }
    return v;
  } catch { return ""; }
}
/** 운영자 기기 표시 + 이 기기로 쌓인 방문 기록 삭제 (처음 한 번) */
export function markAdminDevice() {
  if (noTrack()) return;
  try { localStorage.setItem("notrack", "1"); } catch { /* 무시 */ }
  const v = visitorId();
  if (v.length >= 8) rpc("forget_visitor", { p_vid: v }, true);
}
export const trackVisit = (path: string) => { const v = visitorId(); if (v.length >= 8) rpc("track_visit", { p_vid: v, p_path: path }); };
export const trackStock = (code: string, name?: string) => rpc("track_stock", { p_code: code, p_name: name ?? null });
export const trackSearch = (q: string) => { if (q.trim()) rpc("track_search", { p_q: q.trim() }); };
