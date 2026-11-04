-- 운영자 대시보드: AI 사용 기록 · 회원 활동 기록 · 운영자 조회 권한
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다. (my.sql 을 먼저 실행해 둔 상태여야 한다)

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ── AI 호출 기록 (모델·토큰·추정 비용) ─────────────────────────────────────
create table if not exists public.ai_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,   -- 시스템 작업(시황 등)은 null
  feature text not null,          -- analyze / stock-analysis / market-commentary / ...
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  searches int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  detail text,                    -- 종목명 등 요청 요약
  created_at timestamptz not null default now()
);
create index if not exists ai_logs_created_idx on public.ai_logs (created_at desc);
create index if not exists ai_logs_user_idx on public.ai_logs (user_id, created_at desc);
alter table public.ai_logs enable row level security;
drop policy if exists "ai_logs insert" on public.ai_logs;
create policy "ai_logs insert" on public.ai_logs for insert with check (user_id is null or user_id = auth.uid());
drop policy if exists "ai_logs admin read" on public.ai_logs;
create policy "ai_logs admin read" on public.ai_logs for select using (public.is_admin() or user_id = auth.uid());

-- ── 회원 활동 기록 (검색·종목 조회·담기·로그인 등) ─────────────────────────
create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,             -- login / search / view / watch / portfolio / analyze / post ...
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_user_idx on public.activity_logs (user_id, created_at desc);
alter table public.activity_logs enable row level security;
drop policy if exists "activity insert own" on public.activity_logs;
create policy "activity insert own" on public.activity_logs for insert with check (user_id = auth.uid());
drop policy if exists "activity admin read" on public.activity_logs;
create policy "activity admin read" on public.activity_logs for select using (public.is_admin());

-- ── 운영자가 모든 회원의 AI 한도 사용량·포트폴리오·관심종목을 볼 수 있게 ────
drop policy if exists "ai_usage admin read" on public.ai_usage;
create policy "ai_usage admin read" on public.ai_usage for select using (public.is_admin());
drop policy if exists "watchlist admin read" on public.watchlist;
create policy "watchlist admin read" on public.watchlist for select using (public.is_admin());

-- 90일 지난 활동 기록 정리(원하면 주기적으로 실행)
-- delete from public.activity_logs where created_at < now() - interval '90 days';
