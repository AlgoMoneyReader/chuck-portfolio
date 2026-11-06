"use client";

import { useCallback, useEffect, useState } from "react";
import { FiInstagram, FiTrash2 } from "react-icons/fi";
import { SiNaver } from "react-icons/si";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import { relTime } from "@/lib/time";

interface Reel { id: number; url: string; caption: string | null; created_at: string }
interface Blog { title: string; url: string; summary: string; thumb: string | null; publishedAt: string | null }
type Item = { kind: "reel"; at: string; r: Reel } | { kind: "blog"; at: string; b: Blog };

// 인스타그램 링크 → 임베드 주소 (릴스·게시물)
const embedOf = (url: string) => {
  const m = /instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(url);
  return m ? `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/embed/` : null;
};

// 알읽남 인사이트: 운영자가 올린 릴스 + 네이버 블로그 새 글(자동)
export default function InsightFeed() {
  const { isAdmin } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [filter, setFilter] = useState<"all" | "reel" | "blog">("all");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    const [r, b] = await Promise.all([
      sb ? sb.from("insights").select("id,url,caption,created_at").order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
      fetch("/api/blog-feed", { cache: "no-store" }).then(x => x.json()).catch(() => ({ items: [] })),
    ]);
    if (r.error) setMsg(r.error.message.includes("insights") ? "릴스 저장 테이블이 아직 없습니다 (supabase/insights.sql 실행 필요)" : r.error.message);
    setReels((r.data ?? []) as Reel[]);
    setBlogs(b.items ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!embedOf(url)) { setMsg("인스타그램 릴스·게시물 링크를 넣어 주세요 (instagram.com/reel/…)"); return; }
    const sb = getBrowserSupabase();
    if (!sb) return;
    const { error } = await sb.from("insights").insert({ url: url.trim(), caption: caption.trim() || null });
    setMsg(error ? `올리기 실패: ${error.message}` : "올렸습니다");
    if (!error) { setUrl(""); setCaption(""); load(); }
  };
  const remove = async (id: number) => {
    if (!confirm("이 릴스를 내릴까요?")) return;
    const sb = getBrowserSupabase();
    if (sb) { await sb.from("insights").delete().eq("id", id); load(); }
  };

  const items: Item[] = [
    ...reels.map(r => ({ kind: "reel" as const, at: r.created_at, r })),
    ...blogs.map(b => ({ kind: "blog" as const, at: b.publishedAt ?? "", b })),
  ].filter(x => filter === "all" || x.kind === filter).sort((a, b) => b.at.localeCompare(a.at));

  const chip = (on: boolean) => `px-3.5 py-1.5 text-sm rounded-lg border whitespace-nowrap ${on ? "bg-white text-navy border-white font-bold" : "border-navy-border text-gray-400 hover:text-white"}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {([["all", "전체"], ["reel", "릴스"], ["blog", "블로그"]] as const).map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={chip(filter === k)}>{l}</button>)}
      </div>

      {isAdmin && (
        <div className="card space-y-2">
          <p className="text-sm font-semibold text-white flex items-center gap-1.5"><FiInstagram className="text-pink-400" /> 릴스 올리기 <span className="text-xs font-normal text-gray-500">운영자 전용</span></p>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…"
            className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-brand" />
          <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="한 줄 설명 (선택)"
            className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-brand" />
          <div className="flex items-center gap-2">
            <button onClick={add} className="px-4 py-1.5 rounded-lg bg-cyan-brand text-white text-sm font-bold">올리기</button>
            {msg && <span className="text-xs text-gold">{msg}</span>}
          </div>
          <p className="text-[11px] text-gray-600">블로그 새 글은 자동으로 올라옵니다 (30분마다 확인)</p>
        </div>
      )}

      {loading ? <div className="card h-40 animate-pulse" /> : items.length === 0 ? (
        <div className="card text-center text-sm text-gray-500 py-10">아직 올라온 인사이트가 없습니다</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map(x => x.kind === "reel" ? (
            <div key={`r-${x.r.id}`} className="card !p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <FiInstagram className="text-pink-400" /> 릴스 · {relTime(x.r.created_at)}
                {isAdmin && <button onClick={() => remove(x.r.id)} aria-label="내리기" className="ml-auto text-gray-600 hover:text-signal-red"><FiTrash2 /></button>}
              </div>
              {x.r.caption && <p className="text-sm text-white">{x.r.caption}</p>}
              {embedOf(x.r.url) && <iframe src={embedOf(x.r.url)!} title="instagram" loading="lazy" allowFullScreen className="w-full rounded-xl bg-white" style={{ height: 620, border: 0 }} />}
            </div>
          ) : (
            <a key={`b-${x.b.url}`} href={x.b.url} target="_blank" rel="noopener noreferrer" className="card !p-3 flex gap-3 hover:border-cyan-brand/40">
              {x.b.thumb && <img src={x.b.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-24 h-24 rounded-lg object-cover shrink-0" />}
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-gray-400"><SiNaver className="text-[#03C75A]" size={11} /> 블로그{x.b.publishedAt ? ` · ${relTime(x.b.publishedAt)}` : ""}</p>
                <p className="text-sm font-semibold text-white mt-1 line-clamp-2">{x.b.title}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{x.b.summary}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
