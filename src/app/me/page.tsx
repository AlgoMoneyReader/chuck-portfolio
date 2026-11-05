"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiPieChart, FiCpu, FiLock, FiInstagram, FiChevronRight, FiUser, FiEdit2, FiHeart, FiFileText, FiMoon, FiSun, FiType } from "react-icons/fi";
import { useAuth } from "@/components/AuthProvider";
import { LoginButtons, NicknameForm } from "@/components/LoginPanel";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { relTime } from "@/lib/time";
import { useTheme, type Theme } from "@/lib/theme";
import { useFontPref, loadFontCss } from "@/lib/fontPref";
import { FONTS, FONT_SCALES, FONT_SCALE_LABELS } from "@/lib/themeScript";
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
        <FontSetting />
      </div>
    </section>
  );
}

// 글꼴 · 글자 크기 — 바로 적용, 로그인하면 계정에 저장
function FontSetting() {
  const { font, scale, setFont, previewScale, commitScale } = useFontPref();
  const [open, setOpen] = useState(false);
  const cur = FONTS.find(f => f.key === font) ?? FONTS[1];
  const idx = scale == null ? FONT_SCALES.indexOf(1) : Math.max(0, FONT_SCALES.findIndex(s => Math.abs(s - scale) < 0.001));
  const system = scale == null;
  return (
    <>
      {/* 글꼴 */}
      <div className="border-t border-navy-border px-4 py-4">
        <button onClick={() => { if (!open) FONTS.forEach(f => loadFontCss(f.key)); setOpen(!open); }} className="w-full flex items-center gap-4 text-left">
          <span className="w-10 h-10 rounded-xl bg-navy-sub flex items-center justify-center text-cyan-brand"><FiType size={18} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-white">글꼴</span>
            <span className="block text-xs text-gray-500 mt-0.5">{cur.label}</span>
          </span>
          <FiChevronRight className={`text-gray-500 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {open && (
          <div role="radiogroup" aria-label="글꼴" className="mt-3 space-y-1.5">
            {FONTS.map(f => (
              <button key={f.key} role="radio" aria-checked={font === f.key} onClick={() => setFont(f.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  font === f.key ? "border-cyan-brand/50 bg-cyan-brand/10" : "border-navy-border hover:bg-navy-sub/60"}`}>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white" style={{ fontFamily: f.stack }}>{f.label} <span className="text-gray-400">가나다 123,456원</span></span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">{f.desc}</span>
                </span>
                <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${font === f.key ? "border-cyan-brand bg-cyan-brand shadow-[inset_0_0_0_3px_rgb(var(--c-navy-card))]" : "border-navy-border"}`} />
              </button>
            ))}
            <p className="text-[10px] text-gray-600 px-1">글꼴을 고르면 처음 한 번 내려받는 데 잠깐 걸릴 수 있습니다.</p>
          </div>
        )}
      </div>

      {/* 글자 크기 — 막대를 끌면 바로 커지고 작아진다 */}
      <div className="border-t border-navy-border px-4 py-4 space-y-3">
        <div className="flex items-center gap-4">
          <span className="w-10 h-10 rounded-xl bg-navy-sub flex items-center justify-center text-cyan-brand font-bold">가</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-white">글자 크기</span>
            <span className="block text-xs text-gray-500 mt-0.5">{system ? "시스템 설정 (기기·브라우저 글자 크기)" : `${FONT_SCALE_LABELS[idx]} · ${Math.round(FONT_SCALES[idx] * 100)}%`}</span>
          </span>
          <button role="switch" aria-checked={system} onClick={() => commitScale(system ? 1 : null)}
            className={`shrink-0 text-xs px-2.5 py-1.5 rounded-lg border font-semibold ${system ? "border-cyan-brand/50 bg-cyan-brand/10 text-cyan-brand" : "border-navy-border text-gray-500"}`}>
            시스템 설정
          </button>
        </div>
        <div className={`px-1 ${system ? "opacity-40" : ""}`}>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-bold" style={{ fontSize: 12 }}>가</span>
            <input type="range" min={0} max={FONT_SCALES.length - 1} step={1} value={idx} aria-label="글자 크기"
              onChange={e => previewScale(FONT_SCALES[+e.target.value])}
              onPointerUp={e => commitScale(FONT_SCALES[+(e.target as HTMLInputElement).value])}
              onKeyUp={e => commitScale(FONT_SCALES[+(e.target as HTMLInputElement).value])}
              className="flex-1 accent-[rgb(var(--c-cyan-brand))] h-2 cursor-pointer" />
            <span className="text-gray-400 font-bold" style={{ fontSize: 20 }}>가</span>
          </div>
          <div className="flex justify-between mt-1.5 pl-6 pr-7">
            {FONT_SCALE_LABELS.map((l, i) => (
              <button key={l} onClick={() => commitScale(FONT_SCALES[i])}
                className={`text-[10px] ${i === idx && !system ? "text-cyan-brand font-bold" : "text-gray-600"}`}>{i === 0 || i === 2 || i === FONT_SCALES.length - 1 ? l : "·"}</button>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-navy-sub/50 px-3 py-2.5">
          <p className="text-[11px] text-gray-500">미리보기</p>
          <p className="text-sm text-white mt-0.5">삼성전자 <span className="num font-semibold">209,500원</span> <span className="text-signal-red num">▼ 3.90%</span></p>
          <p className="text-xs text-gray-400">외국인 순매수 <span className="text-signal-green num">+1,225억</span></p>
        </div>
      </div>
    </>
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
