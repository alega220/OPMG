/* ==========================================================
   OPMG v2 — views
   ========================================================== */
'use strict';

const ICON = {
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/></svg>',
  server: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></svg>',
  cage: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" stroke-dasharray="3 2.5"/><path d="M9 4v16M15 4v16"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
};
const ico = (n, c = '') => `<span class="ico ${c}">${ICON[n] || ''}</span>`;

/* ---------- small components ---------- */
function ringSvg(pct, size = 64, stroke = 7) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = clamp(pct, 0, 1);
  const col = `var(--${statusKey(pct)})`;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ring-t" font-size="${size * 0.24}">${Math.round(pct * 100)}%</text></svg>`;
}
const badge = (txt, kind = '') => `<span class="badge ${kind}">${esc(txt)}</span>`;
const bar = (pct, h = 6) => `<div class="bar" style="height:${h}px"><i class="${statusKey(pct)}" style="width:${clamp(pct, 0, 1) * 100}%"></i></div>`;
const kpi = (label, value, sub = '', accent = '') => `<div class="kpi ${accent}"><div class="kpi-l">${esc(label)}</div><div class="kpi-v">${value}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`;
function empty(title, text, btn = '') { return `<div class="emptystate"><div class="es-i">${ico('server')}</div><h3>${esc(title)}</h3><p>${text}</p>${btn}</div>`; }

/* ---------- auth screens ---------- */
function renderLogin() {
  const su = state.authMode === 'signup';
  return `<div class="auth">
    <div class="auth-hero">
      <div class="logo big"><i></i><i></i><i></i></div>
      <h1>OPMG</h1><p class="lead">Facility &amp; rack operations, from the power feed down to the last U.</p>
      <ul class="auth-feats"><li>${ico('cage')} Cage-aware floor plans</li><li>${ico('bolt')} Live power &amp; capacity</li><li>${ico('users')} Customers at a glance</li></ul>
    </div>
    <form class="auth-card" id="authForm">
      <h2>${su ? 'Create your account' : 'Welcome back'}</h2>
      <p class="muted">${su ? 'An admin must approve new accounts before data is visible.' : 'Sign in to continue.'}</p>
      ${state.authError ? `<div class="alert err">${esc(state.authError)}</div>` : ''}
      <label>Email<input type="email" name="email" required autocomplete="email" placeholder="you@company.com"></label>
      <label>Password<input type="password" name="password" required minlength="6" autocomplete="${su ? 'new-password' : 'current-password'}" placeholder="••••••••"></label>
      <button class="btn primary lg" type="submit">${su ? 'Create account' : 'Sign in'}</button>
      <div class="auth-alt">${su ? 'Already have an account?' : 'New here?'} <a href="#" data-act="auth-toggle">${su ? 'Sign in' : 'Create account'}</a></div>
    </form></div>`;
}
function renderPending() {
  return `<div class="auth"><div class="auth-card center"><div class="es-i">${ico('users')}</div><h2>Waiting for approval</h2>
  <p class="muted">Your account <b>${esc(state.user.email)}</b> is signed in but not approved yet. An admin needs to approve it before you can view facility data.</p>
  <div class="row-gap"><button class="btn primary" data-act="recheck">Check again</button><button class="btn" data-act="signout">Sign out</button></div></div></div>`;
}

/* ---------- shell ---------- */
function routeSite() { return state.route.name === 'site' ? siteById(state.route.siteId) : null; }
function renderShell() {
  const r = state.route, cur = routeSite();
  const nav = (id, icon, label, active) => `<a class="nav ${active ? 'on' : ''}" href="${id}">${ico(icon)}<span>${label}</span></a>`;
  const sites = visibleSites();
  const sidebar = `<aside class="side">
    <a class="brand" href="#/"><div class="logo"><i></i><i></i><i></i></div><div><b>OPMG</b><small>Facility Ops</small></div></a>
    <nav>
      ${nav('#/', 'grid', 'Portfolio', r.name === 'portfolio')}
      ${nav('#/analysis', 'chart', 'Analysis', r.name === 'analysis')}
      ${LIVE && isAdmin() ? `<a class="nav" href="#" data-act="users">${ico('users')}<span>Users</span></a>` : ''}
    </nav>
    <div class="side-h">Sites <span>${sites.length}</span></div>
    <div class="side-sites">${sites.map(s => `<a class="sitelink ${cur === s ? 'on' : ''}" href="#/site/${encodeURIComponent(s.id)}/floor"><i class="dot ${statusKey(s.utilizationPct)}"></i><span>${esc(s.name)}</span><em>${fmtPct(s.utilizationPct)}</em></a>`).join('') || '<div class="faint pad">No sites</div>'}</div>
    <div class="side-foot">
      <div class="seg mini" id="catSeg">${['all', 'colo', 'inhouse'].map(k => `<button data-act="cat" data-v="${k}" class="${state.category === k ? 'on' : ''}">${k === 'all' ? 'All' : CATEGORIES[k].label}</button>`).join('')}</div>
      <div class="userchip"><div class="av">${esc((state.user.email || '?')[0].toUpperCase())}</div><div class="ui"><b>${esc(state.user.email)}</b><small>${LIVE ? esc(ROLE_LABEL[state.role] || state.role) : 'Demo mode'}</small></div>
      <button class="iconbtn" data-act="signout" title="Sign out">${ico('out')}</button></div>
    </div></aside>`;
  const crumbs = r.name === 'portfolio' ? 'Portfolio' : r.name === 'analysis' ? 'Analysis' : cur ? `<a href="#/">Portfolio</a><i>/</i>${esc(cur.name)}` : 'Site';
  const top = `<header class="top"><div class="crumbs">${crumbs}</div>
    <div class="gsearch"><span class="gs-i">${ico('search')}</span><input id="gsearch" placeholder="Search racks, customers, cages, serials…  ( / )" autocomplete="off"><div id="gsresults" class="gs-res" hidden></div></div>
    <div class="top-r">${!LIVE ? '<span class="badge amber">Demo data</span>' : ''}
    <button class="iconbtn" data-act="theme" title="Toggle theme">${ico(state.theme === 'dark' ? 'sun' : 'moon')}</button></div></header>`;
  let page = '';
  if (r.name === 'portfolio') page = renderPortfolio();
  else if (r.name === 'analysis') page = renderAnalysis();
  else if (r.name === 'site') page = cur ? renderSite(cur) : empty('Site not found', 'This site does not exist or you have no access.', '<a class="btn primary" href="#/">Back to portfolio</a>');
  return `<div class="shell">${sidebar}<div class="main">${top}<main class="page" id="page">${page}</main></div></div>`;
}

/* ---------- portfolio ---------- */
function renderPortfolio() {
  const sites = visibleSites();
  const racks = sites.flatMap(s => s.racks);
  const cap = sites.reduce((s, x) => s + x.totalCapacityKva, 0), it = sites.reduce((s, x) => s + x.itLoadKva, 0);
  const custs = new Set(racks.map(customerName).filter(Boolean).map(x => x.toLowerCase()));
  const cages = sites.reduce((s, x) => s + x.cages.length, 0);
  const devs = sites.reduce((s, x) => s + x.deviceCount, 0);
  const crit = racks.filter(r => r.utilPct >= 0.9).length;
  return `<div class="pagehead"><div><h1>Portfolio</h1><p class="muted">${sites.length} site${sites.length === 1 ? '' : 's'} · ${fmtNum(racks.length)} racks · ${fmtNum(devs)} devices</p></div>
    <div class="row-gap">${isManager() ? `<button class="btn primary" data-act="add-site">${ico('plus')} Add site</button>` : ''}</div></div>
  <div class="kpis">
    ${kpi('IT load', `${it.toFixed(0)}<small> kVA</small>`, `of ${cap.toFixed(0)} kVA capacity`, 'a1')}
    ${kpi('Utilization', fmtPct(cap ? it / cap : 0), `<span class="badge ${statusKey(cap ? it / cap : 0)}">${statusLabel(cap ? it / cap : 0)}</span>`, 'a2')}
    ${kpi('Customers', fmtNum(custs.size), `${fmtNum(racks.filter(r => customerName(r)).length)} racks booked`, 'a3')}
    ${kpi('Cages & suites', fmtNum(cages), `${fmtNum(racks.filter(r => r.cageId).length)} racks inside`, 'a4')}
    ${kpi('Critical racks', fmtNum(crit), crit ? 'at or above 90% load' : 'all within limits', crit ? 'a5' : 'a6')}
  </div>
  <div class="sitegrid">${sites.map(siteCard).join('') || empty('No sites yet', LIVE ? 'Add your first site to start.' : '', isManager() ? `<button class="btn primary" data-act="add-site">${ico('plus')} Add site</button>` : '')}</div>`;
}
function siteCard(s) {
  const custs = customerGroups(s).length;
  const emptyR = s.racks.filter(r => !r.devices.length && !customerName(r)).length;
  return `<a class="sitecard" href="#/site/${encodeURIComponent(s.id)}/floor">
    <div class="sc-top"><div><div class="sc-name">${esc(s.name)}</div><div class="muted sm">${esc(s.location || '—')}</div></div>${ringSvg(s.utilizationPct, 66)}</div>
    <div class="sc-tags">${badge(s.tier || 'Tier —')}${badge(CATEGORIES[s.category] ? CATEGORIES[s.category].label : s.category, 'soft')}${badge('PUE ' + (s.pue || 0).toFixed(2), 'soft')}</div>
    <div class="miniplan">${miniPlan(s)}</div>
    <div class="sc-stats"><div><b>${s.racks.length}</b><span>racks</span></div><div><b>${custs}</b><span>customers</span></div><div><b>${s.cages.length}</b><span>cages</span></div><div><b>${emptyR}</b><span>empty</span></div></div>
    <div class="sc-foot">${fmtKva(s.itLoadKva, 0)} <span class="faint">/ ${fmtKva(s.totalCapacityKva, 0)}</span></div></a>`;
}
function miniPlan(s) {
  const rows = Array.from(new Set(s.racks.map(r => r.row))).sort(rowCompare).slice(0, 8);
  return rows.map(row => `<div class="mp-row">${s.racks.filter(r => r.row === row).sort((a, b) => a.position - b.position).slice(0, 40).map(r => {
    const cg = r.cageId && s.cages.find(c => c.id === r.cageId);
    return `<i class="${!r.devices.length && !customerName(r) ? 'e' : statusKey(r.utilPct)}" ${cg ? `style="outline:1.5px solid ${cg.color};outline-offset:0"` : ''}></i>`;
  }).join('')}</div>`).join('');
}

/* ---------- site ---------- */
const SITE_TABS = [['floor', 'Floor plan'], ['cages', 'Cages'], ['customers', 'Customers'], ['devices', 'Devices'], ['specs', 'Specs'], ['power', 'Power']];
function renderSite(site) {
  const tab = state.route.tab || 'floor';
  const cust = customerGroups(site).length;
  const hasPower = site.pdfBreakers && site.pdfBreakers.length;
  const head = `<div class="sitehead">
    <div class="sh-l"><div class="sh-ring">${ringSvg(site.utilizationPct, 74, 8)}</div><div>
      <h1>${esc(site.name)} ${badge(site.tier || 'Tier —')} ${badge(CATEGORIES[site.category] ? CATEGORIES[site.category].label : site.category, 'soft')}</h1>
      <p class="muted">${esc(site.location || '—')} · ${site.racks.length} racks · ${cust} customers · ${site.cages.length} cages · ${fmtKva(site.itLoadKva, 0)} of ${fmtKva(site.totalCapacityKva, 0)}</p></div></div>
    <div class="row-gap wrap">
      <button class="btn" data-act="print-site">${ico('print')} Print site PDF</button>
      <button class="btn" data-act="export-site">${ico('down')} Export Excel</button>
      ${isManager() ? `<button class="btn" data-act="import-devices">${ico('up')} Import devices</button>` : ''}
      ${isManager() ? `<button class="btn" data-act="add-rack">${ico('plus')} Rack</button>` : ''}
      ${isManager() ? `<button class="btn primary" data-act="new-cage">${ico('cage')} New cage</button>` : ''}
    </div></div>
    <div class="tabs">${SITE_TABS.filter(t => t[0] !== 'power' || hasPower).map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/site/${encodeURIComponent(site.id)}/${k}">${l}${k === 'cages' ? `<em>${site.cages.length}</em>` : k === 'customers' ? `<em>${cust}</em>` : k === 'devices' ? `<em>${site.deviceCount}</em>` : ''}</a>`).join('')}</div>`;
  const body = { floor: renderFloor, cages: renderCagesTab, customers: renderCustomersTab, devices: renderDevicesTab, specs: renderSpecs, power: renderPower }[tab] || renderFloor;
  return head + `<div class="tabbody">${!LIVE || state.cagesEnabled ? '' : `<div class="alert warn">Cages are not enabled in your database yet. Run <code>migration_v2.sql</code> once in the Supabase SQL editor, then reload. Everything else works as before.</div>`}${body(site)}</div>`;
}

/* ---- floor plan ---- */
function rackAccent(r) {
  if (state.fp.colorBy === 'space') { const p = r.occupiedU / 42; return p === 0 ? 'var(--empty)' : `hsl(${215 - p * 40} ${55 + p * 25}% ${62 - p * 22}%)`; }
  if (state.fp.colorBy === 'customer') { const c = customerName(r); return c ? `hsl(${hashStr(c.toLowerCase()) % 360} 62% 52%)` : 'var(--empty)'; }
  if (!r.devices.length && r.actualKva === 0) return 'var(--empty)';
  return `var(--${statusKey(r.utilPct)})`;
}
function rackMatches(site, r) {
  const q = state.fp.search.trim().toLowerCase();
  if (state.fp.status !== 'all') {
    const st = state.fp.status;
    const isEmpty = !r.devices.length && !customerName(r);
    if (st === 'empty' && !isEmpty) return false;
    if (st === 'booked' && !(customerName(r) && !r.devices.length)) return false;
    if (st === 'nocage' && r.cageId) return false;
    if (['ok', 'warn', 'crit'].includes(st) && (isEmpty || statusKey(r.utilPct) !== st)) return false;
  }
  if (!q) return true;
  const cg = site.cages.find(c => c.id === r.cageId);
  return String(r.id).toLowerCase().includes(q) || customerName(r).toLowerCase().includes(q) || (cg && cg.name.toLowerCase().includes(q)) || r.devices.some(d => (d.serialNumber || '').toLowerCase().includes(q) || d.model.toLowerCase().includes(q));
}
function tileHtml(site, r) {
  const sel = state.fp.selected.has(rkey(r));
  const pct = r.utilPct;
  const hit = rackMatches(site, r);
  const empty = !r.devices.length && !customerName(r);
  const booked = customerName(r) && !r.devices.length;
  const tip = `${r.id}${customerName(r) ? ' · ' + customerName(r) : ''} · ${r.devices.length} devices · ${r.occupiedU}/42U · ${fmtKva(r.actualKva, 2)} of ${fmtKva(r.capacityKva, 1)} (${fmtPct(pct)})`;
  return `<button class="rack ${state.fp.size} ${empty ? 'is-empty' : ''} ${booked ? 'is-booked' : ''} ${sel ? 'sel' : ''} ${hit ? '' : 'dim'}" style="--tc:${rackAccent(r)}" data-act="rack" data-key="${esc(rkey(r))}" title="${esc(tip)}">
    <span class="rn">${esc(shortRackName(site, r))}</span>
    <span class="rbody"><span class="ru" title="Space used"><i style="height:${(r.occupiedU / 42) * 100}%"></i></span><span class="rv">${empty ? '–' : Math.round(pct * 100) + '<small>%</small>'}</span></span>
    <span class="rb"><i style="width:${clamp(pct, 0, 1) * 100}%"></i></span>
    ${sel ? `<span class="tick">${ico('check')}</span>` : ''}</button>`;
}
function cageBox(site, cage, racks) {
  const st = cageStats(site, cage);
  const own = racks.length;
  return `<div class="cage" data-cage="${esc(cage.id)}" style="--cc:${esc(cage.color)}"><button class="cage-head" data-act="cage" data-id="${esc(cage.id)}" title="Open ${esc(cage.name)}">
    <span class="cg-ico">${ico('cage')}</span><b>${esc(cage.name)}</b><span class="ctype">${esc(CAGE_TYPES[cage.type] || cage.type)}</span>${cage.customer ? `<span class="cg-cust">${esc(cage.customer)}</span>` : ''}
    <span class="cg-meta">${own === st.racks.length ? own + ' racks' : own + ' of ' + st.racks.length + ' racks'} · ${st.act.toFixed(1)}/${st.cap.toFixed(0)} kVA · <b class="t-${statusKey(st.pct)}">${fmtPct(st.pct)}</b></span></button>
    <div class="cage-racks">${racks.map(r => tileHtml(site, r)).join('')}</div></div>`;
}
function laneItems(site, racks) {
  const items = []; let curr = null;
  racks.slice().sort((a, b) => a.position - b.position).forEach(r => {
    const cg = r.cageId && site.cages.find(c => c.id === r.cageId);
    if (cg) { if (curr && curr.cage === cg) curr.racks.push(r); else { curr = { cage: cg, racks: [r] }; items.push(curr); } }
    else { curr = null; items.push({ cage: null, racks: [r] }); }
  });
  return items.map(it => it.cage ? cageBox(site, it.cage, it.racks) : tileHtml(site, it.racks[0])).join('');
}
function section(title, sub, inner, extra = '') { return `<section class="lane"><div class="lane-h"><b>${title}</b><span>${sub}</span>${extra}</div><div class="lane-b">${inner}</div></section>`; }
function renderFloor(site) {
  const fp = state.fp;
  if (!site.floors.some(f => f.id === fp.floor) && fp.floor !== 'all') fp.floor = 'all';
  const racks = site.racks.filter(r => fp.floor === 'all' || String(r.floorId) === String(fp.floor));
  const stat = rs => `${rs.length} rack${rs.length === 1 ? '' : 's'} · ${rs.reduce((s, r) => s + r.actualKva, 0).toFixed(1)}/${rs.reduce((s, r) => s + r.capacityKva, 0).toFixed(0)} kVA`;
  let lanes = '';
  if (fp.group === 'rows') {
    const keys = []; const m = new Map();
    racks.forEach(r => { const k = (site.floors.length > 1 && fp.floor === 'all' ? (site.floors.find(f => String(f.id) === String(r.floorId)) || { name: '' }).name + ' · ' : '') + 'Row ' + (r.row || '—'); if (!m.has(k)) { m.set(k, []); keys.push(k); } m.get(k).push(r); });
    keys.sort((a, b) => { const ra = m.get(a)[0], rb = m.get(b)[0]; return String(ra.floorId).localeCompare(String(rb.floorId)) || rowCompare(ra.row, rb.row); });
    lanes = keys.map(k => { const rs = m.get(k); return section(esc(k), stat(rs), `<div class="lane-flow" data-row="${esc(rs[0].row || '')}" data-floor="${esc(rs[0].floorId || '')}">${laneItems(site, rs)}</div>`); }).join('');
  } else if (fp.group === 'cages') {
    const cs = site.cages.filter(c => racks.some(r => r.cageId === c.id));
    lanes = cs.map(c => { const rs = racks.filter(r => r.cageId === c.id).sort((a, b) => rowCompare(a.row, b.row) || a.position - b.position); return section(`<span class="swatch" style="background:${esc(c.color)}"></span>${esc(c.name)}`, `${esc(c.customer || 'No customer')} · ${stat(rs)}`, `<div class="lane-flow" data-cage-lane="${esc(c.id)}">${rs.map(r => tileHtml(site, r)).join('')}</div>`, `<button class="linkbtn" data-act="cage" data-id="${esc(c.id)}">Open</button>`); }).join('');
    const un = racks.filter(r => !r.cageId);
    if (un.length) lanes += section('Not in a cage', stat(un), `<div class="lane-flow" data-cage-lane="">${un.sort((a, b) => rowCompare(a.row, b.row) || a.position - b.position).map(r => tileHtml(site, r)).join('')}</div>`);
  } else {
    const m = new Map();
    racks.forEach(r => { const c = customerName(r) || ''; const k = c.toLowerCase(); if (!m.has(k)) m.set(k, { name: c, rs: [] }); m.get(k).rs.push(r); });
    lanes = Array.from(m.values()).sort((a, b) => (a.name === '') - (b.name === '') || b.rs.length - a.rs.length).map(g => section(esc(g.name || 'No customer'), stat(g.rs), `<div class="lane-flow">${g.rs.sort((a, b) => rowCompare(a.row, b.row) || a.position - b.position).map(r => tileHtml(site, r)).join('')}</div>`)).join('');
  }
  const opt = (v, cur, l) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
  const legend = fp.colorBy === 'power'
    ? `<span><i class="lg ok"></i>&lt;75%</span><span><i class="lg warn"></i>75–90%</span><span><i class="lg crit"></i>≥90%</span><span><i class="lg empty"></i>Empty</span>`
    : fp.colorBy === 'space' ? `<span><i class="lg" style="background:hsl(215 55% 62%)"></i>Low U</span><span><i class="lg" style="background:hsl(175 80% 40%)"></i>High U</span>` : `<span class="muted sm">Colored by customer</span>`;
  return `<div class="fp-tools">
    <div class="field-inline"><label>View</label><div class="seg" id="segGroup">${[['rows', 'Rows'], ['cages', 'Cages'], ['customers', 'Customers']].map(([v, l]) => `<button data-act="fp-group" data-v="${v}" class="${fp.group === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    ${site.floors.length > 1 ? `<div class="field-inline"><label>Floor</label><select data-fp="floor"><option value="all">All floors</option>${site.floors.map(f => opt(f.id, fp.floor, esc(f.name))).join('')}</select></div>` : ''}
    <div class="field-inline"><label>Color</label><select data-fp="colorBy">${opt('power', fp.colorBy, 'Power load')}${opt('space', fp.colorBy, 'Space used')}${opt('customer', fp.colorBy, 'Customer')}</select></div>
    <div class="field-inline"><label>Show</label><select data-fp="status">${[['all', 'All racks'], ['ok', 'Normal'], ['warn', 'Warning'], ['crit', 'Critical'], ['empty', 'Empty'], ['booked', 'Booked, no devices'], ['nocage', 'Not in a cage']].map(([v, l]) => opt(v, fp.status, l)).join('')}</select></div>
    <div class="field-inline"><label>Size</label><div class="seg">${[['sm', 'S'], ['md', 'M'], ['lg', 'L']].map(([v, l]) => `<button data-act="fp-size" data-v="${v}" class="${fp.size === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="fp-search"><span class="gs-i">${ico('search')}</span><input id="fpSearch" value="${esc(fp.search)}" placeholder="Find rack, customer, serial…"></div>
    ${isManager() ? `<button class="btn ${fp.select ? 'primary' : ''}" data-act="fp-select">${fp.select ? 'Done selecting' : 'Select racks'}</button>` : ''}
  </div>
  <div class="legend">${legend}<span class="sp"></span><span><i class="lg cagekey"></i>Cage / suite outline</span><span><i class="lg booked"></i>Booked, no devices</span>${isManager() && fp.group !== 'customers' ? `<span class="faint">Tip: drag a rack to reorder it, move it to another row, or drop it in a cage${'ontouchstart' in window ? ' (touch: press and hold, then drag)' : ''}.</span>` : ''}</div>
  <div class="floor">${lanes || empty('No racks match', 'Try clearing the filters or search.')}</div>
  ${fp.select ? selectBar(site) : ''}`;
}
function selectBar(site) {
  const n = state.fp.selected.size;
  return `<div class="selbar"><b>${n}</b> selected<span class="sp"></span>
    <button class="btn sm primary" data-act="sel-newcage" ${n ? '' : 'disabled'}>${ico('cage')} Group into new cage</button>
    <select id="selCage" ${n && site.cages.length ? '' : 'disabled'}><option value="">Add to existing cage…</option>${site.cages.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
    <button class="btn sm" data-act="sel-nocage" ${n ? '' : 'disabled'}>Remove from cage</button>
    <button class="btn sm" data-act="sel-row" ${n ? '' : 'disabled'}>Select whole row…</button>
    <button class="btn sm ghost" data-act="sel-clear">Clear</button></div>`;
}

/* ---- cages tab ---- */
function renderCagesTab(site) {
  if (!site.cages.length) return empty('No cages yet', 'Group racks that belong together (a customer cage, a suite, a pod) and they will show up as one outlined block on the floor plan.', isManager() ? `<button class="btn primary" data-act="new-cage">${ico('cage')} Create the first cage</button>` : '');
  const un = site.racks.filter(r => !r.cageId).length;
  return `<div class="cagegrid">${site.cages.map(c => {
    const st = cageStats(site, c);
    return `<div class="cagecard" style="--cc:${esc(c.color)}"><div class="cc-top"><div><div class="cc-name">${esc(c.name)}</div><div class="muted sm">${esc(CAGE_TYPES[c.type] || c.type)}${c.customer ? ' · ' + esc(c.customer) : ''}</div></div>${ringSvg(st.pct, 54, 6)}</div>
      <div class="cc-racks">${st.racks.slice(0, 48).map(r => `<button class="mini" style="--tc:${rackAccent(r)}" data-act="rack" data-key="${esc(rkey(r))}" title="${esc(r.id)} · ${fmtPct(r.utilPct)}"></button>`).join('')}</div>
      <div class="cc-stats"><div><b>${st.racks.length}</b><span>racks</span></div><div><b>${st.devs}</b><span>devices</span></div><div><b>${st.act.toFixed(1)}</b><span>of ${st.cap.toFixed(0)} kVA</span></div><div><b>${st.totalU ? Math.round(st.usedU / st.totalU * 100) : 0}%</b><span>space</span></div></div>
      <div class="cc-foot"><span class="faint sm">Rows: ${esc(Array.from(new Set(st.racks.map(r => r.row))).sort(rowCompare).join(', ') || '—')}</span><button class="btn sm" data-act="cage" data-id="${esc(c.id)}">Open</button></div></div>`;
  }).join('')}</div><p class="muted sm pad">${un} rack${un === 1 ? ' is' : 's are'} not in any cage.</p>`;
}

/* ---- customers tab ---- */
function renderCustomersTab(site) {
  const groups = customerGroups(site);
  if (!groups.length) return empty('No customers', 'Assign a customer to a rack (open a rack, then Edit) to see it here.');
  const total = groups.reduce((s, g) => s + g.racks.length, 0);
  return `<div class="card flush"><table class="tbl"><thead><tr><th>Customer</th><th class="n">Racks</th><th>Cages</th><th class="n">Devices</th><th class="n">Capacity</th><th class="n">Actual</th><th style="width:160px">Load</th><th>Rack IDs</th></tr></thead><tbody>
  ${groups.map(g => `<tr><td><span class="swatch" style="background:hsl(${hashStr(g.name.toLowerCase()) % 360} 62% 52%)"></span><b>${esc(g.name)}</b></td><td class="n"><b>${g.racks.length}</b></td><td>${Array.from(g.cages).map(c => badge(c, 'soft')).join(' ') || '<span class="faint">—</span>'}</td><td class="n">${g.devices}</td><td class="n">${g.capacity.toFixed(1)}</td><td class="n">${g.actual.toFixed(1)}</td><td>${bar(g.capacity ? g.actual / g.capacity : 0)}</td>
  <td><div class="chips">${g.racks.sort((a, b) => rowCompare(a.row, b.row) || a.position - b.position).map(r => `<button class="chip" data-act="rack" data-key="${esc(rkey(r))}">${esc(shortRackName(site, r))}</button>`).join('')}</div></td></tr>`).join('')}
  </tbody><tfoot><tr><td><b>Total</b></td><td class="n"><b>${total}</b></td><td></td><td class="n">${groups.reduce((s, g) => s + g.devices, 0)}</td><td class="n">${groups.reduce((s, g) => s + g.capacity, 0).toFixed(1)}</td><td class="n">${groups.reduce((s, g) => s + g.actual, 0).toFixed(1)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
}

/* ---- devices tab ---- */
function renderDevicesTab(site) {
  const q = state.deviceSearch.trim().toLowerCase();
  const rows = [];
  site.racks.forEach(r => r.devices.forEach(d => { if (!q || [r.id, d.model, d.serialNumber, d.authorizedPerson, customerName(r)].some(x => String(x || '').toLowerCase().includes(q))) rows.push([r, d]); }));
  rows.sort((a, b) => String(a[0].id).localeCompare(String(b[0].id), undefined, { numeric: true }) || a[1].startU - b[1].startU);
  const shown = rows.slice(0, 400);
  return `<div class="card flush"><div class="card-tools"><div class="fp-search wide"><span class="gs-i">${ico('search')}</span><input id="devSearch" value="${esc(state.deviceSearch)}" placeholder="Search model, serial, rack, person, customer…"></div><span class="muted sm">${rows.length} device${rows.length === 1 ? '' : 's'}${rows.length > shown.length ? ' (showing 400)' : ''}</span></div>
  <div class="scroll"><table class="tbl"><thead><tr><th>Rack</th><th>U</th><th>Model</th><th>Serial</th><th class="n">Rated kVA</th><th>Authorized person</th><th>Customer</th></tr></thead><tbody>
  ${shown.map(([r, d]) => `<tr class="click" data-act="rack" data-key="${esc(rkey(r))}"><td><b>${esc(r.id)}</b></td><td><span class="ubadge">U${d.startU}${d.sizeU > 1 ? '–' + (d.startU + d.sizeU - 1) : ''}</span></td><td>${esc(d.model)}</td><td class="mono">${esc(d.serialNumber || '—')}</td><td class="n">${d.datasheetKva.toFixed(2)}</td><td>${esc(d.authorizedPerson)}</td><td>${esc(customerName(r) || '—')}</td></tr>`).join('') || `<tr><td colspan="7" class="center pad faint">No devices</td></tr>`}
  </tbody></table></div></div>`;
}

/* ---- specs ---- */
function specRow(site, key, display) {
  const f = SPEC_FIELDS[key]; const v = site[key];
  const shown = display != null ? display : (v == null || v === '' ? '<span class="faint">—</span>' : esc(v));
  return `<div class="spec"><div class="spec-l">${esc(f.label)}</div><div class="spec-v">${shown}${isManager() ? `<button class="iconbtn sm" data-act="edit-spec" data-key="${key}" title="Edit">${ico('edit')}</button>` : ''}</div></div>`;
}
function renderSpecs(site) {
  const populated = site.racks.filter(r => r.devices.length).length;
  const booked = site.racks.filter(r => !r.devices.length && customerName(r)).length;
  const hvac = site.hvacUnits != null && site.hvacTrPerUnit != null ? site.hvacUnits * site.hvacTrPerUnit : null;
  const ups = site.upsUnits != null && site.upsKvaPerUnit != null ? site.upsUnits * site.upsKvaPerUnit : null;
  const gen = site.generatorUnits != null && site.generatorKvaPerUnit != null ? site.generatorUnits * site.generatorKvaPerUnit : null;
  return `<div class="specgrid">
  <div class="card"><h3>Identity</h3>${specRow(site, 'name')}${specRow(site, 'location')}${specRow(site, 'tier')}${specRow(site, 'category', esc(CATEGORIES[site.category] ? CATEGORIES[site.category].label : site.category))}${specRow(site, 'commissionedDate')}${specRow(site, 'pue', (site.pue || 0).toFixed(2))}</div>
  <div class="card"><h3>Infrastructure</h3>${specRow(site, 'hvacUnits')}${specRow(site, 'hvacTrPerUnit')}<div class="spec"><div class="spec-l">Total cooling</div><div class="spec-v mono">${hvac != null ? hvac + ' TR' : '—'}</div></div>
  ${specRow(site, 'upsUnits')}${specRow(site, 'upsKvaPerUnit')}<div class="spec"><div class="spec-l">Total UPS</div><div class="spec-v mono">${ups != null ? fmtKva(ups, 0) : '—'}</div></div>
  ${specRow(site, 'generatorUnits')}${specRow(site, 'generatorKvaPerUnit')}<div class="spec"><div class="spec-l">Total generators</div><div class="spec-v mono">${gen != null ? fmtKva(gen, 0) : '—'}</div></div></div>
  <div class="card"><h3>Racks</h3><div class="spec"><div class="spec-l">Total racks</div><div class="spec-v mono">${site.racks.length}</div></div><div class="spec"><div class="spec-l">Populated</div><div class="spec-v mono t-ok">${populated}</div></div><div class="spec"><div class="spec-l">Booked (no devices)</div><div class="spec-v mono" style="color:var(--violet)">${booked}</div></div><div class="spec"><div class="spec-l">Empty</div><div class="spec-v mono faint">${site.racks.length - populated - booked}</div></div><div class="spec"><div class="spec-l">Devices</div><div class="spec-v mono">${site.deviceCount}</div></div><div class="spec"><div class="spec-l">Cages</div><div class="spec-v mono">${site.cages.length}</div></div></div>
  <div class="card"><h3>Load</h3><div class="spec"><div class="spec-l">Capacity</div><div class="spec-v mono">${fmtKva(site.totalCapacityKva, 0)}</div></div><div class="spec"><div class="spec-l">IT load</div><div class="spec-v mono">${fmtKva(site.itLoadKva, 0)}</div></div><div class="spec"><div class="spec-l">Utility load (× PUE)</div><div class="spec-v mono">${fmtKva(site.utilityLoadKva, 0)}</div></div><div class="spec"><div class="spec-l">Utilization</div><div class="spec-v"><span class="badge ${statusKey(site.utilizationPct)}">${fmtPct(site.utilizationPct)} · ${statusLabel(site.utilizationPct)}</span></div></div>
  <div class="spec"><div class="spec-l">Floors</div><div class="spec-v">${site.floors.map(f => esc(f.name)).join(', ') || '—'}${isManager() ? `<button class="iconbtn sm" data-act="add-floor" title="Add floor">${ico('plus')}</button>` : ''}</div></div></div>
  ${isAdmin() ? `<div class="card danger"><h3>Danger zone</h3><p class="muted sm">Removing a site deletes its racks, devices and cages.</p><button class="btn danger" data-act="remove-site">Remove site</button></div>` : ''}</div>`;
}

/* ---- power (pdf breakers) ---- */
function renderPower(site) {
  const list = site.pdfBreakers || [];
  const uses = {};
  site.racks.forEach(r => { if (!r.circuitBreaker) return; String(r.circuitBreaker).split(';').forEach(part => { const m = part.match(/^\s*(A1|A2|B1|B2)\s*:\s*(.+)$/i); if (!m) return; m[2].split(/&|,/).map(x => x.trim()).filter(Boolean).forEach(b => { (uses[m[1].toUpperCase() + '::' + b] = uses[m[1].toUpperCase() + '::' + b] || []).push(r.id); }); }); });
  return ['A1', 'A2', 'B1', 'B2'].map(pdf => {
    const rows = list.filter(b => b.pdf === pdf).sort((a, b) => String(a.breaker_no || '').localeCompare(String(b.breaker_no || ''), undefined, { numeric: true }));
    if (!rows.length) return '';
    const cap = rows.reduce((s, b) => s + (Number(b.capacity_a) || 0), 0), load = rows.reduce((s, b) => s + (Number(b.load_a) || 0), 0);
    return `<div class="card flush mb"><div class="card-tools"><h3 style="margin:0">PDF ${pdf}</h3><span class="muted sm">${rows.length} breakers · ${cap} A capacity · ${load.toFixed(1)} A load (${(load * 53 / 1000).toFixed(2)} kW)</span></div><div class="scroll" style="max-height:480px"><table class="tbl"><thead><tr><th>Breaker</th><th class="n">Cap (A)</th><th class="n">Cable mm²</th><th class="n">Load (A)</th><th class="n">Load kW</th><th style="width:130px">Loading</th><th>Status</th><th>Racks</th></tr></thead><tbody>
    ${rows.map(b => { const c = Number(b.capacity_a) || 0, l = Number(b.load_a) || 0, p = c > 0 ? l / c : null, used = uses[pdf + '::' + b.breaker_no] || []; const st = p !== null && p > 0.8 ? badge('High', 'crit') : p !== null ? badge('OK', 'ok') : l > 0 ? badge('No capacity', 'warn') : used.length ? badge('No reading', 'warn') : badge('Spare', 'soft'); return `<tr><td class="mono">${esc(b.breaker_no)}</td><td class="n">${c || ''}</td><td class="n">${esc(b.cable_mm2 || '')}</td><td class="n">${b.load_a != null ? l.toFixed(1) : ''}</td><td class="n">${b.load_a != null ? (l * 53 / 1000).toFixed(3) : ''}</td><td>${p != null ? bar(p) : ''}</td><td>${st}</td><td class="faint sm">${esc(used.join(', '))}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }).join('');
}

/* ---------- analysis ---------- */
function renderAnalysis() {
  const sites = visibleSites(); const racks = sites.flatMap(s => s.racks);
  const cap = sites.reduce((s, x) => s + x.totalCapacityKva, 0), it = sites.reduce((s, x) => s + x.itLoadKva, 0), util = sites.reduce((s, x) => s + x.utilityLoadKva, 0);
  const top = racks.slice().sort((a, b) => b.utilPct - a.utilPct).filter(r => r.capacityKva).slice(0, 8);
  return `<div class="pagehead"><div><h1>Analysis</h1><p class="muted">Capacity, load and customer mix across ${sites.length} site${sites.length === 1 ? '' : 's'}</p></div></div>
  <div class="kpis">${kpi('Capacity', `${cap.toFixed(0)}<small> kVA</small>`, '', 'a1')}${kpi('IT load', `${it.toFixed(0)}<small> kVA</small>`, fmtPct(cap ? it / cap : 0) + ' utilized', 'a2')}${kpi('Utility load', `${util.toFixed(0)}<small> kVA</small>`, 'IT × PUE', 'a3')}${kpi('Headroom', `${Math.max(0, cap - it).toFixed(0)}<small> kVA</small>`, 'unused capacity', 'a4')}${kpi('Avg PUE', (it ? util / it : 0).toFixed(2), 'weighted by IT load', 'a6')}</div>
  <div class="chartgrid">
    <div class="card"><h3>Utilization by site</h3><div class="chartbox"><canvas id="chSites"></canvas></div></div>
    <div class="card"><h3>Rack load distribution</h3><div class="chartbox"><canvas id="chBuckets"></canvas></div></div>
    <div class="card"><h3>Racks per customer (top 8)</h3><div class="chartbox"><canvas id="chCust"></canvas></div></div>
    <div class="card"><h3>Device mix</h3><div class="chartbox"><canvas id="chMix"></canvas></div></div>
  </div>
  <div class="card flush mb"><div class="card-tools"><h3 style="margin:0">Hottest racks</h3></div><table class="tbl"><thead><tr><th>Rack</th><th>Site</th><th>Customer</th><th class="n">Actual</th><th class="n">Capacity</th><th style="width:160px">Load</th></tr></thead><tbody>
  ${top.map(r => { const e = RACK_INDEX.get(rkey(r)); return `<tr class="click" data-act="rack" data-key="${esc(rkey(r))}"><td><b>${esc(r.id)}</b></td><td>${esc(e.site.name)}</td><td>${esc(customerName(r) || '—')}</td><td class="n">${r.actualKva.toFixed(2)}</td><td class="n">${r.capacityKva.toFixed(1)}</td><td>${bar(r.utilPct)}</td></tr>`; }).join('')}</tbody></table></div>`;
}
let charts = [];
function drawAnalysisCharts() {
  charts.forEach(c => c.destroy()); charts = [];
  if (!window.Chart || !$('#chSites')) return;
  const cs = getComputedStyle(document.documentElement);
  const tx = cs.getPropertyValue('--text2').trim(), grid = cs.getPropertyValue('--line').trim();
  Chart.defaults.color = tx; Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  const sites = visibleSites(); const racks = sites.flatMap(s => s.racks);
  const accent = cs.getPropertyValue('--accent').trim();
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: grid }, beginAtZero: true } } };
  charts.push(new Chart($('#chSites'), { type: 'bar', data: { labels: sites.map(s => s.name), datasets: [{ label: 'Utilization %', data: sites.map(s => +(s.utilizationPct * 100).toFixed(1)), backgroundColor: sites.map(s => cs.getPropertyValue('--' + statusKey(s.utilizationPct)).trim()), borderRadius: 8 }] }, options: { ...opts, scales: { ...opts.scales, y: { ...opts.scales.y, max: 100 } } } }));
  const b = [0, 0, 0, 0, 0]; racks.forEach(r => { if (!r.devices.length && !r.actualKva) b[0]++; else if (r.utilPct < 0.5) b[1]++; else if (r.utilPct < 0.75) b[2]++; else if (r.utilPct < 0.9) b[3]++; else b[4]++; });
  charts.push(new Chart($('#chBuckets'), { type: 'bar', data: { labels: ['Empty', '<50%', '50–75%', '75–90%', '≥90%'], datasets: [{ data: b, backgroundColor: ['#94a3b8', '#10b981', '#06b6d4', '#f59e0b', '#ef4444'], borderRadius: 8 }] }, options: opts }));
  const cm = new Map(); racks.forEach(r => { const c = customerName(r); if (c) cm.set(c, (cm.get(c) || 0) + 1); });
  const tc = Array.from(cm.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  charts.push(new Chart($('#chCust'), { type: 'bar', data: { labels: tc.map(x => x[0]), datasets: [{ data: tc.map(x => x[1]), backgroundColor: accent, borderRadius: 8 }] }, options: { ...opts, indexAxis: 'y', scales: { x: { grid: { color: grid }, beginAtZero: true }, y: { grid: { display: false } } } } }));
  const mix = new Map(); racks.forEach(r => r.devices.forEach(d => mix.set(d.model, (mix.get(d.model) || 0) + 1)));
  const mm = Array.from(mix.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  charts.push(new Chart($('#chMix'), { type: 'doughnut', data: { labels: mm.map(x => x[0]), datasets: [{ data: mm.map(x => x[1]), backgroundColor: CAGE_COLORS, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, usePointStyle: true } } } } }));
}
