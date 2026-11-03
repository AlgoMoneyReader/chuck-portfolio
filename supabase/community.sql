-- 알읽남 회원·커뮤니티·관심종목 스키마
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.

-- ── 프로필 (가입 시 닉네임) ───────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 12),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);

-- ── 게시글 ────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default '자유' check (category in ('자유', '국내주식', '해외주식', '질문')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 5000),
  comment_count int not null default 0,
  like_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
alter table public.posts enable row level security;

drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select using (true);
drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own" on public.posts for insert with check (auth.uid() = user_id);
drop policy if exists "posts update own" on public.posts;
create policy "posts update own" on public.posts for update using (auth.uid() = user_id);
drop policy if exists "posts delete own" on public.posts;
create policy "posts delete own" on public.posts for delete using (auth.uid() = user_id);

-- ── 댓글 ──────────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
alter table public.comments enable row level security;

drop policy if exists "comments read" on public.comments;
create policy "comments read" on public.comments for select using (true);
drop policy if exists "comments insert own" on public.comments;
create policy "comments insert own" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "comments delete own" on public.comments;
create policy "comments delete own" on public.comments for delete using (auth.uid() = user_id);

-- ── 좋아요 ────────────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;

drop policy if exists "likes read" on public.post_likes;
create policy "likes read" on public.post_likes for select using (true);
drop policy if exists "likes insert own" on public.post_likes;
create policy "likes insert own" on public.post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "likes delete own" on public.post_likes;
create policy "likes delete own" on public.post_likes for delete using (auth.uid() = user_id);

-- ── 관심종목 ──────────────────────────────────────────────────────────────
create table if not exists public.watchlist (
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  name text not null,
  market text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.watchlist enable row level security;

drop policy if exists "watchlist own" on public.watchlist;
create policy "watchlist own" on public.watchlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 댓글 수·좋아요 수 자동 집계 (사용자가 직접 숫자를 바꾸지 못하게 트리거로만) ──
create or replace function public.bump_counts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'comments' then
    update posts set comment_count = comment_count + (case when tg_op = 'INSERT' then 1 else -1 end)
      where id = coalesce(new.post_id, old.post_id);
  else
    update posts set like_count = like_count + (case when tg_op = 'INSERT' then 1 else -1 end)
      where id = coalesce(new.post_id, old.post_id);
  end if;
  return null;
end $$;

drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments for each row execute function public.bump_counts();
drop trigger if exists likes_count on public.post_likes;
create trigger likes_count after insert or delete on public.post_likes for each row execute function public.bump_counts();

-- 글쓴이가 update 정책으로 카운트를 조작하지 못하도록 컬럼 권한 제한
revoke update on public.posts from authenticated;
grant update (title, body, category) on public.posts to authenticated;
