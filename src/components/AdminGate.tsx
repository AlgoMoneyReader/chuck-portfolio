"use client";

import Link from "next/link";
import { FiLock } from "react-icons/fi";
import { useAuth } from "./AuthProvider";

// 운영자 화면 잠금: 카카오로 로그인한 운영자 계정(Supabase is_admin)만 내용을 보여준다.
// 실제 데이터는 서버 쪽 RLS(is_admin·본인 행)로도 막혀 있어, 이 화면 잠금을 우회해도 남의 데이터는 읽을 수 없다.
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { loading, user, isAdmin } = useAuth();
  if (loading) return <div className="card h-40 animate-pulse" />;
  if (!user || !isAdmin) {
    return (
      <section className="card flex flex-col items-center text-center gap-3 py-12">
        <span className="w-12 h-12 rounded-2xl bg-navy-sub flex items-center justify-center text-gold"><FiLock size={22} /></span>
        <p className="text-base font-bold text-white">운영자 전용 화면입니다</p>
        <p className="text-xs text-gray-400">{user ? "운영자 계정이 아닙니다." : "운영자 카카오 계정으로 로그인해 주세요."}</p>
        <Link href="/" className="text-xs text-cyan-brand">홈으로</Link>
      </section>
    );
  }
  return <>{children}</>;
}
