-- OPMG v2 migration: cages / suites / pods / zones.
-- Additive and safe to re-run. Does not change or drop any existing table, column or policy.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.cages (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.sites(id) on delete cascade,
  floor_id uuid,
  name text not null,
  customer text,
  color text default '#6366f1',
  type text not null default 'cage' check (type in ('cage','suite','pod','zone','room')),
  notes text,
  created_at timestamptz default now()
);

-- racks point at a cage; deleting a cage just un-assigns its racks
alter table public.racks add column if not exists cage_id uuid references public.cages(id) on delete set null;
create index if not exists racks_cage_id_idx on public.racks(cage_id);
create index if not exists cages_site_id_idx on public.cages(site_id);

alter table public.cages enable row level security;

-- only approved users can read; only approved managers/admins can write
create or replace function public.is_approved_user()
returns boolean as $$
  select exists(select 1 from public.profiles where id = auth.uid() and coalesce(approved,false) = true);
$$ language sql security definer stable;

drop policy if exists "cages_select_approved" on public.cages;
create policy "cages_select_approved" on public.cages for select using (public.is_approved_user());

drop policy if exists "cages_insert_managers" on public.cages;
create policy "cages_insert_managers" on public.cages for insert with check (public.is_approved_user() and public.is_manager());

drop policy if exists "cages_update_managers" on public.cages;
create policy "cages_update_managers" on public.cages for update using (public.is_approved_user() and public.is_manager()) with check (public.is_approved_user() and public.is_manager());

drop policy if exists "cages_delete_managers" on public.cages;
create policy "cages_delete_managers" on public.cages for delete using (public.is_approved_user() and public.is_manager());
