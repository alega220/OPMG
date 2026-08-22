/* ==================================================================
   FACILITY OPS — app.js
   Runs in DEMO MODE (mock data, no login) when config.js is blank,
   or LIVE MODE (Supabase auth + persistence) when SUPABASE_URL /
   SUPABASE_ANON_KEY are filled in.
================================================================== */

const LIVE = Boolean(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
const sb = LIVE ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;

/* ---------------------------------------------------------------
   SEEDED RNG + MOCK DATA (demo mode, and used to seed a live DB)
--------------------------------------------------------------- */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ seed>>>15, 1 | seed);
    t = (t + Math.imul(t ^ t>>>7, 61 | t)) ^ t;
    return ((t ^ t>>>14) >>> 0) / 4294967296;
  };
}
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++) h=(Math.imul(31,h)+s.charCodeAt(i))|0; return h; }
function rand(rng,min,max){ return min + rng()*(max-min); }
function pick(rng,arr){ return arr[Math.floor(rng()*arr.length)]; }

const DEVICE_TYPES = [
  {name:"GPU Compute Node", size:4, min:3.8, max:6.6},
  {name:"Rack Server 1U", size:1, min:0.35, max:0.75},
  {name:"Rack Server 2U", size:2, min:0.7, max:1.3},
  {name:"Blade Chassis", size:10, min:8.5, max:13.2},
  {name:"Storage Array", size:4, min:1.1, max:2.3},
  {name:"ToR Switch", size:1, min:0.15, max:0.35},
  {name:"Core/Spine Switch", size:2, min:0.4, max:0.85},
  {name:"Firewall Appliance", size:1, min:0.2, max:0.45},
  {name:"KVM Console", size:1, min:0.04, max:0.09},
];
const PEOPLE = [
  "A. Hassan — Network Ops","M. Youssef — Server Team","S. Ali — Storage Team",
  "R. Nasser — DBA Team","K. Farouk — Virtualization","H. Sami — Security Ops",
  "O. Tarek — Vendor Contractor","N. Adel — Facilities",
];
const SITE_DEFS = [
  {id:"b90",name:"B90",location:"Cairo — Bldg 90",tier:"Tier III",rackCount:195,caps:[5,8,10,15]},
  {id:"a12",name:"A12",location:"Cairo — Bldg 12",tier:"Tier III",rackCount:96,caps:[5,8,10]},
  {id:"c77",name:"C77",location:"Alexandria — Bldg 77",tier:"Tier II",rackCount:60,caps:[4,6,8]},
  {id:"d40",name:"D40",location:"6th of October — Bldg 40",tier:"Tier IV",rackCount:132,caps:[8,10,15,20]},
];

function genSerial(rng){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'SN-';
  for(let i=0;i<7;i++) s += chars[Math.floor(rng()*chars.length)];
  return s;
}

function generateRack(rng, siteId, idx, caps, rowLen){
  const capacityKva = pick(rng, caps);
  const targetUtil = rand(rng, 0.28, 0.97);
  const targetPower = capacityKva * targetUtil;
  let curU=1, curPower=0, guard=0;
  const devices=[];
  while(curU<=42 && curPower<targetPower && guard<60){
    guard++;
    let t = pick(rng, DEVICE_TYPES);
    if(curU + t.size - 1 > 42){
      const small = DEVICE_TYPES.filter(d=>d.size<=42-curU+1);
      if(small.length===0) break;
      t = pick(rng, small);
    }
    const power = rand(rng, t.min, t.max);
    if(curPower + power > capacityKva*1.03) break;
    devices.push({id:`demo-${siteId}-${idx}-${devices.length}`, startU:curU, sizeU:t.size, model:t.name, serialNumber:genSerial(rng), datasheetKva:power*rand(rng,1.25,1.7), authorizedPerson:pick(rng,PEOPLE)});
    curU += t.size; curPower += power;
  }
  const row = String.fromCharCode(65 + Math.floor((idx-1)/rowLen));
  const position = (idx-1) % rowLen;
  return { id:`${siteId.toUpperCase()}-R${String(idx).padStart(3,"0")}`, row, position, capacityKva, actualKva:Math.round(curPower*100)/100, circuitBreaker:null, devices };
}
function generateSite(def){
  const rng = mulberry32(hashStr(def.id) ^ 0x9E3779B9);
  const rowLen = 15;
  const racks=[];
  for(let i=1;i<=def.rackCount;i++) racks.push(generateRack(rng, def.id, i, def.caps, rowLen));
  const pue = rand(rng,1.28,1.55);
  const site = {...def, racks, pue};
  racks.forEach(recomputeRack);
  recomputeSite(site);
  return site;
}

/* ---------------------------------------------------------------
   AGGREGATE HELPERS (shared by demo + live)
--------------------------------------------------------------- */
function recomputeRack(rack){
  // rack.actualKva is a directly-entered measured value (e.g. from a PDU reading),
  // not derived from devices — only totalDatasheetKva (sum of device ratings) and
  // occupiedU are computed here.
  rack.totalDatasheetKva = rack.devices.reduce((s,d)=>s+d.datasheetKva,0);
  rack.occupiedU = rack.devices.reduce((s,d)=>s+d.sizeU,0);
}
function recomputeSite(site){
  site.itLoadKva = site.racks.reduce((s,r)=>s+(r.actualKva||0),0);
  site.utilityLoadKva = site.itLoadKva * site.pue;
  site.totalCapacityKva = site.racks.reduce((s,r)=>s+r.capacityKva,0);
  site.utilizationPct = site.totalCapacityKva>0 ? site.itLoadKva / site.totalCapacityKva : 0;
}
function findFreeSlot(rack, sizeU, excludeDeviceId){
  const occupied = new Array(43).fill(false);
  rack.devices.forEach(d=>{ if(d.id===excludeDeviceId) return; for(let u=d.startU; u<d.startU+d.sizeU; u++) occupied[u]=true; });
  let runStart=1, run=0;
  for(let u=1; u<=42; u++){
    if(!occupied[u]){ if(run===0) runStart=u; run++; if(run>=sizeU) return runStart; }
    else run=0;
  }
  return null;
}
const fmtKva = (n,d=1)=> `${(n||0).toFixed(d)} kVA`;
const fmtPct = (n,d=0)=> `${((n||0)*100).toFixed(d)}%`;
function statusColor(pct){ if(pct>=0.9) return 'red'; if(pct>=0.75) return 'amber'; return 'green'; }
function statusHex(pct){ if(pct>=0.9) return '#D6373C'; if(pct>=0.75) return '#C9821A'; return '#1FA97A'; }
function statusLabel(pct){ if(pct>=0.9) return 'Critical'; if(pct>=0.75) return 'Warning'; return 'Normal'; }
function densityColor(kwPerU){
  const t = Math.max(0, Math.min(1, kwPerU/2.2));
  let r,g,b;
  if(t<0.5){ const k=t/0.5; r=Math.round(124+k*(200-124)); g=Math.round(92+k*(140-92)); b=Math.round(227+k*(20-227)); }
  else { const k=(t-0.5)/0.5; r=Math.round(200+k*(214-200)); g=Math.round(140+k*(55-140)); b=Math.round(20+k*(60-20)); }
  return `rgb(${r},${g},${b})`;
}
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function gaugeSvg(pct, size=62){
  const r = size/2-5, c=2*Math.PI*r, clamped=Math.max(0,Math.min(1,pct)), color=statusHex(pct);
  return `<svg width="${size}" height="${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#EDEFF2" stroke-width="5"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${c*clamped} ${c}" transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" fill="#15181F" font-size="${size*0.22}" font-family="IBM Plex Mono" font-weight="600">${Math.round(pct*100)}%</text>
  </svg>`;
}
function showToast(msg, isError){
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : ''); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2800);
}

/* ---------------------------------------------------------------
   GLOBAL STATE
--------------------------------------------------------------- */
let SITES = [];
const state = {
  ready:false, user:null, role: LIVE ? null : 'manager',
  view:'dashboard', siteId:null, siteSub:'floor', search:'', sort:'name',
  modalType:null, modalRack:null, modalSiteId:null, rackFace:'front',
  addDeviceSiteId:null, addDeviceError:null,
  editingCapacity:false, capacityError:null,
  editingRackName:false, rackNameError:null,
  addSiteError:null,
  editSiteId:null, editSiteError:null,
  addRackSiteId:null, addRackError:null,
  editDeviceId:null, editDeviceRackId:null, editDeviceSiteId:null, editDeviceError:null,
  historyRack:null, historySiteId:null, historyEvents:null, historyLoading:false,
  authMode:'signin', authError:null,
};
// managers AND admins can add/remove sites, racks, and devices; edit rack capacity/position/name
function isManager(){ return state.role === 'manager' || state.role === 'admin'; }
// kept for possible future use — not currently required by any permission check
function isAdmin(){ return state.role === 'admin'; }

/* ---------------------------------------------------------------
   DATA LAYER — demo vs live
--------------------------------------------------------------- */
async function loadData(){
  if(!LIVE){
    SITES = SITE_DEFS.map(generateSite);
    state.ready = true;
    return;
  }
  const [{data: siteRows, error: e1}, {data: rackRows, error: e2}, {data: deviceRows, error: e3}] = await Promise.all([
    sb.from('sites').select('*'),
    sb.from('racks').select('*'),
    sb.from('devices').select('*'),
  ]);
  if(e1 || e2 || e3){ showToast('Failed to load data from Supabase — check console.', true); console.error(e1||e2||e3); SITES=[]; state.ready=true; return; }

  SITES = (siteRows||[]).map(s=>{
    const racks = (rackRows||[]).filter(r=>r.site_id===s.id).map(r=>{
      const devices = (deviceRows||[]).filter(d=>d.rack_id===r.id).map(d=>({
        id:d.id, startU:d.start_u, sizeU:d.size_u, model:d.model, serialNumber:d.serial_number||'',
        datasheetKva:Number(d.datasheet_kva), authorizedPerson:d.authorized_person,
      }));
      const rack = { id:r.id, row:r.row_label, position:Number(r.position||0), capacityKva:Number(r.capacity_kva), actualKva:Number(r.actual_kva||0), circuitBreaker:r.circuit_breaker||null, devices };
      recomputeRack(rack);
      return rack;
    });
    const site = { id:s.id, name:s.name, location:s.location, tier:s.tier, pue:Number(s.pue), racks };
    recomputeSite(site);
    return site;
  });
  state.ready = true;
}

async function seedDemoDataToSupabase(){
  if(!LIVE || !isManager()) return;
  showToast('Seeding demo data — this can take a minute…');
  const demo = SITE_DEFS.map(generateSite);
  for(const site of demo){
    await sb.from('sites').upsert({ id:site.id, name:site.name, location:site.location, tier:site.tier, pue:site.pue });
    const rackRows = site.racks.map(r=>({ id:r.id, site_id:site.id, row_label:r.row, capacity_kva:r.capacityKva, actual_kva:r.actualKva, position:r.position }));
    for(let i=0;i<rackRows.length;i+=500) await sb.from('racks').upsert(rackRows.slice(i,i+500));
    let deviceRows = [];
    site.racks.forEach(r=>r.devices.forEach(d=>{
      deviceRows.push({ rack_id:r.id, start_u:d.startU, size_u:d.sizeU, model:d.model, serial_number:d.serialNumber, datasheet_kva:d.datasheetKva, authorized_person:d.authorizedPerson, created_by: state.user.id });
    }));
    for(let i=0;i<deviceRows.length;i+=500) await sb.from('devices').insert(deviceRows.slice(i,i+500));
  }
  await loadData();
  showToast('Demo data seeded.');
  render();
}

async function addDevice({ siteId, rackId, model, sizeU, serialNumber, datasheetKva, authorizedPerson }){
  const site = SITES.find(s=>s.id===siteId);
  const rack = site.racks.find(r=>r.id===rackId);
  const freeStart = findFreeSlot(rack, sizeU);
  if(freeStart===null) return { error: `${rack.id} doesn't have ${sizeU} contiguous U free. Try a smaller size or another rack.` };

  if(LIVE){
    const { data, error } = await sb.from('devices').insert({
      rack_id: rackId, start_u: freeStart, size_u: sizeU, model, serial_number: serialNumber,
      datasheet_kva: datasheetKva, authorized_person: authorizedPerson,
      created_by: state.user.id,
    }).select().single();
    if(error) return { error: error.message };
    rack.devices.push({ id:data.id, startU:freeStart, sizeU, model, serialNumber, datasheetKva, authorizedPerson });
  } else {
    rack.devices.push({ id:`demo-${Date.now()}`, startU:freeStart, sizeU, model, serialNumber, datasheetKva, authorizedPerson });
    const uLabel = sizeU>1 ? `U${freeStart}-${freeStart+sizeU-1}` : `U${freeStart}`;
    pushDemoHistory(rack, 'device_added', `${model} (SN ${serialNumber}) — rated ${datasheetKva.toFixed(2)} kVA (${uLabel})`);
  }
  recomputeRack(rack); recomputeSite(site);
  return { ok:true, rack, startU:freeStart };
}

async function editDevice(siteId, rackId, deviceId, { model, sizeU, serialNumber, datasheetKva, authorizedPerson }){
  const site = SITES.find(s=>s.id===siteId);
  const rack = site.racks.find(r=>r.id===rackId);
  const dev = rack.devices.find(d=>d.id===deviceId);
  if(!dev) return { error:'Device not found.' };

  let startU = dev.startU;
  if(sizeU !== dev.sizeU){
    const freeStart = findFreeSlot(rack, sizeU, deviceId);
    if(freeStart===null) return { error: `${rack.id} doesn't have ${sizeU} contiguous U free for this size. Try a smaller size.` };
    startU = freeStart;
  }

  const changes = [];
  if(model !== dev.model) changes.push(`model ${dev.model} -> ${model}`);
  if(serialNumber !== dev.serialNumber) changes.push(`serial ${dev.serialNumber||'—'} -> ${serialNumber||'—'}`);
  if(sizeU !== dev.sizeU) changes.push(`size ${dev.sizeU}U -> ${sizeU}U`);
  if(datasheetKva !== dev.datasheetKva) changes.push(`datasheet ${dev.datasheetKva.toFixed(2)} -> ${datasheetKva.toFixed(2)} kVA`);
  if(authorizedPerson !== dev.authorizedPerson) changes.push(`authorized person ${dev.authorizedPerson} -> ${authorizedPerson}`);

  if(LIVE){
    const { error } = await sb.from('devices').update({
      model, size_u: sizeU, start_u: startU, serial_number: serialNumber,
      datasheet_kva: datasheetKva, authorized_person: authorizedPerson,
    }).eq('id', deviceId);
    if(error) return { error: error.message };
  } else if(changes.length){
    pushDemoHistory(rack, 'device_edited', `${dev.model}: ${changes.join(', ')}`);
  }

  dev.model = model; dev.sizeU = sizeU; dev.startU = startU; dev.serialNumber = serialNumber;
  dev.datasheetKva = datasheetKva; dev.authorizedPerson = authorizedPerson;
  recomputeRack(rack);
  return { ok:true };
}

async function removeDevice(siteId, rackId, deviceId){
  const site = SITES.find(s=>s.id===siteId);
  const rack = site.racks.find(r=>r.id===rackId);
  const dev = rack.devices.find(d=>d.id===deviceId);
  if(LIVE){
    const { error } = await sb.from('devices').delete().eq('id', deviceId);
    if(error) return { error: error.message };
  } else if(dev){
    const uLabel = dev.sizeU>1 ? `U${dev.startU}-${dev.startU+dev.sizeU-1}` : `U${dev.startU}`;
    pushDemoHistory(rack, 'device_removed', `${dev.model}${dev.serialNumber?` (SN ${dev.serialNumber})`:''} — rated ${dev.datasheetKva.toFixed(2)} kVA (${uLabel})`);
  }
  rack.devices = rack.devices.filter(d=>d.id!==deviceId);
  recomputeRack(rack); recomputeSite(site);
  return { ok:true };
}

async function updateRackCapacity(siteId, rackId, newCapacityKva){
  const site = SITES.find(s=>s.id===siteId);
  const rack = site.racks.find(r=>r.id===rackId);
  const oldCapacityKva = rack.capacityKva;
  if(LIVE){
    const { error } = await sb.from('racks').update({ capacity_kva: newCapacityKva }).eq('id', rackId);
    if(error) return { error: error.message };
  } else {
    pushDemoHistory(rack, 'capacity_changed', `${oldCapacityKva} kVA -> ${newCapacityKva} kVA`);
  }
  rack.capacityKva = newCapacityKva;
  recomputeSite(site);
  return { ok:true };
}

async function updateRackActual(siteId, rackId, newActualKva){
  const site = SITES.find(s=>s.id===siteId);
  const rack = site.racks.find(r=>r.id===rackId);
  const oldActualKva = rack.actualKva;
  if(LIVE){
    const { error } = await sb.from('racks').update({ actual_kva: newActualKva }).eq('id', rackId);
    if(error) return { error: error.message };
  } else {
    pushDemoHistory(rack, 'actual_changed', `${oldActualKva} kVA -> ${newActualKva} kVA`);
  }
  rack.actualKva = newActualKva;
  recomputeSite(site);
  return { ok:true };
}

async function updateRackBreaker(siteId, rackId, newBreaker){
  const site = SITES.find(s=>s.id===siteId);
  const rack = site.racks.find(r=>r.id===rackId);
  const oldBreaker = rack.circuitBreaker;
  if(LIVE){
    const { error } = await sb.from('racks').update({ circuit_breaker: newBreaker || null }).eq('id', rackId);
    if(error) return { error: error.message };
  } else {
    pushDemoHistory(rack, 'breaker_changed', `${oldBreaker||'—'} -> ${newBreaker||'—'}`);
  }
  rack.circuitBreaker = newBreaker || null;
  return { ok:true };
}

async function moveRack(siteId, rackId, targetRow, beforeRackId){
  const site = SITES.find(s=>s.id===siteId);
  const rack = site.racks.find(r=>r.id===rackId);
  if(!rack) return { error:'Rack not found.' };

  const siblings = site.racks.filter(r=>r.row===targetRow && r.id!==rackId).sort((a,b)=>(a.position||0)-(b.position||0));
  let newPosition;
  if(beforeRackId){
    const idx = siblings.findIndex(r=>r.id===beforeRackId);
    if(idx<=0){ newPosition = (siblings[0]?(siblings[0].position||0):0) - 1; }
    else { newPosition = ((siblings[idx-1].position||0) + (siblings[idx].position||0)) / 2; }
  } else {
    newPosition = siblings.length ? Math.max(...siblings.map(r=>r.position||0)) + 1 : 0;
  }
  const oldRow = rack.row;

  if(LIVE){
    const { error } = await sb.from('racks').update({ row_label: targetRow, position: newPosition }).eq('id', rackId);
    if(error) return { error: error.message };
  } else if(oldRow !== targetRow){
    pushDemoHistory(rack, 'rack_moved', `Row ${oldRow} -> Row ${targetRow}`);
  }
  rack.row = targetRow;
  rack.position = newPosition;
  return { ok:true };
}

async function renameRack(siteId, oldId, newId){
  const site = SITES.find(s=>s.id===siteId);
  const rack = site.racks.find(r=>r.id===oldId);
  if(!rack) return { error:'Rack not found.' };
  if(SITES.some(s=>s.racks.some(r=>r.id===newId))) return { error:`Rack name "${newId}" is already in use.` };

  if(LIVE){
    const { error } = await sb.from('racks').update({ id: newId }).eq('id', oldId);
    if(error) return { error: error.message };
  } else {
    pushDemoHistory(rack, 'rack_renamed', `${oldId} -> ${newId}`);
  }
  rack.id = newId;
  return { ok:true };
}

function slugify(name){
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'site';
  let id = base, n = 1;
  while(SITES.some(s=>s.id===id)){ id = `${base}-${++n}`; }
  return id;
}

async function createSite({ name, location, tier, pue, rackCount, rowCount, defaultCapacityKva }){
  const id = slugify(name);
  const racksPerRow = Math.max(1, Math.ceil(rackCount / rowCount));
  const rackDefs = [];
  for(let i=1;i<=rackCount;i++){
    const row = String.fromCharCode(65 + Math.floor((i-1)/racksPerRow));
    const position = (i-1) % racksPerRow;
    rackDefs.push({ id:`${id.toUpperCase()}-R${String(i).padStart(3,'0')}`, row, position, capacityKva:defaultCapacityKva, actualKva:0, circuitBreaker:null });
  }

  if(LIVE){
    const { error: e1 } = await sb.from('sites').insert({ id, name, location, tier, pue });
    if(e1) return { error: e1.message };
    const rackRows = rackDefs.map(r=>({ id:r.id, site_id:id, row_label:r.row, position:r.position, capacity_kva:r.capacityKva, actual_kva:0 }));
    for(let i=0;i<rackRows.length;i+=500){
      const { error: e2 } = await sb.from('racks').insert(rackRows.slice(i,i+500));
      if(e2) return { error: e2.message };
    }
  }

  const racks = rackDefs.map(r=>({ ...r, devices:[], history:[] }));
  racks.forEach(recomputeRack);
  const site = { id, name, location, tier, pue, racks };
  recomputeSite(site);
  SITES.push(site);
  return { ok:true, site };
}

async function addRackToSite(siteId, { rackId, row, capacityKva, circuitBreaker }){
  const site = SITES.find(s=>s.id===siteId);
  if(!site) return { error:'Site not found.' };
  if(SITES.some(s=>s.racks.some(r=>r.id===rackId))) return { error:`Rack name "${rackId}" is already in use.` };

  const siblings = site.racks.filter(r=>r.row===row);
  const position = siblings.length ? Math.max(...siblings.map(r=>r.position||0)) + 1 : 0;

  if(LIVE){
    const { error } = await sb.from('racks').insert({ id:rackId, site_id:siteId, row_label:row, position, capacity_kva:capacityKva, actual_kva:0, circuit_breaker:circuitBreaker||null });
    if(error) return { error: error.message };
  }

  const rack = { id:rackId, row, position, capacityKva, actualKva:0, circuitBreaker:circuitBreaker||null, devices:[], history:[] };
  recomputeRack(rack);
  site.racks.push(rack);
  recomputeSite(site);
  return { ok:true, rack };
}

async function removeSite(siteId){
  if(LIVE){
    const { error } = await sb.from('sites').delete().eq('id', siteId);
    if(error) return { error: error.message };
  }
  SITES = SITES.filter(s=>s.id!==siteId);
  return { ok:true };
}

async function updateSiteInfo(siteId, { name, location, tier, pue }){
  const site = SITES.find(s=>s.id===siteId);
  if(LIVE){
    const { error } = await sb.from('sites').update({ name, location, tier, pue }).eq('id', siteId);
    if(error) return { error: error.message };
  }
  site.name = name; site.location = location; site.tier = tier; site.pue = pue;
  recomputeSite(site);
  return { ok:true };
}

function pushDemoHistory(rack, eventType, detail){
  if(!rack.history) rack.history = [];
  rack.history.unshift({ eventType, detail, actor: state.user ? state.user.email : `Demo ${state.role}`, createdAt: new Date().toISOString() });
}

const HISTORY_WINDOW_DAYS = 182; // ~6 months

async function loadRackHistory(rackId){
  const sinceIso = new Date(Date.now() - HISTORY_WINDOW_DAYS*24*60*60*1000).toISOString();
  if(!LIVE){
    const site = SITES.find(s=>s.racks.some(r=>r.id===rackId));
    const rack = site.racks.find(r=>r.id===rackId);
    const events = (rack.history || []).filter(e=>e.createdAt >= sinceIso);
    return { ok:true, events };
  }
  const { data, error } = await sb.from('rack_events').select('*').eq('rack_id', rackId).gte('created_at', sinceIso).order('created_at', { ascending:false }).limit(500);
  if(error) return { error: error.message };
  return { ok:true, events: (data||[]).map(e=>({ eventType:e.event_type, detail:e.detail, actor:e.performed_by_email||'Unknown', createdAt:e.created_at })) };
}

/* ---------------------------------------------------------------
   AUTH (live mode only)
--------------------------------------------------------------- */
async function initAuth(){
  if(!LIVE) return;
  const { data: { session } } = await sb.auth.getSession();
  if(session) await onSignedIn(session.user);
  sb.auth.onAuthStateChange((event, session)=>{
    if(event==='SIGNED_OUT'){ state.user=null; state.role=null; renderRoot(); }
  });
}
async function onSignedIn(user){
  state.user = user;
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  state.role = profile ? profile.role : 'technician';
  await loadData();
  renderRoot();
}
async function signIn(email, password){
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error){ state.authError = error.message; renderRoot(); return; }
  await onSignedIn(data.user);
}
async function signUp(email, password){
  const { data, error } = await sb.auth.signUp({ email, password });
  if(error){ state.authError = error.message; renderRoot(); return; }
  if(data.session){ await onSignedIn(data.user); }
  else { state.authError = null; state.authMode='signin'; showToast('Account created — check your email to confirm, then sign in.'); renderRoot(); }
}
async function signOut(){
  await sb.auth.signOut();
  state.user=null; state.role=null; SITES=[]; state.view='dashboard'; state.siteId=null;
  renderRoot();
}

/* ---------------------------------------------------------------
   LOGIN SCREEN
--------------------------------------------------------------- */
function renderLogin(){
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-brand"><div class="mark">DC</div>Facility Ops</div>
      <div class="login-tabs">
        <button data-authmode="signin" class="${state.authMode==='signin'?'active':''}">Sign in</button>
        <button data-authmode="signup" class="${state.authMode==='signup'?'active':''}">Create account</button>
      </div>
      ${state.authError ? `<div class="form-error">${esc(state.authError)}</div>` : ''}
      <form id="authForm">
        <div class="field">
          <label>Email</label>
          <input id="authEmail" type="email" required autocomplete="email"/>
        </div>
        <div class="field">
          <label>Password</label>
          <input id="authPassword" type="password" required autocomplete="${state.authMode==='signin'?'current-password':'new-password'}" minlength="6"/>
        </div>
        <button type="submit" class="btn btn-primary login-submit">${state.authMode==='signin' ? 'Sign in' : 'Create account'}</button>
      </form>
      <div class="form-hint">New accounts default to Technician (read-only). A manager can promote you from the Supabase dashboard.</div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------
   DASHBOARD
--------------------------------------------------------------- */
function renderDashboard(){
  const racks = SITES.reduce((s,x)=>s+x.racks.length,0);
  const it = SITES.reduce((s,x)=>s+x.itLoadKva,0);
  const util = SITES.reduce((s,x)=>s+x.utilityLoadKva,0);
  const cap = SITES.reduce((s,x)=>s+x.totalCapacityKva,0);
  const pct = cap>0 ? it/cap : 0;

  const flat=[];
  SITES.forEach(s=>s.racks.forEach(r=>{ const p=r.capacityKva>0 ? r.actualKva/r.capacityKva : 0; if(p>=0.75) flat.push({site:s.name,siteId:s.id,rack:r.id,pct:p}); }));
  flat.sort((a,b)=>b.pct-a.pct);
  const top = flat.slice(0,6);
  const critCount = flat.filter(f=>f.pct>=0.9).length;
  const warnCount = flat.filter(f=>f.pct>=0.75 && f.pct<0.9).length;

  if(SITES.length===0 && LIVE){
    return `
      <div class="h1">Colocation facility operations</div>
      <div class="muted" style="font-size:13px;margin:8px 0 20px;">No sites yet in this Supabase project.</div>
      ${isManager() ? `<button class="btn btn-primary" id="seedBtn">Seed demo data (4 sites)</button>` :
        `<div class="faint" style="font-size:13px;">Ask a manager to seed initial site data.</div>`}
    `;
  }

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
      <div class="h1">Colocation facility operations</div>
      ${isManager() ? `<button class="btn btn-primary" id="openAddSite">+ Add site</button>` : ''}
    </div>
    <div class="muted" style="font-size:13px;margin:4px 0 20px;">${SITES.length} sites · ${racks} racks · portfolio utilization ${fmtPct(pct)}</div>

    <div class="card kpirow">
      <div><div class="stat-label">Total racks</div><div class="stat-value">${racks}</div></div>
      <div><div class="stat-label">Total IT load</div><div class="stat-value">${fmtKva(it,0)}</div></div>
      <div><div class="stat-label">Total utility load</div><div class="stat-value">${fmtKva(util,0)}</div></div>
      <div><div class="stat-label">Total capacity</div><div class="stat-value">${fmtKva(cap,0)}</div><div class="stat-sub">${fmtPct(pct)} utilized</div></div>
    </div>

    ${top.length? `
    <div class="card alertbox">
      <div class="hdr">
        <div class="stat-label" style="margin:0;">Racks needing attention</div>
        <div style="display:flex;gap:8px;">
          <span class="badge red">${critCount} critical</span>
          <span class="badge amber">${warnCount} warning</span>
        </div>
      </div>
      <div class="alertchips">
        ${top.map(f=>`<div class="alertchip"><span class="faint">${esc(f.site)}</span> / ${esc(f.rack)} <span style="color:${statusHex(f.pct)};font-weight:700;">${fmtPct(f.pct)}</span></div>`).join('')}
      </div>
    </div>` : ''}

    <div class="sitegrid">
      ${SITES.map(s=>`
        <div class="card sitecard" data-open-site="${s.id}">
          <div class="sitecard-top">
            <div><div class="sitename">${s.name}</div><div class="siteloc">${esc(s.location)}</div></div>
            <span class="badge ${statusColor(s.utilizationPct)}">${statusLabel(s.utilizationPct)}</span>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:14px;">
            ${isManager() ? `<button class="btn btn-primary btn-sm" data-add-device="${s.id}">+ Add device</button>` : ''}
            ${isManager() ? `<button class="btn btn-sm btn-danger" data-remove-site="${s.id}" data-remove-site-name="${esc(s.name)}">Remove site</button>` : ''}
          </div>
          <div class="gaugewrap">
            ${gaugeSvg(s.utilizationPct,62)}
            <div class="statgrid2">
              <div><div class="stat-label">Racks</div><div class="stat-value">${s.racks.length}</div></div>
              <div><div class="stat-label">Tier</div><div class="stat-value">${(s.tier||'').replace('Tier ','T')}</div></div>
              <div><div class="stat-label">IT load</div><div class="stat-value">${fmtKva(s.itLoadKva,0)}</div></div>
              <div><div class="stat-label">Utility load</div><div class="stat-value">${fmtKva(s.utilityLoadKva,0)}</div></div>
            </div>
          </div>
          <div class="sitecard-foot">
            <span>Capacity <span class="mono" style="color:var(--ink);">${fmtKva(s.totalCapacityKva,0)}</span></span>
            <span>PUE <span class="mono" style="color:var(--ink);">${(s.pue||0).toFixed(2)}</span></span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ---------------------------------------------------------------
   SITE VIEW (floor plan / list)
--------------------------------------------------------------- */
function filteredSortedRacks(site){
  let list = site.racks;
  if(state.search.trim()){
    const q = state.search.trim().toLowerCase();
    list = list.filter(r => r.id.toLowerCase().includes(q) ||
      r.devices.some(d=>d.model.toLowerCase().includes(q) || d.authorizedPerson.toLowerCase().includes(q)));
  }
  const sorted = [...list];
  if(state.sort==='name') sorted.sort((a,b)=>a.id.localeCompare(b.id));
  if(state.sort==='util_desc') sorted.sort((a,b)=>(b.actualKva/b.capacityKva)-(a.actualKva/a.capacityKva));
  if(state.sort==='util_asc') sorted.sort((a,b)=>(a.actualKva/a.capacityKva)-(b.actualKva/b.capacityKva));
  return sorted;
}

// Floor plan has its own ordering (by saved position within each row, drag-and-drop
// controlled) — independent of the list view's name/utilization sort dropdown.
function racksForFloorPlan(site){
  let list = site.racks;
  if(state.search.trim()){
    const q = state.search.trim().toLowerCase();
    list = list.filter(r => r.id.toLowerCase().includes(q) ||
      r.devices.some(d=>d.model.toLowerCase().includes(q) || d.authorizedPerson.toLowerCase().includes(q)));
  }
  return [...list].sort((a,b)=>(a.position||0)-(b.position||0));
}

function rackShortLabel(id){
  const parts = String(id).split('-');
  return parts[parts.length-1] || id;
}

function renderSite(site){
  const racks = filteredSortedRacks(site);

  const listHtml = `
    <div class="card" style="overflow:hidden;">
      <div class="listhead">
        <div>Rack</div><div>Load</div><div style="text-align:right;">Actual</div><div style="text-align:right;">Capacity</div><div style="text-align:right;">Util</div><div style="text-align:right;">U used</div>
      </div>
      <div style="max-height:560px;overflow-y:auto;">
        ${racks.length===0 ? `<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">No racks match this search.</div>` :
        racks.map(r=>{
          const pct = r.capacityKva>0 ? r.actualKva/r.capacityKva : 0;
          return `<div class="listrow" data-open-rack="${r.id}">
            <div class="mono" style="font-weight:600;">${r.id}</div>
            <div class="barbg"><div class="barfill" style="width:${Math.min(100,pct*100)}%;background:${statusHex(pct)};"></div></div>
            <div class="mono" style="text-align:right;color:var(--text2);">${r.actualKva.toFixed(1)} kVA</div>
            <div class="mono" style="text-align:right;color:var(--text3);">/ ${r.capacityKva} kVA</div>
            <div class="mono" style="text-align:right;font-weight:700;color:${statusHex(pct)};">${fmtPct(pct)}</div>
            <div class="mono" style="text-align:right;color:var(--text2);">${r.occupiedU}U</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="faint" style="font-size:11.5px;margin-top:8px;">Showing ${racks.length} of ${site.racks.length} racks</div>
  `;

  const floorRacks = racksForFloorPlan(site);
  const byRow = {};
  floorRacks.forEach(r=>{ (byRow[r.row] = byRow[r.row]||[]).push(r); });
  const rowKeys = Object.keys(byRow).sort();
  const floorHtml = `
    <div class="floorlegend">
      <span><span class="legdot" style="background:#1FA97A;"></span>Normal (&lt;75%)</span>
      <span><span class="legdot" style="background:#C9821A;"></span>Warning (75–90%)</span>
      <span><span class="legdot" style="background:#D6373C;"></span>Critical (&gt;90%)</span>
      ${isManager() ? `<span class="faint" style="margin-left:auto;">Drag a rack to move it between or within rows</span>` : ''}
    </div>
    <div class="card" style="padding:18px 20px;">
      ${rowKeys.length===0 ? `<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">No racks match this search.</div>` :
      rowKeys.map(rk=>`
        <div class="rowblock">
          <div class="rowlabel">ROW ${esc(rk)}</div>
          <div class="racktiles" data-row="${esc(rk)}">
            ${byRow[rk].map(r=>{
              const pct = r.capacityKva>0 ? r.actualKva/r.capacityKva : 0;
              return `<div class="racktile" draggable="${isManager()}" data-open-rack="${r.id}" data-rack-id="${r.id}" style="background:${statusHex(pct)};" title="${r.id} · ${fmtPct(pct)} · ${r.actualKva.toFixed(1)} kVA">${esc(rackShortLabel(r.id))}</div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  return `
    <button class="backlink" data-back="1">&larr; All sites</button>
    <div class="sitehead">
      <div>
        <div class="sitename" style="font-size:24px;">${site.name} ${isManager() ? `<button class="editlink" id="openEditSite" style="font-size:12px;">edit</button>` : ''}</div>
        <div class="siteloc" style="margin-top:3px;">${esc(site.location||'')} · ${site.tier||''} · ${site.racks.length} racks</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        ${isManager() ? `<button class="btn" data-add-rack="${site.id}">+ Add rack</button>` : ''}
        ${isManager() ? `<button class="btn btn-primary" data-add-device="${site.id}">+ Add device</button>` : ''}
        ${isManager() ? `<button class="btn btn-danger" data-remove-site="${site.id}" data-remove-site-name="${esc(site.name)}">Remove site</button>` : ''}
        ${gaugeSvg(site.utilizationPct,70)}
      </div>
    </div>

    <div class="card kpirow2">
      <div><div class="stat-label">Racks</div><div class="stat-value">${site.racks.length}</div></div>
      <div><div class="stat-label">IT load</div><div class="stat-value">${fmtKva(site.itLoadKva,0)}</div></div>
      <div><div class="stat-label">Utility load</div><div class="stat-value">${fmtKva(site.utilityLoadKva,0)}</div><div class="stat-sub">PUE ${(site.pue||0).toFixed(2)}</div></div>
      <div><div class="stat-label">Total capacity</div><div class="stat-value">${fmtKva(site.totalCapacityKva,0)}</div></div>
      <div><div class="stat-label">Utilization</div><div class="stat-value">${fmtPct(site.utilizationPct)}</div></div>
    </div>

    <div class="subtabs">
      <button class="subtab ${state.siteSub==='floor'?'active':''}" data-sub="floor">Floor plan</button>
      <button class="subtab ${state.siteSub==='list'?'active':''}" data-sub="list">Rack list</button>
    </div>

    <div class="toolrow">
      <input class="search-input" id="searchbox" placeholder="Search rack ID, device model, or authorized person…" value="${esc(state.search)}"/>
      ${state.siteSub==='list' ? `
      <select class="sort-select" id="sortsel">
        <option value="name" ${state.sort==='name'?'selected':''}>Sort: rack name</option>
        <option value="util_desc" ${state.sort==='util_desc'?'selected':''}>Sort: utilization ↓</option>
        <option value="util_asc" ${state.sort==='util_asc'?'selected':''}>Sort: utilization ↑</option>
      </select>` : ''}
    </div>

    ${state.siteSub==='floor' ? floorHtml : listHtml}
  `;
}

/* ---------------------------------------------------------------
   RACK MODAL (elevation + inventory + capacity setup + remove)
--------------------------------------------------------------- */
function initials(name){
  const clean = String(name).split('—')[0].trim();
  const parts = clean.split(/\s+/).filter(Boolean).map(p=>p.replace(/[^A-Za-z]/g,'')).filter(Boolean);
  return ((parts[0]||'')[0]||'') .toUpperCase() + ((parts[1]||'')[0]||'').toUpperCase();
}

function renderRackModal(rack, site){
  const pct = rack.capacityKva>0 ? rack.actualKva/rack.capacityKva : 0;
  const view = state.rackFace || 'front';

  let elevationHtml = '';
  if(view==='front'){
    let u=42; const rows=[]; const gutter=[];
    while(u>=1){
      const dev = rack.devices.find(d=>u>=d.startU && u<=d.startU+d.sizeU-1);
      const mark5 = (u%5===0) ? ' mark5' : '';
      if(dev && u===dev.startU+dev.sizeU-1){
        const h = dev.sizeU*11;
        const kvaPerU = dev.datasheetKva/dev.sizeU;
        const uLabel = dev.sizeU>1 ? `U${dev.startU}-${dev.startU+dev.sizeU-1}` : `U${dev.startU}`;
        const title = `${esc(dev.model)} · ${uLabel} · ${dev.datasheetKva.toFixed(2)} kVA`;
        if(dev.sizeU>=2){
          rows.push(`<div class="u-slot tall" style="height:${h}px;background:${densityColor(kvaPerU)};" title="${title}">
            <span class="u-slot-title">${esc(dev.model)}</span>
            <span class="u-slot-sub">${uLabel} · ${dev.datasheetKva.toFixed(2)} kVA</span>
          </div>`);
        } else {
          rows.push(`<div class="u-slot" style="height:${h}px;background:${densityColor(kvaPerU)};" title="${title}">${esc(dev.model)}</div>`);
        }
        gutter.push(`<div class="major${mark5}" style="height:${h}px;">${u}</div>`);
        u -= dev.sizeU;
      } else {
        rows.push(`<div class="u-empty${mark5}"></div>`);
        gutter.push(`<div class="${mark5.trim()}">${u}</div>`);
        u -= 1;
      }
    }
    elevationHtml = `
      <div class="elev-caption"><span>${rack.id} · 42U</span><span>top = U42</span></div>
      <div class="elevation-wrap">
        <div class="u-gutter">${gutter.join('')}</div>
        <div class="elevation">${rows.join('')}</div>
      </div>
      <div class="density-legend">
        <span>Power density</span><div class="density-bar"></div><span>Low → High (kVA/U)</span>
      </div>`;
  } else {
    const pduA = rack.actualKva/2 * (0.92 + (hashStr(rack.id)%17)/100);
    const pduB = rack.actualKva - pduA;
    elevationHtml = `
      <div style="width:230px;">
        <div class="pdurow"><div><div class="pdulabel">PDU A</div><div class="faint" style="font-size:11px;">Primary feed</div></div><div class="pduval">${pduA.toFixed(2)} kVA</div></div>
        <div class="pdurow"><div><div class="pdulabel">PDU B</div><div class="faint" style="font-size:11px;">Redundant feed</div></div><div class="pduval">${pduB.toFixed(2)} kVA</div></div>
        <div class="faint" style="font-size:11.5px;padding:0 4px;">Rear view shows power feeds only. Switch to front view for device-level detail.</div>
      </div>`;
  }

  const capacityHtml = state.editingCapacity ? `
    <div>
      <div class="stat-label">Max power (rack capacity)</div>
      ${state.capacityError ? `<div class="form-error" style="margin:4px 0;">${esc(state.capacityError)}</div>` : ''}
      <div class="capbox">
        <input id="capacityInput" type="number" min="0.5" step="0.5" value="${rack.capacityKva}"/>
        <span class="faint" style="font-size:12px;">kVA</span>
        <button class="btn btn-primary btn-sm" id="saveCapacity">Save</button>
        <button class="btn btn-sm" id="cancelCapacity">Cancel</button>
      </div>
    </div>
  ` : `
    <div>
      <div class="stat-label">Max power (rack capacity)</div>
      <div class="stat-value">${fmtKva(rack.capacityKva,1)} ${isManager() ? `<button class="editlink" id="editCapacityBtn">edit</button>` : ''}</div>
    </div>
  `;

  const actualHtml = state.editingActual ? `
    <div>
      <div class="stat-label">Actual power (measured)</div>
      ${state.actualError ? `<div class="form-error" style="margin:4px 0;">${esc(state.actualError)}</div>` : ''}
      <div class="capbox">
        <input id="actualInput" type="number" min="0" step="0.1" value="${rack.actualKva}"/>
        <span class="faint" style="font-size:12px;">kVA</span>
        <button class="btn btn-primary btn-sm" id="saveActual">Save</button>
        <button class="btn btn-sm" id="cancelActual">Cancel</button>
      </div>
    </div>
  ` : `
    <div>
      <div class="stat-label">Actual power (measured)</div>
      <div class="stat-value">${fmtKva(rack.actualKva,2)} ${isManager() ? `<button class="editlink" id="editActualBtn">edit</button>` : ''}</div>
    </div>
  `;

  const breakerHtml = state.editingBreaker ? `
    <div>
      <div class="stat-label">Circuit breaker #</div>
      <div class="capbox">
        <input id="breakerInput" value="${esc(rack.circuitBreaker||'')}" placeholder="e.g. CB-14" style="width:110px;"/>
        <button class="btn btn-primary btn-sm" id="saveBreaker">Save</button>
        <button class="btn btn-sm" id="cancelBreaker">Cancel</button>
      </div>
    </div>
  ` : `
    <div>
      <div class="stat-label">Circuit breaker #</div>
      <div class="stat-value">${rack.circuitBreaker ? esc(rack.circuitBreaker) : '<span class="faint">—</span>'} ${isManager() ? `<button class="editlink" id="editBreakerBtn">edit</button>` : ''}</div>
    </div>
  `;

  return `
  <div class="overlay" id="overlay">
    <div class="modal" style="max-width:1060px;">
      <div class="modal-top">
        <div>
          ${state.editingRackName ? `
            <div style="display:flex;align-items:center;gap:8px;">
              <input id="rackNameInput" value="${esc(rack.id)}" class="mono" style="font-size:15px;padding:5px 9px;border:1px solid var(--border);border-radius:6px;width:190px;"/>
              <button class="btn btn-primary btn-sm" id="saveRackName">Save</button>
              <button class="btn btn-sm" id="cancelRackName">Cancel</button>
            </div>
            ${state.rackNameError ? `<div class="form-error" style="margin-top:6px;">${esc(state.rackNameError)}</div>` : ''}
          ` : `
            <div class="sitename" style="font-size:19px;">${esc(rack.id)} ${isManager() ? `<button class="editlink" id="editRackNameBtn">rename</button>` : ''}</div>
          `}
          <div class="siteloc" style="margin-top:2px;">${site.name} · ${esc(site.location||'')} · Row ${esc(rack.row||'—')}</div>
        </div>
        <button class="modal-close" id="closeModal">&times;</button>
      </div>

      <div class="modal-kpis">
        ${actualHtml}
        <div><div class="stat-label">Datasheet power</div><div class="stat-value">${fmtKva(rack.totalDatasheetKva,2)}</div><div class="stat-sub">sum of device ratings</div></div>
        ${capacityHtml}
        ${breakerHtml}
        <div><div class="stat-label">Utilization</div><span class="badge ${statusColor(pct)}">${fmtPct(pct)} · ${statusLabel(pct)}</span></div>
      </div>

      <div class="rackview-grid">
        <div class="rackview-left">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
            <div class="viewtoggle" style="margin-bottom:0;">
              <button data-face="front" class="${view==='front'?'active':''}">Front</button>
              <button data-face="rear" class="${view==='rear'?'active':''}">Rear</button>
            </div>
            <button class="btn btn-sm" id="openHistory" title="View change history">History</button>
          </div>
          ${elevationHtml}
        </div>

        <div class="rackview-right">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div class="stat-label" style="margin:0;">Inventory</div>
            ${isManager() ? `<button class="btn btn-primary btn-sm" data-add-device-rack="${rack.id}" data-add-device-site="${site.id}">+ Add device</button>` : ''}
          </div>
          <div style="max-height:500px;overflow-y:auto;overflow-x:auto;border:1px solid var(--border);border-radius:8px;">
            <table class="inv">
              <thead><tr>
                <th class="num">U</th><th>Device</th><th>Serial #</th><th class="num">Datasheet</th><th>Authorized person</th>${isManager()?'<th class="rm-col" colspan="2"></th>':''}
              </tr></thead>
              <tbody>
                ${[...rack.devices].sort((a,b)=>b.startU-a.startU).map(d=>{
                  const swatch = densityColor(d.datasheetKva/d.sizeU);
                  const uLabel = d.sizeU>1 ? `${d.startU}–${d.startU+d.sizeU-1}` : d.startU;
                  return `
                  <tr>
                    <td class="num"><span class="ubadge">${uLabel}</span></td>
                    <td><div class="model-cell"><span class="swatch" style="background:${swatch};"></span><span style="font-weight:600;">${esc(d.model)}</span></div></td>
                    <td class="mono faint" style="font-size:11px;">${esc(d.serialNumber||'—')}</td>
                    <td class="num faint">${d.datasheetKva.toFixed(2)}<span style="font-size:10px;"> kVA</span></td>
                    <td><div class="person-cell"><span class="avatar">${esc(initials(d.authorizedPerson))}</span><span class="faint" style="font-size:11.5px;">${esc(d.authorizedPerson)}</span></div></td>
                    ${isManager() ? `<td class="rm"><button class="rm-btn" data-edit-device="${d.id}" data-edit-rack="${rack.id}" data-edit-site="${site.id}" title="Edit device">✎</button></td>
                    <td class="rm"><button class="rm-btn" data-remove-device="${d.id}" data-remove-rack="${rack.id}" data-remove-site="${site.id}" title="Remove device">&times;</button></td>` : ''}
                  </tr>
                `;}).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3" class="faint">Total (${rack.devices.length} devices)</td>
                  <td class="num">${rack.totalDatasheetKva.toFixed(2)}</td>
                  <td></td>${isManager()?'<td colspan="2"></td>':''}
                </tr>
              </tfoot>
            </table>

          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------
   ADD DEVICE MODAL
--------------------------------------------------------------- */
function renderAddDeviceModal(){
  const site = SITES.find(s=>s.id===state.addDeviceSiteId) || SITES[0];
  const rackOptions = [...site.racks].sort((a,b)=>a.id.localeCompare(b.id));
  const preselectRack = state.addDeviceRackId && rackOptions.some(r=>r.id===state.addDeviceRackId) ? state.addDeviceRackId : (rackOptions[0]?rackOptions[0].id:'');
  const deviceNames = DEVICE_TYPES.map(t=>t.name);

  return `
  <div class="overlay" id="overlay">
    <div class="modal" style="max-width:520px;">
      <div class="modal-top">
        <div>
          <div class="sitename" style="font-size:18px;">Add device</div>
          <div class="siteloc" style="margin-top:2px;">Place a new device into a rack at ${esc(site.name)}</div>
        </div>
        <button class="modal-close" id="closeModal">&times;</button>
      </div>

      ${state.addDeviceError ? `<div class="form-error">${esc(state.addDeviceError)}</div>` : ''}

      <form id="addDeviceForm">
        <div class="field-row">
          <div class="field">
            <label>Site</label>
            <select id="fSite">
              ${SITES.map(s=>`<option value="${s.id}" ${s.id===site.id?'selected':''}>${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Rack</label>
            <select id="fRack">
              ${rackOptions.map(r=>`<option value="${r.id}" ${r.id===preselectRack?'selected':''}>${r.id} (${42-r.occupiedU}U free)</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="field">
          <label>Device model</label>
          <input id="fModel" list="deviceModelList" placeholder="e.g. Rack Server 2U" autocomplete="off"/>
          <datalist id="deviceModelList">${deviceNames.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Size (U)</label>
            <input id="fSize" type="number" min="1" max="42" step="1" value="1"/>
          </div>
          <div class="field">
            <label>Serial number</label>
            <input id="fSerial" placeholder="e.g. SN-4F82K1" autocomplete="off"/>
          </div>
        </div>

        <div class="field">
          <label>Authorized person</label>
          <input id="fPerson" placeholder="Full name" autocomplete="off"/>
        </div>

        <div class="field">
          <label>Datasheet consumption (kVA)</label>
          <input id="fDatasheet" type="number" min="0" step="0.01" placeholder="0.00"/>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
          <button type="button" class="btn" id="cancelAddDevice">Cancel</button>
          <button type="submit" class="btn btn-primary">Add device</button>
        </div>
      </form>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------
   EDIT DEVICE MODAL (managers + admins)
--------------------------------------------------------------- */
function renderEditDeviceModal(){
  const site = SITES.find(s=>s.id===state.editDeviceSiteId);
  const rack = site.racks.find(r=>r.id===state.editDeviceRackId);
  const dev = rack.devices.find(d=>d.id===state.editDeviceId);
  const deviceNames = DEVICE_TYPES.map(t=>t.name);

  return `
  <div class="overlay" id="overlay">
    <div class="modal" style="max-width:520px;">
      <div class="modal-top">
        <div>
          <div class="sitename" style="font-size:18px;">Edit device</div>
          <div class="siteloc" style="margin-top:2px;">${rack.id} · ${esc(site.name)}</div>
        </div>
        <button class="modal-close" id="closeModal">&times;</button>
      </div>

      ${state.editDeviceError ? `<div class="form-error">${esc(state.editDeviceError)}</div>` : ''}

      <form id="editDeviceForm">
        <div class="field">
          <label>Device model</label>
          <input id="eModel" list="deviceModelListEdit" value="${esc(dev.model)}" autocomplete="off"/>
          <datalist id="deviceModelListEdit">${deviceNames.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Size (U)</label>
            <input id="eSize" type="number" min="1" max="42" step="1" value="${dev.sizeU}"/>
          </div>
          <div class="field">
            <label>Serial number</label>
            <input id="eSerial" value="${esc(dev.serialNumber||'')}" autocomplete="off"/>
          </div>
        </div>

        <div class="field">
          <label>Authorized person</label>
          <input id="ePerson" value="${esc(dev.authorizedPerson)}" autocomplete="off"/>
        </div>

        <div class="field">
          <label>Datasheet consumption (kVA)</label>
          <input id="eDatasheet" type="number" min="0" step="0.01" value="${dev.datasheetKva}"/>
        </div>
        <div class="faint" style="font-size:11.5px;margin:-6px 0 14px;">Changing size will re-place this device in the next free slot if its current position no longer fits.</div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
          <button type="button" class="btn" id="cancelEditDevice">Cancel</button>
          <button type="submit" class="btn btn-primary">Save changes</button>
        </div>
      </form>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------
   ADD SITE MODAL (managers + admins)
--------------------------------------------------------------- */
function renderAddSiteModal(){
  return `
  <div class="overlay" id="overlay">
    <div class="modal" style="max-width:520px;">
      <div class="modal-top">
        <div>
          <div class="sitename" style="font-size:18px;">Add site</div>
          <div class="siteloc" style="margin-top:2px;">Define the rack layout for a new colocation site</div>
        </div>
        <button class="modal-close" id="closeModal">&times;</button>
      </div>

      ${state.addSiteError ? `<div class="form-error">${esc(state.addSiteError)}</div>` : ''}

      <form id="addSiteForm">
        <div class="field">
          <label>Site name</label>
          <input id="sName" placeholder="e.g. E55" autocomplete="off"/>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Location</label>
            <input id="sLocation" placeholder="e.g. Cairo — Bldg 55" autocomplete="off"/>
          </div>
          <div class="field">
            <label>Tier</label>
            <select id="sTier">
              <option>Tier I</option><option>Tier II</option><option selected>Tier III</option><option>Tier IV</option>
            </select>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Number of racks</label>
            <input id="sRackCount" type="number" min="1" max="2000" step="1" value="40"/>
          </div>
          <div class="field">
            <label>Number of rows</label>
            <input id="sRowCount" type="number" min="1" max="200" step="1" value="4"/>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Maximum power per rack (kVA)</label>
            <input id="sCapacity" type="number" min="0.5" step="0.5" value="10"/>
          </div>
          <div class="field">
            <label>PUE</label>
            <input id="sPue" type="number" min="1" step="0.01" value="1.4"/>
          </div>
        </div>
        <div class="faint" style="font-size:11.5px;margin:-6px 0 14px;">Applied to every rack at creation — each rack's max power can still be adjusted individually afterward.</div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
          <button type="button" class="btn" id="cancelAddSite">Cancel</button>
          <button type="submit" class="btn btn-primary">Create site</button>
        </div>
      </form>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------
   EDIT SITE MODAL (managers + admins) — name/location/tier/PUE
--------------------------------------------------------------- */
function renderEditSiteModal(){
  const site = SITES.find(s=>s.id===state.editSiteId);
  return `
  <div class="overlay" id="overlay">
    <div class="modal" style="max-width:480px;">
      <div class="modal-top">
        <div>
          <div class="sitename" style="font-size:18px;">Edit site — ${esc(site.name)}</div>
          <div class="siteloc" style="margin-top:2px;">Rack count and layout are set at creation and can't be changed here.</div>
        </div>
        <button class="modal-close" id="closeModal">&times;</button>
      </div>

      ${state.editSiteError ? `<div class="form-error">${esc(state.editSiteError)}</div>` : ''}

      <form id="editSiteForm">
        <div class="field">
          <label>Site name</label>
          <input id="eName" value="${esc(site.name)}" autocomplete="off"/>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Location</label>
            <input id="eLocation" value="${esc(site.location||'')}" autocomplete="off"/>
          </div>
          <div class="field">
            <label>Tier</label>
            <select id="eTier">
              ${['Tier I','Tier II','Tier III','Tier IV'].map(t=>`<option ${site.tier===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>PUE</label>
          <input id="ePue" type="number" min="1" step="0.01" value="${site.pue}"/>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
          <button type="button" class="btn" id="cancelEditSite">Cancel</button>
          <button type="submit" class="btn btn-primary">Save changes</button>
        </div>
      </form>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------
   ADD RACK MODAL (managers + admins) — add a single rack to any row
--------------------------------------------------------------- */
function renderAddRackModal(){
  const site = SITES.find(s=>s.id===state.addRackSiteId);
  const existingRows = [...new Set(site.racks.map(r=>r.row))].sort();
  const suggestedId = `${site.id.toUpperCase()}-R${String(site.racks.length+1).padStart(3,'0')}`;
  return `
  <div class="overlay" id="overlay">
    <div class="modal" style="max-width:480px;">
      <div class="modal-top">
        <div>
          <div class="sitename" style="font-size:18px;">Add rack</div>
          <div class="siteloc" style="margin-top:2px;">Add a single rack to ${esc(site.name)}, in any row</div>
        </div>
        <button class="modal-close" id="closeModal">&times;</button>
      </div>

      ${state.addRackError ? `<div class="form-error">${esc(state.addRackError)}</div>` : ''}

      <form id="addRackForm">
        <div class="field">
          <label>Rack name</label>
          <input id="rRackId" value="${esc(suggestedId)}" class="mono" autocomplete="off"/>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Row</label>
            <input id="rRow" list="existingRows" placeholder="e.g. A" autocomplete="off"/>
            <datalist id="existingRows">${existingRows.map(r=>`<option value="${esc(r)}">`).join('')}</datalist>
          </div>
          <div class="field">
            <label>Max power (kVA)</label>
            <input id="rCapacity" type="number" min="0.5" step="0.5" value="10"/>
          </div>
        </div>
        <div class="field">
          <label>Circuit breaker # <span class="faint" style="text-transform:none;font-weight:400;">(optional)</span></label>
          <input id="rBreaker" placeholder="e.g. CB-14" autocomplete="off"/>
        </div>
        <div class="faint" style="font-size:11.5px;margin:-6px 0 14px;">Existing rows are suggested, but you can type a new row letter to start one.</div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
          <button type="button" class="btn" id="cancelAddRack">Cancel</button>
          <button type="submit" class="btn btn-primary">Add rack</button>
        </div>
      </form>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------
   RACK HISTORY MODAL
--------------------------------------------------------------- */
const HISTORY_LABELS = { device_added:'Added', device_removed:'Removed', device_edited:'Edited', capacity_changed:'Capacity', actual_changed:'Actual', breaker_changed:'Breaker', rack_moved:'Moved', rack_renamed:'Renamed' };
const HISTORY_COLORS = { device_added:'green', device_removed:'red', device_edited:'amber', capacity_changed:'amber', actual_changed:'amber', breaker_changed:'amber', rack_moved:'amber', rack_renamed:'amber' };

function fmtWhen(iso){
  const d = new Date(iso);
  if(isNaN(d)) return iso;
  return d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function renderHistoryModal(rack){
  const events = state.historyEvents || [];
  return `
  <div class="overlay" id="historyOverlay">
    <div class="modal" style="max-width:520px;">
      <div class="modal-top">
        <div>
          <div class="sitename" style="font-size:18px;">History — ${rack.id}</div>
          <div class="siteloc" style="margin-top:2px;">Every device add/remove and capacity change, last 6 months</div>
        </div>
        <button class="modal-close" id="closeHistory">&times;</button>
      </div>

      ${state.historyLoading ? `<div class="faint" style="padding:20px 0;text-align:center;">Loading…</div>` :
        events.length===0 ? `<div class="faint" style="padding:20px 0;text-align:center;">No changes recorded for this rack in the last 6 months.</div>` : `
        <div class="historylist">
          ${events.map(ev=>`
            <div class="historyrow">
              <span class="badge ${HISTORY_COLORS[ev.eventType]||'green'}" style="min-width:64px;text-align:center;">${HISTORY_LABELS[ev.eventType]||ev.eventType}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;">${esc(ev.detail)}</div>
                <div class="faint" style="font-size:11px;margin-top:2px;">${esc(ev.actor||'Unknown')} · ${fmtWhen(ev.createdAt)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  </div>`;
}

/* ---------------------------------------------------------------
   ANALYSIS TAB
--------------------------------------------------------------- */
const COVE = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];

function deviceMixCounts(){
  const map = {};
  SITES.forEach(s=>s.racks.forEach(r=>r.devices.forEach(d=>{ map[d.model]=(map[d.model]||0)+1; })));
  const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const top = entries.slice(0,7);
  const restSum = entries.slice(7).reduce((s,[,c])=>s+c,0);
  if(restSum>0) top.push(['Other', restSum]);
  return top;
}
function ownerPowerTotals(){
  const map = {};
  SITES.forEach(s=>s.racks.forEach(r=>r.devices.forEach(d=>{ map[d.authorizedPerson]=(map[d.authorizedPerson]||0)+d.datasheetKva; })));
  return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,6);
}
function utilBuckets(){
  const buckets = [0,0,0,0];
  SITES.forEach(s=>s.racks.forEach(r=>{
    const p = r.capacityKva>0 ? (r.actualKva/r.capacityKva)*100 : 0;
    if(p<50) buckets[0]++; else if(p<75) buckets[1]++; else if(p<90) buckets[2]++; else buckets[3]++;
  }));
  return buckets;
}
function renderAnalysis(){
  const racks = SITES.reduce((s,x)=>s+x.racks.length,0);
  const it = SITES.reduce((s,x)=>s+x.itLoadKva,0);
  const util = SITES.reduce((s,x)=>s+x.utilityLoadKva,0);
  const cap = SITES.reduce((s,x)=>s+x.totalCapacityKva,0);
  const devices = SITES.reduce((s,x)=>s+x.racks.reduce((s2,r)=>s2+r.devices.length,0),0);
  const owners = ownerPowerTotals();

  return `
    <div class="h1">Portfolio analysis</div>
    <div class="muted" style="font-size:13px;margin:4px 0 20px;">${SITES.length} sites · ${racks} racks · ${devices} devices tracked</div>

    <div class="card kpirow">
      <div><div class="stat-label">Total IT load</div><div class="stat-value">${fmtKva(it,0)}</div></div>
      <div><div class="stat-label">Total utility load</div><div class="stat-value">${fmtKva(util,0)}</div></div>
      <div><div class="stat-label">Total capacity</div><div class="stat-value">${fmtKva(cap,0)}</div></div>
      <div><div class="stat-label">Portfolio utilization</div><div class="stat-value">${fmtPct(cap>0?it/cap:0)}</div></div>
    </div>

    <div class="agrid">
      <div class="card achart-card">
        <div class="achart-title">IT load by site</div>
        <div style="position:relative;height:220px;"><canvas id="chartSiteLoad" role="img" aria-label="Bar chart of IT load in kilowatts for each site"></canvas></div>
      </div>
      <div class="card achart-card">
        <div class="achart-title">Rack utilization distribution</div>
        <div style="position:relative;height:220px;"><canvas id="chartUtilBuckets" role="img" aria-label="Bar chart of rack counts by utilization bracket"></canvas></div>
        <div class="legend-row">
          <span><span class="legend-sw" style="background:#1FA97A;"></span>Normal</span>
          <span><span class="legend-sw" style="background:#C9821A;"></span>Warning</span>
          <span><span class="legend-sw" style="background:#D6373C;"></span>Critical</span>
        </div>
      </div>
    </div>

    <div class="agrid">
      <div class="card achart-card">
        <div class="achart-title">Device mix (portfolio-wide)</div>
        <div style="position:relative;height:220px;"><canvas id="chartDeviceMix" role="img" aria-label="Donut chart of device counts by model across all sites"></canvas></div>
        <div class="legend-row" id="deviceMixLegend"></div>
      </div>
      <div class="card achart-card">
        <div class="achart-title">Top authorized owners by device rating</div>
        <div class="ownerlist">
          ${owners.map(([name,kw])=>`<div class="ownerrow"><span>${esc(name)}</span><span class="mono" style="color:var(--purple-dark);font-weight:600;">${kw.toFixed(1)} kVA</span></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}
let chartInstances = {};
function drawAnalysisCharts(){
  if(typeof Chart === 'undefined') return;
  Object.values(chartInstances).forEach(c=>c && c.destroy());
  chartInstances = {};

  const siteLoadEl = document.getElementById('chartSiteLoad');
  if(siteLoadEl){
    chartInstances.siteLoad = new Chart(siteLoadEl, {
      type:'bar',
      data:{ labels: SITES.map(s=>s.name), datasets:[{ label:'IT load (kVA)', data: SITES.map(s=>Math.round(s.itLoadKva)), backgroundColor:'#6C4EE3', borderRadius:4, maxBarThickness:44 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
        scales:{ y:{ beginAtZero:true, grid:{ color:'#EEF0F3' }, ticks:{ color:'#8A93A3' } }, x:{ grid:{ display:false }, ticks:{ color:'#5B6472' } } } }
    });
  }
  const bucketEl = document.getElementById('chartUtilBuckets');
  if(bucketEl){
    const b = utilBuckets();
    chartInstances.buckets = new Chart(bucketEl, {
      type:'bar',
      data:{ labels:['<50%','50–75%','75–90%','90–100%'], datasets:[{ data:b, backgroundColor:['#1FA97A','#1FA97A','#C9821A','#D6373C'], borderRadius:4, maxBarThickness:44 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
        scales:{ y:{ beginAtZero:true, grid:{ color:'#EEF0F3' }, ticks:{ color:'#8A93A3', stepSize:Math.max(1, Math.ceil(Math.max(...b,1)/5)) } }, x:{ grid:{ display:false }, ticks:{ color:'#5B6472' } } } }
    });
  }
  const mixEl = document.getElementById('chartDeviceMix');
  if(mixEl){
    const mix = deviceMixCounts();
    const total = mix.reduce((s,[,c])=>s+c,0) || 1;
    chartInstances.mix = new Chart(mixEl, {
      type:'doughnut',
      data:{ labels: mix.map(([n])=>n), datasets:[{ data: mix.map(([,c])=>c), backgroundColor: mix.map((_,i)=>COVE[i%COVE.length]), borderColor:'#fff', borderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }
    });
    const legendEl = document.getElementById('deviceMixLegend');
    if(legendEl) legendEl.innerHTML = mix.map(([n,c],i)=>`<span><span class="legend-sw" style="background:${COVE[i%COVE.length]};"></span>${esc(n)} ${Math.round(c/total*100)}%</span>`).join('');
  }
}

/* ---------------------------------------------------------------
   ROOT RENDER + EVENT WIRING
--------------------------------------------------------------- */
const rootEl = document.getElementById('app');
const topbarMeta = document.getElementById('topbarMeta');
const topbarNav = document.getElementById('topbarNav');
let modalRoot;

function renderRoot(){
  if(LIVE && !state.user){
    document.getElementById('topbar').style.display = 'none';
    rootEl.innerHTML = renderLogin();
    wireAuthForm();
    return;
  }
  document.getElementById('topbar').style.display = 'flex';
  renderTopbarMeta();
  render();
}

function renderTopbarMeta(){
  if(LIVE){
    topbarMeta.innerHTML = `
      <span class="role-tag ${state.role}">${state.role}</span>
      <span>${esc(state.user.email)}</span>
      <button class="signout-link" id="signOutBtn">Sign out</button>
    `;
    document.getElementById('signOutBtn').addEventListener('click', signOut);
  } else {
    topbarMeta.innerHTML = `
      <span class="demo-switch">Demo mode — viewing as
        <select id="demoRoleSelect">
          <option value="admin" ${state.role==='admin'?'selected':''}>Admin</option>
          <option value="manager" ${state.role==='manager'?'selected':''}>Manager</option>
          <option value="technician" ${state.role==='technician'?'selected':''}>Technician</option>
        </select>
      </span>
    `;
    document.getElementById('demoRoleSelect').addEventListener('change', (e)=>{ state.role = e.target.value; render(); });
  }
}

function render(){
  if(state.view==='dashboard') rootEl.innerHTML = renderDashboard();
  else if(state.view==='analysis') rootEl.innerHTML = renderAnalysis();
  else rootEl.innerHTML = renderSite(SITES.find(s=>s.id===state.siteId));
  attachHandlers();
  renderModal();
  renderHistoryOverlay();
  updateNavActive();
  if(state.view==='analysis') requestAnimationFrame(drawAnalysisCharts);
}
function updateNavActive(){
  document.getElementById('navSites').classList.toggle('active', state.view==='dashboard' || state.view==='site');
  document.getElementById('navAnalysis').classList.toggle('active', state.view==='analysis');
}

function renderModal(){
  if(!modalRoot){ modalRoot = document.createElement('div'); document.body.appendChild(modalRoot); }
  if(!state.modalType){ modalRoot.innerHTML=''; return; }

  if(state.modalType==='rack'){
    const site = SITES.find(s=>s.id===state.modalSiteId);
    const rack = site.racks.find(r=>r.id===state.modalRack.id);
    modalRoot.innerHTML = renderRackModal(rack, site);
    document.getElementById('overlay').addEventListener('click', (e)=>{ if(e.target.id==='overlay') closeModal(); });
    document.getElementById('closeModal').addEventListener('click', closeModal);
    modalRoot.querySelectorAll('[data-face]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ state.rackFace = btn.getAttribute('data-face'); renderModal(); });
    });
    const editBtn = document.getElementById('editCapacityBtn');
    if(editBtn) editBtn.addEventListener('click', ()=>{ state.editingCapacity=true; state.capacityError=null; renderModal(); });
    const saveCap = document.getElementById('saveCapacity');
    if(saveCap) saveCap.addEventListener('click', async ()=>{
      const val = parseFloat(document.getElementById('capacityInput').value);
      if(isNaN(val) || val<=0){ state.capacityError='Enter a valid capacity greater than 0.'; renderModal(); return; }
      const res = await updateRackCapacity(site.id, rack.id, val);
      if(res.error){ state.capacityError=res.error; renderModal(); return; }
      state.editingCapacity=false; state.capacityError=null;
      showToast(`${rack.id} max power set to ${val} kVA`);
      renderModal(); render();
    });
    const cancelCap = document.getElementById('cancelCapacity');
    if(cancelCap) cancelCap.addEventListener('click', ()=>{ state.editingCapacity=false; state.capacityError=null; renderModal(); });

    const editActualBtn = document.getElementById('editActualBtn');
    if(editActualBtn) editActualBtn.addEventListener('click', ()=>{ state.editingActual=true; state.actualError=null; renderModal(); });
    const saveActual = document.getElementById('saveActual');
    if(saveActual) saveActual.addEventListener('click', async ()=>{
      const val = parseFloat(document.getElementById('actualInput').value);
      if(isNaN(val) || val<0){ state.actualError='Enter a valid measured power (0 or more).'; renderModal(); return; }
      const res = await updateRackActual(site.id, rack.id, val);
      if(res.error){ state.actualError=res.error; renderModal(); return; }
      state.editingActual=false; state.actualError=null;
      showToast(`${rack.id} actual power set to ${val} kVA`);
      renderModal(); render();
    });
    const cancelActual = document.getElementById('cancelActual');
    if(cancelActual) cancelActual.addEventListener('click', ()=>{ state.editingActual=false; state.actualError=null; renderModal(); });

    const editBreakerBtn = document.getElementById('editBreakerBtn');
    if(editBreakerBtn) editBreakerBtn.addEventListener('click', ()=>{ state.editingBreaker=true; renderModal(); });
    const saveBreaker = document.getElementById('saveBreaker');
    if(saveBreaker) saveBreaker.addEventListener('click', async ()=>{
      const val = document.getElementById('breakerInput').value.trim();
      const res = await updateRackBreaker(site.id, rack.id, val);
      if(res.error){ showToast(res.error, true); return; }
      state.editingBreaker=false;
      showToast(`${rack.id} circuit breaker updated`);
      renderModal(); render();
    });
    const cancelBreaker = document.getElementById('cancelBreaker');
    if(cancelBreaker) cancelBreaker.addEventListener('click', ()=>{ state.editingBreaker=false; renderModal(); });

    const editNameBtn = document.getElementById('editRackNameBtn');
    if(editNameBtn) editNameBtn.addEventListener('click', ()=>{ state.editingRackName=true; state.rackNameError=null; renderModal(); });
    const saveNameBtn = document.getElementById('saveRackName');
    if(saveNameBtn) saveNameBtn.addEventListener('click', async ()=>{
      const newId = document.getElementById('rackNameInput').value.trim();
      if(!newId){ state.rackNameError='Enter a rack name.'; renderModal(); return; }
      const oldId = rack.id;
      const res = await renameRack(site.id, oldId, newId);
      if(res.error){ state.rackNameError=res.error; renderModal(); return; }
      state.editingRackName=false; state.rackNameError=null;
      showToast(`${oldId} renamed to ${newId}`);
      renderModal(); render();
    });
    const cancelNameBtn = document.getElementById('cancelRackName');
    if(cancelNameBtn) cancelNameBtn.addEventListener('click', ()=>{ state.editingRackName=false; state.rackNameError=null; renderModal(); });

    modalRoot.querySelectorAll('[data-remove-device]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(!confirm('Remove this device from the rack?')) return;
        const res = await removeDevice(btn.getAttribute('data-remove-site'), btn.getAttribute('data-remove-rack'), btn.getAttribute('data-remove-device'));
        if(res.error){ showToast(res.error, true); return; }
        showToast('Device removed.');
        renderModal(); render();
      });
    });
    modalRoot.querySelectorAll('[data-edit-device]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.editDeviceSiteId = btn.getAttribute('data-edit-site');
        state.editDeviceRackId = btn.getAttribute('data-edit-rack');
        state.editDeviceId = btn.getAttribute('data-edit-device');
        state.editDeviceError = null;
        state.modalType = 'editDevice';
        renderModal();
      });
    });
    const addFromRack = modalRoot.querySelector('[data-add-device-rack]');
    if(addFromRack) addFromRack.addEventListener('click', ()=>{
      state.addDeviceSiteId = addFromRack.getAttribute('data-add-device-site');
      state.addDeviceRackId = addFromRack.getAttribute('data-add-device-rack');
      state.addDeviceError = null;
      state.modalType = 'addDevice';
      renderModal();
    });
    const historyBtn = document.getElementById('openHistory');
    if(historyBtn) historyBtn.addEventListener('click', ()=> openHistory(rack));
    return;
  }

  if(state.modalType==='addDevice'){
    modalRoot.innerHTML = renderAddDeviceModal();
    document.getElementById('overlay').addEventListener('click', (e)=>{ if(e.target.id==='overlay') closeModal(); });
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelAddDevice').addEventListener('click', closeModal);
    document.getElementById('fSite').addEventListener('change', (e)=>{ state.addDeviceSiteId = e.target.value; state.addDeviceRackId=null; state.addDeviceError=null; renderModal(); });
    document.getElementById('addDeviceForm').addEventListener('submit', handleAddDeviceSubmit);
    return;
  }

  if(state.modalType==='addSite'){
    modalRoot.innerHTML = renderAddSiteModal();
    document.getElementById('overlay').addEventListener('click', (e)=>{ if(e.target.id==='overlay') closeModal(); });
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelAddSite').addEventListener('click', closeModal);
    document.getElementById('addSiteForm').addEventListener('submit', handleAddSiteSubmit);
    return;
  }

  if(state.modalType==='editSite'){
    modalRoot.innerHTML = renderEditSiteModal();
    document.getElementById('overlay').addEventListener('click', (e)=>{ if(e.target.id==='overlay') closeModal(); });
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelEditSite').addEventListener('click', closeModal);
    document.getElementById('editSiteForm').addEventListener('submit', handleEditSiteSubmit);
    return;
  }

  if(state.modalType==='addRack'){
    modalRoot.innerHTML = renderAddRackModal();
    document.getElementById('overlay').addEventListener('click', (e)=>{ if(e.target.id==='overlay') closeModal(); });
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelAddRack').addEventListener('click', closeModal);
    document.getElementById('addRackForm').addEventListener('submit', handleAddRackSubmit);
    return;
  }

  if(state.modalType==='editDevice'){
    modalRoot.innerHTML = renderEditDeviceModal();
    document.getElementById('overlay').addEventListener('click', (e)=>{ if(e.target.id==='overlay') closeModal(); });
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelEditDevice').addEventListener('click', closeModal);
    document.getElementById('editDeviceForm').addEventListener('submit', handleEditDeviceSubmit);
  }
}

function closeModal(){
  state.modalRack=null; state.modalSiteId=null; state.rackFace='front';
  state.modalType=null; state.addDeviceSiteId=null; state.addDeviceRackId=null; state.addDeviceError=null;
  state.editingCapacity=false; state.capacityError=null; state.addSiteError=null;
  state.editingActual=false; state.actualError=null; state.editingBreaker=false;
  state.editingRackName=false; state.rackNameError=null;
  state.editSiteId=null; state.editSiteError=null;
  state.addRackError=null;
  state.editDeviceId=null; state.editDeviceRackId=null; state.editDeviceSiteId=null; state.editDeviceError=null;
  renderModal();
}

/* ---------------------------------------------------------------
   HISTORY OVERLAY (stacks on top of the rack modal)
--------------------------------------------------------------- */
let historyModalRoot;
async function openHistory(rack){
  state.historyRack = rack; state.historySiteId = state.modalSiteId;
  state.historyLoading = true; state.historyEvents = null;
  renderHistoryOverlay();
  const res = await loadRackHistory(rack.id);
  state.historyLoading = false;
  state.historyEvents = res.ok ? res.events : [];
  if(res.error) showToast(res.error, true);
  renderHistoryOverlay();
}
function closeHistory(){
  state.historyRack = null; state.historySiteId = null; state.historyEvents = null; state.historyLoading = false;
  renderHistoryOverlay();
}
function renderHistoryOverlay(){
  if(!historyModalRoot){ historyModalRoot = document.createElement('div'); document.body.appendChild(historyModalRoot); }
  if(!state.historyRack){ historyModalRoot.innerHTML=''; return; }
  historyModalRoot.innerHTML = renderHistoryModal(state.historyRack);
  document.getElementById('historyOverlay').addEventListener('click', (e)=>{ if(e.target.id==='historyOverlay') closeHistory(); });
  document.getElementById('closeHistory').addEventListener('click', closeHistory);
}

async function handleAddDeviceSubmit(e){
  e.preventDefault();
  const siteId = document.getElementById('fSite').value;
  const rackId = document.getElementById('fRack').value;
  const model = document.getElementById('fModel').value.trim();
  const sizeU = parseInt(document.getElementById('fSize').value, 10);
  const serial = document.getElementById('fSerial').value.trim();
  const person = document.getElementById('fPerson').value.trim();
  const datasheet = parseFloat(document.getElementById('fDatasheet').value);

  if(!model){ state.addDeviceError='Enter a device model.'; renderModal(); return; }
  if(!serial){ state.addDeviceError='Enter a serial number.'; renderModal(); return; }
  if(!person){ state.addDeviceError='Enter an authorized person.'; renderModal(); return; }
  if(!Number.isInteger(sizeU) || sizeU<1 || sizeU>42){ state.addDeviceError='Size must be a whole number between 1 and 42 U.'; renderModal(); return; }
  if(isNaN(datasheet) || datasheet<=0){ state.addDeviceError='Enter a valid datasheet consumption greater than 0.'; renderModal(); return; }

  const res = await addDevice({ siteId, rackId, model, sizeU, serialNumber:serial, datasheetKva:datasheet, authorizedPerson:person });
  if(res.error){ state.addDeviceError = res.error; renderModal(); return; }

  const wasRackModal = state.modalRack && state.modalRack.id === rackId;
  closeModal();
  showToast(`${model} added to ${rackId} (U${res.startU}${sizeU>1?'-'+(res.startU+sizeU-1):''})`);
  if(wasRackModal){ state.modalType='rack'; state.modalRack={id:rackId}; state.modalSiteId=siteId; }
  render();
}

async function handleEditDeviceSubmit(e){
  e.preventDefault();
  const siteId = state.editDeviceSiteId;
  const rackId = state.editDeviceRackId;
  const deviceId = state.editDeviceId;
  const model = document.getElementById('eModel').value.trim();
  const sizeU = parseInt(document.getElementById('eSize').value, 10);
  const serial = document.getElementById('eSerial').value.trim();
  const person = document.getElementById('ePerson').value.trim();
  const datasheet = parseFloat(document.getElementById('eDatasheet').value);

  if(!model){ state.editDeviceError='Enter a device model.'; renderModal(); return; }
  if(!person){ state.editDeviceError='Enter an authorized person.'; renderModal(); return; }
  if(!Number.isInteger(sizeU) || sizeU<1 || sizeU>42){ state.editDeviceError='Size must be a whole number between 1 and 42 U.'; renderModal(); return; }
  if(isNaN(datasheet) || datasheet<=0){ state.editDeviceError='Enter a valid datasheet consumption greater than 0.'; renderModal(); return; }

  const res = await editDevice(siteId, rackId, deviceId, { model, sizeU, serialNumber:serial, datasheetKva:datasheet, authorizedPerson:person });
  if(res.error){ state.editDeviceError = res.error; renderModal(); return; }

  closeModal();
  showToast(`${model} updated.`);
  state.modalType='rack'; state.modalRack={id:rackId}; state.modalSiteId=siteId;
  render();
}

async function handleAddSiteSubmit(e){
  e.preventDefault();
  const name = document.getElementById('sName').value.trim();
  const location = document.getElementById('sLocation').value.trim();
  const tier = document.getElementById('sTier').value;
  const rackCount = parseInt(document.getElementById('sRackCount').value, 10);
  const rowCount = parseInt(document.getElementById('sRowCount').value, 10);
  const defaultCapacityKva = parseFloat(document.getElementById('sCapacity').value);
  const pue = parseFloat(document.getElementById('sPue').value);

  if(!name){ state.addSiteError='Enter a site name.'; renderModal(); return; }
  if(!Number.isInteger(rackCount) || rackCount<1 || rackCount>2000){ state.addSiteError='Number of racks must be a whole number between 1 and 2000.'; renderModal(); return; }
  if(!Number.isInteger(rowCount) || rowCount<1 || rowCount>rackCount){ state.addSiteError='Number of rows must be a whole number between 1 and the number of racks.'; renderModal(); return; }
  if(isNaN(defaultCapacityKva) || defaultCapacityKva<=0){ state.addSiteError='Enter a valid default rack capacity greater than 0.'; renderModal(); return; }
  if(isNaN(pue) || pue<1){ state.addSiteError='PUE must be 1 or greater.'; renderModal(); return; }

  const res = await createSite({ name, location, tier, pue, rackCount, rowCount, defaultCapacityKva });
  if(res.error){ state.addSiteError = res.error; renderModal(); return; }

  closeModal();
  showToast(`${name} created with ${rackCount} racks.`);
  render();
}

async function handleEditSiteSubmit(e){
  e.preventDefault();
  const name = document.getElementById('eName').value.trim();
  const location = document.getElementById('eLocation').value.trim();
  const tier = document.getElementById('eTier').value;
  const pue = parseFloat(document.getElementById('ePue').value);

  if(!name){ state.editSiteError='Enter a site name.'; renderModal(); return; }
  if(isNaN(pue) || pue<1){ state.editSiteError='PUE must be 1 or greater.'; renderModal(); return; }

  const res = await updateSiteInfo(state.editSiteId, { name, location, tier, pue });
  if(res.error){ state.editSiteError = res.error; renderModal(); return; }

  closeModal();
  showToast(`${name} updated.`);
  render();
}

async function handleAddRackSubmit(e){
  e.preventDefault();
  const rackId = document.getElementById('rRackId').value.trim();
  const row = document.getElementById('rRow').value.trim().toUpperCase();
  const capacityKva = parseFloat(document.getElementById('rCapacity').value);
  const breaker = document.getElementById('rBreaker').value.trim();

  if(!rackId){ state.addRackError='Enter a rack name.'; renderModal(); return; }
  if(!row){ state.addRackError='Enter a row.'; renderModal(); return; }
  if(isNaN(capacityKva) || capacityKva<=0){ state.addRackError='Enter a valid max power greater than 0.'; renderModal(); return; }

  const res = await addRackToSite(state.addRackSiteId, { rackId, row, capacityKva, circuitBreaker: breaker });
  if(res.error){ state.addRackError = res.error; renderModal(); return; }

  closeModal();
  showToast(`${rackId} added to Row ${row}.`);
  render();
}

function attachHandlers(){
  rootEl.querySelectorAll('[data-open-site]').forEach(el=>{
    el.addEventListener('click', ()=>{ state.view='site'; state.siteId=el.getAttribute('data-open-site'); state.search=''; state.sort='name'; state.siteSub='floor'; render(); });
  });
  rootEl.querySelectorAll('[data-back]').forEach(el=>{
    el.addEventListener('click', ()=>{ state.view='dashboard'; state.siteId=null; render(); });
  });
  rootEl.querySelectorAll('[data-sub]').forEach(el=>{
    el.addEventListener('click', ()=>{ state.siteSub = el.getAttribute('data-sub'); render(); });
  });
  rootEl.querySelectorAll('[data-open-rack]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const site = SITES.find(s=>s.id===state.siteId);
      const rack = site.racks.find(r=>r.id===el.getAttribute('data-open-rack'));
      state.modalRack = rack; state.modalSiteId = site.id; state.rackFace='front'; state.modalType='rack';
      renderModal();
    });
  });
  rootEl.querySelectorAll('[data-add-device]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      state.addDeviceSiteId = el.getAttribute('data-add-device');
      state.addDeviceRackId = null;
      state.addDeviceError = null;
      state.modalType = 'addDevice';
      renderModal();
    });
  });
  const openAddSite = document.getElementById('openAddSite');
  if(openAddSite) openAddSite.addEventListener('click', ()=>{ state.addSiteError=null; state.modalType='addSite'; renderModal(); });
  const openEditSite = document.getElementById('openEditSite');
  if(openEditSite) openEditSite.addEventListener('click', ()=>{ state.editSiteId=state.siteId; state.editSiteError=null; state.modalType='editSite'; renderModal(); });
  rootEl.querySelectorAll('[data-add-rack]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.addRackSiteId = el.getAttribute('data-add-rack');
      state.addRackError = null;
      state.modalType = 'addRack';
      renderModal();
    });
  });
  rootEl.querySelectorAll('[data-remove-site]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const id = el.getAttribute('data-remove-site');
      const name = el.getAttribute('data-remove-site-name');
      if(!confirm(`Remove ${name}? This deletes all its racks and devices permanently.`)) return;
      const res = await removeSite(id);
      if(res.error){ showToast(res.error, true); return; }
      showToast(`${name} removed.`);
      if(state.siteId===id){ state.view='dashboard'; state.siteId=null; }
      render();
    });
  });
  const seedBtn = document.getElementById('seedBtn');
  if(seedBtn) seedBtn.addEventListener('click', seedDemoDataToSupabase);
  const sb2 = document.getElementById('searchbox');
  if(sb2) sb2.addEventListener('input', ()=>{ state.search = sb2.value; render(); sb2.focus(); sb2.setSelectionRange(sb2.value.length, sb2.value.length); });
  const ss = document.getElementById('sortsel');
  if(ss) ss.addEventListener('change', ()=>{ state.sort = ss.value; render(); });
}

function wireAuthForm(){
  document.querySelectorAll('[data-authmode]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ state.authMode = btn.getAttribute('data-authmode'); state.authError=null; renderRoot(); });
  });
  document.getElementById('authForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if(state.authMode==='signin') signIn(email, password); else signUp(email, password);
  });
}

document.getElementById('navSites').addEventListener('click', ()=>{ state.view='dashboard'; state.siteId=null; render(); });
document.getElementById('navAnalysis').addEventListener('click', ()=>{ state.view='analysis'; render(); });

/* ---------------------------------------------------------------
   BOOT
--------------------------------------------------------------- */
(async function boot(){
  if(LIVE){
    await initAuth();
    if(!state.user){ renderRoot(); }
  } else {
    await loadData();
    renderRoot();
  }
})();
