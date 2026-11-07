"use client";

import { getBrowserSupabase } from "./supabase/client";

// 오류 1건을 운영자 화면용으로 기록. 같은 화면에선 최대 5건, 같은 내용은 한 번만 (supabase/update-2026-11-08.sql)
const sent = new Set<string>();
// 사용자 탓이 아니거나 의미 없는 것: 확장 프로그램·네트워크 끊김·취소된 요청 등
const IGNORE = /ResizeObserver loop|Script error\.?$|AbortError|aborted|Failed to fetch|NetworkError|Load failed|chrome-extension|moz-extension|safari-extension|The operation was aborted|cancelled/i;

export function reportError(err: unknown, kind: string) {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err ?? "unknown"));
    const message = `${e.name && e.name !== "Error" ? `${e.name}: ` : ""}${e.message || String(err)}`.slice(0, 300);
    if (!message || IGNORE.test(message) || IGNORE.test(e.stack ?? "")) return;
    const key = message + location.pathname;
    if (sent.has(key) || sent.size >= 5) return;
    sent.add(key);
    getBrowserSupabase()?.rpc("log_client_error", {
      p_message: message, p_stack: (e.stack ?? "").slice(0, 1500), p_path: location.pathname.slice(0, 100),
      p_kind: kind.slice(0, 20), p_ua: navigator.userAgent.slice(0, 200),
    }).then(() => {}, () => {});
  } catch { /* 오류 기록 중 오류는 무시 */ }
}
