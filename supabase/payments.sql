-- 래미안 엘라비네 분양대금 납입현황 (운영자 대시보드에서 직접 입력·수정)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.
create table if not exists public.payment_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rows jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.payment_plans enable row level security;
drop policy if exists "payment plans own" on public.payment_plans;
create policy "payment plans own" on public.payment_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
