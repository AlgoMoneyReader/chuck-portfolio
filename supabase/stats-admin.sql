-- 운영자 본인 방문은 통계에서 제외 — Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.

-- 1) 운영자로 로그인한 상태의 기록은 서버에서도 무시
create or replace function public.track_visit(p_vid text, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
        p text := coalesce(nullif(split_part(coalesce(p_path, '/'), '/', 2), ''), '');
begin
  if public.is_admin() then return; end if;
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
  if public.is_admin() then return; end if;
  if p_code is null or p_code !~ '^[0-9A-Za-z.\-]{1,12}$' then return; end if;
  insert into stock_views (day, code, name, count) values (d, upper(p_code), left(p_name, 40), 1)
    on conflict (day, code) do update set count = stock_views.count + 1, name = coalesce(excluded.name, stock_views.name);
end $$;

create or replace function public.track_search(p_q text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
        q text := lower(btrim(coalesce(p_q, '')));
begin
  if public.is_admin() then return; end if;
  if length(q) < 1 or length(q) > 30 then return; end if;
  insert into search_terms (day, q, count) values (d, q, 1)
    on conflict (day, q) do update set count = search_terms.count + 1;
end $$;

-- 2) 운영자 기기의 지난 방문 기록 지우기 (운영자만 호출 가능)
create or replace function public.forget_visitor(p_vid text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return; end if;
  delete from site_visits where vid = p_vid;
end $$;
grant execute on function public.forget_visitor(text) to authenticated;
