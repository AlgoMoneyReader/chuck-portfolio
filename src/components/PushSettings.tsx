"use client";

import { useEffect, useState } from "react";
import { FiBell, FiBellOff } from "react-icons/fi";
import { useAuth } from "./AuthProvider";
import { authFetch } from "@/lib/supabase/authFetch";
import { VAPID_PUBLIC_KEY, type PushPrefs } from "@/lib/pushConfig";
import { isStandalone, openInstallGuide } from "./InstallGuide";

// My > 알림 설정 — 새 인사이트 · 지수 ±2% · 관심 종목 ±5%
const PREF_KEY = "push:prefs";
const DEFAULT: PushPrefs = { insight: true, idx: true, watch: true, close: true, dart: true };

function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
const isIOS = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

type Support = "checking" | "ok" | "ios-install" | "unsupported";

export default function PushSettings() {
  const { user } = useAuth();
  const [support, setSupport] = useState<Support>("checking");
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try { const v = localStorage.getItem(PREF_KEY); if (v) setPrefs({ ...DEFAULT, ...JSON.parse(v) }); } catch { /* 무시 */ }
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!ok) { setSupport(isIOS() && !isStandalone() ? "ios-install" : "unsupported"); return; }
    setSupport("ok");
    navigator.serviceWorker.getRegistration("/").then(r => r?.pushManager.getSubscription()).then(s => setSub(s ?? null)).catch(() => {});
  }, []);

  const save = async (s: PushSubscription, p: PushPrefs) => {
    const r = await authFetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: s.toJSON(), prefs: p }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* 무시 */ }
  };

  // 알림을 켠 뒤에 로그인했으면 구독을 회원과 연결 (관심 종목 알림용)
  useEffect(() => {
    if (sub && user) save(sub, prefs).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, user?.id]);

  const enable = async () => {
    setBusy(true); setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMsg(perm === "denied" ? "알림이 차단돼 있어요. 브라우저(또는 휴대폰) 설정에서 이 사이트 알림을 허용해 주세요." : "알림 허용을 눌러야 받을 수 있어요."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const s = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource });
      await save(s, prefs);
      setSub(s); setMsg("알림을 켰어요 🔔");
    } catch (e) { setMsg(`알림을 켜지 못했어요: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  };

  const disable = async () => {
    if (!sub) return;
    setBusy(true); setMsg("");
    try {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
      setSub(null); setMsg("알림을 껐어요");
    } finally { setBusy(false); }
  };

  const toggle = async (k: keyof PushPrefs) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    if (sub) { try { await save(sub, next); } catch (e) { setMsg(String(e)); } }
    else { try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* 무시 */ } }
  };

  const test = async () => {
    if (!sub) return;
    const r = await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok && j.ok ? "테스트 알림을 보냈어요. 몇 초 안에 도착해요." : j.error ?? "보내지 못했어요");
  };

  const on = !!sub;
  const Row = ({ k, title, desc, disabled }: { k: keyof PushPrefs; title: string; desc: string; disabled?: boolean }) => (
    <label className={`flex items-center gap-3 py-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-white">{title}</span>
        <span className="block text-[11px] text-gray-500 mt-0.5">{desc}</span>
      </span>
      <input type="checkbox" className="w-4 h-4 accent-cyan-500" checked={prefs[k] && !disabled} disabled={disabled || busy} onChange={() => toggle(k)} />
    </label>
  );

  return (
    <div className="px-4 py-4 border-t border-navy-border/60">
      <div className="flex items-center gap-4">
        <span className="w-10 h-10 rounded-xl bg-navy-sub flex items-center justify-center text-cyan-brand">{on ? <FiBell size={18} /> : <FiBellOff size={18} />}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-white">알림</span>
          <span className="block text-xs text-gray-500 mt-0.5">{on ? "이 기기에서 알림을 받고 있어요" : "급등락·새 인사이트를 휴대폰 알림으로"}</span>
        </span>
        {support === "ok" && (
          <button onClick={on ? disable : enable} disabled={busy}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 ${on ? "border border-navy-border text-gray-300" : "bg-cyan-brand text-white on-color"}`}>
            {busy ? "…" : on ? "끄기" : "알림 켜기"}
          </button>
        )}
      </div>

      {support === "ios-install" && (
        <p className="mt-3 text-xs text-gray-400 leading-relaxed">
          아이폰은 사이트를 <b className="text-white">홈 화면에 추가</b>한 뒤, 홈 화면 아이콘으로 열어야 알림을 켤 수 있어요 (iOS 16.4 이상).{" "}
          <button onClick={openInstallGuide} className="text-cyan-brand font-semibold">추가하는 방법 보기 ›</button>
        </p>
      )}
      {support === "unsupported" && <p className="mt-3 text-xs text-gray-500">이 브라우저는 알림을 지원하지 않아요. 크롬·사파리(홈 화면 추가)에서 열어 주세요.</p>}

      {support === "ok" && (
        <div className="mt-2 pl-14 divide-y divide-navy-border/40">
          <Row k="idx" title="지수 급등락" desc={"코스피·코스닥·S&P500·나스닥이 ±2% 넘게 움직일 때 (2%·3%·4%… 구간마다)"} />
          <Row k="watch" title="관심 종목 급등락" desc={user ? "관심 종목이 ±5% 넘게 움직일 때 (종목별 하루 한 번)" : "로그인하면 켤 수 있어요"} disabled={!user} />
          <Row k="dart" title="관심 종목 공시" desc={user ? "관심 종목(국내)에 새 공시가 뜨면 바로 (실적·증자·자사주 등)" : "로그인하면 켤 수 있어요"} disabled={!user} />
          <Row k="close" title="장 마감 요약" desc="국내 장 마감(15:40쯤)·미국 장 마감(아침 6시쯤)에 지수·외국인 수급 한 줄 요약" />
          <Row k="insight" title="새 인사이트" desc="알읽남 릴스·블로그 새 글이 올라올 때" />
          {on && <button onClick={test} className="mt-2 pt-2 text-xs text-cyan-brand font-semibold">테스트 알림 보내기</button>}
        </div>
      )}
      {msg && <p className="mt-2 pl-14 text-xs text-gold">{msg}</p>}
    </div>
  );
}
