"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/admin";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // window.location: 하드 리다이렉트 → 미들웨어가 새 쿠키를 확실히 인식
        // router.replace는 소프트 내비게이션이라 쿠키 반영이 안 될 수 있음
        window.location.href = from;
      } else {
        const json = await res.json();
        setError(json.error ?? "인증 실패");
        setPassword("");
        inputRef.current?.focus();
      }
    } catch {
      setError("네트워크 오류. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        {/* 헤더 */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gold/10 border border-gold/30 mb-2">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-xl font-bold text-white">운영자 전용</h1>
          <p className="text-sm text-gray-500">비밀번호를 입력하여 접속하세요</p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">
              비밀번호
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full bg-navy-sub border border-navy-border rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-brand/60 transition-colors text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-signal-red bg-signal-red/10 border border-signal-red/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 bg-cyan-brand/20 hover:bg-cyan-brand/30 border border-cyan-brand/40 text-cyan-brand font-semibold rounded-lg text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "확인 중..." : "입장"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-700">
          알읽남 Investment Dashboard
        </p>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
