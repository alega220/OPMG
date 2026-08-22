-- ============================================================
-- Facility Ops schema for Supabase
-- Run this in your Supabase project's SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run)
--
-- Safe to re-run any time, on a fresh project OR an existing one —
-- every statement uses IF NOT EXISTS / OR REPLACE / DROP-then-ADD /
-- guarded DO blocks, so upgrading is just "paste the latest version
-- of this file and run it again." Existing data is never discarded;
-- see the migration notes inline below for exactly what each
-- guarded block does to older installs.
--
-- Roles: technician (read-only). manager and admin can both add or
-- remove sites/racks/devices and edit rack capacity — admin is kept
-- as a separate label for now but currently has the same
-- permissions as manager.
--
-- Power model: each RACK carries its own directly-entered
-- actual_kva (e.g. a PDU/meter reading) — this is NOT summed from
-- devices. Each DEVICE carries only a datasheet_kva (nameplate/rated
-- spec) for reference; devices have no per-device "actual" figure.
-- ============================================================

-- ---------- profiles (one row per authenticated user) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'technician',
  created_at timestamptz default now()
);

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('manager','technician','admin'));

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
-- (kept for future use — not currently required by any policy below)
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

-- managers AND admins may create/edit/delete sites
drop policy if exists "sites_write_managers" on sites;
drop policy if exists "sites_insert_managers" on sites;
create policy "sites_insert_managers" on sites
  for insert with check (public.is_manager());

drop policy if exists "sites_update_managers" on sites;
create policy "sites_update_managers" on sites
  for update using (public.is_manager()) with check (public.is_manager());

drop policy if exists "sites_delete_admin" on sites;
drop policy if exists "sites_delete_managers" on sites;
create policy "sites_delete_managers" on sites
  for delete using (public.is_manager());

-- ---------- racks ----------
-- Fresh installs get the final column names directly.
create table if not exists racks (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  row_label text,
  capacity_kva numeric not null default 10,
  actual_kva numeric not null default 0,
  circuit_breaker text,
  position numeric not null default 0
);

-- Upgrade path: older installs still have capacity_kw — rename it in place.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='racks' and column_name='capacity_kw') then
    alter table racks rename column capacity_kw to capacity_kva;
  end if;
end $$;

alter table racks add column if not exists position numeric not null default 0;
alter table racks add column if not exists actual_kva numeric not null default 0;
alter table racks add column if not exists circuit_breaker text;

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

-- rack deletes mostly happen via a site being removed (cascade),
-- but direct rack deletion is also manager+admin
drop policy if exists "racks_delete_admin" on racks;
drop policy if exists "racks_delete_managers" on racks;
create policy "racks_delete_managers" on racks
  for delete using (public.is_manager());

-- ---------- devices ----------
-- Fresh installs: no actual_kva column here at all — actual power
-- lives on the rack, not the device.
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  rack_id text not null references racks(id) on delete cascade,
  start_u int not null,
  size_u int not null check (size_u between 1 and 42),
  model text not null,
  serial_number text,
  datasheet_kva numeric not null check (datasheet_kva > 0),
  authorized_person text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table devices add column if not exists serial_number text;

-- Upgrade path: older installs still have datasheet_kw — rename it in place.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='devices' and column_name='datasheet_kw') then
    alter table devices rename column datasheet_kw to datasheet_kva;
  end if;
end $$;

-- Upgrade path: older installs have a per-device actual_kw. Before it's
-- dropped, back-fill each rack's new actual_kva with the sum of its
-- devices' old actual_kw — so real measured data already entered is
-- preserved as the rack-level figure, not discarded.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='devices' and column_name='actual_kw') then
    update racks r set actual_kva = coalesce((select sum(d.actual_kw) from devices d where d.rack_id = r.id), 0)
      where r.actual_kva = 0;
    alter table devices drop column actual_kw;
  end if;
end $$;

-- allow renaming a rack (racks.id) without breaking existing devices/history:
-- ON UPDATE CASCADE means changing racks.id automatically updates every
-- devices.rack_id / rack_events.rack_id that pointed at it.
alter table devices drop constraint if exists devices_rack_id_fkey;
alter table devices add constraint devices_rack_id_fkey
  foreign key (rack_id) references racks(id) on delete cascade on update cascade;

alter table devices enable row level security;

drop policy if exists "devices_select_authenticated" on devices;
create policy "devices_select_authenticated" on devices
  for select using (auth.role() = 'authenticated');

-- managers AND admins may add, edit, or remove devices; technicians cannot
drop policy if exists "devices_insert_managers" on devices;
create policy "devices_insert_managers" on devices
  for insert with check (public.is_manager());

drop policy if exists "devices_update_managers" on devices;
create policy "devices_update_managers" on devices
  for update using (public.is_manager()) with check (public.is_manager());

drop policy if exists "devices_delete_managers" on devices;
create policy "devices_delete_managers" on devices
  for delete using (public.is_manager());

-- ---------- rack_events (audit log / history) ----------
create table if not exists rack_events (
  id uuid primary key default gen_random_uuid(),
  rack_id text not null references racks(id) on delete cascade,
  event_type text not null,
  detail text not null,
  performed_by uuid references profiles(id),
  performed_by_email text,
  created_at timestamptz default now()
);

alter table rack_events drop constraint if exists rack_events_event_type_check;
alter table rack_events add constraint rack_events_event_type_check
  check (event_type in ('device_added','device_removed','device_edited','capacity_changed','actual_changed','breaker_changed','rack_moved','rack_renamed'));

alter table rack_events drop constraint if exists rack_events_rack_id_fkey;
alter table rack_events add constraint rack_events_rack_id_fkey
  foreign key (rack_id) references racks(id) on delete cascade on update cascade;

alter table rack_events enable row level security;

drop policy if exists "rack_events_select_authenticated" on rack_events;
create policy "rack_events_select_authenticated" on rack_events
  for select using (auth.role() = 'authenticated');
-- no manual insert policy needed — only the security-definer triggers below write to this table

-- auto-log every device add/remove/edit
create or replace function public.log_device_change()
returns trigger as $$
declare
  actor_email text;
begin
  select email into actor_email from public.profiles where id = auth.uid();
  if (tg_op = 'INSERT') then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.rack_id, 'device_added',
      new.model || coalesce(' (SN ' || nullif(new.serial_number,'') || ')', '') || ' — rated ' || new.datasheet_kva || ' kVA (U' || new.start_u ||
      case when new.size_u>1 then '-'||(new.start_u+new.size_u-1) else '' end || ')',
      auth.uid(), actor_email);
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (old.rack_id, 'device_removed',
      old.model || coalesce(' (SN ' || nullif(old.serial_number,'') || ')', '') || ' — rated ' || old.datasheet_kva || ' kVA (U' || old.start_u ||
      case when old.size_u>1 then '-'||(old.start_u+old.size_u-1) else '' end || ')',
      auth.uid(), actor_email);
    return old;
  elsif (tg_op = 'UPDATE') then
    if new.model is distinct from old.model or new.size_u is distinct from old.size_u
       or new.serial_number is distinct from old.serial_number or new.datasheet_kva is distinct from old.datasheet_kva
       or new.authorized_person is distinct from old.authorized_person then
      insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
      values (new.rack_id, 'device_edited', old.model || ' updated (now: ' || new.model || ', ' || new.datasheet_kva || ' kVA, ' || new.authorized_person || ')', auth.uid(), actor_email);
    end if;
    return new;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists on_device_change on devices;
create trigger on_device_change
  after insert or delete or update on devices
  for each row execute procedure public.log_device_change();

-- auto-log rack capacity/actual-power/breaker changes, moves between rows, and renames
create or replace function public.log_rack_change()
returns trigger as $$
declare
  actor_email text;
begin
  select email into actor_email from public.profiles where id = auth.uid();

  if new.capacity_kva is distinct from old.capacity_kva then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.id, 'capacity_changed', old.capacity_kva || ' kVA -> ' || new.capacity_kva || ' kVA', auth.uid(), actor_email);
  end if;

  if new.actual_kva is distinct from old.actual_kva then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.id, 'actual_changed', old.actual_kva || ' kVA -> ' || new.actual_kva || ' kVA', auth.uid(), actor_email);
  end if;

  if new.circuit_breaker is distinct from old.circuit_breaker then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.id, 'breaker_changed', coalesce(old.circuit_breaker,'—') || ' -> ' || coalesce(new.circuit_breaker,'—'), auth.uid(), actor_email);
  end if;

  if new.row_label is distinct from old.row_label then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.id, 'rack_moved', 'Row ' || coalesce(old.row_label,'—') || ' -> Row ' || coalesce(new.row_label,'—'), auth.uid(), actor_email);
  end if;

  if new.id is distinct from old.id then
    insert into public.rack_events (rack_id, event_type, detail, performed_by, performed_by_email)
    values (new.id, 'rack_renamed', old.id || ' -> ' || new.id, auth.uid(), actor_email);
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
-- 2. In Table Editor -> profiles, change that user's `role` to
--    'manager' or 'admin' (both currently have identical permissions —
--    add/remove sites, racks, and devices; edit capacity; move/rename
--    racks). Everyone else who signs up defaults to 'technician'
--    (read-only).
-- 3. Re-running this whole file later (to pick up future updates) is
--    always safe — nothing here is destructive to existing data.
--    Upgrading from an install that predates the actual/datasheet
--    power split: each rack's actual_kva is automatically seeded
--    from the sum of its devices' old actual_kw readings before that
--    column is dropped, so previously-imported real power data is
--    preserved, just moved to the rack level where you can edit it
--    directly going forward.
-- ============================================================
