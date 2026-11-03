"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FiEdit3, FiMessageSquare, FiHeart } from "react-icons/fi";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { relTime } from "@/lib/time";

const CATEGORIES = ["자유", "국내주식", "해외주식", "질문"] as const;
const PAGE = 20;

interface Row {
  id: number; title: string; category: string; created_at: string;
  comment_count: number; like_count: number; profiles: { nickname: string } | null;
}

export default function CommunityPage() {
  const [cat, setCat] = useState<string>("전체");
  const [sort, setSort] = useState<"new" | "hot">("new");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (offset: number) => {
    const sb = getBrowserSupabase();
    if (!sb) { setErr("Supabase 미설정"); setLoading(false); return; }
    let q = sb.from("posts").select("id,title,category,created_at,comment_count,like_count,profiles(nickname)");
    if (cat !== "전체") q = q.eq("category", cat);
    q = sort === "hot"
      ? q.order("like_count", { ascending: false }).order("created_at", { ascending: false })
      : q.order("created_at", { ascending: false });
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) setErr(error.message);
    const list = (data ?? []) as unknown as Row[];
    setRows(prev => (offset === 0 ? list : [...prev, ...list]));
    setMore(list.length === PAGE);
    setLoading(false);
  }, [cat, sort]);

  useEffect(() => { setLoading(true); setErr(""); load(0); }, [load]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">커뮤니티</h1>
        <div className="flex gap-1 text-xs">
          {([["new", "최신순"], ["hot", "인기순"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`px-2.5 py-1 rounded-lg ${sort === k ? "bg-navy-card text-white border border-navy-border" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {["전체", ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold ${
              cat === c ? "bg-white text-navy" : "bg-navy-card text-gray-400 border border-navy-border"
            }`}>{c}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-navy-card rounded-xl animate-pulse" />)}</div>
      ) : err ? (
        <div className="card text-center text-xs text-gray-500 py-10">게시판을 불러오지 못했습니다 ({err})</div>
      ) : rows.length === 0 ? (
        <div className="card text-center text-sm text-gray-500 py-10">첫 글을 남겨 보세요</div>
      ) : (
        <ul className="card !p-0 divide-y divide-navy-border">
          {rows.map(r => (
            <li key={r.id}>
              <Link href={`/community/${r.id}`} className="block px-4 py-3.5 hover:bg-white/5">
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <span className="text-cyan-brand">{r.category}</span>
                  <span>{r.profiles?.nickname ?? "알 수 없음"}</span>
                  <span>· {relTime(r.created_at)}</span>
                </div>
                <p className="text-sm font-semibold text-white mt-1 truncate">{r.title}</p>
                <div className="flex gap-3 mt-1.5 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1"><FiHeart size={11} /> {r.like_count}</span>
                  <span className="flex items-center gap-1"><FiMessageSquare size={11} /> {r.comment_count}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {more && !loading && (
        <button onClick={() => load(rows.length)}
          className="w-full py-2.5 text-xs text-gray-400 border border-navy-border rounded-xl">더 보기</button>
      )}

      <Link href="/community/write" aria-label="글쓰기"
        className="fixed right-5 bottom-24 z-30 w-14 h-14 rounded-full bg-cyan-brand text-white shadow-lg flex items-center justify-center">
        <FiEdit3 size={22} />
      </Link>
    </main>
  );
}
