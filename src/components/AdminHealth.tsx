"use client";

import { useState } from "react";
import { authFetch } from "@/lib/supabase/authFetch";

// 운영자 화면: 서버 설정(API 키 있음/없음·외부 연결) 점검 — /api/health 는 운영자만 부를 수 있다
export default function AdminHealth() {
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { const r = await authFetch("/api/health"); setOut(JSON.stringify(await r.json(), null, 2)); }
    catch (e) { setOut(String(e)); }
    setBusy(false);
  };
  return (
    <section className="card space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-white">서버 설정 점검</p>
        <span className="text-xs text-gray-500">API 키 등록 여부·외부 연결 상태 (키 값은 표시하지 않음)</span>
        <button onClick={run} disabled={busy} className="ml-auto px-3 py-1.5 rounded-lg bg-cyan-brand text-white text-xs font-bold on-color disabled:opacity-50">{busy ? "점검 중…" : "점검 실행"}</button>
      </div>
      {out && <pre className="text-[11px] text-gray-300 bg-navy-sub rounded-lg p-3 overflow-x-auto max-h-80">{out}</pre>}
    </section>
  );
}
