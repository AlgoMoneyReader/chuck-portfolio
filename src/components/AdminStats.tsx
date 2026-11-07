"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

// 운영자 대시보드: 방문자·페이지뷰(7일) · 인기 페이지 · 인기 종목 · 인기 검색어 · 회원 · 알림 구독
interface Stats {
  visitors_today: number; pageviews_today: number;
  visitors_7d: { day: string; visitors: number; pageviews: number }[];
  pages_today: { path: string; count: number }[];
  top_stocks_7d: { code: string; name: string | null; count: number }[];
  top_searches_7d: { q: string; count: number }[];
  members: number; members_7d: number;
  push: { total: number; idx: number; watch: number; insight: number; close: number; members: number };
}
const PAGE: Record<string, string> = { "/": "증시", "/flow": "매매동향", "/news": "뉴스", "/calendar": "캘린더", "/community": "인사이트", "/me": "My", "/stock": "종목 화면", "/portfolio": "포트폴리오", "/analyze": "AI 레이더", "/admin": "운영자" };

export default function AdminStats() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    getBrowserSupabase()?.rpc("admin_stats").then(({ data, error }) => {
      if (error) setErr(error.message.includes("admin_stats") ? "supabase/update-2026-11-07.sql 을 실행하면 통계가 보입니다" : error.message);
      else setS(data as Stats);
    });
  }, []);
  if (err) return <section className="card text-xs text-gray-500">{err}</section>;
  if (!s) return <section className="card h-40 animate-pulse" />;
  const max = Math.max(1, ...s.visitors_7d.map(d => d.visitors));
  const Tile = ({ k, v, sub }: { k: string; v: string | number; sub?: string }) => (
    <div className="rounded-xl bg-navy-sub px-3 py-2.5 min-w-0">
      <p className="text-[11px] text-gray-500">{k}</p>
      <p className="text-lg font-bold text-white num">{typeof v === "number" ? v.toLocaleString("ko-KR") : v}</p>
      {sub && <p className="text-[10px] text-gray-500 truncate">{sub}</p>}
    </div>
  );
  const List = ({ title, rows }: { title: string; rows: { label: string; count: number }[] }) => (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-400 mb-1.5">{title}</p>
      {rows.length ? (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.label + i} className="flex items-center gap-2 text-sm">
              <span className="w-4 text-[11px] text-gray-600 num">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate text-gray-200">{r.label}</span>
              <span className="text-xs text-gray-500 num">{r.count.toLocaleString("ko-KR")}</span>
            </li>
          ))}
        </ol>
      ) : <p className="text-xs text-gray-600">아직 기록이 없어요</p>}
    </div>
  );
  return (
    <section className="card space-y-4">
      <p className="text-sm font-semibold text-white">운영 현황 <span className="text-xs font-normal text-gray-500">오늘 · 최근 7일</span></p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile k="오늘 방문자" v={s.visitors_today} sub={`페이지뷰 ${s.pageviews_today.toLocaleString("ko-KR")}`} />
        <Tile k="7일 방문자(일별 합)" v={s.visitors_7d.reduce((a, d) => a + d.visitors, 0)} />
        <Tile k="회원" v={s.members} sub={`최근 7일 +${s.members_7d}`} />
        <Tile k="알림 구독 기기" v={s.push.total} sub={`지수 ${s.push.idx} · 관심 ${s.push.watch} · 마감 ${s.push.close} · 인사이트 ${s.push.insight}`} />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 mb-2">일별 방문자</p>
        <div className="flex items-end gap-1.5 h-28">
          {s.visitors_7d.map(d => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span className="text-[10px] text-gray-400 num">{d.visitors}</span>
              <div className="w-full rounded-t bg-cyan-brand/70" style={{ height: `${Math.max(3, (d.visitors / max) * 80)}px` }} title={`페이지뷰 ${d.pageviews}`} />
              <span className="text-[10px] text-gray-500 num">{d.day.slice(5).replace("-", "/")}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <List title="오늘 많이 본 화면" rows={s.pages_today.map(p => ({ label: PAGE[p.path] ?? p.path, count: p.count }))} />
        <List title="인기 종목 (7일, 조회)" rows={s.top_stocks_7d.map(t => ({ label: `${t.name ?? t.code} ${t.name ? `(${t.code})` : ""}`, count: t.count }))} />
        <List title="인기 검색어 (7일)" rows={s.top_searches_7d.map(t => ({ label: t.q, count: t.count }))} />
      </div>
      <p className="text-[10px] text-gray-600">방문자는 브라우저 단위(같은 사람이 폰·PC로 오면 2명) · 통계 기록은 이번 업데이트부터 시작</p>
    </section>
  );
}
