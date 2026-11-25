/* ==========================================================
   OPMG v2 — router, events, boot
   ========================================================== */
'use strict';

function parseRoute() {
  const h = decodeURIComponent(location.hash || '#/').replace(/^#\/?/, '');
  const p = h.split('/').filter(Boolean);
  if (p[0] === 'analysis') state.route = { name: 'analysis' };
  else if (p[0] === 'site' && p[1]) state.route = { name: 'site', siteId: p[1], tab: p[2] || 'floor' };
  else state.route = { name: 'portfolio' };
}
function applyTheme() { document.documentElement.dataset.theme = state.theme; }

function renderAll() {
  applyTheme();
  const app = $('#app'); const y = window.scrollY;
  if (!state.ready) { app.innerHTML = `<div class="boot"><div class="logo big"><i></i><i></i><i></i></div><p>Loading…</p></div>`; return; }
  if (LIVE && !state.user) { app.innerHTML = renderLogin(); wireAuth(); return; }
  if (LIVE && !state.approved) { app.innerHTML = renderPending(); return; }
   if (!state.categoryPicked) { app.innerHTML = renderCategoryPicker(); window.scrollTo(0, 0); return; }
  app.innerHTML = renderShell();
  if (state.route.name === 'analysis') drawAnalysisCharts();
  wireSearch();
  window.scrollTo(0, y);
}
const renderPage = renderAll;
function rerenderKeepFocus(id) {
  const el = document.getElementById(id); const pos = el ? el.selectionStart : 0;
  renderAll();
  const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } }
}
function wireAuth() {
  const f = $('#authForm'); if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(f).entries());
    const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Please wait…';
    if (state.authMode === 'signup') await signUp(d.email.trim(), d.password); else await signIn(d.email.trim(), d.password);
  });
}

/* ---------- global search ---------- */
function runGlobalSearch(q) {
  q = q.trim().toLowerCase(); const out = [];
  if (q.length < 2) return out;
  const sites = visibleSites();
  sites.forEach(s => {
    if (s.name.toLowerCase().includes(q) || (s.location || '').toLowerCase().includes(q)) out.push({ k: 'Site', t: s.name, s: s.location || '', a: 'site', id: s.id });
    s.cages.forEach(c => { if (c.name.toLowerCase().includes(q) || (c.customer || '').toLowerCase().includes(q)) out.push({ k: 'Cage', t: c.name, s: `${c.customer || ''} · ${s.name}`, a: 'cage', id: c.id, site: s.id }); });
  });
  const seenC = new Set();
  sites.forEach(s => s.racks.forEach(r => {
    const c = customerName(r);
    if (c && c.toLowerCase().includes(q) && !seenC.has(s.id + c.toLowerCase())) { seenC.add(s.id + c.toLowerCase()); out.push({ k: 'Customer', t: c, s: s.name, a: 'customer', site: s.id }); }
    if (String(r.id).toLowerCase().includes(q)) out.push({ k: 'Rack', t: r.id, s: `${s.name}${c ? ' · ' + c : ''}`, a: 'rack', id: rkey(r) });
    r.devices.forEach(d => { if ((d.serialNumber || '').toLowerCase().includes(q) || d.model.toLowerCase().includes(q)) out.push({ k: 'Device', t: `${d.model} · ${d.serialNumber || 'no serial'}`, s: `${r.id} · U${d.startU}`, a: 'rack', id: rkey(r) }); });
  }));
  return out.slice(0, 12);
}
function wireSearch() {
  const inp = $('#gsearch'); if (!inp) return; const box = $('#gsresults');
  const upd = () => { const res = runGlobalSearch(inp.value); if (!res.length) { box.hidden = inp.value.trim().length < 2 ? true : false; box.innerHTML = inp.value.trim().length < 2 ? '' : '<div class="gs-empty">No matches</div>'; return; } box.hidden = false; box.innerHTML = res.map(r => `<button data-act="gs-go" data-a="${r.a}" data-id="${esc(r.id || '')}" data-site="${esc(r.site || '')}"><span class="badge soft">${r.k}</span><b>${esc(r.t)}</b><em>${esc(r.s)}</em></button>`).join(''); };
  inp.addEventListener('input', upd); inp.addEventListener('focus', upd);
}
function goRack(key) {
  const e = RACK_INDEX.get(key); if (!e) return;
  const want = `#/site/${encodeURIComponent(e.site.id)}/floor`;
  if (location.hash.startsWith(`#/site/${encodeURIComponent(e.site.id)}/`)) openRack(key); else { location.hash = want; setTimeout(() => openRack(key), 40); }
}

/* ---------- click actions ---------- */
function selectedRacks(site) { return Array.from(state.fp.selected).map(k => RACK_INDEX.get(k)).filter(x => x && x.site === site).map(x => x.rack); }
const ACTIONS = {
  'auth-toggle': () => { state.authMode = state.authMode === 'signin' ? 'signup' : 'signin'; state.authError = null; renderAll(); },
  recheck: () => recheckApproval(),
  signout: () => signOut(),
  users: () => openUsers(),
  cat: t => { state.category = t.dataset.v; localStorage.setItem('opmg.category', state.category); renderAll(); },
  theme: () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('opmg.theme', state.theme); renderAll(); },
  'close-modal': () => closeModal(),
  'add-site': () => addSiteForm(),
  'print-site': () => printSitePdf(routeSite()),
  'export-site': () => exportSiteExcel(routeSite()).catch(e => toast(e.message, true)),
  'import-devices': () => importModal(routeSite()),
  'add-rack': () => addRackForm(routeSite()),
  'add-floor': () => addFloorForm(routeSite()),
  'edit-spec': t => editSpecForm(routeSite(), t.dataset.key),
  'remove-site': () => { const s = routeSite(); confirmModal({ title: `Remove ${esc(s.name)}?`, text: `This permanently deletes <b>${esc(s.name)}</b> with its ${s.racks.length} racks, ${s.deviceCount} devices and ${s.cages.length} cages.`, confirm: 'Remove site', onConfirm: async () => { const r = await removeSite(s); if (r.error) return r.error; closeModal(); location.hash = '#/'; renderAll(); toast('Site removed'); } }); },
  rack: t => {
    const key = t.dataset.key;
    if (state.fp.select && t.classList.contains('rack') && !t.closest('#modal')) { state.fp.selected.has(key) ? state.fp.selected.delete(key) : state.fp.selected.add(key); renderAll(); return; }
    if ($('#modal')) closeModal(true);
    openRack(key);
  },
  cage: t => { if ($('#modal')) closeModal(true); openCage(t.dataset.id); },
  'fp-group': t => { state.fp.group = t.dataset.v; renderAll(); },
  'fp-size': t => { state.fp.size = t.dataset.v; renderAll(); },
  'fp-select': () => { state.fp.select = !state.fp.select; if (!state.fp.select) state.fp.selected.clear(); renderAll(); },
  'new-cage': () => {
    const s = routeSite(); if (!s) return;
    if (!state.cagesEnabled) return toast('Cages need the database upgrade: run migration_v2.sql once in Supabase.', true);
    const sel = selectedRacks(s);
    if (sel.length) return newCageForm(s, sel);
    state.fp.select = true; state.fp.group = state.fp.group; if (state.route.tab !== 'floor') { location.hash = `#/site/${encodeURIComponent(s.id)}/floor`; } else renderAll();
    toast('Click the racks that belong in the cage, then choose "Group into new cage".');
  },
  'sel-newcage': () => { const s = routeSite(); const sel = selectedRacks(s); if (sel.length) newCageForm(s, sel); },
  'sel-nocage': async () => { const s = routeSite(); const r = await assignRacksToCage(s, selectedRacks(s).filter(x => x.cageId), null); if (r.error) return toast(r.error, true); state.fp.selected.clear(); renderAll(); toast('Removed from cage'); },
  'sel-clear': () => { state.fp.selected.clear(); renderAll(); },
  'sel-row': () => {
    const s = routeSite(); const rows = Array.from(new Set(s.racks.map(r => r.row))).sort(rowCompare);
    formModal({ title: 'Select a whole row', fields: `<div class="full">${fld('Row', `<select name="row">${rows.map(r => `<option>${esc(r)}</option>`).join('')}</select>`)}</div>`, submit: 'Select', onSubmit: d => { s.racks.filter(r => r.row === d.row).forEach(r => state.fp.selected.add(rkey(r))); closeModal(); renderAll(); } });
  },
  'add-device': t => { const { rack, site } = RACK_INDEX.get(state.modalRack); deviceForm(site, rack, null, t.dataset.u ? parseInt(t.dataset.u, 10) : null); },
  'edit-device': t => { const { rack, site } = RACK_INDEX.get(state.modalRack); deviceForm(site, rack, rack.devices.find(d => d.id === t.dataset.id)); },
  'rm-device': t => { const k = state.modalRack; const { rack, site } = RACK_INDEX.get(k); const d = rack.devices.find(x => x.id === t.dataset.id); confirmModal({ title: 'Remove device?', text: `Remove <b>${esc(d.model)}</b> (${esc(d.serialNumber || 'no serial')}) from ${esc(rack.id)}?`, confirm: 'Remove', onConfirm: async () => { const r = await removeDevice(site, rack, d); if (r.error) return r.error; state.modalRack = k; toast('Device removed'); reopenRack(); } }); },
  nudge: async t => { const k = state.modalRack; const { rack, site } = RACK_INDEX.get(k); const r = await nudgeRack(site, rack, parseInt(t.dataset.d, 10)); if (r.error) return toast(r.error, true); toast('Moved'); state.modalRack = k; reopenRack(); },
  'edit-rack': () => { const { rack, site } = RACK_INDEX.get(state.modalRack); editRackForm(site, rack); },
  history: () => openHistory(state.modalRack),
  'back-rack': () => { const k = state.modalRack; openRack(k); },
  'remove-rack': () => { const k = state.modalRack; const { rack, site } = RACK_INDEX.get(k); confirmModal({ title: `Remove ${esc(rack.id)}?`, text: `This deletes the rack and its ${rack.devices.length} devices.`, confirm: 'Remove rack', onConfirm: async () => { const r = await removeRack(site, rack); if (r.error) return r.error; closeModal(); renderAll(); toast('Rack removed'); } }); },
  'cage-edit': t => { const s = routeSite(); editCageForm(s, s.cages.find(c => c.id === t.dataset.id)); },
  'cage-delete': t => { const s = routeSite(); const c = s.cages.find(x => x.id === t.dataset.id); confirmModal({ title: `Delete ${esc(c.name)}?`, text: 'The racks stay where they are; they just stop being part of this cage.', confirm: 'Delete cage', onConfirm: async () => { const r = await deleteCage(s, c); if (r.error) return r.error; closeModal(); renderAll(); toast('Cage deleted'); } }); },
  'cage-unassign': async t => { const s = routeSite(); const e = RACK_INDEX.get(t.dataset.key); const id = e.rack.cageId; const r = await assignRacksToCage(s, [e.rack], null); if (r.error) return toast(r.error, true); renderAll(); openCage(id); },
  'gs-go': t => {
    const a = t.dataset.a; $('#gsresults').hidden = true; $('#gsearch').value = '';
    if (a === 'site') location.hash = `#/site/${encodeURIComponent(t.dataset.id)}/floor`;
    else if (a === 'customer') location.hash = `#/site/${encodeURIComponent(t.dataset.site)}/customers`;
    else if (a === 'cage') { location.hash = `#/site/${encodeURIComponent(t.dataset.site)}/floor`; setTimeout(() => openCage(t.dataset.id), 40); }
    else if (a === 'rack') goRack(t.dataset.id);
  },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) { if (!e.target.closest('.gsearch')) { const b = $('#gsresults'); if (b) b.hidden = true; } return; }
  const fn = ACTIONS[t.dataset.act]; if (!fn) return;
  if (t.tagName === 'A' && t.getAttribute('href') === '#') e.preventDefault();
  fn(t, e);
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.fp) { state.fp[t.dataset.fp] = t.value; renderAll(); return; }
  if (t.id === 'selCage' && t.value) {
    const s = routeSite(); const cage = s.cages.find(c => c.id === t.value);
    const r = await assignRacksToCage(s, selectedRacks(s), cage, { pack: true, setCustomer: false });
    if (r.error) return toast(r.error, true);
    state.fp.selected.clear(); renderAll(); toast(`Added to ${cage.name}`);
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'fpSearch') { state.fp.search = e.target.value; rerenderKeepFocus('fpSearch'); }
  else if (e.target.id === 'devSearch') { state.deviceSearch = e.target.value; rerenderKeepFocus('devSearch'); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#modal')) closeModal(); const b = $('#gsresults'); if (b) b.hidden = true; }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { const i = $('#gsearch'); if (i) { e.preventDefault(); i.focus(); } }
});
window.addEventListener('hashchange', () => { parseRoute(); if ($('#modal')) closeModal(); if (state.route.name !== 'site') { state.fp.select = false; state.fp.selected.clear(); } renderAll(); window.scrollTo(0, 0); });

/* ---------- boot ---------- */
(async function boot() {
  parseRoute(); applyTheme(); renderAll();
  try { await initAuth(); } catch (e) { console.error(e); state.ready = true; toast('Startup problem: ' + e.message, true); }
  state.ready = true; renderAll();
  if (LIVE) { /* refresh once when the tab regains focus after a long time away */ let last = Date.now(); document.addEventListener('visibilitychange', async () => { if (!document.hidden && Date.now() - last > 10 * 60 * 1000 && state.approved && !$('#modal')) { last = Date.now(); await loadData(); renderAll(); } }); }
})();
