-- 푸시 알림 (새 인사이트 · 지수 ±2% · 관심 종목 ±5%) — Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.
-- 구독 정보는 서버(service_role 키)만 읽고 쓴다. 회원·익명은 이 테이블에 직접 접근할 수 없다 (RLS 켜고 정책 없음).

create table if not exists public.push_subs (
  endpoint text primary key,                 -- 브라우저가 준 푸시 주소
  p256dh text not null,
  auth text not null,
  user_id uuid references auth.users(id) on delete cascade,   -- 로그인한 경우만 (관심 종목 알림에 필요)
  insight boolean not null default true,     -- 새 릴스·블로그
  idx boolean not null default true,         -- 지수 ±2% 이상
  watch boolean not null default true,       -- 관심 종목 ±5% 이상
  ua text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;

-- 같은 알림을 두 번 보내지 않기 위한 기록 (예: idx:^KS11:2026-11-06:-:2)
create table if not exists public.push_log (
  key text primary key,
  created_at timestamptz not null default now()
);
alter table public.push_log enable row level security;

-- 마지막 점검 시각·마지막 블로그 글 등
create table if not exists public.push_state (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.push_state enable row level security;

-- 5분마다 알림 조건 점검 (장이 닫혀 있으면 서버가 바로 끝낸다)
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule('alliknam-push') where exists (select 1 from cron.job where jobname = 'alliknam-push');
select cron.schedule('alliknam-push', '*/5 * * * *', $$ select net.http_get(url := 'https://alliknam.vercel.app/api/push/tick') $$);

-- 30일 지난 발송 기록 정리 (매일 새벽 4시 UTC)
select cron.unschedule('alliknam-push-clean') where exists (select 1 from cron.job where jobname = 'alliknam-push-clean');
select cron.schedule('alliknam-push-clean', '0 4 * * *', $$ delete from public.push_log where created_at < now() - interval '30 days' $$);
