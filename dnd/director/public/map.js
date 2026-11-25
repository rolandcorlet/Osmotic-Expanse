// The Map tab, on every screen: the TRAVEL map of the adventure's places, the ZONE map of the place
// where the party is, and the BATTLE grid of one zone (5-foot squares, 30 feet a side unless a battle
// map says otherwise). The Engine decides every move (engine/map.js and the Ledger); this draws, lights
// the squares a move could reach, and sends what the person picks. The DM switches each map on or off
// for everyone, edits the zones and imports pictures (any image, or a Universal VTT file with its walls).

import * as MAP from '/engine/map.js';

let A = null; // the app's own helpers (app.js passes them in)
export function initMap(api) { A = api; install(); }

const C = 100; // one square, in drawing units
const S = () => A.state();
const ui = () => A.ui.map || (A.ui.map = { view: '', zone: '', sel: '', edit: false, draft: null, travelSel: '', imp: { target: 'site', cols: '', rows: '', split: true, busy: false, file: null, info: '', vtt: null } });
const esc = (x) => A.esc(x);
const host = () => A.role === 'host';
const siteId = () => S().scene.siteId;
const mapOf = () => S().map || MAP.newMap();
const shown = () => ({ ...MAP.newMap().show, ...(mapOf().show || {}) });
const zonesNow = () => { const u = ui(); if (u.edit && u.draft && u.view === 'zones') return u.draft; return (mapOf().zones || {})[siteId()] || MAP.autoZones(); };
const posOf = (k) => (mapOf().at || {})[k] || null;
const whoOf = (k) => { const [kind, id] = String(k).split(':'); return kind === 'pc' ? S().pcs[id] : S().foes[id]; };
const myKey = () => { const p = A.myPc(); return p ? `pc:${p.id}` : ''; };
const fightNow = () => (S().fight && S().fight.phase === 'turns' ? S().fight : null);
const canMove = (k) => !!k && (host() || (A.role === 'player' && k === myKey()));
// Who the battle grid is moving: the one the DM tapped, or a player's own character.
const effSel = () => { const u = ui(); if (u.sel && posOf(u.sel)) return u.sel; return A.role === 'player' && posOf(myKey()) ? myKey() : ''; };
const here = () => Object.keys(mapOf().at || {}).filter((k) => { const p = posOf(k); return p && p.site === siteId() && whoOf(k); });
const hostile = (a, b) => a.split(':')[0] !== b.split(':')[0];
const living = (k) => { const o = whoOf(k); return !!o && !o.dead; };

function tokenLabel(k) {
  const o = whoOf(k);
  if (!o) return '?';
  const words = o.name.trim().split(/\s+/);
  const last = words[words.length - 1];
  if (k.startsWith('foe:') && /^\d+$/.test(last) && words.length > 1) return `${words[0][0].toUpperCase()}${last}`;
  return o.name.replace(/[^A-Za-z]/g, '').slice(0, 2).replace(/^./, (c) => c.toUpperCase()) || '?';
}
function speedFt(k) {
  const o = whoOf(k);
  if (!o) return 30;
  if (k.startsWith('pc:')) return MAP.speedOf(o);
  const m = A.ix() && A.ix().monster[o.mid];
  return MAP.speedOf(o, m);
}
function zoneShown() {
  const zs = zonesNow(); const u = ui();
  let z = u.zone && MAP.zoneOf(zs, u.zone);
  if (!z) {
    const k = (A.role === 'player' && myKey()) || (fightNow() && A.curKey()) || here().find((x) => x.startsWith('pc:')) || '';
    const p = k && posOf(k);
    z = p ? MAP.zoneOf(zs, p.zone) : null;
  }
  return z || MAP.entryZone(zs) || zs[0];
}
const viewsFor = () => {
  const sh = shown();
  const all = [['travel', 'Travel', sh.travel], ['zones', 'Zones', sh.zones], ['battle', 'Battle grid', sh.grid]];
  return host() ? all : all.filter((v) => v[2]);
};
function viewNow() {
  const v = viewsFor();
  if (!v.length) return '';
  const u = ui();
  if (v.some((x) => x[0] === u.view)) return u.view;
  const want = fightNow() ? ['battle', 'zones', 'travel'] : ['zones', 'battle', 'travel'];
  return (want.find((w) => v.some((x) => x[0] === w && x[2] !== false)) || v[0][0]);
}

// Feet from one creature to another: squares in the same zone, else the walk through the zones between.
function feetBetween(a, b) {
  if (!a || !b) return null;
  if (a.zone === b.zone) return MAP.cheb(a, b) * MAP.CELL_FT;
  const st = MAP.stepsBetween(mapOf(), siteId(), zonesNow(), a, b);
  return st == null ? null : st * MAP.CELL_FT;
}
// Where the selected token could step now, and the movement it has left.
function moveInfo(k, z) {
  const p = posOf(k);
  if (!p || !canMove(k) || !living(k)) return null;
  const f = fightNow();
  const mine = f && A.curKey() === k;
  if (f && !host() && !mine) return { cells: null, left: 0, wait: true };
  const o = whoOf(k);
  const b = MAP.budget(o, { speed: speedFt(k), used: mine ? f.used : null, zoneTags: z.tags || [] });
  const unlimited = host() || !f;
  const g = MAP.gridOf(mapOf(), siteId(), z);
  const blocked = new Set();
  const occupied = new Set();
  for (const x of here()) {
    const q = posOf(x);
    if (x === k || q.zone !== z.id || !living(x)) continue;
    occupied.add(q.y * g.cols + q.x);
    if (hostile(k, x)) blocked.add(q.y * g.cols + q.x);
  }
  let cells = null;
  if (p.zone === z.id) {
    const maxSteps = unlimited ? Infinity : Math.floor(b.left / b.per);
    cells = MAP.reach(g, [[p.x, p.y]], { blocked, maxSteps });
    for (const c of occupied) cells.delete(c);
    cells.delete(p.y * g.cols + p.x);
  }
  return { cells, b, mine, unlimited, per: b.per, left: b.left };
}
// What stepping into a neighbouring zone costs (to the square the Engine would choose).
function crossCost(k, from, to) {
  const p = posOf(k);
  if (!p) return null;
  const zs = zonesNow();
  const g = MAP.gridOf(mapOf(), siteId(), to);
  const held = new Set(here().filter((x) => x !== k && posOf(x).zone === to.id && living(x)).map((x) => posOf(x).y * g.cols + posOf(x).x));
  const path = MAP.zonePath(zs, p.zone, to.id);
  if (!path) return null;
  const prev = MAP.zoneOf(zs, path[path.length - 2]) || from;
  const c = MAP.freeNear(g, held, ...MAP.anchor(g, MAP.sideToward(to, prev)));
  if (!c) return null;
  const st = MAP.stepsBetween(mapOf(), siteId(), zs, p, { zone: to.id, x: c[0], y: c[1] });
  return st == null ? null : st;
}

// ------------------------------------------------------------------------------ the tab
export function mapTabHtml() {
  if (!S()) return '<div class="empty">Connecting to the table…</div>';
  const views = viewsFor();
  if (!views.length) return '<div class="empty">The DM has switched the maps off for now.</div>';
  const v = viewNow();
  ui().view = v;
  const seg = `<div class="seg">${views.map(([id, name, on]) => `<button class="${v === id ? 'on' : ''}" data-act="mp.view" data-v="${id}" title="${on ? '' : 'Hidden from the players'}">${name}${on ? '' : ' ◌'}</button>`).join('')}</div>`;
  let stage = '';
  let side = '';
  let title = '';
  if (v === 'travel') { stage = travelSvg(); side = travelPanel(); title = A.adv().name || 'The journey'; }
  else if (v === 'zones') { stage = zonesSvg(); side = zonesPanel(); title = (A.site() || {}).name || ''; }
  else {
    const z = zoneShown();
    // A phone gives the squares the whole width: the ways out go in a row of buttons under the grid.
    const narrow = typeof window !== 'undefined' && window.innerWidth <= 640;
    stage = battleSvg(z, { narrow }) + (narrow ? exitButtons(z) : '');
    side = battlePanel(z); title = `${(A.site() || {}).name || ''} · ${z.name}`;
  }
  return `<div class="mapwrap">
    <section class="card mapstage"><h3><span class="mtitle">${esc(title)}</span><span class="right">${seg}</span></h3>
      <div class="mapsvgbox">${stage}</div></section>
    <div class="col scroll mappanel" data-scroll="mapside">${side}${host() ? dmPanel(v) : ''}</div></div>`;
}

// How far a creature is from my character, for the attack card (" · 25 ft"), when the map is on.
export function mapFeet(k) {
  if (A.local || !S() || !(shown().zones || shown().grid)) return '';
  const me = posOf(myKey()); const p = posOf(k);
  if (!me || !p || me.site !== p.site) return '';
  const ft = feetBetween(me, p);
  return ft == null ? '' : ` · ${ft} ft`;
}

// A small button for the Play tab's fight card.
export function mapChip() {
  if (A.local || !S() || !viewsFor().length) return '';
  const p = posOf(myKey());
  const z = p ? MAP.zoneOf(zonesNow(), p.zone) : null;
  return `<button class="chip" data-act="tab" data-t="map" title="Open the map">Map${z ? ` · ${esc(z.name)}` : ''}</button>`;
}

// ------------------------------------------------------------------------------ battle grid
// The ways out of a zone, with what each costs the one moving.
function exitList(z) {
  const sel = effSel();
  const mv = sel ? moveInfo(sel, z) : null;
  const zs = zonesNow();
  return (z.links || []).map((id) => MAP.zoneOf(zs, id)).filter(Boolean).map((L) => {
    const steps = sel && canMove(sel) ? crossCost(sel, z, L) : null;
    const ft = steps != null && mv && !mv.unlimited ? steps * mv.per : null;
    return { L, side: MAP.sideToward(z, L), ft, far: ft != null && mv && ft > mv.left, sel };
  });
}
function exitButtons(z) {
  const arrow = { left: '←', right: '→', top: '↑', bottom: '↓' };
  const list = exitList(z);
  if (!list.length) return '';
  return `<div class="mapexits">${list.map((e) => `<button class="btn sm${e.far ? ' far' : ''}" data-act="mp.go" data-z="${esc(e.L.id)}" title="${esc(`${e.sel ? 'Move to' : 'Look at'} ${e.L.name}`)}">${arrow[e.side]} ${esc(e.L.name)}${e.ft != null ? ` · ${e.ft} ft` : ''}</button>`).join('')}</div>`;
}
function battleSvg(z, { narrow = false } = {}) {
  const m = mapOf();
  const g = MAP.gridOf(m, siteId(), z);
  const W = g.cols * C; const H = g.rows * C; const pad = narrow ? 14 : 130;
  const u = ui();
  const sel = effSel();
  const mv = sel ? moveInfo(sel, z) : null;
  const out = [];
  out.push(`<svg class="mapsvg battle" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}" preserveAspectRatio="xMidYMid meet" data-svg="battle" data-zone="${esc(z.id)}" data-cols="${g.cols}" data-rows="${g.rows}" role="img" aria-label="Battle grid of ${esc(z.name)}">`);
  out.push(`<defs><clipPath id="bclip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>`);
  out.push(`<rect class="floor" x="0" y="0" width="${W}" height="${H}" rx="6"/>`);
  if (g.img) out.push(`<image href="${esc(g.img.url)}" x="${-g.img.x0 * C}" y="${-g.img.y0 * C}" width="${g.img.cols * C}" height="${g.img.rows * C}" preserveAspectRatio="none" clip-path="url(#bclip)"/>`);
  // Squares: lit where the selected creature can step.
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      const d = mv && mv.cells ? mv.cells.get(y * g.cols + x) : undefined;
      const can = d != null;
      // In a fight the squares within reach light up, each with its cost; outside one, anywhere goes.
      const lit = can && !mv.unlimited;
      const ft = can ? d * mv.per : 0;
      out.push(`<rect class="cell${lit ? ' lit' : can ? ' can' : ''}${g.img ? ' over' : ''}" x="${x * C}" y="${y * C}" width="${C}" height="${C}" data-act="mp.cell" data-x="${x}" data-y="${y}" data-z="${esc(z.id)}">${can ? `<title>${ft} ft</title>` : ''}</rect>`);
      if (lit) out.push(`<text class="cost" x="${x * C + C - 8}" y="${y * C + 22}" text-anchor="end">${ft}</text>`);
    }
  }
  for (const w of g.walls) out.push(`<line class="wall" x1="${w[0] * C}" y1="${w[1] * C}" x2="${w[2] * C}" y2="${w[3] * C}"/>`);
  for (const w of g.doors) out.push(`<line class="door" x1="${w[0] * C}" y1="${w[1] * C}" x2="${w[2] * C}" y2="${w[3] * C}"/>`);
  out.push(`<rect class="edge" x="0" y="0" width="${W}" height="${H}" rx="6"/>`);
  // Melee reach between enemies.
  const toks = here().filter((k) => posOf(k).zone === z.id);
  for (const a of toks) for (const b of toks) {
    if (a >= b || !hostile(a, b) || !living(a) || !living(b) || !MAP.inReach(posOf(a), posOf(b))) continue;
    const pa = posOf(a); const pb = posOf(b);
    out.push(`<line class="engage" x1="${pa.x * C + C / 2}" y1="${pa.y * C + C / 2}" x2="${pb.x * C + C / 2}" y2="${pb.y * C + C / 2}"/>`);
  }
  const mine = myKey();
  const me = posOf(mine);
  const cur = A.curKey();
  for (const k of toks.sort((a, b) => Number(living(a)) - Number(living(b)))) {
    const p = posOf(k); const o = whoOf(k);
    const cx = p.x * C + C / 2; const cy = p.y * C + C / 2;
    const big = k.startsWith('foe:') && A.ix() && A.ix().monster[o.mid] && /Large|Huge|Gargantuan/.test(A.ix().monster[o.mid].size || '');
    const r = big ? 46 : 38;
    const cls = ['tk', k.split(':')[0], k === mine ? 'me' : '', k === cur ? 'now' : '', o.dead ? 'dead' : '', o.hidden ? 'hid' : '', k === sel ? 'sel' : ''].filter(Boolean).join(' ');
    const dist = me && k !== mine ? feetBetween(me, p) : null;
    const tip = `${o.name}${o.dead ? ' (down)' : ''}${o.hidden ? ' (hidden from the players)' : ''}${dist != null ? ` · ${dist} ft from you` : ''}`;
    out.push(`<g class="${cls}" data-act="mp.tok" data-k="${esc(k)}"${canMove(k) && living(k) ? ` data-drag="tok" data-dk="${esc(k)}"` : ''} transform="translate(${cx} ${cy})"><title>${esc(tip)}</title>
      ${k === cur ? `<circle class="ring" r="${r + 9}"/>` : ''}<circle class="body" r="${r}"/><text class="lab" y="12" text-anchor="middle">${esc(tokenLabel(k))}</text>${o.dead ? `<path class="x" d="M-22 -22 L22 22 M22 -22 L-22 22"/>` : ''}</g>`);
  }
  // Ways into the neighbouring zones, on the side that faces each (under the grid on a phone).
  const zs = zonesNow();
  const sides = { left: [], right: [], top: [], bottom: [] };
  if (narrow) { out.push('</svg>'); return out.join(''); }
  for (const id of z.links || []) { const L = MAP.zoneOf(zs, id); if (L) sides[MAP.sideToward(z, L)].push(L); }
  for (const [side, list] of Object.entries(sides)) {
    list.forEach((L, i) => {
      const n = list.length;
      const along = (i + 1) / (n + 1);
      const wv = side === 'left' || side === 'right' ? pad - 16 : Math.min(W / n - 16, 360);
      const hv = side === 'left' || side === 'right' ? Math.min(H / n - 16, 130) : 70;
      const x = side === 'left' ? -pad + 4 : side === 'right' ? W + 12 : along * W - wv / 2;
      const y = side === 'top' ? -pad + 40 : side === 'bottom' ? H + 20 : along * H - hv / 2;
      const steps = sel && canMove(sel) ? crossCost(sel, z, L) : null;
      const ft = steps != null && mv && !mv.unlimited ? steps * mv.per : null;
      const far = ft != null && mv && ft > mv.left;
      const arrow = { left: '←', right: '→', top: '↑', bottom: '↓' }[side];
      if (side === 'left' || side === 'right') {
        const words = short(L.name, 22).split(' ');
        const half = Math.ceil(words.length / 2);
        const l1 = words.slice(0, words.length > 1 ? half : 1).join(' '); const l2 = words.length > 1 ? words.slice(half).join(' ') : '';
        out.push(`<g class="exitbtn${far ? ' far' : ''}" data-act="mp.go" data-z="${esc(L.id)}"><title>${esc(`${sel ? 'Move to' : 'Look at'} ${L.name}${ft != null ? ` (${ft} ft)` : ''}`)}</title><rect x="${x}" y="${y}" width="${wv}" height="${hv}" rx="12"/>
          <text x="${x + wv / 2}" y="${y + hv / 2 - (l2 ? 18 : 6) - (ft != null ? 10 : 0)}" text-anchor="middle">${arrow}</text><text class="small" x="${x + wv / 2}" y="${y + hv / 2 + 14 - (ft != null ? 10 : 0)}" text-anchor="middle">${esc(short(l1, 11))}</text>${l2 ? `<text class="small" x="${x + wv / 2}" y="${y + hv / 2 + 36 - (ft != null ? 10 : 0)}" text-anchor="middle">${esc(short(l2, 11))}</text>` : ''}${ft != null ? `<text class="small cost2" x="${x + wv / 2}" y="${y + hv - 12}" text-anchor="middle">${ft} ft</text>` : ''}</g>`);
      } else {
        out.push(`<g class="exitbtn${far ? ' far' : ''}" data-act="mp.go" data-z="${esc(L.id)}"><title>${esc(`${sel ? 'Move to' : 'Look at'} ${L.name}${ft != null ? ` (${ft} ft)` : ''}`)}</title><rect x="${x}" y="${y}" width="${wv}" height="${hv}" rx="12"/><text x="${x + wv / 2}" y="${y + 45}" text-anchor="middle">${arrow} ${esc(short(L.name, Math.max(8, Math.floor(wv / 17))))}${ft != null ? ` · ${ft} ft` : ''}</text></g>`);
      }
    });
  }
  out.push('</svg>');
  return out.join('');
}
const short = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

function battlePanel(z) {
  const u = ui();
  const sel = u.sel && posOf(u.sel) ? u.sel : '';
  void u;
  const f = fightNow();
  const mine = myKey();
  const out = [];
  const tags = (z.tags || []).map((t) => `<span class="chip" title="${esc(MAP.TAGS[t])}">${esc(MAP.TAG_SHORT[t] || t)}</span>`).join('');
  const g = MAP.gridOf(mapOf(), siteId(), z);
  out.push(`<section class="card"><h3>${esc(z.name)}<span class="right"><span class="chip">${g.cols * 5} × ${g.rows * 5} ft</span></span></h3>${tags ? `<div class="chips">${tags}</div>` : ''}
    ${host() && z.note ? `<div class="small dim">${esc(z.note)}</div>` : ''}${zoneList(z)}</section>`);
  // The one I am moving.
  const k = sel || (A.role === 'player' ? mine : '');
  if (k && posOf(k)) {
    const o = whoOf(k);
    const mv = moveInfo(k, MAP.zoneOf(zonesNow(), posOf(k).zone) || z);
    const p = posOf(k);
    const lines = [];
    if (o.dead) lines.push('<div class="small dim">Down: no moving.</div>');
    else if (!mv) lines.push('<div class="small dim">You can see where they stand.</div>');
    else if (mv.wait) lines.push('<div class="small dim">You can move on your turn.</div>');
    else if (mv.unlimited) lines.push(`<div class="small dim">${f && host() ? 'As DM you can put anyone anywhere.' : 'No fight on: move freely.'} Tap a square${effSel() ? '' : ' (tap the token first)'}, drag the token, or take a way out.</div>`);
    else {
      const used = f.used || {};
      lines.push(`<div class="mvbar"><div class="mvfill" style="width:${Math.round((100 * mv.left) / Math.max(1, mv.b.total || 1))}%"></div></div>
        <div class="row"><b>${mv.left} ft</b><span class="small dim">of ${mv.b.total} ft left${mv.per > 5 ? ` · each square costs ${mv.per} ft (${(o.conds || []).includes('prone') ? 'crawling' : 'rough ground'})` : ''}</span></div>
        ${!used.action ? `<div class="row"><button class="btn sm" data-act="mp.dash" data-k="${esc(k)}" title="Use your action to double your movement">Dash</button><button class="btn sm" data-act="mp.diseng" data-k="${esc(k)}" title="Use your action so moving away draws no opportunity attacks">Disengage</button></div>` : `<div class="small dim">${used.dash ? 'Dashing.' : used.disengaged ? 'Disengaged: moving away is safe this turn.' : 'Action used.'}</div>`}
        <div class="small dim">Tap a lit square, drag your token, or tap a way out at the edge.</div>`);
    }
    out.push(`<section class="card${k === mine && mv && mv.mine ? ' ask turn' : ''}"><h3>${esc(o.name)}<span class="right"><span class="chip">${esc((MAP.zoneOf(zonesNow(), p.zone) || {}).name || '')}</span>${sel && host() ? '<button class="btn sm ghost" data-act="mp.tok" data-k="">Done</button>' : ''}</span></h3>${lines.join('')}</section>`);
  } else if (host()) out.push('<section class="card"><div class="small dim">Tap anyone on the grid to move them. Tap a way out at the edge to look at the next zone.</div></section>');
  if (A.role === 'player' && mine && posOf(mine) && posOf(mine).zone !== z.id) out.push('<button class="btn" data-act="mp.findme">Show where I am</button>');
  return out.join('');
}
// Who is in a zone, with how far each is from me.
function zoneList(z) {
  const me = posOf(myKey());
  const rows = here().filter((k) => posOf(k).zone === z.id).map((k) => {
    const o = whoOf(k);
    const d = me && k !== myKey() ? feetBetween(me, posOf(k)) : null;
    const hp = k.startsWith('pc:') ? `${o.hp}/${o.maxHp}` : host() ? `${o.hp}/${o.maxHp}` : (o.health || '');
    return `<div class="zrow${k.startsWith('foe:') ? ' enemy' : ''}${o.dead ? ' dead' : ''}"><span class="dotk ${k.split(':')[0]}">${esc(tokenLabel(k))}</span><span class="grow">${esc(o.name)}${o.hidden ? ' <span class="faint">(hidden)</span>' : ''}</span><span class="small dim">${esc(hp)}${(o.conds || []).length ? ` · ${esc(o.conds.join(', '))}` : ''}${d != null ? ` · ${d} ft` : ''}</span></div>`;
  });
  return rows.length ? `<div class="zlist">${rows.join('')}</div>` : '<div class="small dim">Nobody here.</div>';
}

// ------------------------------------------------------------------------------ zone map
function zonesSvg() {
  const m = mapOf();
  const zs = zonesNow();
  const sm = m.sites && m.sites[siteId()];
  const u = ui();
  const W = 1000; const H = sm && sm.w ? Math.round((W * sm.h) / sm.w) : 625;
  const out = [`<svg class="mapsvg zones${u.edit ? ' editing' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" data-svg="zones" data-w="${W}" data-h="${H}" data-cols="${(sm && sm.cols) || 0}" data-rows="${(sm && sm.rows) || 0}" role="img" aria-label="Zones of this place">`];
  if (sm && sm.url) out.push(`<image href="${esc(sm.url)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`);
  const grid = sm && sm.cols && sm.rows;
  if (grid && !u.edit) {
    for (let x = 0; x <= sm.cols; x++) out.push(`<line class="sgrid" x1="${(x * W) / sm.cols}" y1="0" x2="${(x * W) / sm.cols}" y2="${H}"/>`);
    for (let y = 0; y <= sm.rows; y++) out.push(`<line class="sgrid" x1="0" y1="${(y * H) / sm.rows}" x2="${W}" y2="${(y * H) / sm.rows}"/>`);
    for (const w of sm.walls || []) out.push(`<line class="wall thin" x1="${(w[0] * W) / sm.cols}" y1="${(w[1] * H) / sm.rows}" x2="${(w[2] * W) / sm.cols}" y2="${(w[3] * H) / sm.rows}"/>`);
  }
  const rect = (z) => ({ x: z.x * W, y: z.y * H, w: z.w * W, h: z.h * H });
  // The ways between zones.
  if (!grid) {
    for (const z of zs) for (const l of z.links || []) {
      if (z.id > l) continue;
      const o = MAP.zoneOf(zs, l);
      if (!o) continue;
      const a = rect(z); const b = rect(o);
      out.push(`<line class="zlink" x1="${a.x + a.w / 2}" y1="${a.y + a.h / 2}" x2="${b.x + b.w / 2}" y2="${b.y + b.h / 2}"/>`);
    }
  }
  const mine = myKey();
  const myZone = posOf(mine) && posOf(mine).zone;
  const cur = A.curKey();
  const curZone = cur && posOf(cur) ? posOf(cur).zone : '';
  for (const z of zs) {
    const r = rect(z);
    const cls = ['zone', grid ? 'onmap' : '', sm && sm.url && !grid ? 'onpic' : '', z.id === myZone ? 'mine' : '', z.id === curZone ? 'now' : '', u.zone === z.id ? 'sel' : ''].filter(Boolean).join(' ');
    out.push(`<g class="${cls}"${u.edit ? ` data-drag="zone" data-dz="${esc(z.id)}"` : ` data-act="mp.zone" data-z="${esc(z.id)}"`}>
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${grid ? 2 : 14}"/>
      <text class="zname" x="${r.x + 12}" y="${r.y + 30}">${esc(short(z.name, Math.max(6, Math.floor(r.w / 13))))}</text>
      ${(z.tags || []).length ? `<text class="ztags" x="${r.x + 12}" y="${r.y + 54}">${esc(z.tags.map((t) => MAP.TAG_SHORT[t] || t).join(' · '))}</text>` : ''}
      ${u.edit ? `<rect class="handle" data-drag="zh" data-dz="${esc(z.id)}" x="${r.x + r.w - 26}" y="${r.y + r.h - 26}" width="24" height="24" rx="4"/>` : ''}</g>`);
  }
  // Who stands where: their own squares on a battle map, else gathered in each zone's box.
  if (!u.edit) {
    const per = {};
    for (const k of here()) (per[posOf(k).zone] = per[posOf(k).zone] || []).push(k);
    for (const z of zs) {
      const list = (per[z.id] || []).sort((a, b) => (a < b ? -1 : 1));
      const r = rect(z);
      const g = MAP.gridOf(m, siteId(), z);
      list.forEach((k, i) => {
        const o = whoOf(k);
        let cx; let cy; let rad;
        if (grid) {
          const p = posOf(k);
          const cw = W / sm.cols; const ch = H / sm.rows;
          cx = (g.img ? g.img.x0 : Math.round(z.x * sm.cols)) * cw + (p.x + 0.5) * cw;
          cy = (g.img ? g.img.y0 : Math.round(z.y * sm.rows)) * ch + (p.y + 0.5) * ch;
          rad = Math.min(cw, ch) * 0.42;
        } else {
          rad = 21;
          const across = Math.max(1, Math.floor((r.w - 16) / (rad * 2 + 8)));
          const top = r.y + ((z.tags || []).length ? 70 : 50);
          cx = r.x + 12 + rad + (i % across) * (rad * 2 + 8);
          cy = top + rad + Math.floor(i / across) * (rad * 2 + 8);
          if (cy + rad > r.y + r.h - 4) return; // more than fit: the list beside says who
        }
        const cls = ['tk', k.split(':')[0], k === mine ? 'me' : '', k === cur ? 'now' : '', o.dead ? 'dead' : '', o.hidden ? 'hid' : '', u.sel === k ? 'sel' : ''].filter(Boolean).join(' ');
        out.push(`<g class="${cls}" data-act="mp.tok" data-k="${esc(k)}" transform="translate(${cx} ${cy}) scale(${rad / 38})"><title>${esc(o.name)}</title>${k === cur ? '<circle class="ring" r="47"/>' : ''}<circle class="body" r="38"/><text class="lab" y="12" text-anchor="middle">${esc(tokenLabel(k))}</text></g>`);
      });
    }
  }
  out.push('</svg>');
  return out.join('');
}

function zonesPanel() {
  const u = ui();
  const zs = zonesNow();
  if (u.edit) return zoneEditor();
  const z = (u.zone && MAP.zoneOf(zs, u.zone)) || zoneShown();
  const sel = u.sel && posOf(u.sel) ? u.sel : '';
  const hint = sel && canMove(sel)
    ? `<div class="small dim">Tap a zone to move ${esc(whoOf(sel).name)} there${fightNow() && !host() ? ' (it uses your movement)' : ''}.</div>`
    : `<div class="small dim">Each zone is about 30 feet across. Tap a zone to see its battle grid${A.role === 'player' ? '; tap your token, then a zone, to move there' : ''}.</div>`;
  return `<section class="card"><h3>${esc(z.name)}<span class="right">${shown().grid || host() ? `<button class="btn sm" data-act="mp.view" data-v="battle" data-z="${esc(z.id)}">Battle grid</button>` : ''}</span></h3>
    ${(z.tags || []).length ? `<div class="chips">${z.tags.map((t) => `<span class="chip" title="${esc(MAP.TAGS[t])}">${esc(MAP.TAG_SHORT[t] || t)}</span>`).join('')}</div>` : ''}
    ${host() && z.note ? `<div class="small dim">${esc(z.note)}</div>` : ''}${zoneList(z)}${hint}</section>`;
}

// ------------------------------------------------------------------------------ travel map
function travelSites() {
  const sites = (A.adv().sites || []);
  const s = S();
  const visited = new Set([...(s.scene.visited || []), s.scene.siteId]);
  if (host()) return { sites, known: new Set(sites.map((x) => x.id)), visited };
  const known = new Set(visited);
  for (const x of sites) if (visited.has(x.id)) for (const e of x.exits || []) known.add(e.to);
  return { sites, known, visited };
}
function travelSvg() {
  const m = mapOf();
  const W = 1000; const H = m.travel && m.travel.w ? Math.round((W * m.travel.h) / m.travel.w) : 625;
  const { sites, known, visited } = travelSites();
  const pos = MAP.travelLayout(sites, m.pos);
  const u = ui();
  const out = [`<svg class="mapsvg travel${u.edit ? ' editing' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" data-svg="travel" data-w="${W}" data-h="${H}" role="img" aria-label="The travel map">`];
  if (m.travel && m.travel.url) out.push(`<image href="${esc(m.travel.url)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`);
  else out.push(`<rect class="parch" x="0" y="0" width="${W}" height="${H}" rx="12"/>`);
  const P = (id) => ({ x: pos[id].x * W, y: pos[id].y * H });
  const seen = new Set();
  for (const x of sites) {
    if (!known.has(x.id)) continue;
    for (const e of x.exits || []) {
      const y = sites.find((q) => q.id === e.to);
      if (!y || !known.has(y.id)) continue;
      const key = [x.id, y.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const a = P(x.id); const b = P(y.id);
      const walked = visited.has(x.id) && visited.has(y.id);
      out.push(`<line class="road${walked ? ' walked' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
      const hrs = !visited.has(y.id) ? y.travelHours : !visited.has(x.id) ? x.travelHours : 0;
      if (hrs) out.push(`<text class="hrs" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 6}" text-anchor="middle">${hrs} h</text>`);
    }
  }
  const here0 = S().scene.siteId;
  for (const x of sites) {
    if (!known.has(x.id)) continue;
    const p = P(x.id);
    const cls = ['place', x.id === here0 ? 'here' : visited.has(x.id) ? 'been' : 'new', u.travelSel === x.id ? 'sel' : ''].join(' ');
    out.push(`<g class="${cls}"${u.edit && host() ? ` data-drag="node" data-ds="${esc(x.id)}"` : ` data-act="mp.place" data-s="${esc(x.id)}"`} transform="translate(${p.x} ${p.y})"><title>${esc(x.name)}</title>
      ${x.id === here0 ? '<circle class="halo" r="30"/>' : ''}<circle class="pin" r="15"/>${x.id === here0 ? '<path class="flag" d="M-2 -40 L-2 -12 M-2 -40 L18 -33 L-2 -26"/>' : ''}
      <text class="pname" y="38" text-anchor="middle">${esc(short(x.name, 26))}</text>${!visited.has(x.id) && x.id !== here0 ? '<text class="pq" y="6" text-anchor="middle">?</text>' : ''}</g>`);
  }
  out.push('</svg>');
  return out.join('');
}
function travelPanel() {
  const u = ui();
  const { sites, visited } = travelSites();
  const cur = sites.find((x) => x.id === S().scene.siteId) || {};
  const sel = sites.find((x) => x.id === u.travelSel);
  const exits = (cur.exits || []).map((e) => sites.find((x) => x.id === e.to)).filter(Boolean);
  const out = [`<section class="card"><h3>You are at<span class="right small dim">Day ${S().time.day}, ${String(Math.floor(S().time.hour)).padStart(2, '0')}:00</span></h3><div><b>${esc(cur.name || '')}</b></div>${cur.region ? `<div class="small dim">${esc(cur.region)}</div>` : ''}
    <div class="small dim">Places you have been: ${visited.size}. Roads lead to: ${exits.map((x) => esc(x.name)).join(', ') || 'nowhere yet'}.</div></section>`];
  if (sel && sel.id !== cur.id) {
    const next = exits.some((x) => x.id === sel.id);
    out.push(`<section class="card"><h3>${esc(sel.name)}</h3>${sel.region ? `<div class="small dim">${esc(sel.region)}${sel.travelHours ? ` · about ${sel.travelHours} hours away` : ''}</div>` : ''}
      ${next ? (host() ? '<button class="btn primary" data-act="mp.travel">Move the party here</button>' : '<button class="btn primary" data-act="mp.travel">Suggest going here</button><div class="small dim">This puts the words in your Say box on the Play tab.</div>') : `<div class="small dim">${visited.has(sel.id) ? 'You have been here.' : 'No road leads there from here.'}</div>`}</section>`);
  } else out.push('<section class="card"><div class="small dim">Tap a place to see it. A place with a ? is one you have heard of but not yet visited.</div></section>');
  return out.join('');
}

// ------------------------------------------------------------------------------ the DM's tools
function dmPanel(v) {
  const sh = shown();
  const u = ui();
  const m = mapOf();
  const im = u.imp;
  const sw = (k, label, tip) => `<label class="chk" title="${esc(tip)}"><input type="checkbox" data-mpshow="${k}" ${sh[k] ? 'checked' : ''}> ${label}</label>`;
  const z = zoneShown();
  const sm = m.sites && m.sites[siteId()];
  const zg = m.grids && m.grids[`${siteId()}/${z.id}`];
  const targets = [['site', 'This place: a battle map with squares'], ['backdrop', 'This place: a picture behind the zones'], ['zone', `This zone (${z.name}): its own battle map`], ['travel', 'The travel map']];
  const needsSquares = im.target === 'site' || im.target === 'zone';
  return `<section class="card"><h3>Maps for everyone</h3>
      <div class="chips col">${sw('travel', 'Travel map', 'The places of the adventure and the roads between them')}${sw('zones', 'Zone map', 'This place split into zones of about 30 feet')}${sw('grid', 'Battle grid', 'Each zone as 5-foot squares; players move their own token')}${sw('reach', 'Reach and range rules', 'Off: the map follows the story. On: a melee attack needs the target within reach this turn, ranged attacks suffer close to an enemy or at long range')}</div>
      <div class="row"><button class="btn sm" data-act="mp.reset" title="Everyone at this place back to their starting squares">Re-place everyone</button>${v === 'zones' ? `<button class="btn sm" data-act="mp.edit">${u.edit ? 'Stop editing' : 'Edit zones'}</button>` : ''}${v === 'travel' ? `<button class="btn sm" data-act="mp.edit">${u.edit ? 'Done placing' : 'Place the places'}</button>` : ''}</div>
      ${v === 'travel' && u.edit ? '<div class="small dim">Drag each place to where it sits on your map.</div>' : ''}</section>
    <section class="card"><h3>Import a map</h3>
      <label class="fld"><span class="fl">Use it for</span><select data-mpimp="target">${targets.map(([id, t]) => `<option value="${id}"${im.target === id ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="btn">${im.file ? 'Choose another file' : 'Choose a picture or VTT file'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.dd2vtt,.uvtt,.df2vtt,.json" data-mpfile="1" hidden></label>
      ${im.info ? `<div class="small">${esc(im.info)}</div>` : '<div class="small dim">A PNG, JPEG or WebP picture, or a Universal VTT file (.dd2vtt from Dungeondraft or Dungeon Alchemist, .uvtt, .df2vtt): those bring their own squares and walls.</div>'}
      ${needsSquares ? `<div class="fields"><label class="fld"><span class="fl">Squares across</span><input type="number" min="1" max="200" data-mpimp="cols" value="${esc(im.cols)}" placeholder="${im.target === 'zone' ? '6' : ''}"></label><label class="fld"><span class="fl">Squares down</span><input type="number" min="1" max="200" data-mpimp="rows" value="${esc(im.rows)}" placeholder="${im.target === 'zone' ? '6' : ''}"></label></div>` : ''}
      ${im.target === 'site' ? `<label class="chk"><input type="checkbox" data-mpimp="split" ${im.split ? 'checked' : ''}> Cut it into zones of about 30 feet (rename them after)</label>` : ''}
      <button class="btn primary" data-act="mp.import" ${im.file && !im.busy ? '' : 'disabled'}>${im.busy ? 'Importing…' : 'Import'}</button>
      <div class="row">${m.travel ? '<button class="btn sm danger" data-act="mp.clear" data-w="travel">Remove travel picture</button>' : ''}${sm ? '<button class="btn sm danger" data-act="mp.clear" data-w="site">Remove this place\'s map</button>' : ''}${zg ? '<button class="btn sm danger" data-act="mp.clear" data-w="zone">Remove this zone\'s map</button>' : ''}</div></section>`;
}

function zoneEditor() {
  const u = ui();
  const zs = u.draft || [];
  return `<section class="card"><h3>Edit the zones<span class="right"><button class="btn sm" data-act="mp.zadd">Add a zone</button></span></h3>
    <div class="small dim">Drag a zone to move it, its corner to resize it. Links are the ways between zones.</div>
    ${zs.map((z) => `<div class="zedit"><div class="row nw"><input type="text" data-mpzname="${esc(z.id)}" value="${esc(z.name)}" maxlength="40"><button class="btn sm danger" data-act="mp.zdel" data-z="${esc(z.id)}" title="Remove this zone">✕</button></div>
      <div class="chips">${Object.keys(MAP.TAGS).map((t) => `<button class="chip${(z.tags || []).includes(t) ? ' on' : ''}" data-act="mp.ztag" data-z="${esc(z.id)}" data-t="${t}" title="${esc(MAP.TAGS[t])}">${esc(MAP.TAG_SHORT[t])}</button>`).join('')}</div>
      <div class="chips"><span class="small dim">Leads to:</span>${zs.filter((o) => o.id !== z.id).map((o) => `<button class="chip${(z.links || []).includes(o.id) ? ' on' : ''}" data-act="mp.zlink" data-z="${esc(z.id)}" data-l="${esc(o.id)}">${esc(o.name)}</button>`).join('')}</div>
      <input type="text" data-mpznote="${esc(z.id)}" value="${esc(z.note || '')}" placeholder="A note for you only (the Director reads it)" maxlength="300"></div>`).join('')}
    <div class="row"><button class="btn primary" data-act="mp.zsave">Save the zones</button><button class="btn" data-act="mp.edit">Cancel</button><button class="btn sm ghost" data-act="mp.zreset" title="Throw away your zones for this place">Back to the adventure's</button></div></section>`;
}

// ------------------------------------------------------------------------------ actions
const clone = (x) => JSON.parse(JSON.stringify(x));
async function move(k, extra) {
  const ok = await A.send({ type: 'map.move', who: k, ...extra });
  if (ok && A.role === 'host') ui().sel = '';
  return ok;
}
export const MAP_ACT = {
  'mp.view': (d) => { const u = ui(); u.view = d.v; u.edit = false; if (d.z) u.zone = d.z; },
  'mp.findme': () => { ui().zone = ''; },
  'mp.tok': (d) => {
    const u = ui();
    if (!d.k) { u.sel = ''; return; }
    if (canMove(d.k) && living(d.k)) u.sel = u.sel === d.k ? '' : d.k;
    else if (u.sel && u.view === 'battle') { /* a tap on someone else's token is a tap on their square */ }
  },
  'mp.cell': (d) => {
    const k = effSel();
    if (!k || !canMove(k) || !living(k)) return null;
    return move(k, { zone: d.z, x: Number(d.x), y: Number(d.y) });
  },
  'mp.go': (d) => {
    const u = ui();
    const k = effSel();
    if (k && canMove(k) && living(k)) return move(k, { zone: d.z }).then((ok) => { if (ok) u.zone = d.z; });
    u.zone = d.z;
    return null;
  },
  'mp.zone': (d) => {
    const u = ui();
    const k = u.sel || '';
    if (k && canMove(k) && living(k) && posOf(k) && posOf(k).zone !== d.z) return move(k, { zone: d.z });
    u.zone = d.z;
    if (shown().grid || host()) u.view = 'battle';
    return null;
  },
  'mp.dash': (d) => A.send({ type: 'map.dash', who: d.k }),
  'mp.diseng': (d) => A.send({ type: 'map.dash', who: d.k, kind: 'disengage' }),
  'mp.reset': () => A.send({ type: 'map.reset' }),
  'mp.place': (d) => { const u = ui(); u.travelSel = u.travelSel === d.s ? '' : d.s; },
  'mp.travel': () => {
    const u = ui();
    const sites = A.adv().sites || [];
    const to = sites.find((x) => x.id === u.travelSel);
    if (!to) return null;
    if (host()) return A.send({ type: 'site.move', siteId: to.id }).then((ok) => { if (ok) u.travelSel = ''; });
    A.ui.say = `Let's head for ${to.name}.`;
    A.ui.tab = 'play';
    A.toast('Your words are ready in the Say box.', true);
    return null;
  },
  'mp.edit': () => {
    const u = ui();
    u.edit = !u.edit;
    u.draft = u.edit ? clone((mapOf().zones || {})[siteId()] || MAP.autoZones()) : null;
  },
  'mp.zadd': () => {
    const u = ui();
    const n = (u.draft || []).length + 1;
    u.draft.push({ id: `zone-${Date.now().toString(36)}`, name: `Zone ${n}`, x: 0.38, y: 0.32, w: 0.24, h: 0.34, links: [], tags: [], cols: 6, rows: 6, note: '' });
  },
  'mp.zdel': (d) => { const u = ui(); if ((u.draft || []).length <= 1) { A.toast('A place needs at least one zone.'); return; } u.draft = u.draft.filter((z) => z.id !== d.z).map((z) => ({ ...z, links: (z.links || []).filter((l) => l !== d.z) })); },
  'mp.ztag': (d) => { const z = (ui().draft || []).find((x) => x.id === d.z); if (!z) return; z.tags = (z.tags || []).includes(d.t) ? z.tags.filter((t) => t !== d.t) : [...(z.tags || []), d.t]; },
  'mp.zlink': (d) => {
    const zs = ui().draft || [];
    const a = zs.find((x) => x.id === d.z); const b = zs.find((x) => x.id === d.l);
    if (!a || !b) return;
    const on = (a.links || []).includes(b.id);
    a.links = on ? a.links.filter((l) => l !== b.id) : [...(a.links || []), b.id];
    b.links = on ? (b.links || []).filter((l) => l !== a.id) : [...(b.links || []), a.id];
  },
  'mp.zsave': async () => {
    const u = ui();
    // Keep ids: the Engine re-reads links by id; a zone with no links anywhere would become a chain.
    const zones = (u.draft || []).map((z) => ({ ...z, links: z.links && z.links.length ? z.links : [] }));
    if (await A.send({ type: 'map.zones', zones })) { u.edit = false; u.draft = null; A.toast('Zones saved.', true); }
  },
  'mp.zreset': async () => { if (!confirm('Throw away your zones for this place and use the adventure\'s own?')) return; const u = ui(); if (await A.send({ type: 'map.zones', reset: true })) { u.edit = false; u.draft = null; } },
  'mp.clear': (d) => {
    if (!confirm('Remove this picture from the map?')) return null;
    if (d.w === 'travel') return A.send({ type: 'map.travel', clear: true });
    if (d.w === 'site') return A.send({ type: 'map.site', clear: true });
    return A.send({ type: 'map.grid', zoneId: zoneShown().id, clear: true });
  },
  'mp.import': () => importNow(),
};

// Fields: the DM's switches, the import form and the zone names. True when the event was the map's.
export function mapField(e) {
  const t = e.target;
  if (!t || !t.dataset) return false;
  if (t.dataset.mpshow) { if (e.type === 'change') A.send({ type: 'map.show', [t.dataset.mpshow]: t.checked }); return true; }
  if (t.dataset.mpimp) {
    const im = ui().imp;
    const k = t.dataset.mpimp;
    im[k] = t.type === 'checkbox' ? t.checked : t.value;
    if (k === 'target' && e.type === 'change') A.render();
    return true;
  }
  if (t.dataset.mpfile) { if (e.type === 'change' && t.files && t.files[0]) pickFile(t.files[0]); return true; }
  if (t.dataset.mpzname) { const z = (ui().draft || []).find((x) => x.id === t.dataset.mpzname); if (z) z.name = t.value; return true; }
  if (t.dataset.mpznote) { const z = (ui().draft || []).find((x) => x.id === t.dataset.mpznote); if (z) z.note = t.value; return true; }
  return false;
}

// ------------------------------------------------------------------------------ importing pictures
const isVtt = (f) => /\.(dd2vtt|uvtt|df2vtt|json)$/i.test(f.name || '') || f.type === 'application/json';
function b64ToBlob(b64) {
  const bin = atob(String(b64).replace(/^data:[^,]*,/, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/octet-stream' });
}
function imageSize(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture could not be read.')); };
    img.src = url;
  });
}
async function pickFile(file) {
  const im = ui().imp;
  im.file = null; im.vtt = null; im.info = 'Reading…';
  A.render();
  try {
    if (file.size > 60 * 1024 * 1024) throw new Error('That file is too big (60 MB at most).');
    if (isVtt(file)) {
      const data = MAP.parseUvtt(JSON.parse(await file.text()));
      if (!data.image) throw new Error('That file has no picture in it.');
      const blob = b64ToBlob(data.image);
      const size = await imageSize(blob);
      im.vtt = { ...data, blob, size };
      im.cols = String(data.cols); im.rows = String(data.rows);
      if (im.target === 'travel' || im.target === 'backdrop') im.target = 'site';
      im.info = `${file.name}: ${data.cols} × ${data.rows} squares, ${data.walls.length} walls, ${data.doors.length} doors.`;
    } else {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF picture, or a Universal VTT file.');
      const size = await imageSize(file);
      im.size = size;
      // A guess at the squares, at 70 pixels a square (the usual export): change it if the map says otherwise.
      if ((im.target === 'site') && !im.cols) { im.cols = String(Math.max(1, Math.round(size.w / 70))); im.rows = String(Math.max(1, Math.round(size.h / 70))); }
      im.info = `${file.name}: ${size.w} × ${size.h} pixels.${im.target === 'site' ? ' Check the squares across and down.' : ''}`;
    }
    im.file = file;
  } catch (e) { im.info = ''; A.toast(e.message || 'That file could not be read.'); }
  A.render();
}
async function importNow() {
  const u = ui(); const im = u.imp;
  if (!im.file || im.busy) return;
  im.busy = true; A.render();
  try {
    const blob = im.vtt ? im.vtt.blob : im.file;
    const size = im.vtt ? im.vtt.size : (im.size || await imageSize(blob));
    const url = await A.upload(blob);
    const pic = { url, w: size.w, h: size.h };
    const cols = Number(im.cols) || 0; const rows = Number(im.rows) || 0;
    const walls = im.vtt ? im.vtt.walls : []; const doors = im.vtt ? im.vtt.doors : [];
    let ok = false;
    if (im.target === 'travel') ok = await A.send({ type: 'map.travel', ...pic });
    else if (im.target === 'backdrop') ok = await A.send({ type: 'map.site', ...pic, cols: 0, rows: 0 });
    else if (im.target === 'site') {
      if (!(cols && rows)) throw new Error('Type the squares across and down first.');
      ok = await A.send({ type: 'map.site', ...pic, cols, rows, walls, doors, split: !!im.split });
      if (ok) { u.view = 'zones'; u.zone = ''; }
    } else ok = await A.send({ type: 'map.grid', zoneId: zoneShown().id, ...pic, cols: cols || 6, rows: rows || 6, walls, doors });
    if (ok) { A.toast('Map imported.', true); u.imp = { target: im.target, cols: '', rows: '', split: im.split, busy: false, file: null, info: '', vtt: null }; return; }
  } catch (e) { A.toast(e.message || 'The import did not work.'); }
  im.busy = false;
}

// ------------------------------------------------------------------------------ dragging
// A token onto a square, a zone (move, or its corner to resize) or a place on the travel map. A short
// press is a tap (the click that follows does the work); a real drag swallows that click.
let drag = null;
function svgPoint(svg, e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function install() {
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('[data-drag]');
    if (!el || e.button > 0) return;
    const svg = el.ownerSVGElement || el.closest('svg');
    if (!svg) return;
    const p = svgPoint(svg, e);
    drag = { el, svg, kind: el.dataset.drag, x0: p.x, y0: p.y, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
    if (drag.kind === 'tok') { const t = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(el.getAttribute('transform') || ''); drag.tx = t ? Number(t[1]) : 0; drag.ty = t ? Number(t[2]) : 0; }
    if (drag.kind === 'node') { const t = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(el.getAttribute('transform') || ''); drag.tx = t ? Number(t[1]) : 0; drag.ty = t ? Number(t[2]) : 0; }
    if (drag.kind === 'zone' || drag.kind === 'zh') {
      const z = (ui().draft || []).find((x) => x.id === el.dataset.dz);
      if (!z) { drag = null; return; }
      drag.z = z; drag.start = { x: z.x, y: z.y, w: z.w, h: z.h };
      drag.W = Number(svg.dataset.w); drag.H = Number(svg.dataset.h);
      drag.g = drag.kind === 'zh' ? el.parentNode : el;
      e.stopPropagation();
    }
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 7) return;
    drag.moved = true;
    e.preventDefault();
    const p = svgPoint(drag.svg, e);
    const dx = p.x - drag.x0; const dy = p.y - drag.y0;
    if (drag.kind === 'tok' || drag.kind === 'node') { drag.el.setAttribute('transform', `translate(${drag.tx + dx} ${drag.ty + dy})`); drag.el.classList.add('dragging'); return; }
    if (drag.kind === 'zone' || drag.kind === 'zh') {
      const s = drag.start; const z = drag.z;
      if (drag.kind === 'zone') { z.x = clamp(s.x + dx / drag.W, 0, 1 - s.w); z.y = clamp(s.y + dy / drag.H, 0, 1 - s.h); }
      else { z.w = clamp(s.w + dx / drag.W, 0.05, 1 - s.x); z.h = clamp(s.h + dy / drag.H, 0.05, 1 - s.y); }
      const r = drag.g.querySelector('rect');
      r.setAttribute('x', z.x * drag.W); r.setAttribute('y', z.y * drag.H); r.setAttribute('width', z.w * drag.W); r.setAttribute('height', z.h * drag.H);
    }
  }, { passive: false });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moved) return; // a tap: the click does it
    swallowClick();
    if (d.kind === 'tok') {
      const p = svgPoint(d.svg, e);
      const cols = Number(d.svg.dataset.cols); const rows = Number(d.svg.dataset.rows);
      const x = Math.floor(p.x / C); const y = Math.floor(p.y / C);
      if (x >= 0 && y >= 0 && x < cols && y < rows) move(d.el.dataset.dk, { zone: d.svg.dataset.zone, x, y }).then(() => A.render());
      else A.render();
      return;
    }
    if (d.kind === 'node') {
      const p = svgPoint(d.svg, e);
      A.send({ type: 'map.pos', siteId: d.el.dataset.ds, x: clamp(p.x / Number(d.svg.dataset.w), 0, 1), y: clamp(p.y / Number(d.svg.dataset.h), 0, 1) }).then(() => A.render());
      return;
    }
    // On a battle map, a zone lands on whole squares.
    const cols = Number(d.svg.dataset.cols); const rows = Number(d.svg.dataset.rows);
    if (d.z && cols && rows) {
      const z = d.z;
      const sx = (v) => Math.round(v * cols) / cols; const sy = (v) => Math.round(v * rows) / rows;
      z.x = sx(z.x); z.y = sy(z.y); z.w = Math.max(1 / cols, sx(z.w)); z.h = Math.max(1 / rows, sy(z.h));
    }
    A.render();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) { drag = null; A.render(); } });
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function swallowClick() {
  const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); document.removeEventListener('click', stop, true); };
  document.addEventListener('click', stop, true);
  setTimeout(() => document.removeEventListener('click', stop, true), 400);
}
