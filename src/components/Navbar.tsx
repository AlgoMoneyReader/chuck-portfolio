"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { TbRadar2 } from "react-icons/tb";
import { FiPieChart, FiLogOut, FiSearch } from "react-icons/fi";
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "./AuthProvider";

// 종목 목록(약 190KB)은 검색을 열 때만 불러온다
const SearchOverlay = dynamic(() => import("./SearchOverlay"), { ssr: false });

// 로그인이 필요한 아이콘: 게스트가 누르면 로그인 화면(내 정보)으로 보내고, 로그인 후 원래 가려던 곳으로
function GatedIcon({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const active = (usePathname() ?? "").startsWith(href);
  return (
    <button
      onClick={() => router.push(user ? href : `/me?next=${encodeURIComponent(href)}`)}
      aria-label={label}
      className={`group relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/5 ${active ? "text-gold" : "text-gray-400 hover:text-white"}`}>
      {children}
      {/* 마우스 오버 툴팁 */}
      <span className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-card border border-navy-border px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
        {label}{!user && " · 로그인 필요"}
      </span>
    </button>
  );
}

function Account() {
  const { loading, user, profile, signIn, signOut } = useAuth();
  const path = usePathname() ?? "/";
  if (loading) return <span className="w-16 h-7 rounded-lg bg-white/5 animate-pulse" />;
  if (!user) {
    return (
      <button onClick={() => signIn("kakao", path)}
        className="ml-1 h-8 px-3 rounded-lg bg-gold text-navy text-xs font-bold hover:bg-gold-light">로그인</button>
    );
  }
  return (
    <div className="flex items-center gap-1 ml-1 min-w-0">
      <Link href="/me" className="text-xs text-gray-300 truncate max-w-[110px] sm:max-w-none">
        <span className="font-semibold text-white">{profile?.nickname ?? "회원"}</span>님<span className="hidden sm:inline"> 환영합니다</span>
      </Link>
      <button onClick={signOut} aria-label="로그아웃" title="로그아웃"
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-white hover:bg-white/5">
        <FiLogOut size={15} />
      </button>
    </div>
  );
}

function SearchButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="종목 검색"
        className="group relative flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
        <FiSearch size={19} />
        <span className="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-card border border-navy-border px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">종목 검색</span>
      </button>
      {open && <SearchOverlay onClose={close} />}
    </>
  );
}

export default function Navbar() {
  return (
    <nav className="bg-navy-sub/95 backdrop-blur-md border-b border-navy-border">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/logo-mark.png" alt="" width={30} height={30} priority
            className="rounded-lg ring-1 ring-white/10" />
          <span className="text-gold font-black text-[17px] tracking-tight">알읽남</span>
          <span className="text-gray-300 text-[13px] font-semibold tracking-tight hidden min-[400px]:inline">증시 레이더</span>
        </Link>

        <div className="flex items-center gap-0.5 min-w-0">
          <GatedIcon href="/analyze" label="AI 종목분석"><TbRadar2 size={20} /></GatedIcon>
          <SearchButton />
          <GatedIcon href="/portfolio" label="My 포트폴리오"><FiPieChart size={18} /></GatedIcon>
          <Account />
        </div>
      </div>
    </nav>
  );
}
