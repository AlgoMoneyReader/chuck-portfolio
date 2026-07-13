"use client";

import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "prompts_auth";
const CORRECT_PW = "3888";

export default function PromptsPage() {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (sessionStorage.getItem(STORAGE_KEY) === "ok") {
      setAuthed(true);
    } else {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input === CORRECT_PW) {
      sessionStorage.setItem(STORAGE_KEY, "ok");
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  if (!mounted) return null;

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07111E]">
        <div className="w-full max-w-sm mx-4">
          <div className="text-center mb-8">
            <p className="text-[#C8A840] font-bold text-xl tracking-wide">알읽남 프롬프트 허브</p>
            <p className="text-[#8E9AAB] text-sm mt-1">접근 비밀번호를 입력하세요</p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              ref={inputRef}
              type="password"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false); }}
              placeholder="비밀번호"
              maxLength={10}
              className={`w-full bg-[#0C1A2E] border rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.3em] text-[#E8ECF2] outline-none transition-all ${
                error
                  ? "border-[#E24B4A] animate-shake"
                  : "border-[rgba(200,168,64,0.35)] focus:border-[#C8A840]"
              }`}
            />
            {error && (
              <p className="text-[#E24B4A] text-sm text-center">비밀번호가 틀렸습니다</p>
            )}
            <button
              type="submit"
              className="w-full bg-[#C8A840] text-[#07111E] font-bold py-3 rounded-xl text-sm hover:bg-[#DBBD5A] active:scale-95 transition-all"
            >
              입장하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-3.5rem)]">
      <iframe
        src="/prompts-hub.html"
        className="w-full h-full border-0"
        title="알읽남 프롬프트 허브"
      />
    </div>
  );
}
