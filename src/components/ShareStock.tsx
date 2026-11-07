"use client";

import { useEffect, useRef, useState } from "react";
import { FiShare2, FiLink, FiImage, FiDownload } from "react-icons/fi";

// 종목 공유: 링크(카톡 미리보기에 시세 카드가 뜬다) · 이미지(시세 카드 PNG)
export default function ShareStock({ code, name, isUS }: { code: string; name: string; isUS: boolean }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [open]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 2500); return () => clearTimeout(t); }, [msg]);

  const url = typeof window !== "undefined" ? `${window.location.origin}/stock/${encodeURIComponent(code)}` : "";
  const text = `${name}${isUS ? "" : `(${code})`} 시세·수급 — 알읽남 증시 레이더`;
  const imgUrl = `/api/share-card?code=${encodeURIComponent(code)}${isUS ? `&name=${encodeURIComponent(name)}` : ""}&t=${Math.floor(Date.now() / 60_000)}`;

  const shareLink = async () => {
    setOpen(false);
    try {
      if (navigator.share) { await navigator.share({ title: text, text, url }); return; }
      await navigator.clipboard.writeText(url); setMsg("링크를 복사했어요");
    } catch { /* 사용자가 취소 */ }
  };

  const shareImage = async () => {
    setOpen(false); setMsg("이미지 만드는 중…");
    try {
      const blob = await (await fetch(imgUrl)).blob();
      const file = new File([blob], `${name}-${code}.png`.replace(/[\\/:*?"<>|\s]/g, "_"), { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) { setMsg(""); await navigator.share({ files: [file], title: text, text: `${text}\n${url}` }); return; }
      // 파일 공유가 안 되는 브라우저(PC 등): 내려받기
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setMsg("이미지를 저장했어요");
    } catch { setMsg(""); }
  };

  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => setOpen(o => !o)} aria-label="공유"
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-navy-card text-gray-400 hover:text-white">
        <FiShare2 size={17} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-52 rounded-xl border border-navy-border bg-navy-card shadow-2xl p-1.5 animate-fade-in">
          <button onClick={shareLink} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-white hover:bg-white/5 text-left">
            <FiLink size={15} className="text-cyan-brand" /> 링크 공유
            <span className="ml-auto text-[10px] text-gray-500">카톡 미리보기</span>
          </button>
          <button onClick={shareImage} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-white hover:bg-white/5 text-left">
            {typeof navigator !== "undefined" && "canShare" in navigator ? <FiImage size={15} className="text-cyan-brand" /> : <FiDownload size={15} className="text-cyan-brand" />} 시세 카드 이미지
          </button>
        </div>
      )}
      {msg && <span className="absolute right-0 top-full mt-2 z-30 whitespace-nowrap rounded-lg bg-navy-card border border-navy-border px-2.5 py-1.5 text-xs text-gold shadow-xl">{msg}</span>}
    </div>
  );
}
