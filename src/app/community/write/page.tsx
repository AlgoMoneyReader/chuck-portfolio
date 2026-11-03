"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { LoginButtons, NicknameForm } from "@/components/LoginPanel";
import { getBrowserSupabase } from "@/lib/supabase/client";

const CATEGORIES = ["자유", "국내주식", "해외주식", "질문"];

export default function WritePage() {
  const router = useRouter();
  const { loading, user, profile } = useAuth();
  const [cat, setCat] = useState("자유");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const sb = getBrowserSupabase();
    if (!sb || !user) return;
    if (!title.trim() || !body.trim()) { setErr("제목과 내용을 입력해 주세요"); return; }
    setSaving(true); setErr("");
    const { data, error } = await sb.from("posts")
      .insert({ user_id: user.id, category: cat, title: title.trim(), body: body.trim() })
      .select("id").single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    router.replace(`/community/${data.id}`);
  };

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-10" />;

  if (!user || !profile) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-4 text-center animate-fade-in">
        <p className="text-sm text-gray-300">{user ? "닉네임을 먼저 정해 주세요" : "글을 쓰려면 로그인이 필요합니다"}</p>
        {user ? <NicknameForm /> : <LoginButtons next="/community/write" />}
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-gray-400">취소</button>
        <h1 className="text-base font-bold text-white">글쓰기</h1>
        <button onClick={submit} disabled={saving} className="text-sm font-semibold text-cyan-brand disabled:opacity-50">
          {saving ? "등록 중…" : "등록"}
        </button>
      </div>

      <div className="flex gap-2">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              cat === c ? "bg-cyan-brand/20 text-cyan-brand border border-cyan-brand/40" : "bg-navy-card text-gray-400 border border-navy-border"
            }`}>{c}</button>
        ))}
      </div>

      <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="제목"
        className="w-full h-12 rounded-xl bg-navy-card border border-navy-border px-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-brand" />
      <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={5000} rows={12} placeholder="내용을 입력하세요"
        className="w-full rounded-xl bg-navy-card border border-navy-border p-4 text-sm text-white placeholder-gray-600 leading-relaxed focus:outline-none focus:border-cyan-brand" />
      <p className="text-right text-[11px] text-gray-600 num">{body.length} / 5000</p>
      {err && <p className="text-xs text-signal-red">{err}</p>}
      <p className="text-[11px] text-gray-600">{profile.nickname} 이름으로 등록됩니다. 투자 권유·광고·비방 글은 삭제될 수 있습니다.</p>
    </main>
  );
}
