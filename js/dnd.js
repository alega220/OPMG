/* ==========================================================
   OPMG v2 — drag & drop for racks (mouse + touch)
   Rows view: reorder within a row, move to another row,
   drop inside or outside a cage. Cages view: drop a rack
   onto a cage lane to join it, or onto "Not in a cage" to
   leave it. Touch uses press-and-hold, then drag.
   ========================================================== */
'use strict';
(function () {
  const THRESH = 7;   /* px of mouse movement before a drag starts */
  const HOLD = 320;   /* ms press-and-hold before a touch drag starts */
  let drag = null;
  let suppressClick = false;

  function dragAllowed() {
    if (!state.ready || state.route.name !== 'site' || (state.route.tab || 'floor') !== 'floor') return false;
    if (!isManager() || state.fp.select) return false;
    return state.fp.group === 'rows' || state.fp.group === 'cages';
  }
  function clearMarks() {
    $$('.rack.drop-before, .rack.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    $$('.lane-flow.drop-in, .cage-racks.drop-in').forEach(x => x.classList.remove('drop-in'));
  }
  function cleanup() {
    if (!drag) return;
    if (drag.timer) clearTimeout(drag.timer);
    if (drag.ghost) drag.ghost.remove();
    if (drag.tile) drag.tile.classList.remove('drag-src');
    document.body.classList.remove('rack-dragging');
    clearMarks();
    drag = null;
  }

  document.addEventListener('pointerdown', e => {
    if (drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!dragAllowed()) return;
    const tile = e.target.closest('.rack[data-key]');
    if (!tile || tile.closest('#modal') || tile.closest('.selbar')) return;
    const entry = RACK_INDEX.get(tile.dataset.key);
    if (!entry) return;
    drag = {
      tile, rack: entry.rack, site: entry.site, pid: e.pointerId,
      x0: e.clientX, y0: e.clientY, started: false, touch: e.pointerType === 'touch',
      target: null, timer: null, ghost: null,
    };
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.started) startDrag(drag.x0, drag.y0); }, HOLD);
  }, true);

  function startDrag(x, y) {
    const rect = drag.tile.getBoundingClientRect();
    drag.started = true;
    if (drag.touch) { drag.dx = rect.width / 2; drag.dy = rect.height + 28; }  /* ghost floats above the finger */
    else { drag.dx = x - rect.left; drag.dy = y - rect.top; }
    const g = drag.tile.cloneNode(true);
    g.classList.remove('sel', 'drop-before', 'drop-after');
    g.classList.add('drag-ghost');
    g.removeAttribute('data-act'); g.removeAttribute('data-key'); g.removeAttribute('title');
    g.style.width = rect.width + 'px'; g.style.height = rect.height + 'px';
    document.body.appendChild(g);
    drag.ghost = g;
    drag.tile.classList.add('drag-src');
    document.body.classList.add('rack-dragging');
    try { drag.tile.setPointerCapture(drag.pid); } catch (_) {}
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (_) {} }
    positionGhost(x, y);
  }
  function positionGhost(x, y) {
    drag.ghost.style.left = (x - drag.dx) + 'px';
    drag.ghost.style.top = (y - drag.dy) + 'px';
  }

  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.started) {
      const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
      if (drag.touch) { if (moved > 10) cleanup(); }        /* a scroll or a tap, not a drag */
      else if (moved > THRESH) startDrag(e.clientX, e.clientY);
      return;
    }
    positionGhost(e.clientX, e.clientY);
    updateTarget(e.clientX, e.clientY);
  }, true);

  function updateTarget(x, y) {
    clearMarks(); drag.target = null;
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const tile = el.closest('.rack[data-key]');
    if (tile && tile !== drag.tile) {
      const flow = tile.closest('.cage-racks, .lane-flow');
      if (!flow) return;
      const r = tile.getBoundingClientRect();
      const before = x < r.left + r.width / 2;
      tile.classList.add(before ? 'drop-before' : 'drop-after');
      drag.target = { kind: 'rack', key: tile.dataset.key, before, flow };
      return;
    }
    const cr = el.closest('.cage-racks');
    if (cr) { cr.classList.add('drop-in'); drag.target = { kind: 'end', flow: cr }; return; }
    const cg = el.closest('.cage');
    if (cg) {
      const crx = cg.querySelector('.cage-racks');
      if (crx) { crx.classList.add('drop-in'); drag.target = { kind: 'end', flow: crx }; return; }
    }
    const flow = el.closest('.lane-flow');
    if (flow) { flow.classList.add('drop-in'); drag.target = { kind: 'end', flow }; }
  }

  function laneFacts(flow) {
    const outer = flow.classList.contains('lane-flow') ? flow : flow.closest('.lane-flow');
    const cageBox = flow.closest('.cage');
    return {
      row: outer ? outer.dataset.row : flow.dataset.row,
      floor: outer ? outer.dataset.floor : flow.dataset.floor,
      cageLane: flow.dataset.cageLane,                 /* cages view: cage id, '' = not in a cage */
      boxCage: cageBox ? cageBox.dataset.cage : null,  /* rows view: cage the drop point sits in */
    };
  }

  document.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (drag.started) { suppressNextClick(); commitDrop(drag); }
    else cleanup();
  }, true);
  document.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.pid) cleanup(); }, true);
  document.addEventListener('contextmenu', e => { if (drag && drag.started) e.preventDefault(); }, true);
  /* keep the page from scrolling once a touch drag has taken over */
  document.addEventListener('touchmove', e => { if (drag && drag.started) e.preventDefault(); }, { capture: true, passive: false });
  /* swallow the click that follows a real drag so it does not open the rack;
     the flag also clears itself because that click can die with the removed tile */
  function suppressNextClick() {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 350);
  }
  document.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); }
  }, true);

  async function commitDrop(d) {
    const t = d.target, rack = d.rack, site = d.site;
    cleanup();
    if (!t) return;
    let res = null, msg = '';
    if (state.fp.group === 'cages') {
      const f = t.kind === 'rack' ? laneFacts(t.flow) : { cageLane: t.flow.dataset.cageLane };
      const cageId = f.cageLane || null;
      if ((rack.cageId || null) === cageId) return;
      const cage = cageId ? site.cages.find(c => String(c.id) === String(cageId)) : null;
      if (cageId && !cage) return;
      res = await assignRacksToCage(site, [rack], cage, { pack: true });
      msg = cage ? `${rack.id} added to ${cage.name}` : `${rack.id} removed from its cage`;
    } else {
      const f = laneFacts(t.flow);
      if (f.row === undefined) return;
      const laneRacks = site.racks.filter(r => r !== rack && String(r.row || '') === String(f.row || '') && String(r.floorId || '') === String(f.floor || '')).sort((a, b) => a.position - b.position);
      let index = laneRacks.length;
      if (t.kind === 'rack') {
        const te = RACK_INDEX.get(t.key);
        if (!te) return;
        const i = laneRacks.indexOf(te.rack);
        if (i < 0) return;
        index = t.before ? i : i + 1;
      }
      const cageId = f.boxCage || null;
      const samePlace = String(rack.row || '') === String(f.row || '')
        && String(rack.floorId || '') === String(f.floor || '')
        && (rack.cageId || null) === cageId && rack.position === index;
      if (samePlace) return;
      res = await placeRack(site, rack, { row: f.row || '', floorId: f.floor || null, index, cageId });
      msg = `${rack.id} moved to row ${f.row || '—'}`;
    }
    renderAll();
    if (res && res.error) { toast(res.error, true); return; }
    if (msg) toast(msg);
  }
})();
