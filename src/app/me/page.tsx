"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiPieChart, FiCpu, FiLock, FiInstagram, FiChevronRight, FiUser, FiEdit2, FiHeart, FiFileText, FiMoon, FiSun } from "react-icons/fi";
import { useAuth } from "@/components/AuthProvider";
import { LoginButtons, NicknameForm } from "@/components/LoginPanel";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { relTime } from "@/lib/time";
import { useTheme, type Theme } from "@/lib/theme";
import { StockLink } from "@/components/StockModal";

const MENU = [
  { href: "/portfolio", Icon: FiPieChart, title: "My 포트폴리오", desc: "보유 종목 손익 · 관심 종목", admin: false },
  { href: "/analyze", Icon: FiCpu, title: "AI 레이더 분석", desc: "수급 신호 + 실적·뉴스 AI 종합 판단", admin: false },
  { href: "/admin", Icon: FiLock, title: "운영자", desc: "운영자 전용 메뉴", admin: true },
];

function QuotaBadge() {
  const { user, isAdmin } = useAuth();
  const [q, setQ] = useState<{ used?: number; limit?: number } | null>(null);
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !user || isAdmin) return;
    sb.rpc("ai_quota_status").then(({ data }) => setQ(data ?? null));
  }, [user, isAdmin]);
  if (!user) return <span className="text-[11px] text-gray-500">로그인 필요</span>;
  if (isAdmin) return <span className="text-[11px] text-gold">무제한</span>;
  if (!q) return null;
  const left = Math.max(0, (q.limit ?? 5) - (q.used ?? 0));
  return <span className="text-[11px] text-gray-400 num">오늘 <span className={left ? "text-gold font-semibold" : "text-signal-red font-semibold"}>{left}</span>/{q.limit ?? 5}회 남음</span>;
}

const THEMES: { key: Theme; label: string; Icon: typeof FiMoon }[] = [
  { key: "dark", label: "다크", Icon: FiMoon },
  { key: "light", label: "라이트", Icon: FiSun },
];

// 화면 테마 — 로그인하면 계정에 저장돼 다른 기기에서도 같은 테마로 열린다
function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  return (
    <section>
      <p className="text-xs font-semibold text-gray-500 mb-2 px-1">설정</p>
      <div className="card !p-0">
        <div className="flex items-center gap-4 px-4 py-4">
          <span className="w-10 h-10 rounded-xl bg-navy-sub flex items-center justify-center text-cyan-brand">
            {theme === "light" ? <FiSun size={18} /> : <FiMoon size={18} />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-white">화면 테마</span>
            <span className="block text-xs text-gray-500 mt-0.5">{user ? "계정에 저장 · 모든 기기 적용" : "이 기기에 저장"}</span>
          </span>
          <div role="radiogroup" aria-label="화면 테마" className="shrink-0 flex p-1 rounded-xl bg-navy-sub border border-navy-border">
            {THEMES.map(({ key, label, Icon }) => (
              <button key={key} role="radio" aria-checked={theme === key} onClick={() => setTheme(key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  theme === key ? "bg-navy-card text-white shadow-sm border border-navy-border" : "text-gray-500 border border-transparent"
                }`}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

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
                <StockLink key={w.code} 
                  className="text-xs font-semibold text-cyan-brand bg-cyan-brand/10 px-2.5 py-1 rounded-lg" code={w.code}>{w.name}</StockLink>
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
  const { loading, user, profile, isAdmin, signOut } = useAuth();
  const params = useSearchParams();
  const authError = params?.get("auth_error");
  const next = params?.get("next");
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  // 레이더·포트폴리오 아이콘을 누르고 로그인하러 온 경우: 로그인·닉네임 설정이 끝나면 원래 화면으로
  useEffect(() => {
    if (next && next.startsWith("/") && !next.startsWith("//") && user && profile) router.replace(next);
  }, [next, user, profile, router]);

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
            <p className="text-sm text-gray-400 mb-2">로그인하고 My 포트폴리오·AI 레이더 분석·커뮤니티를 이용하세요</p>
            <LoginButtons next={next && next.startsWith("/") ? `/me?next=${encodeURIComponent(next)}` : "/me"} />
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
          {MENU.filter(m => !m.admin || isAdmin).map(({ href, Icon, title, desc }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-4 px-4 py-4 hover:bg-white/5">
                <span className="w-10 h-10 rounded-xl bg-navy-sub flex items-center justify-center text-cyan-brand"><Icon size={18} /></span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>
                </span>
                {href === "/analyze" && <QuotaBadge />}
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

      <ThemeSetting />

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
