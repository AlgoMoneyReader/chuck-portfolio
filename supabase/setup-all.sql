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
