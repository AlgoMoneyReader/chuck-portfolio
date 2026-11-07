-- 2026-11-08 배포분: 이 파일 하나만 Supabase SQL Editor 에서 Run. 여러 번 실행해도 안전하다.

-- 1) 푸시 알림: '관심 종목 공시' 받기 설정 칸
alter table public.push_subs add column if not exists dart boolean not null default true;

-- 2) 종목 토론: 게시글에 종목 코드·이름, '종목토론' 분류
alter table public.posts add column if not exists stock_code text;
alter table public.posts add column if not exists stock_name text;
create index if not exists posts_stock_idx on public.posts (stock_code, created_at desc) where stock_code is not null;
alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts add constraint posts_category_check check (category in ('자유', '국내주식', '해외주식', '질문', '종목토론'));

-- 운영자는 문제 글·댓글을 지울 수 있다
drop policy if exists "posts admin delete" on public.posts;
create policy "posts admin delete" on public.posts for delete using (public.is_admin());
drop policy if exists "comments admin delete" on public.comments;
create policy "comments admin delete" on public.comments for delete using (public.is_admin());

-- 3) 사용자 화면 오류 모음 (같은 날·같은 내용·같은 화면은 횟수만 올림)
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  day date not null default ((now() at time zone 'Asia/Seoul')::date),
  message text not null,
  path text not null default '',
  kind text,
  stack text,
  ua text,
  count int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (day, message, path)
);
alter table public.client_errors enable row level security;
drop policy if exists "client_errors admin read" on public.client_errors;
create policy "client_errors admin read" on public.client_errors for select using (public.is_admin());
drop policy if exists "client_errors admin delete" on public.client_errors;
create policy "client_errors admin delete" on public.client_errors for delete using (public.is_admin());

create or replace function public.log_client_error(p_message text, p_stack text, p_path text, p_kind text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_message is null or length(p_message) < 3 then return; end if;
  -- 하루 오류 종류가 너무 많으면(악성 반복) 더 받지 않는다
  if (select count(*) from client_errors where day = d) > 500 then return; end if;
  insert into client_errors (day, message, path, kind, stack, ua)
  values (d, left(p_message, 300), left(coalesce(p_path, ''), 100), left(p_kind, 20), left(p_stack, 1500), left(p_ua, 200))
  on conflict (day, message, path) do update set count = client_errors.count + 1, last_seen = now(), ua = excluded.ua;
end $$;
grant execute on function public.log_client_error(text, text, text, text, text) to anon, authenticated;

-- 30일 지난 오류 정리 (매일)
select cron.unschedule('alliknam-errors-clean') where exists (select 1 from cron.job where jobname = 'alliknam-errors-clean');
select cron.schedule('alliknam-errors-clean', '30 4 * * *', $$ delete from public.client_errors where day < current_date - 30 $$);
