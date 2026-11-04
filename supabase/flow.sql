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
