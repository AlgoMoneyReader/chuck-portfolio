-- 알읽남 인사이트: 운영자가 올리는 인스타그램 릴스 링크 (블로그 글은 RSS 로 자동)
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다. (is_admin() 은 setup-all.sql 에 있음)
create table if not exists public.insights (
  id bigint generated always as identity primary key,
  url text not null,
  caption text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
alter table public.insights enable row level security;
drop policy if exists "insights read" on public.insights;
create policy "insights read" on public.insights for select using (true);
drop policy if exists "insights admin write" on public.insights;
create policy "insights admin write" on public.insights for insert with check (public.is_admin());
drop policy if exists "insights admin delete" on public.insights;
create policy "insights admin delete" on public.insights for delete using (public.is_admin());
