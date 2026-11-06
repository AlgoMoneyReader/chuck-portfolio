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
