"use client";

import { useState } from "react";
import { RiKakaoTalkFill } from "react-icons/ri";
import { useAuth } from "./AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function LoginButtons({ next = "/me" }: { next?: string }) {
  const { signIn, configured } = useAuth();
  if (!configured) {
    return <p className="text-xs text-signal-red text-center">로그인 설정(Supabase)이 아직 연결되지 않았습니다</p>;
  }
  return (
    <div className="space-y-2.5 w-full max-w-xs mx-auto">
      <button onClick={() => signIn("kakao", next)}
        className="w-full h-12 rounded-xl bg-[#FEE500] text-[#191919] text-sm font-semibold flex items-center justify-center gap-2">
        <RiKakaoTalkFill size={20} /> 카카오로 시작하기
      </button>
      <p className="text-[10px] text-gray-500 text-center leading-relaxed">카카오 닉네임만 받습니다. 서비스 개선을 위해 로그인 후 검색·종목 조회·AI 이용 기록이 저장됩니다.</p>
    </div>
  );
}

const NICK_RE = /^[가-힣a-zA-Z0-9_]{2,12}$/;

export function NicknameForm({ initial = "", onDone }: { initial?: string; onDone?: () => void }) {
  const { user, profile, reloadProfile } = useAuth();
  const [nick, setNick] = useState(initial);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const supabase = getBrowserSupabase();
    if (!supabase || !user) return;
    const v = nick.trim();
    if (!NICK_RE.test(v)) { setErr("한글·영문·숫자·밑줄 2~12자로 입력해 주세요"); return; }
    setSaving(true); setErr("");
    const { error } = profile
      ? await supabase.from("profiles").update({ nickname: v }).eq("id", user.id)
      : await supabase.from("profiles").insert({ id: user.id, nickname: v });
    setSaving(false);
    if (error) { setErr(error.code === "23505" ? "이미 사용 중인 닉네임입니다" : error.message); return; }
    await reloadProfile();
    onDone?.();
  };

  return (
    <div className="space-y-2 w-full max-w-xs mx-auto">
      <input value={nick} onChange={e => setNick(e.target.value)} maxLength={12} placeholder="닉네임 (2~12자)"
        onKeyDown={e => e.key === "Enter" && save()}
        className="w-full h-12 rounded-xl bg-navy-sub border border-navy-border px-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-brand" />
      {err && <p className="text-xs text-signal-red">{err}</p>}
      <button onClick={save} disabled={saving}
        className="w-full h-12 rounded-xl bg-cyan-brand text-white text-sm font-semibold disabled:opacity-50">
        {saving ? "저장 중…" : profile ? "닉네임 변경" : "시작하기"}
      </button>
    </div>
  );
}
