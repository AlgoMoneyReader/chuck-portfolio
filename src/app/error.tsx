"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errorReport";

// 화면을 그리다 오류가 나면: 운영자에게 기록하고, 사용자에겐 다시 시도 버튼
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, "render"); }, [error]);
  return (
    <main className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
      <p className="text-3xl">😵</p>
      <p className="text-base font-bold text-white">화면을 불러오다 문제가 생겼어요</p>
      <p className="text-sm text-gray-400">잠시 후 다시 시도해 주세요. 문제는 운영자에게 자동으로 전달됐어요.</p>
      <div className="flex justify-center gap-2 pt-2">
        <button onClick={reset} className="px-4 py-2 rounded-lg bg-cyan-brand text-white text-sm font-bold on-color">다시 시도</button>
        <a href="/" className="px-4 py-2 rounded-lg border border-navy-border text-sm text-gray-300">홈으로</a>
      </div>
    </main>
  );
}
