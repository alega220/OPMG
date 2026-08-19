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
7. **Promote yourself to manager.** In Supabase: **Table Editor →
   profiles**, find your row, change `role` from `technician` to
   `manager`, save.
8. **Seed initial data.** Sign back in — as a manager on an empty
   project you'll see a **"Seed demo data"** button on the dashboard.
   Click it once to populate the 4 sample sites (B90, A12, C77, D40)
   with racks and devices. From then on, use **+ Add device** /
   the remove (×) button in the rack view to manage real inventory,
   and edit a rack's **max power** from its detail view.

To add teammates: they sign up from the login screen (defaults to
technician — read-only), and a manager promotes them to `manager` in
the `profiles` table the same way, if needed. There's no separate
admin UI for this yet — it's a two-minute job in the Supabase Table
Editor.

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

| Action | Manager | Technician |
|---|---|---|
| View sites, racks, devices, analysis | ✅ | ✅ |
| Add a device | ✅ | ❌ |
| Remove a device | ✅ | ❌ |
| Edit a rack's max power | ✅ | ❌ |
| Seed demo data (empty project only) | ✅ | ❌ |

Permissions are enforced twice: the UI hides the controls for
technicians, and the database (`schema.sql`'s RLS policies) rejects
the write even if someone calls the API directly. Read access is open
to any signed-in user; there's no anonymous access in live mode.
