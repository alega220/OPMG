-- ============================================================
-- Facility Ops schema for Supabase
-- Run this once in your Supabase project's SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run)
-- ============================================================

-- ---------- profiles (one row per authenticated user) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'technician' check (role in ('manager','technician')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own_name" on profiles
  for update using (auth.uid() = id);

-- auto-create a profile row (default role: technician) whenever someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'technician');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- helper: is the current logged-in user a manager?
create or replace function public.is_manager()
returns boolean as $$
  select exists(
    select 1 from public.profiles where id = auth.uid() and role = 'manager'
  );
$$ language sql security definer stable;

-- ---------- sites ----------
create table if not exists sites (
  id text primary key,
  name text not null,
  location text,
  tier text,
  pue numeric not null default 1.4
);
alter table sites enable row level security;
create policy "sites_select_authenticated" on sites
  for select using (auth.role() = 'authenticated');
create policy "sites_write_managers" on sites
  for all using (public.is_manager()) with check (public.is_manager());

-- ---------- racks ----------
create table if not exists racks (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  row_label text,
  capacity_kw numeric not null default 10
);
alter table racks enable row level security;
create policy "racks_select_authenticated" on racks
  for select using (auth.role() = 'authenticated');
create policy "racks_insert_managers" on racks
  for insert with check (public.is_manager());
create policy "racks_update_managers" on racks
  for update using (public.is_manager()) with check (public.is_manager());
create policy "racks_delete_managers" on racks
  for delete using (public.is_manager());

-- ---------- devices ----------
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  rack_id text not null references racks(id) on delete cascade,
  start_u int not null,
  size_u int not null check (size_u between 1 and 42),
  model text not null,
  actual_kw numeric not null check (actual_kw > 0),
  datasheet_kw numeric not null check (datasheet_kw > 0),
  authorized_person text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table devices enable row level security;
create policy "devices_select_authenticated" on devices
  for select using (auth.role() = 'authenticated');
create policy "devices_insert_managers" on devices
  for insert with check (public.is_manager());
create policy "devices_delete_managers" on devices
  for delete using (public.is_manager());

-- Technicians therefore get read-only access everywhere; only rows where
-- profiles.role = 'manager' can insert/delete devices or edit rack capacity,
-- enforced at the database level regardless of what the UI shows.

-- ============================================================
-- After running this file:
-- 1. Sign up your first user from the app's login screen.
-- 2. In Table Editor -> profiles, change that user's `role` to 'manager'.
-- 3. Everyone else who signs up defaults to 'technician'.
-- ============================================================
