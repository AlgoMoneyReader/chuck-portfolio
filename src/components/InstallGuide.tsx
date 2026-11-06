"use client";

import { useEffect, useState } from "react";
import { FiX, FiShare, FiPlusSquare, FiMoreVertical, FiCopy, FiExternalLink, FiSmartphone } from "react-icons/fi";

// '홈 화면에 추가' 안내 — 휴대폰에서 앱처럼 아이콘으로 바로 열 수 있게.
// 안드로이드 크롬은 설치 창을 바로 띄우고, 아이폰은 공유 버튼 → 홈 화면에 추가 방법을 보여준다.
// 인스타·카톡 안의 브라우저에선 추가가 안 되니 Safari/Chrome 으로 여는 방법부터 안내.

type Env = "ios" | "ios-other" | "android" | "inapp-kakao" | "inapp" | "desktop";
interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: BIPEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e as BIPEvent; });
}
const OPEN_EVENT = "open-install-guide";
/** My 메뉴 등에서 안내 창 열기 */
export const openInstallGuide = () => window.dispatchEvent(new Event(OPEN_EVENT));

function envOf(): Env {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return "inapp-kakao";
  if (/Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp|Threads/i.test(ua)) return "inapp";
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|Whale/i.test(ua) ? "ios-other" : "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

const DISMISS = "install:dismissed";
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } } };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="shrink-0 w-6 h-6 rounded-full bg-cyan-brand/15 text-cyan-brand text-xs font-bold flex items-center justify-center num">{n}</span>
      <span className="text-sm text-gray-200 leading-relaxed pt-0.5">{children}</span>
    </li>
  );
}
const Key = ({ children }: { children: React.ReactNode }) => <b className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-navy-sub border border-navy-border text-white text-[13px] font-semibold align-middle">{children}</b>;

function Sheet({ onClose }: { onClose: () => void }) {
  const [env] = useState<Env>(envOf);
  const [copied, setCopied] = useState(false);
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); deferred = e as BIPEvent; setCanPrompt(true); };
    window.addEventListener("beforeinstallprompt", h);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("beforeinstallprompt", h); window.removeEventListener("keydown", k); };
  }, [onClose]);
  const url = typeof window !== "undefined" ? window.location.origin + "/" : "";
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* 무시 */ } };
  const install = async () => { if (!deferred) return; await deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; setCanPrompt(false); if (r?.outcome === "accepted") onClose(); };
  const androidChrome = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
  const isAndroidUA = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="fixed z-[81] inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 pointer-events-none">
        <div role="dialog" aria-label="홈 화면에 추가" className="pointer-events-auto w-full sm:max-w-md bg-navy-card border border-navy-border rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-slide-up">
          <div className="flex items-start gap-3">
            <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-xl" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white">알읽남을 앱처럼 쓰기</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">홈 화면에 아이콘을 추가하면 앱처럼 전체 화면으로 바로 열려요. 설치 파일·용량 걱정 없이 무료예요.</p>
            </div>
            <button onClick={onClose} aria-label="닫기" className="text-gray-500 hover:text-white p-1"><FiX size={20} /></button>
          </div>

          <ol className="mt-4 space-y-3">
            {env === "ios" && <>
              <Step n={1}>화면 아래(아이패드는 위)의 <Key><FiShare size={13} />공유</Key> 버튼을 눌러요</Step>
              <Step n={2}>메뉴를 아래로 내려 <Key><FiPlusSquare size={13} />홈 화면에 추가</Key>를 눌러요</Step>
              <Step n={3}>오른쪽 위 <Key>추가</Key>를 누르면 끝! 홈 화면에 알읽남 아이콘이 생겨요</Step>
            </>}
            {env === "ios-other" && <>
              <Step n={1}>주소창 오른쪽의 <Key><FiShare size={13} />공유</Key> 버튼을 눌러요</Step>
              <Step n={2}><Key><FiPlusSquare size={13} />홈 화면에 추가</Key>를 눌러요 (메뉴에 없으면 Safari로 열어 주세요)</Step>
              <Step n={3}><Key>추가</Key>를 누르면 홈 화면에 아이콘이 생겨요</Step>
            </>}
            {env === "android" && (canPrompt ? <>
              <Step n={1}>아래 <Key>앱 설치</Key> 버튼을 누르고, 뜨는 창에서 <Key>설치</Key>를 눌러요</Step>
            </> : <>
              <Step n={1}>크롬 오른쪽 위 <Key><FiMoreVertical size={13} />메뉴</Key>를 눌러요</Step>
              <Step n={2}><Key>홈 화면에 추가</Key> 또는 <Key>앱 설치</Key>를 눌러요</Step>
              <Step n={3}><Key>설치</Key>(또는 추가)를 누르면 홈 화면에 아이콘이 생겨요</Step>
            </>)}
            {(env === "inapp" || env === "inapp-kakao") && <>
              <Step n={1}>지금은 {env === "inapp-kakao" ? "카카오톡" : "인스타그램 등 앱"} 안의 브라우저라 홈 화면 추가가 안 돼요. 먼저 {isAndroidUA ? "크롬" : "Safari"}로 열어 주세요</Step>
              <Step n={2}>{env === "inapp-kakao" ? <>아래 <Key>다른 브라우저로 열기</Key>를 누르거나</> : <>오른쪽 위 <Key><FiMoreVertical size={13} />···</Key> 메뉴 → <Key>외부 브라우저로 열기</Key>를 누르거나</>} 링크를 복사해 {isAndroidUA ? "크롬" : "Safari"} 주소창에 붙여 넣어요</Step>
              <Step n={3}>열린 화면에서 My → <Key>앱처럼 설치하기</Key>를 다시 눌러 주세요</Step>
            </>}
            {env === "desktop" && <>
              <Step n={1}>크롬·엣지 주소창 오른쪽의 <Key>설치</Key> 아이콘(모니터 모양)을 누르면 PC 앱처럼 쓸 수 있어요</Step>
              <Step n={2}>휴대폰에서는 이 사이트를 열고 My → <Key>앱처럼 설치하기</Key>를 눌러 주세요</Step>
            </>}
          </ol>

          <div className="mt-5 flex gap-2">
            {env === "android" && canPrompt && <button onClick={install} className="flex-1 py-2.5 rounded-xl bg-cyan-brand text-white text-sm font-bold on-color flex items-center justify-center gap-1.5"><FiSmartphone size={15} />앱 설치</button>}
            {env === "desktop" && canPrompt && <button onClick={install} className="flex-1 py-2.5 rounded-xl bg-cyan-brand text-white text-sm font-bold on-color">PC에 설치</button>}
            {env === "inapp-kakao" && <a href={`kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`} className="flex-1 py-2.5 rounded-xl bg-cyan-brand text-white text-sm font-bold on-color flex items-center justify-center gap-1.5"><FiExternalLink size={15} />다른 브라우저로 열기</a>}
            {env === "inapp" && isAndroidUA && <a href={androidChrome} className="flex-1 py-2.5 rounded-xl bg-cyan-brand text-white text-sm font-bold on-color flex items-center justify-center gap-1.5"><FiExternalLink size={15} />크롬으로 열기</a>}
            {(env === "inapp" || env === "inapp-kakao") && <button onClick={copy} className="flex-1 py-2.5 rounded-xl border border-navy-border text-sm text-gray-200 font-semibold flex items-center justify-center gap-1.5"><FiCopy size={14} />{copied ? "복사됨" : "링크 복사"}</button>}
            {!(env === "inapp" || env === "inapp-kakao") && !canPrompt && <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-navy-border text-sm text-gray-300 font-semibold">확인</button>}
          </div>
        </div>
      </div>
    </>
  );
}

/** 휴대폰 사용자에게 한 번 띄우는 작은 배너 + 어디서든 열 수 있는 안내 창 */
export default function InstallGuide() {
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState(false);

  useEffect(() => {
    const h = () => { setBanner(false); setOpen(true); };
    window.addEventListener(OPEN_EVENT, h);
    // 배너: 휴대폰 · 아직 설치 안 함 · 첫 방문 안내를 마친 뒤 · 닫은 지 14일 지남
    const t = setTimeout(() => {
      if (isStandalone()) return;
      const env = envOf();
      if (env === "desktop") return;
      const tourDone = store.get("tour:v1:home") || store.get("tour:off");
      const d = Number(store.get(DISMISS) || 0);
      if (!tourDone || (d && Date.now() - d < 14 * 86400_000)) return;
      if (document.querySelector('[role="dialog"]')) return;
      setBanner(true);
    }, 4000);
    return () => { window.removeEventListener(OPEN_EVENT, h); clearTimeout(t); };
  }, []);

  const dismiss = () => { store.set(DISMISS, String(Date.now())); setBanner(false); };

  return (
    <>
      {banner && !open && (
        <div className="fixed z-[35] inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:hidden animate-slide-up">
          <div className="flex items-center gap-3 rounded-2xl border border-navy-border bg-navy-card shadow-2xl px-3.5 py-3">
            <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
            <button onClick={() => setOpen(true)} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-bold text-white">홈 화면에 추가하고 앱처럼 쓰기</p>
              <p className="text-xs text-gray-400 mt-0.5">아이콘 한 번으로 바로 열려요 · 방법 보기 ›</p>
            </button>
            <button onClick={dismiss} aria-label="닫기" className="text-gray-500 p-1 shrink-0"><FiX size={18} /></button>
          </div>
        </div>
      )}
      {open && <Sheet onClose={() => { setOpen(false); store.set(DISMISS, String(Date.now())); }} />}
    </>
  );
}
