# OPMG v2 — Facility & Rack Operations

A ground-up rebuild of OPMG. Plain HTML/CSS/JS, no build step. Same Supabase backend as v1.

## Run it
- Open `index.html` through any static server (e.g. `python3 -m http.server` in this folder, then http://localhost:8000).
- `config.js` holds your Supabase URL and anon key (copied from v1). Blank both for demo mode, or open `index.html?demo=1` to force demo data with no login.
- All libraries are bundled in `vendor/` (no CDN needed).

## One database step for cages
Run `migration_v2.sql` once in the Supabase SQL editor. It only adds a `cages` table and `racks.cage_id`, and touches no existing data. Until you do, everything works except creating or assigning cages (the app shows a banner): browsing, editing, drag & drop, export and print all run against your existing tables, and rack moves simply skip the cage column.

## What's new
- **Cage-aware floor plan.** Racks stay in their rows, and a cage/suite/pod/zone is drawn as one outlined, colored block with its name, customer, rack count, kVA and load. Switch the view between Rows, Cages and Customers. Color racks by power, space or customer; filter, search and resize tiles.
- **Build cages visually.** Click "Select racks", pick racks (or a whole row), then "Group into new cage" or add them to an existing one. Racks are packed side by side so the cage is one block.
- **Drag & drop racks.** Drag a rack to reorder it in its row, move it to another row, or drop it in or out of a cage. In the Cages view, drop a rack onto a cage to join it or onto "Not in a cage" to remove it. On touch screens, press and hold a rack, then drag. The arrow buttons in the rack dialog still nudge a rack one slot.
- **Cages tab** with a card per cage; **Customers tab** with racks, cages, load and rack IDs per customer; **Devices tab** with search.
- Rack view: 42U elevation (click an empty U to add a device), edit rack, move a rack along its row, history.
- Per-site **Print site PDF** (specs, power/HVAC/UPS/generators, customers with rack counts and totals, cages) and Excel export, device import from Excel/CSV.
- Global search (press `/`): racks, customers, cages, serial numbers, models.
- New design system with light and dark themes, sidebar navigation, hash routes (back button works).
- Portfolio and analysis dashboards.

## Fixes carried over from the review
- Managers can edit (role check accepts manager and admin; the Users dialog now offers Manager).
- Every interpolated value is HTML-escaped.
- Device add/edit validates overlaps and U range.

## Not changed (needs you)
- `schema.sql` in your repo is outdated vs your live database; regenerate it from the live DB.
- Approval is enforced in the UI. Tighten RLS on sites/racks/devices/floors so they also require `profiles.approved = true` (the new `cages` policies already do).
- The repo is public and contains `import_b90_rowA_rowD.sql` (facility inventory). It is not included here; make the repo private or delete it from git history.

## Files
`index.html`, `styles.css`, `config.js`, `js/core.js` (data layer), `js/views.js`, `js/modals.js`, `js/dnd.js` (drag & drop), `js/main.js`, `vendor/`, `migration_v2.sql`.
