"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FiMessageCircle, FiHeart } from "react-icons/fi";
import { useAuth } from "./AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { relTime } from "@/lib/time";
import { logActivity } from "@/lib/activity";

// 종목 화면 '토론' 탭 — 커뮤니티 게시판(posts)에 종목 코드를 붙여 저장. 커뮤니티 탭 '종목토론'에서도 보인다
interface Post { id: number; title: string; body: string; created_at: string; comment_count: number; like_count: number; profiles: { nickname: string } | null }

export default function StockTalk({ code, name }: { code: string; name: string }) {
  const { user, profile, signIn } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (!sb) { setPosts([]); return; }
    const { data, error } = await sb.from("posts").select("id,title,body,created_at,comment_count,like_count,profiles(nickname)")
      .eq("stock_code", code).order("created_at", { ascending: false }).limit(30);
    if (error) { setPosts([]); setMsg(error.message.includes("stock_code") ? "토론 기능 준비 중입니다 (운영자: supabase/update-2026-11-08.sql 실행)" : ""); return; }
    setPosts((data ?? []) as unknown as Post[]);
  }, [code]);
  useEffect(() => { setPosts(null); load(); }, [load]);

  const write = async () => {
    const sb = getBrowserSupabase();
    const t = text.trim();
    if (!sb || !user || !profile || !t) return;
    if (t.length < 2) { setMsg("두 글자 이상 써 주세요"); return; }
    setBusy(true); setMsg("");
    const firstLine = t.split("\n")[0];
    const { error } = await sb.from("posts").insert({
      user_id: user.id, category: "종목토론", stock_code: code, stock_name: name.slice(0, 40),
      title: (firstLine.length > 60 ? firstLine.slice(0, 60) + "…" : firstLine), body: t.slice(0, 2000),
    });
    setBusy(false);
    if (error) { setMsg(`올리지 못했어요: ${error.message}`); return; }
    logActivity("post", { code, name, kind: "종목토론" });
    setText(""); load();
  };

  return (
    <div className="space-y-3">
      <div className="card !p-3 space-y-2">
        {!user ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-gray-400">로그인하면 {name}에 대한 의견을 남길 수 있어요</p>
            <button onClick={() => signIn("kakao", typeof window !== "undefined" ? window.location.pathname : "/")} className="shrink-0 px-3 py-1.5 rounded-lg bg-[#FEE500] text-[#191919] text-xs font-bold">카카오 로그인</button>
          </div>
        ) : !profile ? (
          <p className="text-sm text-gray-400">글을 쓰려면 먼저 <Link href="/me" className="text-cyan-brand font-semibold">닉네임을 정해 주세요</Link></p>
        ) : (
          <>
            <textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={3}
              placeholder={`${name}, 어떻게 보세요? (투자 권유·허위 정보·욕설은 삭제될 수 있어요)`}
              className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-brand resize-none" />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-600">{profile.nickname} · 커뮤니티 “종목토론”에도 올라가요</span>
              <button onClick={write} disabled={busy || !text.trim()} className="ml-auto px-4 py-1.5 rounded-lg bg-cyan-brand text-white text-sm font-bold on-color disabled:opacity-40">{busy ? "올리는 중…" : "올리기"}</button>
            </div>
          </>
        )}
        {msg && <p className="text-xs text-gold">{msg}</p>}
      </div>

      {posts === null ? <div className="card h-32 animate-pulse" /> : posts.length === 0 ? (
        <div className="card text-center text-sm text-gray-500 py-8">아직 {name} 토론 글이 없어요. 첫 의견을 남겨 보세요</div>
      ) : (
        <ul className="card !p-0 divide-y divide-navy-border">
          {posts.map(p => (
            <li key={p.id}>
              <Link href={`/community/${p.id}`} className="block px-4 py-3 hover:bg-white/5">
                <p className="text-sm text-white whitespace-pre-line line-clamp-3">{p.body}</p>
                <p className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500">
                  <span>{p.profiles?.nickname ?? "알 수 없음"}</span>·<span>{relTime(p.created_at)}</span>
                  <span className="ml-auto flex items-center gap-2.5">
                    <span className="flex items-center gap-0.5"><FiHeart size={11} />{p.like_count}</span>
                    <span className="flex items-center gap-0.5"><FiMessageCircle size={11} />{p.comment_count}</span>
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
