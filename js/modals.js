/* ==========================================================
   OPMG v2 — modals, forms, print & export
   ========================================================== */
'use strict';

/* ---------- modal system ---------- */
function openModal({ title, sub = '', body, wide = false, foot = '', cls = '' }) {
  closeModal(true);
  const el = document.createElement('div');
  el.id = 'modal'; el.className = 'overlay';
  el.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true"><div class="modal-h"><div><h2>${title}</h2>${sub ? `<div class="muted sm">${sub}</div>` : ''}</div><button class="iconbtn" data-act="close-modal" aria-label="Close">${ico('x')}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  el.addEventListener('mousedown', e => { if (e.target === el) closeModal(); });
  document.body.appendChild(el); document.body.classList.add('noscroll');
  return el;
}
function closeModal(keepScroll) { const m = $('#modal'); if (m) m.remove(); if (!keepScroll) document.body.classList.remove('noscroll'); state.modalRack = null; }
const fld = (label, input, hint = '') => `<label class="f">${esc(label)}${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
function formModal({ title, sub, fields, submit = 'Save', danger = false, wide = false, extraFoot = '', onSubmit }) {
  const m = openModal({ title, sub, wide, body: `<form id="mform" class="mform" novalidate><div class="fgrid">${fields}</div><div class="ferr" id="mferr"></div></form>`, foot: `${extraFoot}<span class="sp"></span><button class="btn" data-act="close-modal" type="button">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" type="submit" form="mform" id="msubmit">${submit}</button>` });
  const form = $('#mform', m);
  const first = form.querySelector('input,select,textarea'); if (first && first.type !== 'hidden') first.focus();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#msubmit', m); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Saving…';
    const data = Object.fromEntries(new FormData(form).entries());
    let err; try { err = await onSubmit(data, form); } catch (ex) { console.error(ex); err = ex.message || 'Something went wrong.'; }
    if (err) { $('#mferr', m).textContent = err; btn.disabled = false; btn.textContent = old; }
  });
  return m;
}
function confirmModal({ title, text, confirm = 'Confirm', danger = true, onConfirm }) {
  const m = openModal({ title, body: `<p>${text}</p><div class="ferr" id="mferr"></div>`, foot: `<span class="sp"></span><button class="btn" data-act="close-modal">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="mconfirm">${confirm}</button>` });
  $('#mconfirm', m).addEventListener('click', async () => { $('#mconfirm', m).disabled = true; const err = await onConfirm(); if (err) { $('#mferr', m).textContent = err; $('#mconfirm', m).disabled = false; } });
}
const num = v => (v === '' || v == null ? NaN : Number(String(v).replace(',', '.')));

/* ---------- rack modal ---------- */
function densityColor(kvaPerU) { const t = clamp(kvaPerU / 1.4, 0, 1); return `hsl(${170 - t * 165} ${60 + t * 15}% ${42 - t * 6}%)`; }
function elevationHtml(site, rack, canEdit) {
  const occ = new Array(43).fill(null);
  rack.devices.forEach(d => { for (let u = d.startU; u < d.startU + d.sizeU && u <= 42; u++) occ[u] = d; });
  let cells = '';
  for (let u = 42; u >= 1; u--) {
    cells += `<div class="u-n ${u % 5 === 0 ? 'm' : ''}" style="grid-row:${43 - u}">${u}</div>`;
    if (!occ[u]) cells += `<button class="u-free ${canEdit ? '' : 'ro'}" style="grid-row:${43 - u}" ${canEdit ? `data-act="add-device" data-u="${u}" title="Add device at U${u}"` : 'tabindex="-1"'}></button>`;
  }
  rack.devices.forEach(d => {
    const per = d.datasheetKva / d.sizeU;
    cells += `<div class="u-dev" style="grid-row:${43 - (d.startU + d.sizeU - 1)} / span ${d.sizeU};background:${densityColor(per)}" title="${esc(d.model)} · ${esc(d.serialNumber || 'no serial')} · ${d.datasheetKva.toFixed(2)} kVA"><b>${esc(d.model)}</b>${d.sizeU > 1 ? `<span>U${d.startU}–${d.startU + d.sizeU - 1} · ${d.datasheetKva.toFixed(2)} kVA</span>` : `<span>${d.datasheetKva.toFixed(2)}</span>`}</div>`;
  });
  return `<div class="elev"><div class="elev-top">TOP</div><div class="elev-grid">${cells}</div><div class="elev-bot"></div></div>`;
}
function openRack(key) {
  const e = RACK_INDEX.get(key); if (!e) return;
  const { rack, site } = e; state.modalRack = key;
  const can = isManager();
  const cg = rack.cageId && site.cages.find(c => c.id === rack.cageId);
  const pct = rack.utilPct;
  const devRows = rack.devices.slice().sort((a, b) => b.startU - a.startU).map(d => `<tr><td><span class="ubadge">U${d.startU}${d.sizeU > 1 ? '–' + (d.startU + d.sizeU - 1) : ''}</span></td><td><b>${esc(d.model)}</b><div class="faint sm mono">${esc(d.serialNumber || '—')}</div></td><td class="n">${d.datasheetKva.toFixed(2)}</td><td><span class="av sm">${esc(initials(d.authorizedPerson))}</span> ${esc(String(d.authorizedPerson).replace(/—.*$/, '').trim())}</td>${can ? `<td class="act"><button class="iconbtn sm" data-act="edit-device" data-id="${esc(d.id)}">${ico('edit')}</button><button class="iconbtn sm" data-act="rm-device" data-id="${esc(d.id)}">${ico('x')}</button></td>` : ''}</tr>`).join('');
  const body = `<div class="rackgrid">
    <div>${elevationHtml(site, rack, can)}</div>
    <div class="rack-side">
      <div class="statgrid">
        <div class="stat wide"><div class="stat-l">Power</div><div class="stat-v">${rack.actualKva.toFixed(2)} <small>/ ${rack.capacityKva.toFixed(1)} kVA</small> <span class="badge ${statusKey(pct)}">${fmtPct(pct)}</span></div>${bar(pct, 8)}</div>
        <div class="stat"><div class="stat-l">Space</div><div class="stat-v">${rack.occupiedU}<small>/42 U</small></div></div>
        <div class="stat"><div class="stat-l">Rated (datasheet)</div><div class="stat-v">${rack.totalDatasheetKva.toFixed(2)}<small> kVA</small></div></div>
        <div class="stat"><div class="stat-l">Customer</div><div class="stat-v sm">${esc(customerName(rack) || '—')}</div></div>
        <div class="stat"><div class="stat-l">Cage</div><div class="stat-v sm">${cg ? `<a href="#" data-act="cage" data-id="${esc(cg.id)}" style="color:${esc(cg.color)}">${esc(cg.name)}</a>` : '—'}</div></div>
        <div class="stat"><div class="stat-l">Breaker</div><div class="stat-v sm mono">${esc(rack.circuitBreaker || '—')}</div></div>
        <div class="stat"><div class="stat-l">Activation</div><div class="stat-v sm">${esc(rack.activationDate || '—')}</div></div>
      </div>
      <div class="sec-h"><h3>Devices <em>${rack.devices.length}</em></h3>${can ? `<button class="btn sm primary" data-act="add-device">${ico('plus')} Add device</button>` : ''}</div>
      <div class="scroll" style="max-height:340px"><table class="tbl dense"><thead><tr><th>U</th><th>Device</th><th class="n">kVA</th><th>Authorized</th>${can ? '<th></th>' : ''}</tr></thead><tbody>${devRows || `<tr><td colspan="5" class="center pad faint">Empty rack</td></tr>`}</tbody></table></div>
    </div></div>`;
  const foot = `${can ? `<button class="btn sm" data-act="nudge" data-d="-1" title="Move earlier in the row">${ico('left')}</button><button class="btn sm" data-act="nudge" data-d="1" title="Move later in the row">${ico('right')}</button><button class="btn sm" data-act="edit-rack">${ico('edit')} Edit rack</button>` : ''}<button class="btn sm" data-act="history">History</button>${isAdmin() ? `<button class="btn sm danger-o" data-act="remove-rack">Remove rack</button>` : ''}<span class="sp"></span><button class="btn" data-act="close-modal">Close</button>`;
  openModal({ title: `${esc(rack.id)}`, sub: `${esc(site.name)} · Row ${esc(rack.row || '—')}${site.floors.length > 1 ? ' · ' + esc((site.floors.find(f => String(f.id) === String(rack.floorId)) || {}).name || '') : ''}`, body, foot, wide: true, cls: 'rackmodal' });
  state.modalRack = key;
}
function reopenRack() { const k = state.modalRack; renderPage(); if (k && RACK_INDEX.has(k)) openRack(k); }

function deviceForm(site, rack, dev, startU) {
  const dl = `<datalist id="dtypes">${DEVICE_TYPES.map(t => `<option value="${esc(t.name)}">`).join('')}</datalist>`;
  const start = dev ? dev.startU : startU || findFreeSlot(rack, 1) || 1;
  formModal({
    title: dev ? 'Edit device' : 'Add device', sub: `${esc(rack.id)}`,
    fields: `${dl}${fld('Model', `<input name="model" list="dtypes" required value="${esc(dev ? dev.model : '')}" placeholder="e.g. Rack Server 2U">`)}
      ${fld('Size (U)', `<input name="sizeU" type="number" min="1" max="42" step="1" required value="${dev ? dev.sizeU : 1}">`)}
      ${fld('Start U (bottom)', `<input name="startU" type="number" min="1" max="42" step="1" required value="${start}">`, `Free slot suggested: U${findFreeSlot(rack, 1, dev && dev.id) || '—'}`)}
      ${fld('Datasheet kVA', `<input name="kva" type="number" min="0" step="0.01" required value="${dev ? dev.datasheetKva : ''}" placeholder="0.00">`)}
      ${fld('Serial number', `<input name="serial" value="${esc(dev ? dev.serialNumber : '')}" placeholder="optional">`)}
      ${fld('Authorized person', `<input name="person" required value="${esc(dev ? dev.authorizedPerson : '')}" placeholder="Name — Team">`)}`,
    submit: dev ? 'Save changes' : 'Add device',
    onSubmit: async d => {
      const v = { model: d.model.trim(), sizeU: parseInt(d.sizeU, 10), startU: parseInt(d.startU, 10), kva: num(d.kva), serial: d.serial.trim(), person: d.person.trim() };
      const res = dev ? await editDevice(site, rack, dev, v) : await addDevice(site, rack, v);
      if (res.error) return res.error;
      toast(dev ? 'Device updated' : 'Device added'); reopenRack();
    },
  });
}
function editRackForm(site, rack) {
  const custs = Array.from(new Set(site.racks.map(customerName).filter(Boolean)));
  formModal({
    title: 'Edit rack', sub: esc(rack.id),
    fields: `${fld('Rack name', `<input name="name" required value="${esc(rack.id)}">`)}
      ${fld('Row', `<input name="row" required value="${esc(rack.row)}">`)}
      ${fld('Max power (kVA)', `<input name="cap" type="number" min="0.1" step="0.1" required value="${rack.capacityKva}">`)}
      ${fld('Actual power (kVA)', `<input name="act" type="number" min="0" step="0.01" required value="${rack.actualKva}">`, 'Measured at the PDU / meter')}
      ${fld('Customer', `<input name="customer" list="custs" value="${esc(rack.customer || '')}" placeholder="none"><datalist id="custs">${custs.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      ${fld('Circuit breaker', `<input name="breaker" value="${esc(rack.circuitBreaker || '')}" placeholder="A1:12&A2:12">`)}
      ${fld('Activation date', `<input name="activation" type="date" value="${esc(rack.activationDate || '')}">`)}
      ${site.cages.length || state.cagesEnabled ? fld('Cage', `<select name="cage"><option value="">— none —</option>${site.cages.map(c => `<option value="${esc(c.id)}" ${rack.cageId === c.id ? 'selected' : ''}>${esc(c.name)}${c.customer ? ' · ' + esc(c.customer) : ''}</option>`).join('')}</select>`) : ''}
      ${site.floors.length > 1 ? fld('Floor', `<select name="floor">${site.floors.map(f => `<option value="${esc(f.id)}" ${String(rack.floorId) === String(f.id) ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`) : ''}`,
    onSubmit: async d => {
      const patch = {}; const nn = d.name.trim();
      if (!nn) return 'Name is required.';
      if (nn !== rack.id) patch.id = nn;
      if (d.row.trim() !== rack.row) patch.row = d.row.trim();
      const cap = num(d.cap), act = num(d.act);
      if (!(cap > 0)) return 'Max power must be greater than 0.'; if (!(act >= 0)) return 'Actual power must be 0 or more.';
      if (cap !== rack.capacityKva) patch.capacityKva = cap;
      if (act !== rack.actualKva) patch.actualKva = act;
      if ((d.customer.trim() || null) !== rack.customer) patch.customer = d.customer.trim();
      if ((d.breaker.trim() || null) !== rack.circuitBreaker) patch.circuitBreaker = d.breaker.trim();
      if ((d.activation || null) !== rack.activationDate) patch.activationDate = d.activation;
      if ('cage' in d && (d.cage || null) !== rack.cageId) { if (!state.cagesEnabled) return 'Cages need migration_v2.sql first.'; patch.cageId = d.cage; }
      if (d.floor && String(d.floor) !== String(rack.floorId)) patch.floorId = d.floor;
      if (!Object.keys(patch).length) { reopenRack(); return; }
      const res = await updateRack(site, rack, patch);
      if (res.error) return res.error;
      const newKey = rkey(rack);
      toast('Rack updated'); state.modalRack = newKey; reopenRack();
    },
  });
}

async function openHistory(key) {
  const { rack } = RACK_INDEX.get(key);
  const m = openModal({ title: `History · ${esc(rack.id)}`, sub: 'Last 6 months', body: '<div class="center pad faint">Loading…</div>', wide: false, foot: `<span class="sp"></span><button class="btn" data-act="back-rack">Back</button>` });
  const ev = await loadRackHistory(rack);
  const L = { device_added: ['Added', 'ok'], device_removed: ['Removed', 'crit'], device_edited: ['Edited', 'warn'], capacity_changed: ['Capacity', 'warn'], actual_changed: ['Actual', 'warn'], breaker_changed: ['Breaker', 'warn'], customer_changed: ['Customer', 'violet'], activation_changed: ['Activation', 'violet'], rack_moved: ['Moved', 'warn'], rack_renamed: ['Renamed', 'warn'] };
  $('.modal-b', m).innerHTML = ev.length ? `<div class="timeline">${ev.map(x => { const l = L[x.event_type] || [x.event_type, 'soft']; return `<div class="tl"><span class="badge ${l[1]}">${esc(l[0])}</span><div><div>${esc(x.detail)}</div><div class="faint sm">${esc(new Date(x.created_at).toLocaleString())} · ${esc(x.performed_by_email || 'system')}</div></div></div>`; }).join('')}</div>` : '<div class="center pad faint">No activity recorded.</div>';
}

/* ---------- cage forms ---------- */
function cageFormFields(site, cage, racksNote = '') {
  const cur = cage ? cage.color : CAGE_COLORS[site.cages.length % CAGE_COLORS.length];
  const custs = Array.from(new Set(site.racks.map(customerName).filter(Boolean)));
  return `${fld('Name', `<input name="name" required value="${esc(cage ? cage.name : '')}" placeholder="e.g. Cage 3 / Suite B">`)}
    ${fld('Type', `<select name="type">${Object.entries(CAGE_TYPES).map(([k, l]) => `<option value="${k}" ${cage && cage.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    ${fld('Customer', `<input name="customer" list="custs2" value="${esc(cage ? cage.customer : '')}" placeholder="optional"><datalist id="custs2">${custs.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}
    <div class="f">Color<div class="swatches">${CAGE_COLORS.map(c => `<label class="sw"><input type="radio" name="color" value="${c}" ${c === cur ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div></div>
    ${site.floors.length > 1 ? fld('Floor', `<select name="floor">${site.floors.map(f => `<option value="${esc(f.id)}" ${cage && String(cage.floorId) === String(f.id) ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`) : ''}
    <label class="f full">Notes<textarea name="notes" rows="2" placeholder="Access rules, contract, contact…">${esc(cage ? cage.notes : '')}</textarea></label>${racksNote}`;
}
function newCageForm(site, racks) {
  const floorId = racks[0] && racks[0].floorId;
  formModal({
    title: 'Group into a new cage', sub: `${racks.length} rack${racks.length === 1 ? '' : 's'} selected`,
    fields: cageFormFields(site, null, `<label class="check full"><input type="checkbox" name="setcust" checked> Set the customer on these racks to the cage customer</label><label class="check full"><input type="checkbox" name="pack" checked> Place the racks side by side in their row so the cage is one block</label>`),
    submit: 'Create cage',
    onSubmit: async d => {
      if (!d.name.trim()) return 'Give the cage a name.';
      const res = await saveCage(site, null, { name: d.name.trim(), type: d.type, customer: d.customer.trim(), color: d.color, notes: d.notes, floorId: d.floor || floorId });
      if (res.error) return res.error;
      const as = await assignRacksToCage(site, racks, res.cage, { pack: !!d.pack, setCustomer: !!d.setcust });
      if (as.error) return as.error;
      state.fp.selected.clear(); state.fp.select = false;
      closeModal(); renderPage(); toast(`${res.cage.name} created with ${racks.length} rack${racks.length === 1 ? '' : 's'}`);
    },
  });
}
function openCage(id) {
  const site = routeSite() || SITES.find(s => s.cages.some(c => c.id === id));
  const cage = site && site.cages.find(c => c.id === id); if (!cage) return;
  const st = cageStats(site, cage), can = isManager();
  const body = `<div class="cage-sum" style="--cc:${esc(cage.color)}">
      <div class="statgrid"><div class="stat"><div class="stat-l">Racks</div><div class="stat-v">${st.racks.length}</div></div><div class="stat"><div class="stat-l">Devices</div><div class="stat-v">${st.devs}</div></div><div class="stat"><div class="stat-l">Power</div><div class="stat-v">${st.act.toFixed(1)}<small>/${st.cap.toFixed(0)} kVA</small></div></div><div class="stat"><div class="stat-l">Load</div><div class="stat-v"><span class="badge ${statusKey(st.pct)}">${fmtPct(st.pct)}</span></div></div></div>
      <div class="sec-h"><h3>Layout</h3></div>
      <div class="cage-layout">${Array.from(new Set(st.racks.map(r => r.row))).sort(rowCompare).map(row => `<div class="cl-row"><span class="cl-l">Row ${esc(row)}</span><div class="lane-flow">${st.racks.filter(r => r.row === row).sort((a, b) => a.position - b.position).map(r => tileHtml(site, r)).join('')}</div></div>`).join('') || '<span class="faint">No racks yet.</span>'}</div>
      <div class="sec-h"><h3>Racks in this ${esc((CAGE_TYPES[cage.type] || 'cage').toLowerCase())}</h3></div>
      <div class="chips big">${st.racks.sort((a, b) => rowCompare(a.row, b.row) || a.position - b.position).map(r => `<span class="chipx"><button class="chip" data-act="rack" data-key="${esc(rkey(r))}">${esc(r.id)}</button>${can ? `<button class="chipx-x" data-act="cage-unassign" data-key="${esc(rkey(r))}" title="Remove from cage">×</button>` : ''}</span>`).join('') || '<span class="faint">No racks yet. Use Select racks on the floor plan.</span>'}</div>
      ${cage.notes ? `<div class="sec-h"><h3>Notes</h3></div><p class="muted">${esc(cage.notes)}</p>` : ''}
    </div>`;
  openModal({ title: `<span class="swatch" style="background:${esc(cage.color)}"></span>${esc(cage.name)}`, sub: `${esc(CAGE_TYPES[cage.type] || cage.type)}${cage.customer ? ' · ' + esc(cage.customer) : ''} · ${esc(site.name)}`, body, wide: true, foot: `${can ? `<button class="btn sm" data-act="cage-edit" data-id="${esc(cage.id)}">${ico('edit')} Edit</button><button class="btn sm danger-o" data-act="cage-delete" data-id="${esc(cage.id)}">Delete cage</button>` : ''}<span class="sp"></span><button class="btn" data-act="close-modal">Close</button>` });
}
function editCageForm(site, cage) {
  formModal({
    title: 'Edit ' + esc(CAGE_TYPES[cage.type] || 'cage'), sub: esc(cage.name),
    fields: cageFormFields(site, cage, `<label class="check full"><input type="checkbox" name="setcust"> Also set this customer on every rack in the cage</label>`),
    onSubmit: async d => {
      if (!d.name.trim()) return 'Name is required.';
      const res = await saveCage(site, cage, { name: d.name.trim(), type: d.type, customer: d.customer.trim(), color: d.color, notes: d.notes, floorId: d.floor || cage.floorId });
      if (res.error) return res.error;
      if (d.setcust && cage.customer) { const r = await assignRacksToCage(site, site.racks.filter(x => x.cageId === cage.id), cage, { pack: false, setCustomer: true }); if (r.error) return r.error; }
      closeModal(); renderPage(); openCage(cage.id); toast('Saved');
    },
  });
}

/* ---------- site forms ---------- */
function addSiteForm() {
  formModal({
    title: 'Add site', sub: 'Racks are laid out into rows automatically.',
    fields: `${fld('Site name', '<input name="name" required placeholder="e.g. E55">')}${fld('Site code', '<input name="code" placeholder="English letters/numbers" >', 'Used in rack names, e.g. E55-A01')}
      ${fld('Location', '<input name="location" placeholder="City — Building">')}${fld('Tier', `<select name="tier"><option>Tier I</option><option>Tier II</option><option selected>Tier III</option><option>Tier IV</option></select>`)}
      ${fld('Category', `<select name="category">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${state.category === k ? 'selected' : ''}>${c.label}</option>`).join('')}</select>`)}${fld('PUE', '<input name="pue" type="number" min="1" step="0.01" value="1.4" required>')}
      ${fld('Number of racks', '<input name="racks" type="number" min="1" max="2000" value="40" required>')}${fld('Number of rows', '<input name="rows" type="number" min="1" max="60" value="4" required>')}${fld('Max power per rack (kVA)', '<input name="cap" type="number" min="0.1" step="0.1" value="10" required>')}`,
    submit: 'Create site',
    onSubmit: async d => {
      const res = await createSite({ name: d.name.trim(), code: d.code, location: d.location.trim(), tier: d.tier, pue: num(d.pue), rackCount: parseInt(d.racks, 10), rowCount: Math.min(parseInt(d.rows, 10), parseInt(d.racks, 10)), capacityKva: num(d.cap), category: d.category });
      if (res.error) return res.error;
      closeModal(); location.hash = `#/site/${encodeURIComponent(res.site.id)}/floor`; toast(`${res.site.name} created`);
    },
  });
}
function addRackForm(site) {
  const rows = Array.from(new Set(site.racks.map(r => r.row))).sort(rowCompare);
  formModal({
    title: 'Add rack', sub: esc(site.name),
    fields: `${fld('Rack name', `<input name="name" required placeholder="${esc(site.id.toUpperCase())}-A13">`)}${fld('Row', `<input name="row" list="rows" required value="${esc(rows[0] || 'A')}"><datalist id="rows">${rows.map(r => `<option value="${esc(r)}">`).join('')}</datalist>`, 'Pick an existing row or type a new one')}
      ${fld('Max power (kVA)', '<input name="cap" type="number" min="0.1" step="0.1" value="10" required>')}${fld('Circuit breaker', '<input name="breaker" placeholder="optional">')}
      ${site.floors.length > 1 ? fld('Floor', `<select name="floor">${site.floors.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select>`) : ''}`,
    submit: 'Add rack',
    onSubmit: async d => { const res = await addRack(site, { name: d.name.trim(), row: d.row.trim(), capacityKva: num(d.cap), circuitBreaker: d.breaker.trim(), floorId: d.floor }); if (res.error) return res.error; closeModal(); renderPage(); toast('Rack added'); },
  });
}
function addFloorForm(site) {
  formModal({ title: 'Add floor', sub: esc(site.name), fields: fld('Floor name', `<input name="name" required value="Floor ${site.floors.length + 1}">`), submit: 'Add floor', onSubmit: async d => { const r = await addFloor(site, d.name.trim()); if (r.error) return r.error; closeModal(); renderPage(); toast('Floor added'); } });
}
function editSpecForm(site, key) {
  const f = SPEC_FIELDS[key]; const v = site[key] == null ? '' : site[key];
  let input;
  if (f.type === 'select') input = `<select name="v">${f.options.map(o => `<option value="${o}" ${o === v ? 'selected' : ''}>${esc(CATEGORIES[o] ? CATEGORIES[o].label : o)}</option>`).join('')}</select>`;
  else input = `<input name="v" type="${f.type}" ${f.min != null ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''} value="${esc(v)}">`;
  formModal({ title: `Edit ${esc(f.label.toLowerCase())}`, sub: esc(site.name), fields: `<div class="full">${fld(f.label, input)}</div>`, onSubmit: async d => { const r = await updateSiteField(site, key, d.v); if (r.error) return r.error; closeModal(); renderAll(); toast('Saved'); } });
}

/* ---------- users ---------- */
async function openUsers() {
  const m = openModal({ title: 'Users & access', sub: 'Approve accounts, set roles and assign sites', body: '<div class="center pad faint">Loading…</div>', wide: true });
  const res = await fetchUserManagerData();
  const body = $('.modal-b', m);
  if (res.error) { body.innerHTML = `<div class="alert err">${esc(res.error)}</div>`; return; }
  const assigned = new Map(); res.assignments.forEach(a => { if (!assigned.has(a.user_id)) assigned.set(a.user_id, new Set()); assigned.get(a.user_id).add(a.site_id); });
  body.innerHTML = `<div class="scroll"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Approved</th><th>Sites</th></tr></thead><tbody>${res.profiles.map(p => {
    const me = p.id === state.user.id;
    return `<tr><td><b>${esc(p.email || p.id)}</b>${me ? ' <span class="badge soft">you</span>' : ''}</td><td><select data-user-role="${esc(p.id)}" ${me ? 'disabled' : ''}>${['technician', 'manager', 'admin'].map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}${p.role === 'engineer' ? '<option value="engineer" selected>Engineer</option>' : ''}</select></td>
    <td><label class="switch"><input type="checkbox" data-user-appr="${esc(p.id)}" ${p.approved ? 'checked' : ''} ${me ? 'disabled' : ''}><i></i></label></td>
    <td class="chips">${SITES.map(s => `<label class="chip chk"><input type="checkbox" data-user-site="${esc(p.id)}|${esc(s.id)}" ${assigned.has(p.id) && assigned.get(p.id).has(s.id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  body.addEventListener('change', async e => {
    const t = e.target; let r;
    if (t.dataset.userRole) r = await setUserRole(t.dataset.userRole, t.value);
    else if (t.dataset.userAppr) r = await setUserApproved(t.dataset.userAppr, t.checked);
    else if (t.dataset.userSite) { const [u, s] = t.dataset.userSite.split('|'); r = await setSiteAssignment(u, s, t.checked); }
    else return;
    if (r.error) { toast(r.error, true); t.checked = !t.checked; } else toast('Saved');
  });
}

/* ---------- import ---------- */
function loadXLSX() {
  return new Promise((res, rej) => { if (window.XLSX) return res(window.XLSX); const s = document.createElement('script'); s.src = 'vendor/xlsx.js'; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Could not load the spreadsheet library.')); document.head.appendChild(s); });
}
function importModal(site) {
  const m = openModal({ title: 'Import devices', sub: `${esc(site.name)} · Excel or CSV`, wide: true,
    body: `<div class="dropzone"><p>Columns: <b>Rack ID, Model, Size (U), Start U (optional), Serial Number, Authorized Person, Datasheet kVA</b></p><div class="row-gap"><button class="btn" id="tplBtn">${ico('down')} Download template</button><label class="btn primary">Choose file<input type="file" id="impFile" accept=".xlsx,.xls,.csv" hidden></label></div></div><div id="impOut"></div>`,
    foot: `<span class="sp"></span><button class="btn" data-act="close-modal">Close</button><button class="btn primary" id="impGo" disabled>Import</button>` });
  let valid = [];
  $('#tplBtn', m).onclick = async () => { const X = await loadXLSX(); const ws = X.utils.aoa_to_sheet([['Rack ID', 'Model', 'Size (U)', 'Start U', 'Serial Number', 'Authorized Person', 'Datasheet kVA'], [site.racks[0] ? site.racks[0].id : 'RACK-01', 'Rack Server 2U', 2, '', 'SN12345', 'A. Hassan — Network Ops', 0.8]]); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Devices'); X.writeFile(wb, `${site.id}-device-template.xlsx`); };
  $('#impFile', m).onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const out = $('#impOut', m);
    try {
      const X = await loadXLSX(); const wb = X.read(await f.arrayBuffer(), { type: 'array' });
      const aoa = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const ex = extractImportRows(aoa); if (ex.error) { out.innerHTML = `<div class="alert err">${esc(ex.error)}</div>`; return; }
      if (ex.rows.length > 2000) { out.innerHTML = '<div class="alert err">Max 2000 rows per import.</div>'; return; }
      const rows = validateImportRows(site, ex.rows); valid = rows.filter(r => r.ok);
      out.innerHTML = `<div class="alert ${valid.length === rows.length ? 'ok' : 'warn'}">${valid.length} of ${rows.length} rows are ready${rows.length - valid.length ? `; ${rows.length - valid.length} have problems and will be skipped` : ''}.</div><div class="scroll" style="max-height:300px"><table class="tbl dense"><thead><tr><th>Row</th><th>Rack</th><th>Model</th><th>U</th><th>Serial</th><th>Status</th></tr></thead><tbody>${rows.slice(0, 300).map(r => `<tr><td>${r.rowNum}</td><td>${esc(r.rack)}</td><td>${esc(r.model)}</td><td>${r.start ? 'U' + r.start : '—'}</td><td class="mono">${esc(r.serial)}</td><td>${r.ok ? badge('OK' + (r.warnings.length ? ' · ' + r.warnings[0] : ''), r.warnings.length ? 'warn' : 'ok') : badge(r.errors[0], 'crit')}</td></tr>`).join('')}</tbody></table></div>`;
      $('#impGo', m).disabled = !valid.length; $('#impGo', m).textContent = `Import ${valid.length} device${valid.length === 1 ? '' : 's'}`;
    } catch (ex) { out.innerHTML = `<div class="alert err">${esc(ex.message)}</div>`; }
  };
  $('#impGo', m).onclick = async () => { $('#impGo', m).disabled = true; const r = await importDevices(site, valid); if (r.error) { $('#impOut', m).insertAdjacentHTML('afterbegin', `<div class="alert err">${esc(r.error)}</div>`); return; } closeModal(); renderPage(); toast(`${r.count} devices imported`); };
}

/* ---------- export ---------- */
async function exportSiteExcel(site) {
  const X = await loadXLSX(); const wb = X.utils.book_new();
  const cg = id => (site.cages.find(c => c.id === id) || {}).name || '';
  const add = (name, aoa) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), name.slice(0, 31));
  add('Summary', [['Site', site.name], ['Location', site.location], ['Tier', site.tier], ['Category', site.category], ['PUE', site.pue], ['Commissioned', site.commissionedDate || ''], ['HVAC units', site.hvacUnits ?? ''], ['HVAC TR per unit', site.hvacTrPerUnit ?? ''], ['UPS units', site.upsUnits ?? ''], ['UPS kVA per unit', site.upsKvaPerUnit ?? ''], ['Generator units', site.generatorUnits ?? ''], ['Generator kVA per unit', site.generatorKvaPerUnit ?? ''], ['Racks', site.racks.length], ['Cages', site.cages.length], ['Capacity kVA', +site.totalCapacityKva.toFixed(2)], ['IT load kVA', +site.itLoadKva.toFixed(2)], ['Utilization', +(site.utilizationPct * 100).toFixed(1) + '%']]);
  add('Racks', [['Rack', 'Row', 'Cage', 'Customer', 'Capacity kVA', 'Actual kVA', 'Util %', 'Breaker', 'Devices', 'Used U', 'Activation']].concat(site.racks.slice().sort((a, b) => rowCompare(a.row, b.row) || a.position - b.position).map(r => [r.id, r.row, cg(r.cageId), r.customer || '', r.capacityKva, r.actualKva, +(r.utilPct * 100).toFixed(1), r.circuitBreaker || '', r.devices.length, r.occupiedU, r.activationDate || ''])));
  add('Customers', [['Customer', 'Racks', 'Cages', 'Devices', 'Capacity kVA', 'Actual kVA', 'Rack IDs']].concat(customerGroups(site).map(g => [g.name, g.racks.length, Array.from(g.cages).join(', '), g.devices, +g.capacity.toFixed(2), +g.actual.toFixed(2), g.racks.map(r => r.id).join(', ')])));
  add('Cages', [['Cage', 'Type', 'Customer', 'Racks', 'Devices', 'Capacity kVA', 'Actual kVA', 'Notes']].concat(site.cages.map(c => { const s = cageStats(site, c); return [c.name, CAGE_TYPES[c.type] || c.type, c.customer, s.racks.length, s.devs, +s.cap.toFixed(2), +s.act.toFixed(2), c.notes]; })));
  const dv = [['Rack', 'Start U', 'Size U', 'Model', 'Serial', 'kVA', 'Authorized person']]; site.racks.forEach(r => r.devices.forEach(d => dv.push([r.id, d.startU, d.sizeU, d.model, d.serialNumber, d.datasheetKva, d.authorizedPerson]))); add('Devices', dv);
  X.writeFile(wb, `${site.id}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ---------- print site PDF ---------- */
function buildSitePrintHtml(site) {
  const groups = customerGroups(site);
  const row = (l, v) => `<tr><th>${esc(l)}</th><td>${v == null || v === '' ? '—' : esc(v)}</td></tr>`;
  const hvac = site.hvacUnits != null && site.hvacTrPerUnit != null ? `${site.hvacUnits} × ${site.hvacTrPerUnit} TR = ${site.hvacUnits * site.hvacTrPerUnit} TR` : '';
  const ups = site.upsUnits != null && site.upsKvaPerUnit != null ? `${site.upsUnits} × ${site.upsKvaPerUnit} kVA = ${site.upsUnits * site.upsKvaPerUnit} kVA` : '';
  const gen = site.generatorUnits != null && site.generatorKvaPerUnit != null ? `${site.generatorUnits} × ${site.generatorKvaPerUnit} kVA = ${site.generatorUnits * site.generatorKvaPerUnit} kVA` : '';
  const populated = site.racks.filter(r => r.devices.length).length, booked = site.racks.filter(r => !r.devices.length && customerName(r)).length;
  const css = `*{box-sizing:border-box}body{font:13px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:0;padding:28px;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1{font-size:26px;margin:0}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#fff;background:#1F4E78;padding:7px 12px;border-radius:6px;margin:24px 0 10px}.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #2E75B6;padding-bottom:12px}.hd small{color:#64748b}table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}thead th{background:#eaf1f8;color:#1F4E78;font-size:11px;text-transform:uppercase;letter-spacing:.04em}tbody tr:nth-child(even){background:#f8fafc}.kv th{width:38%;color:#475569;font-weight:600}.n{text-align:right}tfoot td{font-weight:700;background:#eaf1f8;border-top:2px solid #1F4E78}.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.k{border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px}.k b{display:block;font-size:20px;color:#1F4E78}.k span{font-size:11px;color:#64748b;text-transform:uppercase}.sw{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}.ids{color:#475569;font-size:11.5px}.bt{position:fixed;top:12px;right:12px}@media print{.bt{display:none}body{padding:0}h2{break-after:avoid}tr{break-inside:avoid}}@page{margin:14mm}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(site.name)} · Site report</title><style>${css}</style></head><body>
  <button class="bt" onclick="window.print()">Print / Save as PDF</button>
  <div class="hd"><div><h1>${esc(site.name)}</h1><small>${esc(site.location || '')} · ${esc(site.tier || '')} · ${esc((CATEGORIES[site.category] || {}).label || site.category)}</small></div><small>Generated ${esc(new Date().toLocaleString())}</small></div>
  <div class="kpis"><div class="k"><b>${site.racks.length}</b><span>Racks</span></div><div class="k"><b>${groups.length}</b><span>Customers</span></div><div class="k"><b>${site.cages.length}</b><span>Cages</span></div><div class="k"><b>${fmtPct(site.utilizationPct)}</b><span>Utilization</span></div></div>
  <h2>Site specifications</h2><div class="cols"><table class="kv"><tbody>${row('Name', site.name)}${row('Location', site.location)}${row('Tier', site.tier)}${row('Commissioned', site.commissionedDate)}${row('PUE', (site.pue || 0).toFixed(2))}${row('Floors', site.floors.map(f => f.name).join(', '))}</tbody></table>
  <table class="kv"><tbody>${row('Cooling (HVAC)', hvac)}${row('UPS systems', ups)}${row('Standby generators', gen)}${row('Capacity', fmtKva(site.totalCapacityKva, 0))}${row('IT load', fmtKva(site.itLoadKva, 0))}${row('Utility load', fmtKva(site.utilityLoadKva, 0))}</tbody></table></div>
  <h2>Rack capacity &amp; utilization</h2><table class="kv"><tbody>${row('Total racks', site.racks.length)}${row('Populated', populated)}${row('Booked (customer, no devices)', booked)}${row('Empty', site.racks.length - populated - booked)}${row('Devices', site.deviceCount)}</tbody></table>
  <h2>Customers &amp; racks</h2>${groups.length ? `<table><thead><tr><th>Customer</th><th>Cages</th><th class="n">Racks</th><th class="n">Capacity kVA</th><th>Rack IDs</th></tr></thead><tbody>${groups.map(g => `<tr><td><span class="sw" style="background:hsl(${hashStr(g.name.toLowerCase()) % 360} 62% 52%)"></span><b>${esc(g.name)}</b></td><td>${esc(Array.from(g.cages).join(', ') || '—')}</td><td class="n"><b>${g.racks.length}</b></td><td class="n">${g.capacity.toFixed(1)}</td><td class="ids">${esc(g.racks.sort((a, b) => rowCompare(a.row, b.row) || a.position - b.position).map(r => r.id).join(', '))}</td></tr>`).join('')}</tbody><tfoot><tr><td>TOTAL</td><td></td><td class="n">${groups.reduce((s, g) => s + g.racks.length, 0)}</td><td class="n">${groups.reduce((s, g) => s + g.capacity, 0).toFixed(1)}</td><td></td></tr></tfoot></table>` : '<p>No customers assigned to racks at this site.</p>'}
  ${site.cages.length ? `<h2>Cages &amp; suites</h2><table><thead><tr><th>Name</th><th>Type</th><th>Customer</th><th class="n">Racks</th><th class="n">Actual / Capacity kVA</th></tr></thead><tbody>${site.cages.map(c => { const s = cageStats(site, c); return `<tr><td><span class="sw" style="background:${esc(c.color)}"></span><b>${esc(c.name)}</b></td><td>${esc(CAGE_TYPES[c.type] || c.type)}</td><td>${esc(c.customer || '—')}</td><td class="n">${s.racks.length}</td><td class="n">${s.act.toFixed(1)} / ${s.cap.toFixed(1)}</td></tr>`; }).join('')}</tbody></table>` : ''}
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},400)})<\/script></body></html>`;
}
function printSitePdf(site) {
  const url = URL.createObjectURL(new Blob([buildSitePrintHtml(site)], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) toast('Pop-up blocked. Allow pop-ups for this page and try again.', true);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
