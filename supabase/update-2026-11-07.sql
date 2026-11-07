-- 2026-11-07 배포분: 이 파일 하나만 실행하면 됩니다 (news.sql + stats.sql 합본)
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

-- 운영 통계 (방문자 · 페이지뷰 · 인기 종목 · 인기 검색어) + 장 마감 요약 알림 설정
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.
-- 기록은 아래 함수로만(로그인 없이도 호출 가능, 숫자만 1씩 올린다), 읽기는 운영자(admin_stats)만.

-- 0) 푸시 알림: '장 마감 요약' 받기 설정 칸
alter table public.push_subs add column if not exists close boolean not null default true;

-- 1) 하루 방문자 (브라우저마다 무작위 ID, 개인정보 아님)
create table if not exists public.site_visits (
  day date not null,
  vid text not null,
  created_at timestamptz not null default now(),
  primary key (day, vid)
);
alter table public.site_visits enable row level security;

-- 2) 하루 페이지뷰 (첫 경로 단위: /, /flow, /news, /stock …)
create table if not exists public.page_views (
  day date not null,
  path text not null,
  count int not null default 0,
  primary key (day, path)
);
alter table public.page_views enable row level security;

-- 3) 종목 조회수 (로그인 안 한 방문자 포함)
create table if not exists public.stock_views (
  day date not null,
  code text not null,
  name text,
  count int not null default 0,
  primary key (day, code)
);
alter table public.stock_views enable row level security;

-- 4) 검색어
create table if not exists public.search_terms (
  day date not null,
  q text not null,
  count int not null default 0,
  primary key (day, q)
);
alter table public.search_terms enable row level security;

create or replace function public.track_visit(p_vid text, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
        p text := coalesce(nullif(split_part(coalesce(p_path, '/'), '/', 2), ''), '');
begin
  if p_vid is null or length(p_vid) not between 8 and 64 then return; end if;
  p := '/' || left(p, 20);
  insert into site_visits (day, vid) values (d, p_vid) on conflict do nothing;
  insert into page_views (day, path, count) values (d, p, 1)
    on conflict (day, path) do update set count = page_views.count + 1;
end $$;

create or replace function public.track_stock(p_code text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_code is null or p_code !~ '^[0-9A-Za-z.\-]{1,12}$' then return; end if;
  insert into stock_views (day, code, name, count) values (d, upper(p_code), left(p_name, 40), 1)
    on conflict (day, code) do update set count = stock_views.count + 1, name = coalesce(excluded.name, stock_views.name);
end $$;

create or replace function public.track_search(p_q text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
        q text := lower(btrim(coalesce(p_q, '')));
begin
  if length(q) < 1 or length(q) > 30 then return; end if;
  insert into search_terms (day, q, count) values (d, q, 1)
    on conflict (day, q) do update set count = search_terms.count + 1;
end $$;

grant execute on function public.track_visit(text, text) to anon, authenticated;
grant execute on function public.track_stock(text, text) to anon, authenticated;
grant execute on function public.track_search(text) to anon, authenticated;

-- 운영자 대시보드용 요약 (운영자만)
create or replace function public.admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
        r json;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select json_build_object(
    'today', d,
    'visitors_today', (select count(*) from site_visits where day = d),
    'pageviews_today', (select coalesce(sum(count), 0) from page_views where day = d),
    'visitors_7d', (select coalesce(json_agg(x order by x.day), '[]'::json) from (
        select g::date as day, (select count(*) from site_visits v where v.day = g::date) as visitors,
               (select coalesce(sum(count), 0) from page_views p where p.day = g::date) as pageviews
        from generate_series(d - 6, d, interval '1 day') g) x),
    'pages_today', (select coalesce(json_agg(x), '[]'::json) from (select path, count from page_views where day = d order by count desc limit 8) x),
    'top_stocks_7d', (select coalesce(json_agg(x), '[]'::json) from (
        select code, max(name) as name, sum(count)::int as count from stock_views where day > d - 7 group by code order by 3 desc limit 10) x),
    'top_searches_7d', (select coalesce(json_agg(x), '[]'::json) from (
        select q, sum(count)::int as count from search_terms where day > d - 7 group by q order by 2 desc limit 10) x),
    'members', (select count(*) from profiles),
    'members_7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'push', (select json_build_object('total', count(*), 'idx', count(*) filter (where idx), 'watch', count(*) filter (where watch),
                                      'insight', count(*) filter (where insight), 'close', count(*) filter (where close),
                                      'members', count(*) filter (where user_id is not null)) from push_subs)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_stats() to authenticated;

-- 90일 지난 통계 정리 (매일)
select cron.unschedule('alliknam-stats-clean') where exists (select 1 from cron.job where jobname = 'alliknam-stats-clean');
select cron.schedule('alliknam-stats-clean', '20 4 * * *', $$
  delete from public.site_visits where day < current_date - 90;
  delete from public.page_views where day < current_date - 90;
  delete from public.stock_views where day < current_date - 90;
  delete from public.search_terms where day < current_date - 90;
$$);
