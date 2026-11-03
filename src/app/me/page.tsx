"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FiPieChart, FiCpu, FiLock, FiInstagram, FiChevronRight, FiUser, FiEdit2, FiHeart, FiFileText } from "react-icons/fi";
import { useAuth } from "@/components/AuthProvider";
import { LoginButtons, NicknameForm } from "@/components/LoginPanel";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { relTime } from "@/lib/time";

const MENU = [
  { href: "/portfolio", Icon: FiPieChart, title: "포트폴리오", desc: "보유 종목 실시간 손익 관리 (운영자)" },
  { href: "/analyze", Icon: FiCpu, title: "AI 종목 분석", desc: "종목 검색과 AI 리서치 보고서" },
  { href: "/admin", Icon: FiLock, title: "운영자", desc: "운영자 전용 메뉴 (비밀번호)" },
];

interface WatchItem { code: string; name: string; market: string }
interface MyPost { id: number; title: string; created_at: string; comment_count: number; like_count: number }

function MyActivity({ userId }: { userId: string }) {
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [posts, setPosts] = useState<MyPost[]>([]);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    sb.from("watchlist").select("code,name,market").eq("user_id", userId).order("created_at", { ascending: false })
      .then(({ data }) => setWatch((data as WatchItem[]) ?? []));
    sb.from("posts").select("id,title,created_at,comment_count,like_count").eq("user_id", userId).order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => setPosts((data as MyPost[]) ?? []));
  }, [userId]);

  return (
    <>
      <section>
        <p className="text-xs font-semibold text-gray-500 mb-2 px-1 flex items-center gap-1.5"><FiHeart /> 관심 종목</p>
        <div className="card !p-4">
          {watch.length === 0 ? (
            <p className="text-xs text-gray-500">종목 상세에서 ♥를 누르면 여기에 모입니다</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {watch.map(w => (
                <Link key={w.code} href={`/stock/${w.code}`}
                  className="text-xs font-semibold text-cyan-brand bg-cyan-brand/10 px-2.5 py-1 rounded-lg">{w.name}</Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <section>
        <p className="text-xs font-semibold text-gray-500 mb-2 px-1 flex items-center gap-1.5"><FiFileText /> 내가 쓴 글</p>
        <ul className="card !p-0 divide-y divide-navy-border">
          {posts.length === 0 ? (
            <li className="px-4 py-4 text-xs text-gray-500">아직 쓴 글이 없습니다</li>
          ) : posts.map(p => (
            <li key={p.id}>
              <Link href={`/community/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5">
                <span className="text-sm text-white truncate">{p.title}</span>
                <span className="shrink-0 text-[11px] text-gray-500">{relTime(p.created_at)} · 💬{p.comment_count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function MeContent() {
  const { loading, user, profile, signOut } = useAuth();
  const authError = useSearchParams()?.get("auth_error");
  const [editing, setEditing] = useState(false);

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-16 h-16 rounded-2xl bg-navy-card border border-navy-border flex items-center justify-center">
          <FiUser size={28} className={profile ? "text-cyan-brand" : "text-gray-500"} />
        </div>

        {loading ? (
          <div className="h-5 w-32 bg-navy-card rounded animate-pulse" />
        ) : !user ? (
          <>
            <p className="text-sm text-gray-400 mb-2">로그인하고 커뮤니티·관심종목을 이용하세요</p>
            <LoginButtons />
          </>
        ) : !profile || editing ? (
          <>
            <p className="text-sm text-gray-300 mb-1">{profile ? "새 닉네임을 입력하세요" : "커뮤니티에서 쓸 닉네임을 정해 주세요"}</p>
            <NicknameForm initial={profile?.nickname ?? ""} onDone={() => setEditing(false)} />
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-2 text-lg font-bold text-white">
            {profile.nickname} <FiEdit2 size={15} className="text-cyan-brand" />
          </button>
        )}
        {authError && <p className="text-xs text-signal-red text-center">로그인 실패: {authError}</p>}
      </div>

      {user && profile && <MyActivity userId={user.id} />}

      <section>
        <p className="text-xs font-semibold text-gray-500 mb-2 px-1">메뉴</p>
        <ul className="card !p-0 divide-y divide-navy-border">
          {MENU.map(({ href, Icon, title, desc }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-4 px-4 py-4 hover:bg-white/5">
                <span className="w-10 h-10 rounded-xl bg-navy-sub flex items-center justify-center text-cyan-brand"><Icon size={18} /></span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>
                </span>
                <FiChevronRight className="text-gray-600" />
              </Link>
            </li>
          ))}
          <li>
            <a href="https://www.instagram.com/alliknam" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-4 px-4 py-4 hover:bg-white/5">
              <span className="w-10 h-10 rounded-xl bg-navy-sub flex items-center justify-center text-pink-400"><FiInstagram size={18} /></span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-white">알읽남 인스타그램</span>
                <span className="block text-xs text-gray-500 mt-0.5">@alliknam</span>
              </span>
              <FiChevronRight className="text-gray-600" />
            </a>
          </li>
        </ul>
      </section>

      <section className="card bg-navy-sub/50">
        <p className="text-sm font-bold text-white mb-2">알읽남 채널 소개</p>
        <p className="text-gray-400 text-xs leading-relaxed">
          <span className="text-gold font-bold">알읽남</span>은 알고리즘으로 읽어주는 남자의 줄임말입니다.
          매일 쏟아지는 뉴스와 시장 데이터를 AI가 분석해 핵심 인사이트만 전달합니다.
        </p>
      </section>

      {user && (
        <button onClick={signOut} className="block mx-auto text-xs text-gray-500 underline underline-offset-4">로그아웃</button>
      )}
    </main>
  );
}

export default function MePage() {
  return (
    <Suspense fallback={null}>
      <MeContent />
    </Suspense>
  );
}
