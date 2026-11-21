-- ZdrowieDietaSport, migracja 2: wspólne dane rodziny (plan, własne przepisy, zakupy, spiżarnia, ustawienia profili).
-- Uruchom raz w Supabase: SQL Editor -> New query -> wklej cały plik -> Run. Można uruchomić ponownie bez szkody.

create table if not exists public.family_data (
  family_id uuid not null references public.families (id) on delete cascade,
  key text not null check (key in ('plan', 'recipes', 'pantry', 'shop', 'prof')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (family_id, key)
);

drop trigger if exists family_data_touch on public.family_data;
create trigger family_data_touch before insert or update on public.family_data
  for each row execute function public.touch_updated_at();

alter table public.family_data enable row level security;

drop policy if exists family_data_select on public.family_data;
create policy family_data_select on public.family_data for select to authenticated
  using (public.is_family_member(family_id));
drop policy if exists family_data_insert on public.family_data;
create policy family_data_insert on public.family_data for insert to authenticated
  with check (public.is_family_member(family_id));
drop policy if exists family_data_update on public.family_data;
create policy family_data_update on public.family_data for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

grant select, insert, update on public.family_data to authenticated;
