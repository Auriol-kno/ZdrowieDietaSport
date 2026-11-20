-- Test reguł dostępu. Uruchom po stub_supabase.sql i schema.sql. Każdy błąd przerywa test (ON_ERROR_STOP).
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'rodzic1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'rodzic2@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'obcy@example.com');

-- Pomocnik testowy: true, jeśli zapytanie kończy się błędem (uprawnienia liczone dla wywołującego).
create function public.t_fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
grant execute on function public.t_fails(text) to authenticated;

-- Rodzic 1 tworzy rodzinę i dodaje profil dziecka bez konta.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.create_family('Rodzina testowa', 'Rodzic 1') as fid \gset
insert into public.members (family_id, name, role, kcal_goal) values (:'fid', 'Franciszek', 'dziecko', 1750);
insert into public.members (family_id, name, role) values (:'fid', 'Rodzic 2 (bez konta)', 'dorosły');
select id as kid from public.members where name = 'Franciszek' \gset
select public.get_invite_code(:'fid') as code \gset
insert into public.day_logs (member_id, day, data) values (:'kid', '2026-11-20', '{"water":3}');
insert into public.measurements (member_id, day, weight_kg, fat_pct) values (:'kid', '2026-11-19', 51.2, 31.1);

-- Rodzic 2 dołącza kodem, przejmując swój profil.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select count(*) = 2 as podglad_ok from public.family_preview(:'code') \gset
\if :podglad_ok
\else
  \echo 'BŁĄD: family_preview'
  \quit
\endif
select member_id as claim from public.family_preview(:'code') where role = 'dorosły' \gset
select public.join_family(:'code', 'x', :'claim') as joined \gset

-- Rodzic 2 ma rolę "dorosły": widzi rodzinę i swój profil, ale nie dziennik dziecka ani pomiary.
select count(*) = 3 as widzi_czlonkow from public.members \gset
select count(*) = 0 as nie_widzi_dziennika from public.day_logs \gset
select count(*) = 0 as nie_widzi_pomiarow from public.measurements \gset
select (:'widzi_czlonkow' = 't' and :'nie_widzi_dziennika' = 't' and :'nie_widzi_pomiarow' = 't') as dorosly_ok \gset
\if :dorosly_ok
\else
  \echo 'BŁĄD: dorosły widzi za dużo albo za mało'
  \quit
\endif

-- Dorosły nie dostanie kodu zaproszenia ani zwykłym zapytaniem, ani funkcją.
select public.t_fails(format('select public.get_invite_code(%L)', :'fid'))
   and public.t_fails('select invite_code from public.families') as kod_ukryty \gset
\if :kod_ukryty
\else
  \echo 'BŁĄD: dorosły widzi kod zaproszenia'
  \quit
\endif

-- Dorosły nie może sam awansować na rodzica ani edytować cudzych danych.
update public.members set role = 'rodzic' where user_id = '00000000-0000-0000-0000-0000000000a2';
select count(*) = 0 as awans_zablokowany from public.members where role = 'rodzic' and user_id = '00000000-0000-0000-0000-0000000000a2' \gset
\if :awans_zablokowany
\else
  \echo 'BŁĄD: dorosły awansował się na rodzica'
  \quit
\endif

-- Obcy użytkownik nie widzi niczego i nie zgadnie kodu.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select (select count(*) from public.families) + (select count(*) from public.members)
     + (select count(*) from public.day_logs) + (select count(*) from public.measurements) = 0 as obcy_ok \gset
\if :obcy_ok
\else
  \echo 'BŁĄD: obcy widzi dane rodziny'
  \quit
\endif

-- Obcy nie może wpisać się do dziennika dziecka.
select public.t_fails(format('insert into public.day_logs (member_id, day, data) values (%L, %L, %L)', :'kid', '2026-11-21', '{}')) as zapis_zablokowany \gset
reset role;
\if :zapis_zablokowany
\else
  \echo 'BŁĄD: obcy zapisał do dziennika'
  \quit
\endif
select count(*) = 1 as dziennik_nietkniety from public.day_logs \gset
\if :dziennik_nietkniety
\else
  \echo 'BŁĄD: obcy zmienił dziennik'
  \quit
\endif

-- Rodzic 1 awansuje Rodzica 2, potem widzi dziennik i pomiary dziecka.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update public.members set role = 'rodzic' where user_id = '00000000-0000-0000-0000-0000000000a2';
select count(*) = 1 as widzi_dziennik from public.day_logs \gset
select count(*) = 1 as widzi_pomiary from public.measurements \gset
select (:'widzi_dziennik' = 't' and :'widzi_pomiary' = 't') as rodzic_ok \gset
\if :rodzic_ok
\else
  \echo 'BŁĄD: rodzic nie widzi danych dziecka'
  \quit
\endif

-- Nowy kod unieważnia stary; anonimowy użytkownik (anon) nie ma dostępu do tabel.
select public.regenerate_invite(:'fid') <> :'code' as kod_zmieniony \gset
\if :kod_zmieniony
\else
  \echo 'BŁĄD: kod się nie zmienił'
  \quit
\endif
reset role;
set role anon;
do $$
begin
  perform 1 from public.members;
  raise exception 'anon czyta members';
exception when insufficient_privilege then null;
end $$;
reset role;

\echo 'WSZYSTKIE TESTY RLS OK'
