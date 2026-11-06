"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";

// 처음 방문한 사람을 위한 화면 안내(코치마크).
// 화면에 실제로 보이는 요소를 하나씩 비춰 주고 설명을 띄운다. 요소가 없으면(로그인 상태 등) 그 단계는 건너뛴다.
// 저장(이 기기): tour:v1:<id> = 끝/건너뜀, tour:off = '다시 보지 않기'(모든 안내 끔)

interface Step { target: string; title: string; body: string }
interface Tour { id: string; match: (p: string) => boolean; welcome?: boolean; steps: Step[]; after?: string }

const TOURS: Tour[] = [
  {
    id: "home", match: p => p === "/", welcome: true,
    steps: [
      { target: "clock", title: "세계 증시 시계", body: "나라별로 지금 장이 열렸는지, 마감까지 얼마 남았는지 한국시간으로 보여줘요. 국기를 누르면 자세한 거래 시간이 나와요." },
      { target: "region", title: "국내 · 미국 · 아시아", body: "보고 싶은 시장을 고르세요. 밤 9시~아침 7시엔 미국, 그 외엔 국내가 먼저 열려요." },
      { target: "index", title: "주요 지수", body: "지수 카드를 누르면 분봉·일봉 차트, 시가·고가·저가, 투자자별 수급과 AI 시황까지 볼 수 있어요." },
      { target: "search", title: "종목 검색", body: "국내·미국·아시아 종목을 이름이나 코드로 찾아보세요. 종목을 누르면 현황·수급·뉴스·공시를 한 번에 보여줘요." },
      { target: "radar", title: "AI 레이더 분석", body: "궁금한 종목을 AI가 실적·수급·뉴스로 분석해 리포트로 정리해 줘요." },
      { target: "tab-me", title: "알림 · 앱처럼 쓰기", body: "My에서 알림을 켜면 지수가 ±2% 넘게 움직이거나 관심 종목이 ±5% 급등락할 때, 알읽남 새 인사이트가 올라올 때 휴대폰으로 알려드려요. 홈 화면에 추가하면 앱처럼 쓸 수 있어요." },
      { target: "bottomnav", title: "하단 메뉴", body: "매매동향(상승·하락·거래대금 순위), 뉴스, 경제 캘린더, 알읽남 인사이트(릴스·블로그)로 바로 이동해요." },
      { target: "index", title: "팝업에서 좌우로 밀기", body: "종목·지수 창을 열면 차트가 아닌 곳을 좌우로 밀어 현황·수급·뉴스 등 옆 탭으로 넘길 수 있어요." },
      { target: "login", title: "카카오로 시작하기", body: "로그인하면 포트폴리오 관리와 AI 레이더를 쓸 수 있어요. 카카오에서 받는 건 닉네임 하나뿐이라 개인정보 걱정은 안 하셔도 돼요 (이메일·전화번호·친구 목록 모두 안 받아요)." },
    ],
  },
  // 예전 안내를 이미 본 사람에게만: 새로 생긴 기능 소개 (홈 안내를 처음 보는 사람은 위 단계에 이미 들어 있음)
  {
    id: "new-2026-11", match: p => p === "/", after: "home",
    steps: [
      { target: "tab-me", title: "🆕 휴대폰 알림이 생겼어요", body: "My → 알림 켜기: 지수 ±2%·관심 종목 ±5% 급등락, 알읽남 새 릴스·블로그를 알림으로 받아보세요. (아이폰은 홈 화면에 추가 후)" },
      { target: "index", title: "🆕 좌우로 밀어 탭 이동", body: "종목·지수 창에서 차트가 아닌 곳을 좌우로 밀면 옆 탭으로 넘어가요." },
    ],
  },
  {
    id: "flow", match: p => p.startsWith("/flow"),
    steps: [
      { target: "flow-region", title: "시장 고르기", body: "국내·미국·아시아 종목 순위를 볼 수 있어요." },
      { target: "flow-tabs", title: "순위 기준", body: "시가총액·상승·하락·거래대금·ETF·거래량 급등·투자자 동향·52주 신고가 순위를 실시간으로 보여줘요. 장 마감 후엔 NXT·애프터마켓 시세가 먼저 보여요." },
    ],
  },
  {
    id: "insight", match: p => p.startsWith("/community"),
    steps: [
      { target: "insight-tabs", title: "알읽남 인사이트", body: "알읽남이 올린 릴스와 블로그 글을 한곳에서 볼 수 있어요. 옆 '커뮤니티' 탭에선 다른 투자자들과 이야기할 수 있어요." },
      { target: "insight-filter", title: "릴스 · 블로그", body: "릴스만, 블로그만 골라 볼 수도 있어요. 블로그 새 글은 자동으로 올라와요." },
    ],
  },
];

const KEY = (id: string) => `tour:v1:${id}`;
const OFF = "tour:off";
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return "1"; } }; // 저장 불가 환경에선 안 띄움
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };
const sget = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sset = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* 무시 */ } };

/** My 화면의 '사용 안내 다시 보기' — 모든 안내를 처음 상태로 */
export function resetTours() {
  try { localStorage.removeItem(OFF); TOURS.forEach(t => localStorage.removeItem(KEY(t.id))); sessionStorage.removeItem("tour:later"); } catch { /* 무시 */ }
}

// 화면에 실제로 보이는 대상(모바일/PC 중 숨겨진 쪽 제외)
function findTarget(name: string): HTMLElement | null {
  const sel = name === "search" ? '[aria-label="종목 검색"]' : name === "radar" ? '[aria-label="AI 레이더 분석"]' : `[data-tour="${name}"]`;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export default function TourGuide() {
  const path = usePathname() ?? "/";
  const [tour, setTour] = useState<Tour | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [phase, setPhase] = useState<"welcome" | "run" | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [never, setNever] = useState(false);

  // 페이지가 그려지고 잠시 뒤 시작 (데이터가 들어와 자리가 잡힌 다음)
  useEffect(() => {
    setPhase(null); setTour(null);
    // 이 화면에 맞는 안내 중 아직 안 본 첫 번째 (새 기능 안내는 기본 안내를 본 사람에게만)
    const t = TOURS.find(x => x.match(path) && !get(KEY(x.id)) && (!x.after || get(KEY(x.after))));
    if (!t || get(OFF)) return;
    if (t.welcome && sget("tour:later")) return;
    const timer = setTimeout(() => {
      if (document.querySelector('[role="dialog"], .fixed.inset-0.bg-black\\/70')) return; // 다른 팝업이 떠 있으면 다음에
      const avail = t.steps.filter(s => findTarget(s.target));
      if (!avail.length) return;
      setTour(t); setSteps(avail); setI(0); setNever(false);
      setPhase(t.welcome ? "welcome" : "run");
    }, 1500);
    return () => clearTimeout(timer);
  }, [path]);

  const step = phase === "run" ? steps[i] : undefined;

  // 대상 위치 추적 (스크롤·크기 변화·데이터 로딩으로 움직여도 따라감)
  useLayoutEffect(() => {
    if (!step) { setRect(null); return; }
    const el = findTarget(step.target);
    if (!el) { setRect(null); return; }
    const pos = getComputedStyle(el.closest("nav") ?? el).position;
    if (pos !== "fixed" && pos !== "sticky") el.scrollIntoView({ block: "center", behavior: "auto" });
    const upd = () => { const e = findTarget(step.target); setRect(e ? e.getBoundingClientRect() : null); };
    upd();
    const iv = setInterval(upd, 250);
    window.addEventListener("resize", upd); window.addEventListener("scroll", upd, true);
    return () => { clearInterval(iv); window.removeEventListener("resize", upd); window.removeEventListener("scroll", upd, true); };
  }, [step]);

  const finish = useCallback(() => {
    if (tour) set(KEY(tour.id), "done");
    // 기본 홈 안내를 끝까지 본(건너뛴) 사람은 새 기능 안내도 이미 본 것으로
    if (tour?.id === "home") TOURS.filter(t => t.after === "home").forEach(t => set(KEY(t.id), "done"));
    if (never) set(OFF, "1");
    setPhase(null);
  }, [tour, never]);
  const later = () => { sset("tour:later", "1"); if (never) set(OFF, "1"); setPhase(null); };

  useEffect(() => {
    if (!phase) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (phase === "run" && e.key === "ArrowRight") setI(n => (n + 1 < steps.length ? n + 1 : n));
      else if (phase === "run" && e.key === "ArrowLeft") setI(n => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [phase, steps.length, finish]);

  if (!phase || !tour) return null;

  const NeverBox = (
    <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
      <input type="checkbox" checked={never} onChange={e => setNever(e.target.checked)} className="accent-cyan-500" />
      다시 보지 않기
    </label>
  );

  if (phase === "welcome") {
    return (
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-4 animate-fade-in">
        <div className="w-full max-w-sm rounded-2xl border border-navy-border bg-navy-card shadow-2xl p-5">
          <p className="text-2xl">👋</p>
          <p className="mt-2 text-lg font-bold text-white">알읽남 증시 레이더에 오신 걸 환영해요</p>
          <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">국내·미국·아시아 시장을 한눈에 보는 곳이에요. 주요 기능을 30초만에 둘러볼까요?</p>
          <div className="mt-5 flex gap-2">
            <button onClick={later} className="flex-1 py-2.5 rounded-xl border border-navy-border text-sm text-gray-400 font-semibold">다음에</button>
            <button onClick={() => { if (never) { set(OFF, "1"); setPhase(null); return; } setPhase("run"); }}
              className="flex-[2] py-2.5 rounded-xl bg-cyan-brand text-white text-sm font-bold on-color">둘러보기</button>
          </div>
          <div className="mt-3 flex justify-center">{NeverBox}</div>
        </div>
      </div>
    );
  }

  if (!step) return null;
  // 안내 카드 위치: 대상 아래 공간이 넉넉하면 아래, 아니면 위
  const vw = typeof window !== "undefined" ? window.innerWidth : 400, vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const W = Math.min(320, vw - 24), PAD = 6;
  const r = rect;
  const below = r ? vh - r.bottom > 210 || r.top < 210 : true;
  const left = r ? Math.min(Math.max(12, r.left + r.width / 2 - W / 2), vw - W - 12) : (vw - W) / 2;
  const cardStyle: React.CSSProperties = r
    ? (below ? { top: Math.min(r.bottom + PAD + 10, vh - 200), left, width: W } : { bottom: vh - r.top + PAD + 10, left, width: W })
    : { top: vh / 2 - 100, left, width: W };
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[70]" aria-live="polite">
      {/* 비추는 구멍: 대상 바깥을 어둡게 */}
      {r ? (
        <div className="absolute rounded-xl ring-2 ring-cyan-brand transition-all duration-200 pointer-events-none"
          style={{ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2, boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)" }} />
      ) : <div className="absolute inset-0 bg-black/60" />}
      <div role="dialog" aria-label={step.title} className="absolute rounded-2xl border border-navy-border bg-navy-card shadow-2xl p-4 animate-fade-in" style={cardStyle}>
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-bold text-white">{step.title}</p>
          <span className="ml-auto text-[11px] text-gray-500 num">{i + 1} / {steps.length}</span>
        </div>
        <p className="mt-1.5 text-[13px] text-gray-300 leading-relaxed">{step.body}</p>
        <div className="mt-3 flex items-center gap-1.5">
          <button onClick={finish} className="text-xs text-gray-500 hover:text-white px-1">건너뛰기</button>
          <div className="ml-auto flex gap-1.5">
            {i > 0 && <button onClick={() => setI(i - 1)} className="px-3 py-1.5 rounded-lg border border-navy-border text-xs text-gray-300 font-semibold">이전</button>}
            <button onClick={() => (last ? finish() : setI(i + 1))} className="px-3.5 py-1.5 rounded-lg bg-cyan-brand text-white text-xs font-bold on-color">{last ? "시작하기" : "다음"}</button>
          </div>
        </div>
        <div className="mt-2.5 pt-2.5 border-t border-navy-border/60">{NeverBox}</div>
      </div>
    </div>
  );
}
