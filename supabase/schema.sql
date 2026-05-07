-- 알읽남 포트폴리오 매니저 DB 스키마
-- Supabase SQL Editor에서 실행하세요

-- 보유 종목 테이블
create table if not exists holdings (
  id uuid default gen_random_uuid() primary key,
  user_id text not null default 'default',
  ticker text not null,
  name text,
  qty numeric not null,
  avg_price numeric not null,
  currency text not null default 'KRW',
  sector text default '',
  memo text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, ticker)
);

-- 업데이트 시간 자동 갱신
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger holdings_updated_at
  before update on holdings
  for each row execute function update_updated_at();

-- 분석 히스토리 테이블 (선택)
create table if not exists analyses (
  id uuid default gen_random_uuid() primary key,
  user_id text not null default 'default',
  ticker text not null,
  company_name text,
  thesis text,
  result text not null,
  created_at timestamptz default now()
);

-- RLS 비활성화 (개인 사용 시) — 멀티유저 전환 시 활성화
alter table holdings disable row level security;
alter table analyses disable row level security;
