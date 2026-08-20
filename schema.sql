-- ============================================================
-- Facility Ops schema for Supabase
-- Run this once in your Supabase project's SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run)
--
-- Roles: technician (read-only), manager (add/remove devices,
-- edit rack capacity/name/position, add/remove sites), admin
-- (everything a manager can do — admin no longer has any extra
-- powers over manager, it's kept as a role label for future use).
-- ============================================================

-- ---------- profiles (one row per authenticated user) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'technician' check (role in ('manager','technician','admin')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own_name" on profiles;
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

-- helper: is the current logged-in user a manager OR admin?
create or replace function public.is_manager()
returns boolean as $$
  select exists(
    select 1 from public.profiles where id = auth.uid() and role in ('manager','admin')
  );
$$ language sql security definer stable;

-- helper: is the current logged-in user an admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists(
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
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

drop policy if exists "sites_select_authenticated" on sites;
create policy "sites_select_authenticated" on sites
  for select using (auth.role() = 'authenticated');

-- managers AND admins may create/edit sites
drop policy if exists "sites_write_managers" on sites;
create policy "sites_insert_managers" on sites
  for insert with check (public.is_manager());
create policy "sites_update_managers" on sites
  for update using (public.is_manager()) with check (public.is_manager());

-- managers AND admins may delete a site
drop policy if exists "sites_delete_admin" on sites;
drop policy if exists "sites_delete_managers" on sites;
create policy "sites_delete_managers" on sites
  for delete using (public.is_manager());

-- ---------- racks ----------
create table if not exists racks (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  row_label text,
  name text,
  capacity_kw numeric not null default 10
);
-- upgrading an existing project: add the display-name column if it's missing
alter table racks add column if not exists name text;

alter table racks enable row level security;

drop policy if exists "racks_select_authenticated" on racks;
create policy "racks_select_authenticated" on racks
  for select using (auth.role() = 'authenticated');

drop policy if exists "racks_insert_managers" on racks;
create policy "racks_insert_managers" on racks
  for insert with check (public.is_manager());

drop policy if exists "racks_update_managers" on racks;
create policy "racks_update_managers" on racks
  for update using (public.is_manager()) with check (public.is_manager());

-- rack deletes only really happen via a site being removed (cascade);
-- managers AND admins may also delete a rack directly
drop policy if exists "racks_delete_managers" on racks;
drop policy if exists "racks_delete_admin" on racks;
create policy "racks_delete_managers" on racks
  for delete using (public.is_manager());

-- ---------- devices ----------
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  rack_id text not null references racks(id) on delete cascade,
  start_u int not null,
  size_u int not null check (size_u between 1 and 42),
  model text not null,
  serial_number text,
  actual_kw numeric not null check (actual_kw > 0),
  datasheet_kw numeric not null check (datasheet_kw > 0),
  authorized_person text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
-- upgrading an existing project: add the serial-number column if it's missing
alter table devices add column if not exists serial_number text;
alter table devices enable row level security;

drop policy if exists "devices_select_authenticated" on devices;
create policy "devices_select_authenticated" on devices
  for select using (auth.role() = 'authenticated');

-- managers AND admins may add or remove devices; technicians cannot
drop policy if exists "devices_insert_managers" on devices;
create policy "devices_insert_managers" on devices
  for insert with check (public.is_manager());

drop policy if exists "devices_delete_managers" on devices;
create policy "devices_delete_managers" on devices
  for delete using (public.is_manager());

-- ---------- rack_events (audit log / history) ----------
create table if not exists rack_events (
  id uuid primary key default gen_random_uuid(),
  rack_id text not null references racks(id) on delete cascade,
  event_type text not null check (event_type in ('device_added','device_removed','capacity_changed','rack_moved','rack_renamed')),
  detail text not null,
  performed_by uuid references profiles(id),
  performed_by_email text,
  created_at timestamptz default now()
);
-- upgrading an existing project: widen the event_type constraint to include the new types
alter table rack_events drop constraint if exists rack_events_event_type_check;
alter table rack_events add constraint rack_events_event_type_check
  check (event_type in ('device_added','device_removed','capacity_changed','rack_moved','rack_renamed'));
alter table rack_events enable row level security;

drop policy if exists "rack_events_select_authenticated" on rack_events;
create policy "rack_events_select_authenticated" on rack_events
  for select using (auth.role() = 'authenticated');
-- no manual insert policy needed — only the security-definer triggers below write to this table

-- auto-log every device add/remove
create or replace function public.log_device_change()
returns trigger as $$
declare
  actor_email text;
begin
  select email into actor_email from public.profiles where id = auth.uid();
  if (tg_op = 'INSERT') then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.rack_id, 'device_added',
      new.model || coalesce(' (SN '||nullif(new.serial_number,'')||')', '') || ' — ' || new.actual_kw || ' kW (U' || new.start_u ||
      case when new.size_u>1 then '-'||(new.start_u+new.size_u-1) else '' end || ')',
      auth.uid(), actor_email);
    return new;
  elsif (tg_op = 'DELETE') then
    -- only log if the rack itself still exists — during a cascading
    -- site/rack delete, the rack row may already be gone by the time
    -- this fires, which would otherwise violate the FK on rack_events
    if exists (select 1 from public.racks where id = old.rack_id) then
      insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
      values (old.rack_id, 'device_removed',
        old.model || coalesce(' (SN '||nullif(old.serial_number,'')||')', '') || ' — ' || old.actual_kw || ' kW (U' || old.start_u ||
        case when old.size_u>1 then '-'||(old.start_u+old.size_u-1) else '' end || ')',
        auth.uid(), actor_email);
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists on_device_change on devices;
create trigger on_device_change
  after insert or delete on devices
  for each row execute procedure public.log_device_change();

-- auto-log rack capacity changes, row/position moves, and renames
create or replace function public.log_rack_change()
returns trigger as $$
declare
  actor_email text;
begin
  select email into actor_email from public.profiles where id = auth.uid();
  if new.capacity_kw is distinct from old.capacity_kw then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.id, 'capacity_changed', old.capacity_kw || ' kW -> ' || new.capacity_kw || ' kW', auth.uid(), actor_email);
  end if;
  if new.row_label is distinct from old.row_label then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.id, 'rack_moved', 'Row ' || coalesce(old.row_label,'—') || ' -> Row ' || coalesce(new.row_label,'—'), auth.uid(), actor_email);
  end if;
  if new.name is distinct from old.name then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.id, 'rack_renamed', coalesce(nullif(old.name,''), old.id) || ' -> ' || coalesce(nullif(new.name,''), new.id), auth.uid(), actor_email);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_rack_capacity_change on racks;
drop trigger if exists on_rack_change on racks;
create trigger on_rack_change
  after update on racks
  for each row execute procedure public.log_rack_change();

-- ============================================================
-- After running this file:
-- 1. Sign up your first user from the app's login screen.
-- 2. In Table Editor -> profiles, change that user's `role` to 'manager'
--    or 'admin' (managers can add/remove sites and devices, rename and
--    reposition racks, and edit rack capacity — admin has no extra
--    powers beyond that right now).
-- 3. Everyone else who signs up defaults to 'technician' (read-only).
--
-- If you're upgrading an EXISTING project that already ran an older
-- version of this file, run this first to widen the role constraint:
--   alter table profiles drop constraint profiles_role_check;
--   alter table profiles add constraint profiles_role_check
--     check (role in ('manager','technician','admin'));
-- All other upgrades (new columns, widened event_type check) are
-- handled by the `alter table ... add column if not exists` and
-- `drop/add constraint` statements above — just re-run the whole file.
-- ============================================================
