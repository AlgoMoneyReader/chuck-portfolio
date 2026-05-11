"use client";

import { useRouter } from "next/navigation";

export default function AdminLogout() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/admin-auth", { method: "DELETE" });
    router.push("/");
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
