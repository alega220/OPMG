/* ==========================================================
   OPMG v2 — core: utilities, state, demo data, data layer
   ========================================================== */
'use strict';

const CFG = {
  url: (window.SUPABASE_URL || '').trim(),
  key: (window.SUPABASE_ANON_KEY || '').trim(),
};
const FORCE_DEMO = /[?&]demo=1/.test(location.search);
const LIVE = !!(CFG.url && CFG.key && !FORCE_DEMO && window.supabase);
const sb = LIVE ? window.supabase.createClient(CFG.url, CFG.key) : null;

/* ---------- tiny helpers ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmtKva = (n, d = 1) => `${(Number(n) || 0).toFixed(d)} kVA`;
const fmtPct = (n, d = 0) => `${((Number(n) || 0) * 100).toFixed(d)}%`;
const fmtNum = n => (Number(n) || 0).toLocaleString('en-US');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const statusKey = pct => pct >= 0.9 ? 'crit' : pct >= 0.75 ? 'warn' : 'ok';
const statusLabel = pct => pct >= 0.9 ? 'Critical' : pct >= 0.75 ? 'Warning' : 'Normal';
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return Math.abs(h); }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function initials(name) { const p = String(name || '').replace(/—.*$/, '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + ((p[1] || '')[0] || '')).toUpperCase(); }
function rowLabelFromIndex(n) { let out = ''; n = Math.floor(n); do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0); return out; }
function rowCompare(a, b) {
  const la = /^[A-Za-z]{1,3}$/.test(a), lb = /^[A-Za-z]{1,3}$/.test(b);
  if (la && lb) return a.length - b.length || a.localeCompare(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
function shortRackName(site, rack) {
  const n = String(rack.id);
  const pre = (site.id + '-').toUpperCase();
  return n.toUpperCase().startsWith(pre) ? n.slice(pre.length) : n;
}
function debounce(fn, ms = 150) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

const CAGE_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#3b82f6'];
const CAGE_TYPES = { cage: 'Cage', suite: 'Suite', pod: 'Pod', zone: 'Zone', room: 'Room' };
const CATEGORIES = {
  colo: { label: 'Colocation', icon: '🏢', desc: 'Customer-hosted racks and shared facilities' },
  inhouse: { label: 'In-House', icon: '🏠', desc: 'Company-owned and operated facilities' },
};
const ROLE_LABEL = { technician: 'Technician', manager: 'Manager', engineer: 'Engineer', admin: 'Admin' };

/* ---------- state ---------- */
let SITES = [];
let RACK_INDEX = new Map();           /* key -> { rack, site } */
const state = {
  ready: false, user: null, role: null, approved: false,
  authMode: 'signin', authError: null,
  cagesEnabled: true,
  category: localStorage.getItem('opmg.category') || 'all',
   categoryPicked: false,   /* entry category picker shows until a choice is made (per session) */
  theme: localStorage.getItem('opmg.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  /* floor-plan view prefs (per session) */
  fp: { floor: 'all', group: 'rows', colorBy: 'power', size: 'md', search: '', status: 'all', select: false, selected: new Set() },
  deviceSearch: '',
  route: { name: 'portfolio' },
};
const isManager = () => ['manager', 'admin', 'engineer'].includes(state.role) || !LIVE;
const isAdmin = () => state.role === 'admin' || !LIVE;
const rkey = rack => rack.uuid || rack.id;
const siteById = id => SITES.find(s => s.id === id);
function reindex() {
  RACK_INDEX = new Map();
  SITES.forEach(s => s.racks.forEach(r => RACK_INDEX.set(rkey(r), { rack: r, site: s })));
}
function visibleSites() { return SITES.filter(s => state.category === 'all' || (s.category || 'colo') === state.category); }

/* ---------- computed ---------- */
function recomputeRack(r) {
  r.totalDatasheetKva = r.devices.reduce((s, d) => s + d.datasheetKva, 0);
  r.occupiedU = r.devices.reduce((s, d) => s + d.sizeU, 0);
  r.utilPct = r.capacityKva > 0 ? r.actualKva / r.capacityKva : 0;
}
function recomputeSite(site) {
  site.racks.forEach(recomputeRack);
  site.itLoadKva = site.racks.reduce((s, r) => s + (r.actualKva || 0), 0);
  site.utilityLoadKva = site.itLoadKva * (site.pue || 1);
  site.totalCapacityKva = site.racks.reduce((s, r) => s + r.capacityKva, 0);
  site.utilizationPct = site.totalCapacityKva > 0 ? site.itLoadKva / site.totalCapacityKva : 0;
  site.deviceCount = site.racks.reduce((s, r) => s + r.devices.length, 0);
}
function customerName(r) { return (r.customer || '').trim(); }
function customerGroups(site) {
  const map = new Map();
  site.racks.forEach(r => {
    const c = customerName(r); if (!c) return;
    const k = c.toLowerCase();
    if (!map.has(k)) map.set(k, { name: c, racks: [], cages: new Set(), capacity: 0, actual: 0, devices: 0 });
    const g = map.get(k);
    g.racks.push(r); g.capacity += r.capacityKva; g.actual += r.actualKva; g.devices += r.devices.length;
    if (r.cageId) { const cg = site.cages.find(c2 => c2.id === r.cageId); if (cg) g.cages.add(cg.name); }
  });
  return Array.from(map.values()).sort((a, b) => b.racks.length - a.racks.length || a.name.localeCompare(b.name));
}
function cageStats(site, cage) {
  const racks = site.racks.filter(r => r.cageId === cage.id);
  const cap = racks.reduce((s, r) => s + r.capacityKva, 0);
  const act = racks.reduce((s, r) => s + r.actualKva, 0);
  const devs = racks.reduce((s, r) => s + r.devices.length, 0);
  const usedU = racks.reduce((s, r) => s + r.occupiedU, 0);
  return { racks, cap, act, devs, usedU, totalU: racks.length * 42, pct: cap > 0 ? act / cap : 0 };
}
function findFreeSlot(rack, sizeU, excludeId) {
  const occ = new Array(43).fill(false);
  rack.devices.forEach(d => { if (d.id === excludeId) return; for (let u = d.startU; u < d.startU + d.sizeU; u++) occ[u] = true; });
  let run = 0, start = 1;
  for (let u = 1; u <= 42; u++) {
    if (!occ[u]) { if (run === 0) start = u; run++; if (run >= sizeU) return start; } else run = 0;
  }
  return null;
}
function slotFree(rack, startU, sizeU, excludeId) {
  if (startU < 1 || startU + sizeU - 1 > 42) return false;
  return !rack.devices.some(d => d.id !== excludeId && startU < d.startU + d.sizeU && startU + sizeU > d.startU);
}

/* ==========================================================
   DEMO DATA
   ========================================================== */
const DEVICE_TYPES = [
  { name: 'GPU Compute Node', size: 4, min: 3.8, max: 6.6 },
  { name: 'Rack Server 1U', size: 1, min: 0.35, max: 0.75 },
  { name: 'Rack Server 2U', size: 2, min: 0.7, max: 1.3 },
  { name: 'Blade Chassis', size: 10, min: 8.5, max: 13.2 },
  { name: 'Storage Array', size: 4, min: 1.1, max: 2.3 },
  { name: 'ToR Switch', size: 1, min: 0.15, max: 0.35 },
  { name: 'Core/Spine Switch', size: 2, min: 0.4, max: 0.85 },
  { name: 'Firewall Appliance', size: 1, min: 0.2, max: 0.45 },
  { name: 'KVM Console', size: 1, min: 0.04, max: 0.09 },
];
const PEOPLE = ['A. Hassan — Network Ops', 'M. Youssef — Server Team', 'S. Ali — Storage Team', 'R. Nasser — DBA Team', 'K. Farouk — Virtualization', 'H. Sami — Security Ops', 'O. Tarek — Vendor Contractor', 'N. Adel — Facilities'];
const DEMO_CUSTOMERS = ['Al-Futtaim', 'Nile Bank', 'Orbit Telecom', 'Delta Cloud', 'Pharos Media', 'Sinai Logistics'];
const SITE_DEFS = [
  { id: 'b90', name: 'B90', location: 'Cairo — Bldg 90', tier: 'Tier III', rows: 6, per: 14, caps: [5, 8, 10, 15], category: 'colo', pue: 1.42 },
  { id: 'a12', name: 'A12', location: 'Cairo — Bldg 12', tier: 'Tier III', rows: 4, per: 12, caps: [5, 8, 10], category: 'colo', pue: 1.38 },
  { id: 'c77', name: 'C77', location: 'Alexandria — Bldg 77', tier: 'Tier II', rows: 3, per: 10, caps: [4, 6, 8], category: 'colo', pue: 1.55 },
  { id: 'd40', name: 'D40', location: '6th of October — Bldg 40', tier: 'Tier IV', rows: 4, per: 12, caps: [8, 10, 15, 20], category: 'inhouse', pue: 1.30 },
];
function genSerial(rng) { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'; let s = ''; for (let i = 0; i < 10; i++) s += c[Math.floor(rng() * c.length)]; return s; }
function generateSite(def) {
  const rng = mulberry32(hashStr(def.id));
  const floors = [{ id: def.id + '-f1', name: 'Floor 1', position: 1 }];
  const racks = []; const cages = [];
  for (let ri = 0; ri < def.rows; ri++) {
    const row = rowLabelFromIndex(ri);
    for (let i = 0; i < def.per; i++) {
      const cap = def.caps[Math.floor(rng() * def.caps.length)];
      const rack = { id: `${def.id.toUpperCase()}-${row}${String(i + 1).padStart(2, '0')}`, uuid: null, row, position: i, capacityKva: cap, actualKva: 0, circuitBreaker: null, customer: null, activationDate: null, floorId: floors[0].id, cageId: null, devices: [], history: [] };
      const fill = rng();
      if (fill > 0.18) {
        const target = Math.min(42, Math.floor(8 + rng() * 32));
        let u = 1, guard = 0;
        while (u < target && guard++ < 30) {
          const t = DEVICE_TYPES[Math.floor(rng() * DEVICE_TYPES.length)];
          if (u + t.size - 1 > 42) break;
          const kva = +(t.min + rng() * (t.max - t.min)).toFixed(2);
          rack.devices.push({ id: `${rack.id}-d${u}`, startU: u, sizeU: t.size, model: t.name, serialNumber: genSerial(rng), datasheetKva: kva, authorizedPerson: PEOPLE[Math.floor(rng() * PEOPLE.length)] });
          u += t.size + (rng() > 0.7 ? 1 : 0);
        }
        const lvl = rng(); const tgt = lvl < 0.08 ? 0.92 + rng() * 0.1 : lvl < 0.25 ? 0.76 + rng() * 0.12 : 0.18 + rng() * 0.55;
        rack.actualKva = +(cap * tgt * Math.min(1, 0.35 + target / 42)).toFixed(2);
        rack.circuitBreaker = `A1:${10 + ri * 2 + (i % 8)}&A2:${10 + ri * 2 + (i % 8)}`;
      }
      racks.push(rack);
    }
  }
  const site = { id: def.id, name: def.name, location: def.location, tier: def.tier, pue: def.pue, category: def.category, commissionedDate: '2019-04-01', hvacUnits: 8, hvacTrPerUnit: 30, upsUnits: 4, upsKvaPerUnit: 400, generatorUnits: 3, generatorKvaPerUnit: 1000, floors, racks, cages, pdfBreakers: [] };
  /* customers + cages (contiguous blocks in rows) */
  if (def.category === 'colo') {
    let ci = 0;
    for (let ri = 0; ri < def.rows; ri++) {
      const row = racks.filter(r => r.row === rowLabelFromIndex(ri));
      let i = 1;
      while (i < row.length - 2) {
        const len = 2 + Math.floor(rng() * 4);
        const customer = DEMO_CUSTOMERS[(ci++) % DEMO_CUSTOMERS.length];
        const inCage = rng() > 0.3;
        let cage = null;
        if (inCage) {
          cage = { id: `${def.id}-cg${cages.length + 1}`, siteId: def.id, floorId: floors[0].id, name: `${['Cage', 'Suite', 'Pod'][cages.length % 3]} ${rowLabelFromIndex(ri)}${cages.length + 1}`, customer, color: CAGE_COLORS[cages.length % CAGE_COLORS.length], type: ['cage', 'suite', 'pod'][cages.length % 3], notes: '' };
          cages.push(cage);
        }
        row.slice(i, i + len).forEach(r => { r.customer = customer; if (cage) r.cageId = cage.id; });
        i += len + 1 + Math.floor(rng() * 3);
      }
    }
  } else {
    const cage = { id: `${def.id}-cg1`, siteId: def.id, floorId: floors[0].id, name: 'Secure Zone', customer: 'Security Ops', color: CAGE_COLORS[4], type: 'zone', notes: 'Restricted access' };
    cages.push(cage);
    racks.filter(r => r.row === 'B').slice(2, 7).forEach(r => { r.cageId = cage.id; r.customer = 'Security Ops'; });
  }
  recomputeSite(site);
  return site;
}

/* ==========================================================
   DATA LAYER (live Supabase or in-memory demo)
   ========================================================== */
async function fetchAllRows(table) {
  const size = 1000; let from = 0, all = [];
  for (;;) {
    const { data, error } = await sb.from(table).select('*').range(from, from + size - 1);
    if (error) return { data: null, error };
    all = all.concat(data || []);
    if (!data || data.length < size) break;
    from += size;
  }
  return { data: all, error: null };
}
async function loadData() {
  if (!LIVE) { SITES = SITE_DEFS.map(generateSite); reindex(); state.ready = true; return; }
  const [s, r, d, f, p, c] = await Promise.all(['sites', 'racks', 'devices', 'floors', 'pdf_breakers', 'cages'].map(fetchAllRows));
  if (s.error || r.error || d.error || f.error) { toast('Failed to load data from Supabase. Check the console.', true); console.error(s.error || r.error || d.error || f.error); SITES = []; state.ready = true; return; }
  if (p.error) console.warn('pdf_breakers:', p.error.message);
  state.cagesEnabled = !c.error;
  if (c.error) console.warn('cages table not available (run migration_v2.sql):', c.error.message);
  const devByRack = new Map();
  (d.data || []).forEach(x => { if (!devByRack.has(x.rack_id)) devByRack.set(x.rack_id, []); devByRack.get(x.rack_id).push(x); });
  SITES = (s.data || []).map(row => {
    const floors = (f.data || []).filter(x => x.site_id === row.id).map(x => ({ id: x.id, name: x.name, position: Number(x.position || 1) })).sort((a, b) => a.position - b.position);
    const racks = (r.data || []).filter(x => x.site_id === row.id).map(x => ({
      id: x.name || x.id || '', uuid: x.id, row: x.row_label || '', position: Number(x.position || 0),
      capacityKva: Number(x.capacity_kva), actualKva: Number(x.actual_kva || 0), circuitBreaker: x.circuit_breaker || null,
      customer: x.customer || null, activationDate: x.activation_date || null, floorId: x.floor_id || null, cageId: x.cage_id || null,
      devices: (devByRack.get(x.id) || []).map(v => ({ id: v.id, startU: v.start_u, sizeU: v.size_u, model: v.model, serialNumber: v.serial_number || '', datasheetKva: Number(v.datasheet_kva), authorizedPerson: v.authorized_person })),
      history: [],
    }));
    const cages = ((c.data) || []).filter(x => x.site_id === row.id).map(x => ({ id: x.id, siteId: x.site_id, floorId: x.floor_id || null, name: x.name, customer: x.customer || '', color: x.color || CAGE_COLORS[0], type: x.type || 'cage', notes: x.notes || '' }));
    const site = {
      id: row.id, name: row.name, location: row.location, tier: row.tier, pue: Number(row.pue), category: row.category || 'colo',
      commissionedDate: row.commissioned_date || '',
      hvacUnits: row.hvac_units != null ? Number(row.hvac_units) : null, hvacTrPerUnit: row.hvac_tr_per_unit != null ? Number(row.hvac_tr_per_unit) : null,
      upsUnits: row.ups_units != null ? Number(row.ups_units) : null, upsKvaPerUnit: row.ups_kva_per_unit != null ? Number(row.ups_kva_per_unit) : null,
      generatorUnits: row.generator_units != null ? Number(row.generator_units) : null, generatorKvaPerUnit: row.generator_kva_per_unit != null ? Number(row.generator_kva_per_unit) : null,
      floors, racks, cages, pdfBreakers: (p.data || []).filter(x => x.site_id === row.id),
    };
    recomputeSite(site);
    return site;
  });
  reindex();
  state.ready = true;
}

function demoHistory(rack, type, detail) { rack.history.unshift({ event_type: type, detail, performed_by_email: 'demo@opmg.local', created_at: new Date().toISOString() }); }
const uid = p => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ----- devices ----- */
function validateDevice(rack, v, excludeId) {
  if (!v.model) return 'Model is required.';
  if (!v.person) return 'Authorized person is required.';
  if (!(Number.isInteger(v.sizeU) && v.sizeU >= 1 && v.sizeU <= 42)) return 'Size must be a whole number from 1 to 42 U.';
  if (!(v.kva > 0)) return 'Datasheet kVA must be greater than 0.';
  if (!(Number.isInteger(v.startU) && v.startU >= 1)) return 'Start U must be a whole number.';
  if (v.startU + v.sizeU - 1 > 42) return `U${v.startU}-${v.startU + v.sizeU - 1} goes past U42.`;
  if (!slotFree(rack, v.startU, v.sizeU, excludeId)) return `U${v.startU}${v.sizeU > 1 ? '-' + (v.startU + v.sizeU - 1) : ''} overlaps another device in ${rack.id}.`;
  return null;
}
async function addDevice(site, rack, v) {
  const err = validateDevice(rack, v); if (err) return { error: err };
  let id;
  if (LIVE) {
    const { data, error } = await sb.from('devices').insert({ rack_id: rkey(rack), start_u: v.startU, size_u: v.sizeU, model: v.model, serial_number: v.serial, datasheet_kva: v.kva, authorized_person: v.person, created_by: state.user.id }).select().single();
    if (error) return { error: error.message };
    id = data.id;
  } else { id = uid('dev'); demoHistory(rack, 'device_added', `${v.model} (SN ${v.serial}) rated ${v.kva} kVA (U${v.startU})`); }
  rack.devices.push({ id, startU: v.startU, sizeU: v.sizeU, model: v.model, serialNumber: v.serial, datasheetKva: v.kva, authorizedPerson: v.person });
  recomputeSite(site); return { ok: true };
}
async function editDevice(site, rack, dev, v) {
  const err = validateDevice(rack, v, dev.id); if (err) return { error: err };
  if (LIVE) {
    const { error } = await sb.from('devices').update({ start_u: v.startU, size_u: v.sizeU, model: v.model, serial_number: v.serial, datasheet_kva: v.kva, authorized_person: v.person }).eq('id', dev.id);
    if (error) return { error: error.message };
  } else demoHistory(rack, 'device_edited', `${dev.model} updated`);
  Object.assign(dev, { startU: v.startU, sizeU: v.sizeU, model: v.model, serialNumber: v.serial, datasheetKva: v.kva, authorizedPerson: v.person });
  recomputeSite(site); return { ok: true };
}
async function removeDevice(site, rack, dev) {
  if (LIVE) { const { error } = await sb.from('devices').delete().eq('id', dev.id); if (error) return { error: error.message }; }
  else demoHistory(rack, 'device_removed', `${dev.model} (SN ${dev.serialNumber})`);
  rack.devices = rack.devices.filter(d => d.id !== dev.id);
  recomputeSite(site); return { ok: true };
}

/* ----- racks ----- */
async function updateRack(site, rack, patch) {
  /* patch uses UI field names; returns {ok}|{error} */
  const db = {}; const map = { capacityKva: 'capacity_kva', actualKva: 'actual_kva', circuitBreaker: 'circuit_breaker', customer: 'customer', activationDate: 'activation_date', row: 'row_label', position: 'position', cageId: 'cage_id', floorId: 'floor_id', id: 'name' };
  for (const [k, v] of Object.entries(patch)) db[map[k]] = (v === '' ? null : v);
  if (patch.id && patch.id !== rack.id && RACK_INDEX.has(patch.id) === false && SITES.some(s => s.racks.some(r => r.id === patch.id))) return { error: `Rack name "${patch.id}" is already in use.` };
  if (LIVE) {
    if (!db.name && 'name' in db) delete db.name;
    const { error } = await sb.from('racks').update(db).eq('id', rkey(rack));
    if (error) return { error: error.message };
  } else {
    if ('capacityKva' in patch && patch.capacityKva !== rack.capacityKva) demoHistory(rack, 'capacity_changed', `${rack.capacityKva} kVA -> ${patch.capacityKva} kVA`);
    if ('actualKva' in patch && patch.actualKva !== rack.actualKva) demoHistory(rack, 'actual_changed', `${rack.actualKva} kVA -> ${patch.actualKva} kVA`);
    if ('customer' in patch && (patch.customer || null) !== rack.customer) demoHistory(rack, 'customer_changed', `${rack.customer || '—'} -> ${patch.customer || '—'}`);
  }
  const oldKey = rkey(rack);
  Object.keys(patch).forEach(k => { rack[k] = patch[k] === '' ? null : patch[k]; });
  if (patch.row !== undefined) rack.row = patch.row;
  recomputeSite(site); reindex();
  return { ok: true, oldKey };
}
async function addRack(site, { name, row, capacityKva, circuitBreaker, floorId }) {
  if (SITES.some(s => s.racks.some(r => r.id === name))) return { error: `Rack name "${name}" is already in use.` };
  const sib = site.racks.filter(r => r.row === row);
  const position = sib.length ? Math.max(...sib.map(r => r.position || 0)) + 1 : 0;
  const fl = floorId || (site.floors[0] && site.floors[0].id) || null;
  let uuid = null;
  if (LIVE) {
    const { data, error } = await sb.from('racks').insert({ name, site_id: site.id, row_label: row, position, capacity_kva: capacityKva, actual_kva: 0, circuit_breaker: circuitBreaker || null, floor_id: fl }).select().single();
    if (error) return { error: error.message };
    uuid = data.id;
  }
  const rack = { id: name, uuid, row, position, capacityKva, actualKva: 0, circuitBreaker: circuitBreaker || null, customer: null, activationDate: null, floorId: fl, cageId: null, devices: [], history: [] };
  site.racks.push(rack); recomputeSite(site); reindex();
  return { ok: true, rack };
}
async function removeRack(site, rack) {
  if (LIVE) { const { error } = await sb.from('racks').delete().eq('id', rkey(rack)); if (error) return { error: error.message }; }
  site.racks = site.racks.filter(r => r !== rack); recomputeSite(site); reindex(); return { ok: true };
}
/* shift a rack one slot within its row (swap positions with the neighbour) */
async function nudgeRack(site, rack, dir) {
  const lane = site.racks.filter(r => r.row === rack.row && r.floorId === rack.floorId).sort((a, b) => a.position - b.position);
  const i = lane.indexOf(rack), j = i + dir;
  if (j < 0 || j >= lane.length) return { error: 'Already at the end of the row.' };
  const other = lane[j];
  const pa = rack.position, pb = other.position;
  const ordered = lane.slice(); ordered[i] = other; ordered[j] = rack;
  return await renumberLane(site, ordered);
}
async function renumberLane(site, ordered) {
  const changes = [];
  ordered.forEach((r, idx) => { if (r.position !== idx) changes.push([r, idx]); });
  if (LIVE) {
    const res = await Promise.all(changes.map(([r, idx]) => sb.from('racks').update({ position: idx }).eq('id', rkey(r))));
    const bad = res.find(x => x.error); if (bad) return { error: bad.error.message };
  }
  changes.forEach(([r, idx]) => { r.position = idx; });
  return { ok: true };
}
/* place a rack at an index in a (row, floor) lane, optionally joining a cage — used by drag & drop */
async function placeRack(site, rack, { row, floorId, index, cageId = null }) {
  row = row || ''; floorId = floorId || null; cageId = cageId || null;
  const sameLane = r => String(r.row || '') === String(row) && String(r.floorId || '') === String(floorId || '');
  const oldRow = rack.row, oldFloor = rack.floorId;
  const laneChanged = String(oldRow || '') !== String(row) || String(oldFloor || '') !== String(floorId || '');
  const cageChanged = (rack.cageId || null) !== cageId;
  if (LIVE && (laneChanged || cageChanged)) {
    /* omit cage_id when the cages migration has not been run, so a plain
       row move still works on a database without that column */
    const upd = { row_label: row, floor_id: floorId };
    if (state.cagesEnabled) upd.cage_id = cageId;
    const { error } = await sb.from('racks').update(upd).eq('id', rkey(rack));
    if (error) return { error: error.message };
  }
  if (!LIVE && (laneChanged || cageChanged)) demoHistory(rack, 'rack_moved', `Moved to row ${row || '—'}${cageId ? ' (in a cage)' : ''}`);
  rack.row = row; rack.floorId = floorId; rack.cageId = cageId;
  const lane = site.racks.filter(r => r !== rack && sameLane(r)).sort((a, b) => a.position - b.position);
  lane.splice(clamp(index, 0, lane.length), 0, rack);
  let res = await renumberLane(site, lane);
  if (res.error) return res;
  if (laneChanged) {
    const old = site.racks.filter(r => r !== rack && String(r.row || '') === String(oldRow || '') && String(r.floorId || '') === String(oldFloor || '')).sort((a, b) => a.position - b.position);
    res = await renumberLane(site, old);
    if (res.error) return res;
  }
  recomputeSite(site);
  return { ok: true };
}

/* ----- sites / floors ----- */
const slugBase = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);
async function createSite({ name, location, tier, pue, rackCount, rowCount, capacityKva, category, code }) {
  const base = slugBase(code) || slugBase(name);
  if (!base) return { error: 'Enter a site code using English letters or numbers (used in rack names).' };
  let id = base, n = 1; while (SITES.some(s => s.id === id)) id = `${base}-${++n}`;
  const per = Math.max(1, Math.ceil(rackCount / rowCount));
  let floorId = id + '-f1';
  if (LIVE) {
    const { error } = await sb.from('sites').insert({ id, name, location, tier, pue, category, type: category });
    if (error) return { error: error.message };
    const fl = await sb.from('floors').insert({ site_id: id, name: 'Floor 1', position: 1 }).select().single();
    if (fl.error) { await sb.from('sites').delete().eq('id', id); return { error: fl.error.message }; }
    floorId = fl.data.id;
  }
  const defs = [];
  for (let i = 0; i < rackCount; i++) { const ri = Math.floor(i / per); defs.push({ name: `${id.toUpperCase()}-${rowLabelFromIndex(ri)}${String((i % per) + 1).padStart(2, '0')}`, row: rowLabelFromIndex(ri), position: i % per }); }
  let inserted = [];
  if (LIVE) {
    for (let i = 0; i < defs.length; i += 500) {
      const { data, error } = await sb.from('racks').insert(defs.slice(i, i + 500).map(d => ({ name: d.name, site_id: id, row_label: d.row, position: d.position, capacity_kva: capacityKva, actual_kva: 0, floor_id: floorId }))).select();
      if (error) { await sb.from('racks').delete().eq('site_id', id); await sb.from('floors').delete().eq('site_id', id); await sb.from('sites').delete().eq('id', id); return { error: error.message + ' Nothing was saved.' }; }
      inserted = inserted.concat(data);
    }
  }
  const racks = defs.map((d, i) => ({ id: d.name, uuid: LIVE ? inserted[i].id : null, row: d.row, position: d.position, capacityKva, actualKva: 0, circuitBreaker: null, customer: null, activationDate: null, floorId, cageId: null, devices: [], history: [] }));
  const site = { id, name, location, tier, pue, category, commissionedDate: '', hvacUnits: null, hvacTrPerUnit: null, upsUnits: null, upsKvaPerUnit: null, generatorUnits: null, generatorKvaPerUnit: null, floors: [{ id: floorId, name: 'Floor 1', position: 1 }], racks, cages: [], pdfBreakers: [] };
  recomputeSite(site); SITES.push(site); reindex();
  return { ok: true, site };
}
async function removeSite(site) {
  if (LIVE) { const { error } = await sb.from('sites').delete().eq('id', site.id); if (error) return { error: error.message }; }
  SITES = SITES.filter(s => s !== site); reindex(); return { ok: true };
}
async function addFloor(site, name) {
  const position = Math.max(0, ...site.floors.map(f => f.position)) + 1;
  let id = uid('floor');
  if (LIVE) { const { data, error } = await sb.from('floors').insert({ site_id: site.id, name, position }).select().single(); if (error) return { error: error.message }; id = data.id; }
  site.floors.push({ id, name, position }); return { ok: true, id };
}
const SPEC_FIELDS = {
  name: { col: 'name', label: 'Name', type: 'text', req: true },
  location: { col: 'location', label: 'Location', type: 'text' },
  tier: { col: 'tier', label: 'Tier', type: 'select', options: ['Tier I', 'Tier II', 'Tier III', 'Tier IV'] },
  pue: { col: 'pue', label: 'PUE', type: 'number', min: 1, step: 0.01, req: true },
  category: { col: 'category', label: 'Category', type: 'select', options: ['colo', 'inhouse'] },
  commissionedDate: { col: 'commissioned_date', label: 'Commissioned', type: 'date' },
  hvacUnits: { col: 'hvac_units', label: 'HVAC units', type: 'number', min: 0, step: 1, int: true },
  hvacTrPerUnit: { col: 'hvac_tr_per_unit', label: 'HVAC TR per unit', type: 'number', min: 0, step: 0.1 },
  upsUnits: { col: 'ups_units', label: 'UPS units', type: 'number', min: 0, step: 1, int: true },
  upsKvaPerUnit: { col: 'ups_kva_per_unit', label: 'UPS kVA per unit', type: 'number', min: 0, step: 1 },
  generatorUnits: { col: 'generator_units', label: 'Generator units', type: 'number', min: 0, step: 1, int: true },
  generatorKvaPerUnit: { col: 'generator_kva_per_unit', label: 'Generator kVA per unit', type: 'number', min: 0, step: 1 },
};
async function updateSiteField(site, key, raw) {
  const f = SPEC_FIELDS[key]; if (!f) return { error: 'Unknown field.' };
  let v = raw;
  if (f.type === 'number') {
    if (raw === '' || raw == null) { if (f.req) return { error: `${f.label} is required.` }; v = null; }
    else { v = f.int ? parseInt(raw, 10) : parseFloat(raw); if (isNaN(v) || v < (f.min ?? -Infinity)) return { error: `${f.label} must be a number ≥ ${f.min ?? 0}.` }; }
  } else if (f.type === 'text') { v = String(raw).trim(); if (f.req && !v) return { error: `${f.label} is required.` }; }
  else if (f.type === 'date') v = raw || null;
  const patch = { [f.col]: v }; if (key === 'category') patch.type = v;
  if (LIVE) { const { error } = await sb.from('sites').update(patch).eq('id', site.id); if (error) return { error: error.message }; }
  site[key] = v == null && f.type === 'date' ? '' : v; recomputeSite(site); return { ok: true };
}

/* ----- cages ----- */
async function saveCage(site, cage, data) {
  /* cage null => create. returns {ok,cage} */
  if (!state.cagesEnabled) return { error: 'Cages need the database upgrade: run migration_v2.sql in the Supabase SQL editor once.' };
  const row = { site_id: site.id, floor_id: data.floorId || null, name: data.name, customer: data.customer || null, color: data.color, type: data.type, notes: data.notes || null };
  if (cage) {
    if (LIVE) { const { error } = await sb.from('cages').update(row).eq('id', cage.id); if (error) return { error: error.message }; }
    Object.assign(cage, { floorId: row.floor_id, name: data.name, customer: data.customer || '', color: data.color, type: data.type, notes: data.notes || '' });
    return { ok: true, cage };
  }
  let id = uid('cage');
  if (LIVE) { const { data: d, error } = await sb.from('cages').insert(row).select().single(); if (error) return { error: error.message }; id = d.id; }
  const c = { id, siteId: site.id, floorId: row.floor_id, name: data.name, customer: data.customer || '', color: data.color, type: data.type, notes: data.notes || '' };
  site.cages.push(c); return { ok: true, cage: c };
}
async function deleteCage(site, cage) {
  if (LIVE) { const { error } = await sb.from('cages').delete().eq('id', cage.id); if (error) return { error: error.message }; }
  site.racks.forEach(r => { if (r.cageId === cage.id) r.cageId = null; });
  site.cages = site.cages.filter(c => c !== cage); return { ok: true };
}
/* put racks in a cage (cage may be null = remove). Packs them next to each other within each row and optionally sets customer. */
async function assignRacksToCage(site, racks, cage, { pack = true, setCustomer = false } = {}) {
  if (!state.cagesEnabled) return { error: 'Cages need the database upgrade: run migration_v2.sql in the Supabase SQL editor once.' };
  const ids = racks.map(r => rkey(r));
  const patch = { cage_id: cage ? cage.id : null };
  if (setCustomer && cage && cage.customer) patch.customer = cage.customer;
  if (LIVE && ids.length) {
    const { error } = await sb.from('racks').update(patch).in('id', ids);
    if (error) return { error: error.message };
  }
  racks.forEach(r => { r.cageId = cage ? cage.id : null; if (patch.customer) r.customer = patch.customer; });
  if (cage && pack) {
    const rows = new Set(racks.map(r => r.row + '|' + r.floorId));
    for (const k of rows) {
      const [row, fl] = k.split('|');
      const lane = site.racks.filter(r => r.row === row && String(r.floorId) === fl).sort((a, b) => a.position - b.position);
      const sel = lane.filter(r => racks.includes(r));
      const firstIdx = lane.indexOf(sel[0]);
      const rest = lane.filter(r => !racks.includes(r));
      const before = rest.slice(0, firstIdx), after = rest.slice(firstIdx);
      const res = await renumberLane(site, [...before, ...sel, ...after]);
      if (res.error) return res;
    }
  }
  recomputeSite(site); return { ok: true };
}

/* ----- history ----- */
async function loadRackHistory(rack) {
  if (!LIVE) return rack.history || [];
  const since = new Date(Date.now() - 183 * 864e5).toISOString();
  const { data, error } = await sb.from('rack_events').select('*').eq('rack_id', rkey(rack)).gte('created_at', since).order('created_at', { ascending: false }).limit(500);
  return error ? [] : data;
}

/* ----- users ----- */
async function fetchUserManagerData() {
  const [a, b] = await Promise.all([sb.from('profiles').select('*').order('created_at'), sb.from('site_assignments').select('*')]);
  if (a.error) return { error: a.error.message };
  return { ok: true, profiles: a.data || [], assignments: b.data || [] };
}
async function setUserApproved(id, approved) { const { error } = await sb.from('profiles').update({ approved }).eq('id', id); return error ? { error: error.message } : { ok: true }; }
async function setUserRole(id, role) { const { error } = await sb.from('profiles').update({ role }).eq('id', id); return error ? { error: error.message } : { ok: true }; }
async function setSiteAssignment(userId, siteId, assign) {
  const q = assign ? sb.from('site_assignments').insert({ user_id: userId, site_id: siteId, assigned_by: state.user.id }) : sb.from('site_assignments').delete().eq('user_id', userId).eq('site_id', siteId);
  const { error } = await q; return error ? { error: error.message } : { ok: true };
}

/* ----- auth ----- */
async function initAuth() {
  if (!LIVE) { state.user = { id: 'demo', email: 'demo@opmg.local' }; state.role = 'admin'; state.approved = true; await loadData(); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onSignedIn(session.user); else state.ready = true;
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { state.user = null; state.role = null; state.approved = false; state.categoryPicked = false; SITES = []; reindex(); location.hash = '#/'; renderAll(); } });
}
async function onSignedIn(user) {
  state.user = user;
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  state.role = profile ? profile.role : 'technician';
  state.approved = profile ? !!profile.approved : false;
  if (state.approved) await loadData(); else state.ready = true;
  renderAll();
}
async function signIn(email, password) { const { data, error } = await sb.auth.signInWithPassword({ email, password }); if (error) { state.authError = error.message; renderAll(); return; } state.authError = null; await onSignedIn(data.user); }
async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) { state.authError = error.message; renderAll(); return; }
  if (data.session) { await onSignedIn(data.user); return; }
  state.authMode = 'signin'; state.authError = null; toast('Account created. Confirm your email, then sign in. An admin must approve your account before you can see any data.'); renderAll();
}
async function signOut() { if (LIVE) await sb.auth.signOut(); else location.reload(); }
async function recheckApproval() {
  const { data: p } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
  state.role = p ? p.role : 'technician'; state.approved = p ? !!p.approved : false;
  if (state.approved) await loadData();
  renderAll();
}

/* ==========================================================
   DEVICE IMPORT (Excel / CSV)
   ========================================================== */
const IMPORT_LABELS = { rack: 'Rack ID', model: 'Model', sizeU: 'Size (U)', startU: 'Start U', serial: 'Serial Number', person: 'Authorized Person', kva: 'Datasheet kVA' };
const IMPORT_ALIASES = {
  rack: ['rackid', 'rack', 'rackname', 'rackno', 'racknumber'],
  model: ['model', 'devicemodel', 'device', 'devicetype', 'equipment'],
  sizeU: ['sizeu', 'size', 'usize', 'height', 'heightu', 'units'],
  startU: ['startu', 'start', 'startposition', 'startingu', 'ustart', 'position', 'positionu'],
  serial: ['serialnumber', 'serial', 'serialno', 'sn', 'serialnum'],
  person: ['authorizedperson', 'authorisedperson', 'person', 'owner', 'responsible', 'authorized', 'contact'],
  kva: ['datasheetkva', 'kva', 'ratedkva', 'datasheet', 'datasheetconsumptionkva', 'consumptionkva', 'powerkva', 'datasheetconsumption'],
};
const normHeader = h => String(h == null ? '' : h).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
function importNum(v) { if (typeof v === 'number') return v; let t = String(v == null ? '' : v).trim().replace(/\s+/g, ''); if (t === '') return null; if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.'); const n = Number(t); return isFinite(n) ? n : NaN; }
function extractImportRows(aoa) {
  let hi = -1, map = null;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const m = {};
    (aoa[i] || []).forEach((cell, ci) => { const n = normHeader(cell); for (const [k, list] of Object.entries(IMPORT_ALIASES)) if (m[k] === undefined && list.includes(n)) m[k] = ci; });
    if (m.rack !== undefined && m.model !== undefined) { hi = i; map = m; break; }
  }
  if (hi < 0) return { error: 'Could not find the header row. Use the template (needs at least "Rack ID" and "Model").' };
  const missing = ['rack', 'model', 'sizeU', 'serial', 'person', 'kva'].filter(k => map[k] === undefined);
  if (missing.length) return { error: `Missing column(s): ${missing.map(k => IMPORT_LABELS[k]).join(', ')}.` };
  const rows = [];
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i] || []; const g = k => map[k] === undefined ? '' : r[map[k]];
    const cells = ['rack', 'model', 'sizeU', 'startU', 'serial', 'person', 'kva'].map(k => String(g(k) == null ? '' : g(k)).trim());
    if (cells.every(c => c === '')) continue;
    rows.push({ rowNum: i + 1, rack: cells[0], model: cells[1], sizeU: importNum(g('sizeU')), startU: importNum(g('startU')), serial: cells[4], person: cells[5], kva: importNum(g('kva')) });
  }
  return { rows };
}
function validateImportRows(site, rows) {
  const byName = new Map(site.racks.map(r => [String(r.id).trim().toLowerCase(), r]));
  const placed = new Map(); const have = new Set(); const seen = new Set();
  site.racks.forEach(r => r.devices.forEach(d => { if (d.serialNumber) have.add(d.serialNumber.toLowerCase()); }));
  return rows.map(row => {
    const errors = [], warnings = []; let rack = null, start = null;
    if (!row.rack) errors.push('Rack ID is empty'); else { rack = byName.get(row.rack.toLowerCase()) || null; if (!rack) errors.push(`Rack "${row.rack}" not found in ${site.name}`); }
    if (!row.model) errors.push('Model is empty'); if (!row.serial) errors.push('Serial is empty'); if (!row.person) errors.push('Authorized person is empty');
    const sizeOk = Number.isInteger(row.sizeU) && row.sizeU >= 1 && row.sizeU <= 42;
    if (!sizeOk) errors.push('Size (U) must be 1 to 42');
    if (!(typeof row.kva === 'number' && row.kva > 0)) errors.push('kVA must be greater than 0');
    const wants = row.startU !== null && row.startU !== undefined;
    if (wants && !(Number.isInteger(row.startU) && row.startU >= 1 && row.startU <= 42)) errors.push('Start U must be 1 to 42');
    if (rack && sizeOk && !errors.length) {
      if (!placed.has(rack)) placed.set(rack, []);
      const list = placed.get(rack);
      const proxy = { devices: [...rack.devices, ...list.map((p, i) => ({ id: 'imp' + i, startU: p.startU, sizeU: p.sizeU }))] };
      if (wants) { if (!slotFree(proxy, row.startU, row.sizeU)) errors.push(`U${row.startU} overlaps or passes U42 in ${rack.id}`); else start = row.startU; }
      else { const f = findFreeSlot(proxy, row.sizeU); if (f === null) errors.push(`${rack.id} has no ${row.sizeU}U free`); else start = f; }
      if (!errors.length) list.push({ startU: start, sizeU: row.sizeU });
    }
    if (row.serial) { const k = row.serial.toLowerCase(); if (have.has(k)) warnings.push('Serial already exists in this site'); else if (seen.has(k)) warnings.push('Serial appears twice in the file'); seen.add(k); }
    return { ...row, rackObj: rack, start, errors, warnings, ok: !errors.length };
  });
}
async function importDevices(site, rows) {
  const recs = rows.map(r => ({ rack_id: rkey(r.rackObj), start_u: r.start, size_u: r.sizeU, model: r.model, serial_number: r.serial, datasheet_kva: r.kva, authorized_person: r.person, created_by: state.user && state.user.id }));
  let ids = [];
  if (LIVE) {
    const done = [];
    for (let i = 0; i < recs.length; i += 200) {
      const { data, error } = await sb.from('devices').insert(recs.slice(i, i + 200)).select('id');
      if (error) { if (done.length) await sb.from('devices').delete().in('id', done); return { error: `Import stopped (${error.message}). Nothing was added.` }; }
      data.forEach(d => { done.push(d.id); ids.push(d.id); });
    }
  }
  rows.forEach((r, i) => r.rackObj.devices.push({ id: LIVE ? ids[i] : uid('dev'), startU: r.start, sizeU: r.sizeU, model: r.model, serialNumber: r.serial, datasheetKva: r.kva, authorizedPerson: r.person }));
  recomputeSite(site); return { ok: true, count: rows.length };
}

/* ---------- toast (shared) ---------- */
let toastTimer;
function toast(msg, isErr) {
  let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = 'toast show' + (isErr ? ' err' : ''); el.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), isErr ? 6000 : 3200);
}
