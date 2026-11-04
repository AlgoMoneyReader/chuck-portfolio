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
