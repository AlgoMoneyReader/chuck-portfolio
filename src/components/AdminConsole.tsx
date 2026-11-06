"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface Profile { id: string; nickname: string; created_at: string }
interface AiLog { id: number; user_id: string | null; feature: string; model: string; input_tokens: number; output_tokens: number; searches: number; cost_usd: number; detail: string | null; created_at: string }
interface Act { id: number; user_id: string; kind: string; detail: Record<string, unknown>; created_at: string }

const KRW = 1400; // 비용 원화 환산(대략)
const KIND: Record<string, string> = { login: "로그인", search: "검색", view: "종목 조회", watch: "관심종목", portfolio: "포트폴리오 담기", analyze: "AI 리서치", post: "글쓰기", theme: "테마" };
const t = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(5, 16).replace("T", " ").replace("-", "/");
const won = (usd: number) => `${Math.round(usd * KRW).toLocaleString("ko-KR")}원`;
const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);
const actText = (a: Act) => {
  const d = a.detail ?? {};
  const name = (d.name as string) ?? "";
  if (a.kind === "search") return `${d.q ? `"${d.q}" → ` : ""}${name} (${d.from ?? ""})`;
  if (a.kind === "watch") return `${name} ${d.on ? "추가" : "해제"}`;
  if (a.kind === "portfolio") return `${name} ${d.qty ?? ""}주 @${Number(d.avg ?? 0).toLocaleString("ko-KR")}`;
  if (a.kind === "analyze") return `${name || d.ticker || ""}`;
  return name || (Object.keys(d).length ? JSON.stringify(d).slice(0, 60) : "");
};

// 운영자 대시보드: 회원 가입·AI 사용량(토큰/비용)·활동 기록. Supabase RLS 상 운영자(admins)만 데이터가 보인다.
export default function AdminConsole() {
  const { user, isAdmin, loading } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ai, setAi] = useState<AiLog[]>([]);
  const [acts, setActs] = useState<Act[]>([]);
  const [quota, setQuota] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"users" | "ai" | "feed">("users");
  const [sel, setSel] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const [p, a, ac, q] = await Promise.all([
      sb.from("profiles").select("id,nickname,created_at").order("created_at", { ascending: false }).limit(2000),
      sb.from("ai_logs").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      sb.from("activity_logs").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      sb.from("ai_usage").select("user_id,count").eq("day", today),
    ]);
    const e = [p.error, a.error, ac.error, q.error].filter(Boolean).map(x => x!.message);
    setErr(e.length ? `${e.join(" | ")} — supabase/admin.sql 을 실행했는지 확인하세요` : "");
    setProfiles((p.data as Profile[]) ?? []);
    setAi((a.data as AiLog[]) ?? []);
    setActs((ac.data as Act[]) ?? []);
    setQuota(Object.fromEntries(((q.data ?? []) as { user_id: string; count: number }[]).map(r => [r.user_id, r.count])));
  }, [days]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const nick = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p.nickname])), [profiles]);
  // 카카오 로그인은 했지만 닉네임을 아직 정하지 않은(가입 미완료) 사용자 — 활동 기록엔 있지만 회원 목록엔 없다
  const nameOf = (id: string) => nick[id] ?? `가입 미완료 · ${id.slice(0, 4)}`;
  const rows = useMemo(() => profiles.map(p => {
    const mine = ai.filter(x => x.user_id === p.id), my = acts.filter(x => x.user_id === p.id);
    return {
      ...p,
      last: my[0]?.created_at ?? null,
      aiCalls: mine.length,
      tokens: mine.reduce((s, x) => s + x.input_tokens + x.output_tokens, 0),
      cost: mine.reduce((s, x) => s + Number(x.cost_usd), 0),
      searches: my.filter(x => x.kind === "search").length,
      views: my.filter(x => x.kind === "view").length,
      today: quota[p.id] ?? 0,
    };
  }).sort((a, b) => (b.last ?? b.created_at).localeCompare(a.last ?? a.created_at)), [profiles, ai, acts, quota]);

  const byFeature = useMemo(() => {
    // 기능별 합계 + 그 안에서 모델별(Opus·Gemini 등) 나눠 보기
    type Agg = { calls: number; tokens: number; cost: number };
    const add = (k: Agg, x: (typeof ai)[number]) => { k.calls++; k.tokens += x.input_tokens + x.output_tokens; k.cost += Number(x.cost_usd); };
    const m = new Map<string, Agg & { models: Map<string, Agg> }>();
    for (const x of ai) {
      const k = m.get(x.feature) ?? { calls: 0, tokens: 0, cost: 0, models: new Map<string, Agg>() };
      add(k, x);
      const mm = k.models.get(x.model) ?? { calls: 0, tokens: 0, cost: 0 };
      add(mm, x); k.models.set(x.model, mm);
      m.set(x.feature, k);
    }
    const sortAgg = <T extends Agg>(a: [string, T], b: [string, T]) => b[1].cost - a[1].cost || b[1].calls - a[1].calls;
    return Array.from(m.entries()).sort(sortAgg).map(([f, v]) => [f, { ...v, models: Array.from(v.models.entries()).sort(sortAgg) }] as const);
  }, [ai]);
  const byModel = useMemo(() => {
    const m = new Map<string, { calls: number; tokens: number; cost: number }>();
    for (const x of ai) {
      const k = m.get(x.model) ?? { calls: 0, tokens: 0, cost: 0 };
      k.calls++; k.tokens += x.input_tokens + x.output_tokens; k.cost += Number(x.cost_usd);
      m.set(x.model, k);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].cost - a[1].cost || b[1].calls - a[1].calls);
  }, [ai]);

  if (loading) return <div className="card h-32 animate-pulse" />;
  if (!user || !isAdmin) {
    return (
      <section className="card text-sm text-gray-400">
        회원·사용 현황은 <b className="text-white">운영자 계정으로 카카오 로그인</b>해야 보입니다.
        <span className="block text-xs text-gray-500 mt-1">supabase/my.sql 의 운영자 지정 SQL 을 실행했는지 확인하세요.</span>
      </section>
    );
  }

  const totalCost = ai.reduce((s, x) => s + Number(x.cost_usd), 0);
  const totalTok = ai.reduce((s, x) => s + x.input_tokens + x.output_tokens, 0);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const todayIso = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const activeToday = new Set(acts.filter(a => new Date(Date.parse(a.created_at) + 9 * 3_600_000).toISOString().slice(0, 10) === todayIso).map(a => a.user_id)).size;
  const feed = acts.filter(a => (kind === "all" || a.kind === kind) && (!sel || a.user_id === sel)).slice(0, 300);
  const selAi = sel ? ai.filter(x => x.user_id === sel).slice(0, 100) : [];

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-bold text-white">회원 · AI 사용 현황</h2>
        <div className="flex items-center gap-1 text-xs">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 rounded-lg ${days === d ? "bg-cyan-brand/20 text-cyan-brand" : "text-gray-500"}`}>{d}일</button>
          ))}
          <button onClick={load} className="px-2.5 py-1 rounded-lg text-gray-400 hover:text-white">새로고침</button>
        </div>
      </div>
      {err && <p className="text-xs text-signal-red break-all">{err}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          ["총 회원", `${profiles.length}명`],
          ["최근 7일 가입", `${profiles.filter(p => p.created_at >= weekAgo).length}명`],
          ["오늘 활동 회원", `${activeToday}명`],
          [`AI 호출 (${days}일)`, `${ai.length.toLocaleString("ko-KR")}회 · ${tok(totalTok)}`],
          [`AI 비용 (${days}일)`, `$${totalCost.toFixed(2)} · 약 ${won(totalCost)}`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-navy-sub/60 p-3">
            <p className="text-xs text-gray-500">{l}</p>
            <p className="text-base font-bold text-white num mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 text-sm font-semibold border-b border-navy-border">
        {([["users", "회원별"], ["ai", "AI 기능별"], ["feed", "활동 기록"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 pb-2 border-b-2 ${tab === k ? "text-white border-white" : "text-gray-500 border-transparent"}`}>{l}</button>
        ))}
      </div>

      {tab === "users" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="text-gray-500 text-xs">
              <th className="text-left font-normal py-1.5">닉네임</th><th className="text-left font-normal">가입일</th><th className="text-left font-normal">최근 활동</th>
              <th className="text-right font-normal">오늘 AI</th><th className="text-right font-normal">AI 호출</th><th className="text-right font-normal">토큰</th><th className="text-right font-normal">비용</th>
              <th className="text-right font-normal">검색</th><th className="text-right font-normal">조회</th>
            </tr></thead>
            <tbody className="divide-y divide-navy-border/60 num">
              {rows.map(r => (
                <tr key={r.id} onClick={() => { setSel(sel === r.id ? null : r.id); setTab("feed"); }} className="cursor-pointer hover:bg-white/5">
                  <td className="py-2.5 text-white font-semibold">{r.nickname}</td>
                  <td className="text-gray-400">{t(r.created_at)}</td>
                  <td className="text-gray-400">{r.last ? t(r.last) : "—"}</td>
                  <td className="text-right text-gray-300">{r.today}/5</td>
                  <td className="text-right text-gray-300">{r.aiCalls}</td>
                  <td className="text-right text-gray-300">{tok(r.tokens)}</td>
                  <td className="text-right text-gold">{r.cost ? `$${r.cost.toFixed(3)}` : "—"}</td>
                  <td className="text-right text-gray-300">{r.searches}</td>
                  <td className="text-right text-gray-300">{r.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-600 mt-2">회원을 누르면 그 회원의 활동 기록과 AI 사용 내역이 보입니다 · 비용은 Claude 기준 추정(Gemini 무료 등급은 0)</p>
        </div>
      )}

      {tab === "ai" && (
        <table className="w-full text-sm">
          <thead><tr className="text-gray-500 text-xs"><th className="text-left font-normal py-1.5">기능 · 모델</th><th className="text-right font-normal">호출</th><th className="text-right font-normal">토큰</th><th className="text-right font-normal">비용</th></tr></thead>
          {byFeature.map(([f, v]) => (
            <tbody key={f} className="num border-t border-navy-border/60">
              <tr><td className="pt-2.5 pb-1 text-white font-semibold">{f}</td><td className="text-right text-gray-200 pt-2.5 pb-1">{v.calls}</td><td className="text-right text-gray-200 pt-2.5 pb-1">{tok(v.tokens)}</td>
                <td className="text-right text-gold font-semibold pt-2.5 pb-1">${v.cost.toFixed(3)}</td></tr>
              {v.models.map(([md, a], i) => (
                <tr key={md} className="text-xs"><td className={`pl-4 text-gray-400 ${i === v.models.length - 1 ? "pb-2.5" : "pb-1"}`}><span className="text-gray-600 mr-1">└</span>{md}</td>
                  <td className="text-right text-gray-500">{a.calls}</td><td className="text-right text-gray-500">{tok(a.tokens)}</td><td className="text-right text-gold/70">${a.cost.toFixed(3)}</td></tr>
              ))}
            </tbody>
          ))}
          <tbody className="num border-t-2 border-navy-border">
            <tr><td colSpan={4} className="pt-3 pb-1 text-xs text-gray-500">모델별 합계</td></tr>
            {byModel.map(([md, a]) => (
              <tr key={md}><td className="py-1 text-gray-300">{md}</td><td className="text-right text-gray-300">{a.calls}</td><td className="text-right text-gray-300">{tok(a.tokens)}</td><td className="text-right text-gold">${a.cost.toFixed(3)}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "feed" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {sel && <button onClick={() => setSel(null)} className="px-2 py-1 rounded-lg bg-gold/15 text-gold">{nameOf(sel)} ✕</button>}
            {["all", ...Object.keys(KIND)].map(k => (
              <button key={k} onClick={() => setKind(k)} className={`px-2 py-1 rounded-lg ${kind === k ? "bg-cyan-brand/20 text-cyan-brand" : "text-gray-500"}`}>{k === "all" ? "전체" : KIND[k]}</button>
            ))}
          </div>
          {sel && selAi.length > 0 && (
            <div className="rounded-xl bg-navy-sub/50 p-3">
              <p className="text-xs text-gray-500 mb-1">AI 사용 내역</p>
              <ul className="space-y-1.5 text-sm num">
                {selAi.map(x => <li key={x.id} className="flex gap-2"><span className="text-gray-500 w-28 shrink-0 text-xs">{t(x.created_at)}</span><span className="text-white">{x.feature}</span><span className="text-gray-400 truncate flex-1">{x.detail}</span><span className="text-gray-500">{tok(x.input_tokens + x.output_tokens)}</span><span className="text-gold w-14 text-right">${Number(x.cost_usd).toFixed(3)}</span></li>)}
              </ul>
            </div>
          )}
          <ul className="divide-y divide-navy-border/60 text-sm">
            {feed.length === 0 ? <li className="py-4 text-gray-500 text-center">기록이 없습니다</li> : feed.map(a => (
              <li key={a.id} className="py-2.5 flex gap-2 items-baseline">
                <span className="text-gray-500 w-28 shrink-0 num text-xs">{t(a.created_at)}</span>
                <button onClick={() => setSel(a.user_id)} className={`font-semibold shrink-0 hover:text-cyan-brand ${nick[a.user_id] ? "text-white" : "text-gray-500 italic"}`} title={nick[a.user_id] ? undefined : "카카오 로그인 후 닉네임을 정하지 않아 프로필이 없는 사용자"}>{nameOf(a.user_id)}</button>
                <span className="text-xs px-1.5 py-0.5 rounded bg-navy-sub text-gray-400 shrink-0">{KIND[a.kind] ?? a.kind}</span>
                <span className="text-gray-300 truncate">
                  {typeof a.detail?.code === "string" ? <Link href={`/stock/${a.detail.code}`} className="hover:text-cyan-brand">{actText(a)}</Link> : actText(a)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
