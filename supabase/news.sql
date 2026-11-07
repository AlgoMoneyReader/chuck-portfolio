-- 뉴스 '처음 본 시각' 기록 — 구글 뉴스 RSS 가 기사 수정·재수집 시각을 발행 시각처럼 주는 문제 보정
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다. (서버 service_role 키로만 읽고 씀)
create table if not exists public.news_seen (
  key text primary key,                 -- 제목(공백 제거) 기준
  first_seen timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.news_seen enable row level security;

-- 7일 지난 기록 정리 (매일)
select cron.unschedule('alliknam-news-clean') where exists (select 1 from cron.job where jobname = 'alliknam-news-clean');
select cron.schedule('alliknam-news-clean', '10 4 * * *', $$ delete from public.news_seen where created_at < now() - interval '7 days' $$);
