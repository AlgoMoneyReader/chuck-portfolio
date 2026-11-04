-- AI 레이더 분석 결과 저장: 같은 날 같은 종목은 한 번만 생성하고 모든 회원이 함께 본다 (AI 비용 절약)
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.

-- 운영자 확인 함수 (admin.sql 과 동일. 어느 파일을 먼저 실행해도 되도록 여기도 둔다)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create or replace function public.is_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists(select 1 from admins where user_id = auth.uid());
end $$;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.radar_reports (
  code text not null,
  day date not null,                 -- 한국 날짜
  report jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (code, day)
);
alter table public.radar_reports enable row level security;
drop policy if exists "radar read" on public.radar_reports;
create policy "radar read" on public.radar_reports for select using (auth.role() = 'authenticated');
drop policy if exists "radar insert" on public.radar_reports;
create policy "radar insert" on public.radar_reports for insert with check (created_by = auth.uid());
-- 같은 날 다시 분석(장중 수급이 크게 바뀐 경우 등)은 운영자만 덮어쓸 수 있다
drop policy if exists "radar admin update" on public.radar_reports;
create policy "radar admin update" on public.radar_reports for update using (public.is_admin());
