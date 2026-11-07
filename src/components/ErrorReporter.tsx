"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errorReport";

// 사용자 화면에서 난 오류를 운영자 화면으로 모은다 (스크립트 오류 · 처리 안 된 Promise 오류)
export default function ErrorReporter() {
  useEffect(() => {
    const onErr = (e: ErrorEvent) => reportError(e.error ?? e.message, "window");
    const onRej = (e: PromiseRejectionEvent) => reportError(e.reason, "promise");
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}
