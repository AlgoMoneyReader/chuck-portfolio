"use client";

export default function AdminLogout() {
  const handleLogout = async () => {
    await fetch("/api/admin-auth", { method: "DELETE" });
    // window.location.href: 하드 리다이렉트 → 라우터 캐시 완전 초기화
    // router.push는 소프트 내비게이션이라 미들웨어를 재실행하지 않음
    window.location.href = "/";
  };

  return (
    <button
      onClick={handleLogout}
      className="text-xs text-gray-500 hover:text-gray-300 border border-navy-border hover:border-gray-600 px-3 py-1.5 rounded-lg transition-all"
    >
      로그아웃
    </button>
  );
}
