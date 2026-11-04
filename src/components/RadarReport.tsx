"use client";

import { useCallback, useEffect, useState } from "react";
import { TbRadar2 } from "react-icons/tb";
import { FiChevronDown, FiRefreshCw } from "react-icons/fi";
import { useAuth } from "./AuthProvider";
import { LoginBlur } from "./RequireLogin";
import { authFetch } from "@/lib/supabase/authFetch";

interface Factor { label: string; score: number; max: number; desc: string }
interface Indicator { key: string; label: string; display: string; grade: string }
interface Report {
  verdict: string; aiScore: number; headline: string; short: string; mid: string;
  reasons: { tag: string; text: string }[]; risks: string[];
  strategy?: { entry?: string; target?: string; stop?: string }; checkpoints?: string[];
  model?: string; generatedAt: string; name: string;
  radar: {
    score: number | null; supply: number | null; tech: number | null; grade: string | null; factors: Factor[]; indicators: Indicator[];
    flows: { today: { foreign: number; institution: number; individual: number | null; basis: string | null }; d5: { foreign: number; institution: number }; d20: { foreign: number; institution: number } } | null;
  };
}
interface Quota { admin?: boolean; used?: number; limit?: number }

const VERDICT: Record<string, { cls: string; dot: string }> = {
  매수: { cls: "bg-signal-green/15 text-signal-green border-signal-green/40", dot: "bg-signal-green" },
  분할매수: { cls: "bg-signal-green/10 text-signal-green border-signal-green/30", dot: "bg-signal-green" },
  관망: { cls: "bg-gray-500/15 text-gray-300 border-gray-500/40", dot: "bg-gray-400" },
  비중축소: { cls: "bg-signal-amber/15 text-signal-amber border-signal-amber/40", dot: "bg-signal-amber" },
  매도: { cls: "bg-signal-red/15 text-signal-red border-signal-red/40", dot: "bg-signal-red" },
};
const TAG: Record<string, string> = { 수급: "text-cyan-brand", 실적: "text-gold", 밸류: "text-purple-300", 뉴스: "text-pink-300", 업황: "text-orange-300", 흐름: "text-signal-green" };

// 기술 지표를 일반인 말로
const PLAIN: Record<string, string> = {
  tv5_20: "최근 5일 거래대금이 20일 평균보다 몇 배인지 — 1보다 크면 관심 증가",
  v5_20: "최근 5일 거래량이 20일 평균보다 몇 배인지",
  adx14: "추세의 힘 — 25 이상이면 방향이 뚜렷함",
  mfi14: "돈이 들어오는 정도 — 80 이상 과열, 20 이하 침체",
  cmf20: "매집(+)·분산(−) 흐름 — 플러스면 사는 쪽 우세",
  clv: "그날 종가가 고가 쪽(+1)인지 저가 쪽(−1)인지",
  vwap20: "최근 20일 평균 매입단가 대비 현재가 위치",
  udvr60: "오른 날 거래량 ÷ 내린 날 거래량 — 1보다 크면 매수 우위",
  squeeze: "변동성이 압축된 상태(ON)면 곧 큰 움직임 가능",
};
const eok = (v: number | null | undefined) => {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v), s = v > 0 ? "+" : v < 0 ? "-" : "";
  return a >= 10000 ? `${s}${(a / 10000).toFixed(2)}조` : `${s}${Math.round(a).toLocaleString("ko-KR")}억`;
};
const tone = (v: number | null | undefined) => (v == null ? "text-gray-500" : v > 0 ? "text-signal-green" : v < 0 ? "text-signal-red" : "text-gray-400");
const when = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(5, 16).replace("T", " ").replace("-", "/");

function Gauge({ label, value, sub }: { label: string; value: number | null; sub?: string }) {
  const v = value ?? 0;
  const color = v >= 65 ? "bg-signal-green" : v >= 45 ? "bg-gold" : "bg-signal-red";
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-gray-400">{label}</span>
        <span className="text-sm font-bold text-white num">{value ?? "—"}<span className="text-[10px] text-gray-500">/100</span></span>
      </div>
      <div className="h-1.5 bg-navy-border rounded-full overflow-hidden mt-1"><div className={`h-full ${color}`} style={{ width: `${v}%` }} /></div>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Body({ code, name, market }: { code: string; name: string; market: string }) {
  const { user, isAdmin } = useAuth();
  const [r, setR] = useState<Report | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [state, setState] = useState<"idle" | "checking" | "running">("checking");
  const [err, setErr] = useState("");
  const [refOpen, setRefOpen] = useState(false);

  const call = useCallback(async (run: boolean, force = false) => {
    setErr("");
    setState(run ? "running" : "checking");
    try {
      const res = await authFetch(`/api/radar?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}&market=${market}${run ? "&run=1" : ""}${force ? "&force=1" : ""}`, { cache: "no-store" });
      const j = await res.json();
      if (j.quota) setQuota(j.quota);
      if (j.report) setR(j.report);
      if (!res.ok) setErr(j.error ?? "분석 실패");
    } catch (e) { setErr(String(e)); }
    setState("idle");
  }, [code, name, market]);

  useEffect(() => { setR(null); if (user) call(false); else setState("idle"); }, [user, call]);

  const left = quota && !quota.admin ? Math.max(0, (quota.limit ?? 5) - (quota.used ?? 0)) : null;

  if (state === "running") {
    return (
      <div className="py-10 flex flex-col items-center gap-3 text-center">
        <TbRadar2 className="text-cyan-brand animate-spin" style={{ animationDuration: "2.5s" }} size={34} />
        <p className="text-sm text-white font-semibold">{name} 레이더 스캔 중…</p>
        <p className="text-xs text-gray-500">수급·흐름 신호와 실적·뉴스를 함께 분석하고 있어요 (20~40초)</p>
      </div>
    );
  }
  if (state === "checking") return <div className="h-40 rounded-xl bg-navy-sub/50 animate-pulse" />;

  if (!r) {
    return (
      <div className="py-8 flex flex-col items-center gap-3 text-center">
        <TbRadar2 className="text-cyan-brand" size={32} />
        <p className="text-sm text-white font-semibold">{name}의 AI 레이더 분석이 아직 없어요</p>
        <p className="text-xs text-gray-500 max-w-sm">수급·기술 신호(레이더)와 실적·밸류·뉴스(AI)를 합쳐 매수/관망/매도 판단과 대응 전략을 만들어 드립니다.</p>
        <button onClick={() => call(true)} disabled={left === 0}
          className="mt-1 h-11 px-6 rounded-xl bg-gold text-navy font-bold text-sm disabled:opacity-40">AI 레이더 분석 시작</button>
        <p className="text-[11px] text-gray-500 num">{quota?.admin ? "운영자 · 제한 없음" : left != null ? `오늘 남은 횟수 ${left}/${quota?.limit ?? 5} · 다른 회원이 분석한 종목은 무료` : ""}</p>
        {err && <p className="text-xs text-signal-red">{err}</p>}
      </div>
    );
  }

  const v = VERDICT[r.verdict] ?? VERDICT["관망"];
  const f = r.radar.flows;
  return (
    <div className="space-y-4">
      {/* 종합 판단 */}
      <div className="rounded-xl border border-navy-border bg-navy-sub/50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className={`shrink-0 px-3 py-1.5 rounded-lg border text-base font-black ${v.cls}`}>{r.verdict}</span>
          <p className="text-sm sm:text-base font-bold text-white leading-snug pt-1">{r.headline}</p>
        </div>
        <div className="flex gap-4">
          <Gauge label="레이더 점수" value={r.radar.score} sub={`수급 ${r.radar.grade ?? "—"} · 흐름 신호`} />
          <Gauge label="AI 종합 점수" value={r.aiScore} sub="실적·밸류·뉴스 포함" />
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="rounded-lg bg-navy-card/70 p-3"><p className="text-[11px] text-cyan-brand font-semibold mb-1">단기 (1~4주)</p><p className="text-xs text-gray-200 leading-relaxed">{r.short}</p></div>
          <div className="rounded-lg bg-navy-card/70 p-3"><p className="text-[11px] text-gold font-semibold mb-1">중장기 (3~12개월)</p><p className="text-xs text-gray-200 leading-relaxed">{r.mid}</p></div>
        </div>
      </div>

      {/* 근거 / 리스크 */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-white mb-1.5">핵심 근거</p>
          <ul className="space-y-1.5">
            {(r.reasons ?? []).map((x, i) => (
              <li key={i} className="text-xs text-gray-300 leading-relaxed flex gap-2">
                <span className={`shrink-0 text-[10px] font-bold mt-0.5 w-7 ${TAG[x.tag] ?? "text-gray-400"}`}>{x.tag}</span><span>{x.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-white mb-1.5">리스크</p>
          <ul className="space-y-1.5">
            {(r.risks ?? []).map((x, i) => <li key={i} className="text-xs text-gray-300 leading-relaxed flex gap-2"><span className="text-signal-red shrink-0">!</span><span>{x}</span></li>)}
          </ul>
        </div>
      </div>

      {/* 대응 전략 */}
      {r.strategy && (
        <div>
          <p className="text-xs font-semibold text-white mb-1.5">🎯 대응 전략</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {([["진입", r.strategy.entry, "text-signal-green"], ["목표", r.strategy.target, "text-gold"], ["손절·재검토", r.strategy.stop, "text-signal-red"]] as const).map(([l, t, c]) => (
              <div key={l} className="rounded-lg bg-navy-sub/50 p-3"><p className={`text-[11px] font-semibold mb-1 ${c}`}>{l}</p><p className="text-xs text-gray-200 leading-relaxed">{t ?? "—"}</p></div>
            ))}
          </div>
        </div>
      )}
      {!!r.checkpoints?.length && (
        <p className="text-xs text-gray-400"><span className="text-white font-semibold">체크포인트 </span>{r.checkpoints.join(" · ")}</p>
      )}

      {/* 참고 지표 */}
      <div className="rounded-xl border border-navy-border/70">
        <button onClick={() => setRefOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-gray-400 hover:text-white">
          <span>참고 지표 · 수급 점수 내역과 기술 지표 (쉬운 설명 포함)</span>
          <FiChevronDown className={`transition-transform ${refOpen ? "rotate-180" : ""}`} />
        </button>
        {refOpen && (
          <div className="px-3 pb-3 space-y-3">
            {f && (
              <div className="space-y-1.5">
                <div className="grid sm:grid-cols-2 gap-2">
                  {([["외국인", f.today.foreign, f.d5.foreign, f.d20.foreign], ["기관", f.today.institution, f.d5.institution, f.d20.institution]] as const).map(([l, a, b, c]) => (
                    <div key={l} className="rounded-lg bg-navy-sub/50 px-3 py-2 text-[11px] num">
                      <span className="text-gray-400 mr-2">{l}</span>
                      오늘 <span className={tone(a)}>{eok(a)}</span> · 5일 <span className={tone(b)}>{eok(b)}</span> · 20일 <span className={tone(c)}>{eok(c)}</span>
                    </div>
                  ))}
                </div>
                {f.today.basis && <p className="text-[10px] text-gray-500">오늘 기준: {f.today.basis}</p>}
              </div>
            )}
            {r.radar.factors.length > 0 && (
              <div className="space-y-1.5">
                {r.radar.factors.map(x => (
                  <div key={x.label} className="text-[11px]">
                    <div className="flex justify-between"><span className="text-gray-300">{x.label}</span><span className="text-gray-400 num">{x.score}/{x.max} · {x.desc}</span></div>
                    <div className="h-1 bg-navy-border rounded-full overflow-hidden mt-0.5"><div className="h-full bg-cyan-brand" style={{ width: `${(x.score / Math.max(1, x.max)) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
            {r.radar.indicators.length > 0 && (
              <ul className="divide-y divide-navy-border/60">
                {r.radar.indicators.map(i => (
                  <li key={i.key} className="py-1.5 flex items-start gap-2 text-[11px]">
                    <span className="w-14 shrink-0 text-gray-300 font-semibold">{i.label}</span>
                    <span className="w-14 shrink-0 text-white num">{i.display}</span>
                    <span className="w-6 shrink-0 text-gold font-bold">{i.grade}</span>
                    <span className="text-gray-500">{PLAIN[i.key] ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
        <span>{when(r.generatedAt)} 분석 · 오늘 이 종목을 본 회원과 공유 · 투자 권유가 아닌 참고 정보</span>
        {isAdmin && (
          <button onClick={() => call(true, true)} className="flex items-center gap-1 text-gray-400 hover:text-white shrink-0"><FiRefreshCw size={11} /> 다시 분석</button>
        )}
      </div>
      {err && <p className="text-xs text-signal-red">{err}</p>}
    </div>
  );
}

// AI 레이더 분석 카드 — 레이더 페이지·종목검색·종목 상세에서 같은 내용
export default function RadarReport({ code, name, market, bare = false }: { code: string; name: string; market: string; bare?: boolean }) {
  const inner = (
    <LoginBlur label="AI 레이더 분석은 로그인 후 볼 수 있습니다">
      <Body code={code} name={name} market={market} />
    </LoginBlur>
  );
  if (bare) return inner;
  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-2">
        <TbRadar2 className="text-cyan-brand" size={18} />
        <h2 className="text-sm font-bold text-white">AI 레이더 분석</h2>
        <span className="text-[11px] text-gray-500">수급·흐름 신호 + 실적·뉴스 AI 종합</span>
      </div>
      {inner}
    </section>
  );
}
