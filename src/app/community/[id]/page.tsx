"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiHeart, FiChevronLeft } from "react-icons/fi";
import { useAuth } from "@/components/AuthProvider";
import { LoginButtons } from "@/components/LoginPanel";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { relTime } from "@/lib/time";

interface Post {
  id: number; user_id: string; title: string; body: string; category: string;
  created_at: string; like_count: number; comment_count: number; profiles: { nickname: string } | null;
}
interface Comment { id: number; user_id: string; body: string; created_at: string; profiles: { nickname: string } | null }

export default function PostPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const router = useRouter();
  const { user, profile } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const [p, c] = await Promise.all([
      sb.from("posts").select("*,profiles(nickname)").eq("id", id).maybeSingle(),
      sb.from("comments").select("id,user_id,body,created_at,profiles(nickname)").eq("post_id", id).order("created_at"),
    ]);
    setPost((p.data as unknown as Post) ?? null);
    setComments((c.data as unknown as Comment[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !user) { setLiked(false); return; }
    sb.from("post_likes").select("post_id").eq("post_id", id).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [id, user]);

  const toggleLike = async () => {
    const sb = getBrowserSupabase();
    if (!sb || !user || !profile || !post) return;
    const { error } = liked
      ? await sb.from("post_likes").delete().eq("post_id", id).eq("user_id", user.id)
      : await sb.from("post_likes").insert({ post_id: id, user_id: user.id });
    if (error) return;
    setLiked(!liked);
    setPost({ ...post, like_count: post.like_count + (liked ? -1 : 1) });
  };

  const addComment = async () => {
    const sb = getBrowserSupabase();
    if (!sb || !user || !text.trim()) return;
    const { error } = await sb.from("comments").insert({ post_id: id, user_id: user.id, body: text.trim() });
    if (error) { setErr(error.message); return; }
    setText(""); setErr("");
    load();
  };

  const removeComment = async (cid: number) => {
    const sb = getBrowserSupabase();
    if (!sb || !confirm("댓글을 삭제할까요?")) return;
    await sb.from("comments").delete().eq("id", cid);
    load();
  };

  const removePost = async () => {
    const sb = getBrowserSupabase();
    if (!sb || !confirm("글을 삭제할까요?")) return;
    const { error } = await sb.from("posts").delete().eq("id", id);
    if (!error) router.replace("/community");
  };

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-10"><div className="h-40 bg-navy-card rounded-xl animate-pulse" /></main>;
  if (!post) return <main className="max-w-3xl mx-auto px-4 py-10 text-center text-sm text-gray-500">글을 찾을 수 없습니다</main>;

  const mine = user?.id === post.user_id;

  return (
    <main className="max-w-3xl mx-auto px-4 py-5 space-y-4 animate-fade-in">
      <Link href="/community" className="inline-flex items-center gap-1 text-sm text-gray-400"><FiChevronLeft /> 커뮤니티</Link>

      <article className="card space-y-3">
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <span className="text-cyan-brand">{post.category}</span>
          <span>{post.profiles?.nickname ?? "알 수 없음"}</span>
          <span>· {relTime(post.created_at)}</span>
          {mine && <button onClick={removePost} className="ml-auto text-signal-red">삭제</button>}
        </div>
        <h1 className="text-lg font-bold text-white leading-snug">{post.title}</h1>
        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">{post.body}</p>
        <button onClick={toggleLike} disabled={!profile}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${
            liked ? "border-pink-400/50 text-pink-400 bg-pink-400/10" : "border-navy-border text-gray-400"
          } disabled:opacity-50`}>
          <FiHeart size={13} className={liked ? "fill-current" : ""} /> {post.like_count}
        </button>
      </article>

      <section className="card space-y-3">
        <p className="text-sm font-semibold text-white">댓글 {comments.length}</p>
        {comments.map(c => (
          <div key={c.id} className="border-t border-navy-border pt-3">
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="text-gray-300 font-semibold">{c.profiles?.nickname ?? "알 수 없음"}</span>
              <span>{relTime(c.created_at)}</span>
              {user?.id === c.user_id && <button onClick={() => removeComment(c.id)} className="ml-auto text-signal-red">삭제</button>}
            </div>
            <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap break-words">{c.body}</p>
          </div>
        ))}

        {user && profile ? (
          <div className="flex gap-2 pt-2">
            <input value={text} onChange={e => setText(e.target.value)} maxLength={1000} placeholder="댓글 달기"
              onKeyDown={e => e.key === "Enter" && !e.nativeEvent.isComposing && addComment()}
              className="flex-1 h-10 rounded-lg bg-navy-sub border border-navy-border px-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-brand" />
            <button onClick={addComment} className="px-4 h-10 rounded-lg bg-cyan-brand text-white text-sm font-semibold">등록</button>
          </div>
        ) : (
          <div className="pt-2 space-y-2 text-center">
            <p className="text-xs text-gray-500">{user ? "내정보에서 닉네임을 정하면 댓글을 쓸 수 있습니다" : "로그인하면 댓글과 좋아요를 남길 수 있습니다"}</p>
            {!user && <LoginButtons next={`/community/${id}`} />}
          </div>
        )}
        {err && <p className="text-xs text-signal-red">{err}</p>}
      </section>
    </main>
  );
}
