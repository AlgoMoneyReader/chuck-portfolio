"use client";

import { useState } from "react";
import { RiKakaoTalkFill } from "react-icons/ri";
import { FiShield, FiCheck } from "react-icons/fi";
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
      {/* 개인정보 안심 안내 — 실제로 카카오에 요청하는 권한은 닉네임(profile_nickname)뿐 */}
      <div className="rounded-xl border border-navy-border bg-navy-sub/60 px-3.5 py-3 text-left">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-white"><FiShield className="text-signal-green" size={14} />개인정보 걱정 없이 시작하세요</p>
        <ul className="mt-1.5 space-y-1 text-[11.5px] text-gray-400 leading-relaxed">
          <li className="flex gap-1.5"><FiCheck className="text-signal-green shrink-0 mt-0.5" size={12} />카카오에서 받는 건 <b className="text-gray-200">닉네임 하나뿐</b>이에요</li>
          <li className="flex gap-1.5"><FiCheck className="text-signal-green shrink-0 mt-0.5" size={12} />이메일·전화번호·실명·생일은 받지 않아요</li>
          <li className="flex gap-1.5"><FiCheck className="text-signal-green shrink-0 mt-0.5" size={12} />카카오 친구 목록을 보거나 대신 메시지·글을 보내지 않아요</li>
          <li className="flex gap-1.5"><FiCheck className="text-signal-green shrink-0 mt-0.5" size={12} />사이트 안 닉네임도 원하는 이름으로 새로 정해요</li>
        </ul>
        <p className="mt-2 text-[10px] text-gray-600 leading-relaxed">로그인 후 검색·종목 조회·AI 이용 기록은 서비스 개선에만 쓰여요.</p>
      </div>
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
