"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { relTime } from "@/lib/time";

// 운영자: 사용자 화면에서 난 오류 (최근 7일, 많이 난 순)
interface Row { id: number; day: string; message: string; path: string; kind: string | null; stack: string | null; ua: string | null; count: number; last_seen: string }
const device = (ua: string | null) => !ua ? "" : /iPhone|iPad/.test(ua) ? "아이폰" : /Android/.test(ua) ? "안드로이드" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "기타";

export default function AdminErrors() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const since = new Date(Date.now() + 9 * 3600_000 - 6 * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await sb.from("client_errors").select("*").gte("day", since).order("count", { ascending: false }).order("last_seen", { ascending: false }).limit(40);
    if (error) { setErr(error.message.includes("client_errors") ? "supabase/update-2026-11-08.sql 을 실행하면 오류 모음이 보입니다" : error.message); setRows([]); return; }
    setRows((data ?? []) as Row[]);
  }, []);
  useEffect(() => { load(); }, [load]);
  const remove = async (id: number) => { await getBrowserSupabase()?.from("client_errors").delete().eq("id", id); load(); };

  return (
    <section className="card space-y-2">
      <p className="text-sm font-semibold text-white">사용자 화면 오류 <span className="text-xs font-normal text-gray-500">최근 7일 · 많이 난 순 · 고친 건 “정리”</span></p>
      {err && <p className="text-xs text-gray-500">{err}</p>}
      {rows === null ? <div className="h-16 animate-pulse rounded-lg bg-navy-sub" /> : rows.length === 0 ? (
        !err && <p className="text-xs text-gray-500">최근 7일 동안 기록된 오류가 없어요 👍</p>
      ) : (
        <ul className="divide-y divide-navy-border/60">
          {rows.map(r => (
            <li key={r.id} className="py-2">
              <div className="flex items-start gap-2">
                <button onClick={() => setOpen(o => (o === r.id ? null : r.id))} className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-gray-200 break-all line-clamp-2">{r.message}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{r.path || "/"} · {r.kind} · {device(r.ua)} · {relTime(r.last_seen)}</p>
                </button>
                <span className="shrink-0 text-xs font-bold text-signal-red num">{r.count}회</span>
                <button onClick={() => remove(r.id)} className="shrink-0 text-[11px] text-gray-500 hover:text-white">정리</button>
              </div>
              {open === r.id && r.stack && <pre className="mt-1.5 text-[10px] text-gray-400 bg-navy-sub rounded-lg p-2 overflow-x-auto max-h-48">{r.stack}</pre>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
