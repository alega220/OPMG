# Facility Ops — DCIM

A colocation facility operations dashboard: site overview, DCIM-style
floor plan and rack elevation views, device inventory, and portfolio
analytics — with manager/technician roles.

It runs in two modes:

- **Demo mode** (default, out of the box) — mock data, no login, a
  role switcher in the top bar so you can preview both permission
  levels. Nothing persists between page loads.
- **Live mode** — real accounts via Supabase Auth, real persistence,
  and role permissions enforced by the database itself (not just the
  UI). This is what you want once you're ready to actually use it
  day to day.

Nothing needs to be built or compiled — it's plain HTML/CSS/JS.
Opening `index.html` in a browser is enough to try the demo.

---

## Going live: Supabase (10 minutes)

1. **Create a project.** Go to [supabase.com](https://supabase.com) →
   New project. Pick any name/region/password.
2. **Run the schema.** In your project: **SQL Editor → New query**,
   paste the entire contents of `schema.sql` from this folder, and
   click **Run**. This creates the `sites`, `racks`, `devices`, and
   `profiles` tables, plus the row-level security policies that
   restrict adding/removing devices and editing rack capacity to
   users whose role is `manager`.
3. **Get your API keys.** Project → **Settings → API**. Copy the
   **Project URL** and the **anon public** key.
4. **Fill in `config.js`:**
   ```js
   window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJ...";
   ```
5. **Enable email sign-ups.** In Supabase: **Authentication →
   Providers → Email**, make sure it's enabled. For quick internal
   testing you can also turn off "Confirm email" under
   **Authentication → Settings** so new accounts don't need to click
   a confirmation link.
6. **Open the app and create your first account** via the "Create
   account" tab on the login screen. Every new sign-up defaults to
   the `technician` role.
7. **Promote yourself to admin.** In Supabase: **Table Editor →
   profiles**, find your row, change `role` from `technician` to
   `admin`, save. (Admin is a superset of manager — see the roles
   table below.)
8. **Seed initial data.** Sign back in — as a manager/admin on an
   empty project you'll see a **"Seed demo data"** button on the
   dashboard. Click it once to populate the 4 sample sites (B90, A12,
   C77, D40) with racks and devices. From then on, use **+ Add site**,
   **+ Add device** / the remove (×) button in the rack view, and
   **Remove site** to manage real inventory, and edit a rack's
   **max power** from its detail view. Every add/remove and capacity
   change is logged automatically — see it via the **History** button
   inside a rack's detail view.

To add teammates: they sign up from the login screen (defaults to
technician — read-only), and an admin promotes them to `manager` or
`admin` in the `profiles` table the same way, if needed. There's no
separate admin UI for this yet — it's a two-minute job in the
Supabase Table Editor.

### Upgrading an existing project

If you already ran an earlier version of `schema.sql` (before the
`admin` role existed), re-run the whole file — it's safe to re-run,
every statement uses `create or replace` / `drop ... if exists` first.
The one manual step: Postgres won't let a `create table if not
exists` widen an existing `check` constraint, so run this once first:
```sql
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('manager','technician','admin'));
```
Then run the rest of `schema.sql` as normal.

---

## Putting it on GitHub + hosting it

I can't create a GitHub repo or push code on your behalf — that
needs your own account. Here's the fastest path:

1. Create a new repository on [github.com](https://github.com) (public
   or private, either works).
2. On your machine:
   ```bash
   cd facility-ops
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
   ⚠️ If the repo is **public**, don't worry — the Supabase anon key
   in `config.js` is meant to be public; access control is enforced
   by the database policies in `schema.sql`, not by hiding the key.
3. **Host it for free with GitHub Pages:** repo → **Settings → Pages**
   → Source: **Deploy from a branch** → Branch: `main`, folder `/`
   (root) → Save. Your app will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute
   or two.

   Alternatively, drag-and-drop the whole `facility-ops` folder into
   [Netlify Drop](https://app.netlify.com/drop) or `vercel deploy` in
   the folder — both work for a static site with no config.

---

## File structure

```
facility-ops/
├── index.html      — page shell, loads Supabase + Chart.js + app.js
├── styles.css       — all styling (Fiix-inspired: white bg, purple accent)
├── config.js         — your Supabase URL + anon key (blank = demo mode)
├── app.js               — all app logic: data layer, auth, rendering
├── schema.sql              — Supabase tables + role-based RLS policies
└── README.md                  — this file
```

## Roles, in short

| Action | Technician | Manager | Admin |
|---|---|---|---|
| View sites, racks, devices, analysis, history | ✅ | ✅ | ✅ |
| Add a device | ❌ | ✅ | ✅ |
| Remove a device | ❌ | ✅ | ✅ |
| Edit a rack's max power | ❌ | ✅ | ✅ |
| Add a site (configure racks + rows) | ❌ | ✅ | ✅ |
| Remove a site | ❌ | ❌ | ✅ |
| Seed demo data (empty project only) | ❌ | ✅ | ✅ |

Admin is a superset of manager, plus the one thing managers can't do:
delete a site. Permissions are enforced twice: the UI hides the
controls for roles that shouldn't see them, and the database
(`schema.sql`'s RLS policies) rejects the write even if someone calls
the API directly. Read access is open to any signed-in user; there's
no anonymous access in live mode.

## Power model: kVA, and where "actual power" lives

All power figures are now shown in **kVA**. More importantly, the
data model changed: **actual (measured) power now belongs to the
rack, not the device.** A rack's actual power is a number a manager
or admin types in directly (e.g. from a PDU/circuit reading) via the
"edit" link on its detail view — it is not summed from devices.

Devices still carry a **datasheet (rated/nameplate) figure** each,
useful for capacity planning, but there's no per-device "actual"
field anymore. If you're upgrading from an older install where
devices did have actual power, `schema.sql` automatically sums each
rack's existing device values into that rack's new `actual_kva`
before removing the old column — nothing is lost, it just moves up
to the rack level, where you can now correct it with a real reading.

## What's new since the last version

- **Modify a device**: every device row in a rack's inventory table
  now has an edit (✎) icon next to remove (managers + admins) —
  change its model, size, serial number, datasheet rating, or
  authorized person. If you resize it, it's automatically re-placed
  into the next free slot that fits.
- **Add a rack to any row** of an existing site — not just at site
  creation. A "+ Add rack" button in the site view opens a small form
  (rack name, row — existing or brand new, max power, optional
  circuit breaker). No devices required; add them afterward.
- **Circuit breaker #** is now a field on every rack, editable the
  same way as capacity (managers + admins), shown in the rack detail
  view.
- **Power is now kVA everywhere**, and — see above — actual power
  moved from device-level to rack-level, entered directly rather than
  computed.

## Previously added

- **Add site** (managers + admins) requires configuring the site up
  front: name, location, tier, PUE, **number of racks**, **number of
  rows**, and **maximum power per rack** — the app lays racks out
  into rows (Row A, Row B, …) automatically from those numbers and
  applies the power ceiling to every rack it creates.
- **Edit site** (managers + admins): an "edit" link next to the site
  name in the site view lets you update name, location, tier, and PUE
  at any time. Rack count/rows are structural and set only at
  creation; individual rack power can still be changed per-rack.
- **Remove site** (admins only): deletes the site and cascades to all
  its racks and devices.
- **Rack view, redesigned again, more thoroughly:** the elevation
  (left) now has a U-number gutter with 5U rhythm marks like a real
  elevation chart, two-line labels for multi-U devices (model + U
  range + kW), and a power-density color legend. The inventory table
  (right) now shows a color swatch per row matching its elevation
  block, a badge-styled U column, right-aligned kW figures, and
  avatar-initial chips for the authorized person — considerably
  easier to scan than a plain table.
- **History button** inside every rack's detail view — shows every
  device added/removed and every capacity change **from the last 6
  months**, who did it, and when. In live mode this is captured
  automatically by database triggers (`rack_events` table in
  `schema.sql`), so it
  can't be bypassed by going around the UI.
