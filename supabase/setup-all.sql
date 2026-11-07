-- 알읽남 추가 기능 SQL 통합본 (My 포트폴리오·AI 한도 / 시간별 수급 / 운영자 대시보드 / AI 레이더)
-- community.sql 을 이미 실행한 상태에서, 이 파일 전체를 SQL Editor 에 붙여넣고 Run 한 번이면 된다. 여러 번 실행해도 안전하다.

-- ===================== my.sql =====================
-- 알읽남 My 메뉴: 개인 포트폴리오 · 운영자 지정 · AI 사용 한도
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.
-- (community.sql 을 먼저 실행해 둔 상태여야 한다)

-- ── 개인 포트폴리오 (사용자당 한 줄, 보유 종목 목록을 JSON 으로) ─────────────
create table if not exists public.portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  holdings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.portfolios enable row level security;
drop policy if exists "portfolios own" on public.portfolios;
create policy "portfolios own" on public.portfolios for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 운영자 (사용자가 스스로 추가할 수 없도록 쓰기 정책 없음, 본인 여부만 조회 가능) ──
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins for select using (auth.uid() = user_id);

-- ── AI 종목분석 하루 사용량 (한국 날짜 기준, 하루 5회) ─────────────────────
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage read own" on public.ai_usage;
create policy "ai_usage read own" on public.ai_usage for select using (auth.uid() = user_id);

-- 남은 횟수 조회
create or replace function public.ai_quota_status()
returns json language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Asia/Seoul')::date;
  c int;
  adm boolean;
begin
  if auth.uid() is null then return json_build_object('login', false); end if;
  select exists(select 1 from admins where user_id = auth.uid()) into adm;
  select count into c from ai_usage where user_id = auth.uid() and day = d;
  return json_build_object('login', true, 'admin', adm, 'used', coalesce(c, 0), 'limit', 5);
end $$;

-- 1회 차감 (한도 초과면 ok=false). 한도는 함수 안에 고정 → 클라이언트가 바꿀 수 없다
create or replace function public.use_ai_quota()
returns json language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Asia/Seoul')::date;
  c int;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'reason', 'login'); end if;
  if exists(select 1 from admins where user_id = auth.uid()) then
    return json_build_object('ok', true, 'admin', true, 'used', 0, 'limit', 5);
  end if;
  insert into ai_usage (user_id, day, count) values (auth.uid(), d, 0) on conflict do nothing;
  update ai_usage set count = count + 1 where user_id = auth.uid() and day = d and count < 5 returning count into c;
  if c is null then
    return json_build_object('ok', false, 'reason', 'limit', 'used', 5, 'limit', 5);
  end if;
  return json_build_object('ok', true, 'used', c, 'limit', 5);
end $$;

grant execute on function public.ai_quota_status() to authenticated;
grant execute on function public.use_ai_quota() to authenticated;

-- ── 운영자 지정: 카카오로 로그인해 닉네임을 정한 뒤, 아래 닉네임을 바꿔 한 번 실행 ──
-- insert into public.admins (user_id) select id from public.profiles where nickname = '내닉네임' on conflict do nothing;

-- ===================== flow.sql =====================
-- 매매동향: 장중 시간별 투자자 순매수 기록 (서버가 1분 간격으로 저장)
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.

create table if not exists public.flow_ticks (
  day date not null,
  hm text not null,                 -- 'HH:MM' (한국 시간)
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  foreign_eok bigint not null,
  institution_eok bigint not null,
  individual_eok bigint not null,
  primary key (day, hm, market)
);
alter table public.flow_ticks enable row level security;
drop policy if exists "flow_ticks read" on public.flow_ticks;
create policy "flow_ticks read" on public.flow_ticks for select using (true);

-- 기록은 이 함수로만: 지금 시각(한국 장중)의 칸에만 쓸 수 있다
create or replace function public.record_flow_tick(p_market text, p_foreign bigint, p_institution bigint, p_individual bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  k timestamp := now() at time zone 'Asia/Seoul';
  m int := extract(hour from k) * 60 + extract(minute from k);
begin
  if extract(isodow from k) > 5 or m < 540 or m > 935 then return; end if;
  if p_market not in ('KOSPI', 'KOSDAQ') then return; end if;
  insert into flow_ticks (day, hm, market, foreign_eok, institution_eok, individual_eok)
  values (k::date, to_char(k, 'HH24:MI'), p_market, p_foreign, p_institution, p_individual)
  on conflict (day, hm, market) do update
    set foreign_eok = excluded.foreign_eok, institution_eok = excluded.institution_eok, individual_eok = excluded.individual_eok;
  -- 30일 지난 기록 정리
  delete from flow_ticks where day < (k::date - 30);
end $$;
grant execute on function public.record_flow_tick(text, bigint, bigint, bigint) to anon, authenticated;

-- ===================== admin.sql =====================
-- 운영자 대시보드: AI 사용 기록 · 회원 활동 기록 · 운영자 조회 권한
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다. (my.sql 을 먼저 실행해 둔 상태여야 한다)

create or replace function public.is_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists(select 1 from admins where user_id = auth.uid());
end $$;
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

-- ===================== radar.sql =====================
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

-- ===================== payments.sql =====================
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

-- ===================== insights.sql =====================
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
-- 보안 점검 후속 조치 (2026-11) — Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.

-- 1) 예전 개인용 테이블(holdings·analyses)에 RLS 켜기
--    지금 사이트는 이 테이블을 쓰지 않는다(포트폴리오는 portfolios 테이블). RLS 를 켜고 정책을 두지 않으면
--    익명·회원 모두 읽기/쓰기가 막힌다. 테이블이 없으면 그냥 넘어간다.
do $$ begin
  if to_regclass('public.holdings') is not null then execute 'alter table public.holdings enable row level security'; end if;
  if to_regclass('public.analyses') is not null then execute 'alter table public.analyses enable row level security'; end if;
end $$;

-- 2) AI 한도 되돌리기: 이제 AI 생성 '전에' 1회 차감하고, 생성이 실패하면 이 함수로 돌려준다
create or replace function public.refund_ai_quota()
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then return; end if;
  update ai_usage set count = greatest(count - 1, 0) where user_id = auth.uid() and day = d;
end $$;
grant execute on function public.refund_ai_quota() to authenticated;

-- 3) 장중 수급 기록 함수는 익명·회원이 직접 부르지 못하게 (지금 사이트 코드에서 쓰지 않음)
do $$ begin
  if to_regprocedure('public.record_flow_tick(text, bigint, bigint, bigint)') is not null then
    execute 'revoke execute on function public.record_flow_tick(text, bigint, bigint, bigint) from anon, authenticated, public';
  end if;
end $$;
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
