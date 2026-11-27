-- ZdrowieDietaSport, migracja 3: kopie zapasowe w bazie.
-- Tylko DODAJE nową tabelę; istniejących danych nie zmienia. Uruchom raz: SQL Editor -> New query -> wklej -> Run.

create table if not exists public.family_backups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  label text not null default '',
  device text not null default '',
  size_bytes integer not null default 0,
  data jsonb not null
);
create index if not exists family_backups_family_idx on public.family_backups (family_id, created_at desc);

alter table public.family_backups enable row level security;

drop policy if exists family_backups_select on public.family_backups;
create policy family_backups_select on public.family_backups for select to authenticated
  using (public.is_family_member(family_id));
drop policy if exists family_backups_insert on public.family_backups;
create policy family_backups_insert on public.family_backups for insert to authenticated
  with check (public.is_family_member(family_id));
drop policy if exists family_backups_delete on public.family_backups;
create policy family_backups_delete on public.family_backups for delete to authenticated
  using (public.is_parent(family_id));

grant select, insert, delete on public.family_backups to authenticated;
