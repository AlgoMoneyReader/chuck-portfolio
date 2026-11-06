"use client";

import { usePathname } from "next/navigation";
import { FiLock } from "react-icons/fi";
import { useAuth } from "./AuthProvider";
import { LoginButtons, NicknameForm } from "./LoginPanel";

// 로그인한 회원만 내용을 보여준다. 게스트에게는 카카오 로그인 안내.
export default function RequireLogin({ children, title = "로그인이 필요한 기능입니다" }: { children: React.ReactNode; title?: string }) {
  const { loading, user, profile } = useAuth();
  const path = usePathname() ?? "/";
  if (loading) return <div className="card h-40 animate-pulse" />;
  if (!user) {
    return (
      <div className="card flex flex-col items-center text-center gap-3 py-10">
        <span className="w-12 h-12 rounded-2xl bg-navy-sub flex items-center justify-center text-gold"><FiLock size={22} /></span>
        <p className="text-base font-bold text-white">{title}</p>
        <p className="text-xs text-gray-400">카카오로 3초 만에 시작하세요</p>
        <LoginButtons next={path} />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="card flex flex-col items-center text-center gap-3 py-10">
        <p className="text-sm text-gray-300">사용할 닉네임을 정해 주세요</p>
        <NicknameForm />
      </div>
    );
  }
  return <>{children}</>;
}

// 게스트에게는 내용을 흐리게 가리고 로그인 버튼을 띄운다
export function LoginBlur({ children, label = "로그인하면 볼 수 있습니다" }: { children: React.ReactNode; label?: string }) {
  const { loading, user } = useAuth();
  const path = usePathname() ?? "/";
  if (loading || user) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[6px] opacity-60" aria-hidden>{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy/40 rounded-xl px-4 text-center">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-white"><FiLock /> {label}</span>
        <LoginButtons next={path} />
      </div>
    </div>
  );
}
