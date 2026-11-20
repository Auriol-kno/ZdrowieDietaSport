-- ZdrowieDietaSport: schemat Supabase (Postgres) z zabezpieczeniem wierszy (RLS).
-- Uruchom w Supabase: SQL Editor -> wklej cały plik -> Run. Plik można uruchomić tylko raz na pustym projekcie.
--
-- Role w rodzinie:
--   rodzic  - widzi i zmienia wszystko w rodzinie (profile, dzienniki, pomiary)
--   dorosły - widzi tylko swój profil i swój dziennik
--   dziecko - widzi tylko swój dziennik (np. własny telefon); pomiarów (waga, tłuszcz) nie widzi nigdy
-- Profil dziecka może istnieć bez konta (user_id = null): prowadzi go rodzic.

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  role text not null check (role in ('rodzic', 'dorosły', 'dziecko')),
  kcal_goal integer not null default 0 check (kcal_goal >= 0),
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);
create index members_user_idx on public.members (user_id);
create index members_family_idx on public.members (family_id);

-- Jeden wiersz = jeden dzień jednej osoby. data: {"meals": {...}, "water": n}
create table public.day_logs (
  member_id uuid not null references public.members (id) on delete cascade,
  day date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (member_id, day)
);

-- Pomiary (np. analizator Tanita): tylko rodzice.
create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  day date not null,
  weight_kg numeric(5, 1),
  fat_pct numeric(4, 1),
  muscle_kg numeric(5, 1),
  tbw_pct numeric(4, 1),
  note text,
  created_at timestamptz not null default now()
);
create index measurements_member_idx on public.measurements (member_id, day);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger day_logs_touch before insert or update on public.day_logs
  for each row execute function public.touch_updated_at();

-- ---------- funkcje pomocnicze (security definer, żeby reguły RLS nie wpadały w rekurencję) ----------

create function public.is_family_member(fid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where family_id = fid and user_id = auth.uid())
$$;

create function public.is_parent(fid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where family_id = fid and user_id = auth.uid() and role = 'rodzic')
$$;

create function public.can_access_member(mid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m
    where m.id = mid and (m.user_id = auth.uid() or public.is_parent(m.family_id))
  )
$$;

create function public.is_parent_of_member(mid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.id = mid and public.is_parent(m.family_id))
$$;

-- ---------- RLS ----------

alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.day_logs enable row level security;
alter table public.measurements enable row level security;

create policy families_select on public.families for select to authenticated
  using (public.is_family_member(id));
create policy families_update on public.families for update to authenticated
  using (public.is_parent(id)) with check (public.is_parent(id));

create policy members_select on public.members for select to authenticated
  using (public.is_family_member(family_id));
create policy members_insert on public.members for insert to authenticated
  with check (public.is_parent(family_id) and user_id is null);
create policy members_update on public.members for update to authenticated
  using (public.is_parent(family_id)) with check (public.is_parent(family_id));
create policy members_delete on public.members for delete to authenticated
  using (public.is_parent(family_id));

create policy day_logs_all on public.day_logs for all to authenticated
  using (public.can_access_member(member_id)) with check (public.can_access_member(member_id));

create policy measurements_all on public.measurements for all to authenticated
  using (public.is_parent_of_member(member_id)) with check (public.is_parent_of_member(member_id));

-- ---------- funkcje wywoływane z aplikacji (RPC) ----------

-- Tworzy rodzinę; osoba tworząca zostaje rodzicem.
create function public.create_family(family_name text, my_name text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.families (name) values (trim(family_name)) returning id into fid;
  insert into public.members (family_id, user_id, name, role) values (fid, auth.uid(), trim(my_name), 'rodzic');
  return fid;
end $$;

-- Pokazuje, które profile w rodzinie nie mają jeszcze konta (do "to jestem ja" przy dołączaniu).
create function public.family_preview(code text) returns table (member_id uuid, name text, role text)
  language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
    select m.id, m.name, m.role
    from public.members m join public.families f on f.id = m.family_id
    where f.invite_code = upper(trim(code)) and m.user_id is null;
end $$;

-- Dołącza do rodziny kodem. Albo przejmuje istniejący profil bez konta (claim_member_id),
-- albo tworzy nowy profil z rolą "dorosły" (rodzic może ją potem zmienić).
create function public.join_family(code text, my_name text, claim_member_id uuid default null) returns uuid
  language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into fid from public.families where invite_code = upper(trim(code));
  if fid is null then raise exception 'invalid code'; end if;
  if exists (select 1 from public.members where family_id = fid and user_id = auth.uid()) then
    return fid;
  end if;
  if claim_member_id is not null then
    update public.members set user_id = auth.uid()
      where id = claim_member_id and family_id = fid and user_id is null;
    if not found then raise exception 'member not claimable'; end if;
  else
    insert into public.members (family_id, user_id, name, role) values (fid, auth.uid(), trim(my_name), 'dorosły');
  end if;
  return fid;
end $$;

-- Nowy kod zaproszenia (stary przestaje działać). Tylko rodzic.
create function public.regenerate_invite(fid uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_parent(fid) then raise exception 'forbidden'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  update public.families set invite_code = c where id = fid;
  return c;
end $$;

-- Kod zaproszenia, tylko rodzic.
create function public.get_invite_code(fid uuid) returns text
  language plpgsql stable security definer set search_path = public as $$
declare c text;
begin
  if not public.is_parent(fid) then raise exception 'forbidden'; end if;
  select invite_code into c from public.families where id = fid;
  return c;
end $$;

-- ---------- uprawnienia ----------

revoke all on all tables in schema public from anon, public;
revoke all on all functions in schema public from anon, public;
-- Kod zaproszenia nie jest czytelny dla zwykłych zapytań: dostaje go tylko rodzic przez get_invite_code().
grant select (id, name, created_at), update (name) on public.families to authenticated;
grant select, insert, update, delete on public.members, public.day_logs, public.measurements to authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.touch_updated_at() from authenticated;

-- Odświeżanie na żywo (realtime) dla dzienników, jeśli publikacja istnieje (w Supabase istnieje).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.day_logs;
  end if;
end $$;
