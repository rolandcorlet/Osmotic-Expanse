// The Director prototype screens: player phone (/play), table screen (/table)
// and host console (/host). One file, no build step. The screens only draw the
// Ledger the host sends and post actions back; the Engine on the host decides.

import * as R from '/engine/rules.js';
import { oddsCard } from '/engine/odds.js';

// ------------------------------------------------------------------ basics
const path = location.pathname.replace(/\/+$/, '') || '/';
const role = path === '/host' ? 'host' : path === '/play' ? 'player' : path === '/table' ? 'table' : 'home';
const params = new URLSearchParams(location.search);
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => `${Math.round(x * 100)}%`;
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: carry on without it */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* same */ } },
};

let pid = params.get('pid') || store.get('oxd.pid');
if (!pid) { pid = `p${Math.random().toString(36).slice(2, 10)}`; store.set('oxd.pid', pid); }
let key = (params.get('key') || store.get('oxd.hostKey') || '').toUpperCase();
let tcode = (params.get('t') || store.get('oxd.t') || '').toUpperCase(); // table code, needed only from outside the host's network
const auth = () => `role=${role}&pid=${encodeURIComponent(pid)}&key=${encodeURIComponent(key)}&t=${encodeURIComponent(tcode)}`;

let state = null; // the Ledger, as this screen is allowed to see it
let sc = null; // the scenario (host gets Director notes; players do not)
let info = null;
let online = false;
let keyBad = false;
let codeBad = false;

const TABS = {
  player: [['play', 'Play'], ['sheet', 'Sheet'], ['rolls', 'Rolls'], ['colours', 'Colours']],
  table: [['table', 'Table'], ['rolls', 'Rolls'], ['colours', 'Colours']],
  host: [['run', 'Run'], ['director', 'Director'], ['memory', 'Memory'], ['voice', 'Voice'], ['sheets', 'Sheets'], ['bestiary', 'Bestiary'], ['rolls', 'Rolls'], ['colours', 'Colours']],
  home: [],
};

const ui = {
  tab: (TABS[role][0] || [''])[0],
  join: { name: store.get('oxd.name') || '' },
  claim: { hand: null, name: '' },
  oath: { text: '' },
  zero: { line: '', pauseWord: '', tone: '' },
  newGame: { open: false, vectorId: '', keep: true }, // host: the New game panel
  talk: 'idle', talkAsk: false, // player: the Talk button
  voice: { outUrl: '', outKey: '', outModel: '', outVoice: '', outSpeed: '', inUrl: '', inKey: '', inModel: '', inLang: '', loaded: false }, // host: speech settings
  mem: { q: '', name: '', kind: 'person', fact: '' }, // host: the Memory tab
  show: { scene: false, quick: false, harvest: false, zero: false }, // player page: panels opened with the buttons at the top
  own: null,
  seenReq: {},
  jumpTop: false,
  say: { text: '' },
  dir: { key: '', note: '', edit: '', editId: null, narrate: '', url: '', urlFor: null },
  strike: null,
  drift: false,
  quick: { baseline: 'OSM', pathway: '', at: '', practice: false },
  rollsMine: false,
  freshId: null,
  lastRollId: null,
  keyTry: '',
  host: {
    who: null, baseline: 'OSM', pathway: 'Chemoreception', at: 12, unhurried: false, label: '', mods: [], modLabel: '', modDice: 1,
    open: { n: 3, at: '', who: '', label: '' }, enc: {}, cre: {}, award: { codon: '', substrate: '', why: '' }, bq: '', dmg: {}, cond: {},
  },
};

const BAND_IDS = ['contact', 'near', 'mid', 'far', 'loose'];
const USUAL = {
  'Membrane Penetration': ['VSC', 'DFF'], 'Pressure Tolerance': ['VSC'], 'Fluid Navigation': ['DFF'], Concealment: ['DFF'],
  Catalysis: ['RTC'], Synthesis: ['RTC'], 'Sequence Reading': ['RTC', 'OSM'], Chemoreception: ['OSM'],
  'Signal Discourse': ['AFF'], Symbiosis: ['AFF'], Vigour: ['VSC'], 'Pulse Discipline': ['DFF'],
};
const BASE_NAMES = { VSC: 'Viscosity', DFF: 'Diffusion', RTC: 'Reactivity', OSM: 'Osmosis', AFF: 'Affinity' };

// -------------------------------------------------------------------- toast
let toastTimer = null;
function toast(text, good = false) {
  const t = $('#toast');
  t.textContent = text;
  t.className = `toast${good ? ' good' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, good ? 2200 : 5200);
}

// ------------------------------------------------------------------ effects
// A short full-screen beat when an attack lands or misses, and for any Runaway
// Catalysis. It is drawn outside the main screen so live updates do not cut it off.
let fxTimer = null;
function showFx(r) {
  const attack = r.kind === 'attack' || r.kind === 'incoming';
  if (!attack && !r.runaway) return;
  if (!r.dice || !r.dice.length) return;
  const el = $('#fx');
  const o = mine();
  const atMe = r.kind === 'incoming' && o && r.label.endsWith(o.name);
  let word = '';
  let kind = r.success ? 'ok' : 'no';
  if (r.kind === 'attack') word = r.success ? 'HIT' : 'MISS';
  else if (r.kind === 'incoming') { word = r.success ? (atMe ? 'YOU ARE HIT' : 'IT HITS') : (atMe ? 'IT MISSES YOU' : 'IT MISSES'); kind = r.success ? 'no' : 'ok'; }
  else word = r.success === false ? 'NOT ENOUGH' : 'SUCCESS';
  const effect = r.success && r.segments != null ? `${r.segments} Segments stripped` : r.success && r.damage != null ? `${r.damage} damage` : r.success && r.overflow != null ? `Overflow ${r.overflow}` : r.success === false ? `short by ${r.shortBy}` : '';
  el.className = `fx ${kind}${r.runaway ? ' run' : ''}`;
  el.innerHTML = `<div class="fxbox">
      ${r.runaway ? '<div class="fxrun"><i></i><i></i><i></i><span>RUNAWAY CATALYSIS</span></div>' : ''}
      <div class="fxwho">${esc(r.who)} · ${esc(r.label)}</div>
      <div class="fxword">${word}</div>
      <div class="fxnum"><b data-count="${r.total}">0</b>${r.at != null ? `<span>against ${r.at}</span>` : ''}</div>
      <div class="big">${diceHtml(r.dice, true)}</div>
      ${effect ? `<div class="fxeff">${esc(effect)}</div>` : ''}
      ${r.runaway ? '<div class="fxsub">No Inhibitors and two or more 6s: you gain the Rider, and any Effect Value counts twice.</div>' : ''}
    </div>`;
  el.hidden = false;
  const num = el.querySelector('[data-count]');
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) num.textContent = r.total;
  else {
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0 - 350) / 650);
      num.textContent = Math.round(r.total * Math.max(0, 1 - Math.pow(1 - Math.max(0, k), 3)));
      if (k < 1 && !el.hidden) requestAnimationFrame(tick); else num.textContent = r.total;
    };
    requestAnimationFrame(tick);
  }
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => { el.hidden = true; }, r.runaway ? 4200 : 2800);
}
document.addEventListener('click', (e) => { const fx = e.target.closest('#fx'); if (fx) { fx.hidden = true; clearTimeout(fxTimer); } }, true);

// ---------------------------------------------------------------- transport
async function send(action) {
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role, pid, key, t: tcode, action }),
    });
    const out = await res.json();
    if (!out.ok) toast(out.error || 'That did not work.');
    return !!out.ok;
  } catch (e) {
    toast('Cannot reach the Director host. Is it still running?');
    return false;
  }
}

async function sendDirector(body) {
  try {
    const res = await fetch('/api/director', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, ...body }) });
    if (!res.ok) toast('The Director host refused that.');
    return res.ok;
  } catch (e) {
    toast('Cannot reach the Director host. Is it still running?');
    return false;
  }
}

// The host started a new game in another Vector: this screen's scenario is out of date.
let reloading = false;
async function reloadScenario() {
  if (reloading) return;
  reloading = true;
  try {
    const res = await fetch(`/api/scenario?${auth()}`);
    if (res.ok) sc = await res.json();
  } catch (e) { /* the next update tries again */ }
  reloading = false;
  render();
}

function connect() {
  const es = new EventSource(`/api/events?${auth()}`);
  es.addEventListener('state', (ev) => {
    state = JSON.parse(ev.data);
    online = true;
    if (sc && state.scenarioId && state.scenarioId !== sc.id) { reloadScenario(); return; }
    const last = lastRoll();
    if (last && last.id !== ui.lastRollId) {
      if (ui.lastRollId !== null) {
        if (role === 'player' || role === 'table') showFx(last);
        ui.freshId = last.id;
        setTimeout(() => { if (ui.freshId === last.id) ui.freshId = null; }, 900);
      }
      ui.lastRollId = last.id;
    } else if (!last) ui.lastRollId = '';
    if (ui.own && ui.own.reqId && !state.requests.some((q) => q.id === ui.own.reqId)) ui.own = null;
    // A roll or an attack that has just arrived for this player goes to the top of their screen.
    const myId = state.me && state.me.organismId;
    for (const q of state.requests) {
      const forMe = myId && ((q.actor.kind === 'org' && q.actor.id === myId) || (q.kind === 'incoming' && q.target && q.target.id === myId));
      if (forMe && !ui.seenReq[q.id]) { ui.seenReq[q.id] = true; ui.jumpTop = true; }
    }
    const prop = state.director && state.director.proposal;
    if (prop && prop.id !== ui.dir.editId) { ui.dir.edit = prop.narration; ui.dir.editId = prop.id; }
    if (state.director && state.director.provider && state.director.provider !== ui.dir.urlFor) { ui.dir.url = state.director.url || ''; ui.dir.urlFor = state.director.provider; ui.dir.key = ''; }
    voiceFollows();
    render();
  });
  es.onerror = () => { online = false; render(); };
}

async function boot() {
  applyColours();
  document.body.classList.toggle('phone', role === 'player');
  document.body.classList.add(`role-${role}`);
  if (role === 'home') { render(); return; }
  const res = await fetch(`/api/scenario?${auth()}`);
  if (res.status === 403) {
    const why = await res.json().catch(() => ({}));
    if (why.need === 'code') codeBad = true; else keyBad = true;
    render();
    return;
  }
  sc = await res.json();
  if (role === 'host') store.set('oxd.hostKey', key);
  if (tcode) store.set('oxd.t', tcode);
  const getInfo = async () => {
    try {
      const next = await (await fetch(`/api/info?${auth()}`)).json();
      const changed = JSON.stringify(next) !== JSON.stringify(info);
      info = next;
      if (changed) render();
    } catch (e) { /* the host is away; the live dot already says so */ }
  };
  await getInfo();
  setInterval(getInfo, 15000); // the outside link can appear a few seconds after the host starts
  connect();
  render();
}

// ------------------------------------------------------------------ drawing
// Replace a region only when its HTML changed, and keep focus, caret and
// scroll positions, so typing is never interrupted by a live update.
function patch(el, html) {
  if (el._html === html) return;
  const active = document.activeElement;
  const k = active && el.contains(active) ? active.getAttribute('data-k') : null;
  const caret = k && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  const scrolls = {};
  el.querySelectorAll('[data-scroll]').forEach((n) => { scrolls[n.dataset.scroll] = n.scrollTop; });
  el.innerHTML = html;
  el._html = html;
  el.querySelectorAll('[data-scroll]').forEach((n) => { if (scrolls[n.dataset.scroll] != null) n.scrollTop = scrolls[n.dataset.scroll]; });
  if (k) {
    const n = el.querySelector(`[data-k="${CSS.escape(k)}"]`);
    if (n) {
      n.focus();
      if (caret && n.setSelectionRange) { try { n.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not a text field */ } }
    }
  }
}

// A redraw between pressing and releasing a button would replace the button
// and swallow the tap, so redraws wait until the finger or mouse is up.
let pressing = false;
let renderWaiting = false;
document.addEventListener('pointerdown', () => { pressing = true; }, true);
const release = () => setTimeout(() => {
  pressing = false;
  if (renderWaiting) { renderWaiting = false; render(); }
}, 0);
document.addEventListener('pointerup', release, true);
document.addEventListener('pointercancel', release, true);

function render() {
  if (pressing) { renderWaiting = true; return; }
  const tabs = TABS[role].map(([id, name]) => `<button class="tab${ui.tab === id ? ' on' : ''}" data-act="tab" data-t="${id}">${name}</button>`).join('');
  const roleName = { host: 'Host console', table: 'Table screen', player: 'Player', home: '' }[role];
  patch($('#head'), `
    <div class="brand"><b>The Osmotic Expanse</b><span>${esc(sc ? sc.title : 'Director prototype')}${roleName ? ` · ${roleName}` : ''}</span></div>
    ${role === 'home' ? '' : `<div class="link"><i class="dot${online ? '' : ' off'}"></i>${online ? 'live' : 'reconnecting'}</div>`}
    ${role === 'host' && state && state.director && state.director.proposal && ui.tab !== 'director' ? '<button class="chip warn" data-act="tab" data-t="director">The Director has a proposal</button>' : ''}
    <div class="tabs">${tabs}</div>`);
  patch($('#nav'), role === 'player' && state && me() ? tabs : '');
  patch($('#main'), mainHtml());
  if (role === 'table') placeFace();
  if (ui.jumpTop) {
    ui.jumpTop = false;
    const stack = $('#main .stack');
    if (stack && ui.tab === 'play') stack.scrollTop = 0;
  }
}

function mainHtml() {
  if (role === 'home') return homeHtml();
  if (keyBad) return keyHtml();
  if (codeBad) return codeHtml();
  if (!state || !sc) return '<div class="home"><div class="dim">Connecting to the Director host…</div></div>';
  if (ui.tab === 'colours') return coloursHtml();
  if (ui.tab === 'rolls') return rollsHtml();
  if (role === 'player') return playerHtml();
  if (role === 'table') return tableHtml();
  return hostHtml();
}

// --------------------------------------------------------- shared components
const site = () => sc.sites.find((x) => x.id === state.scene.siteId) || sc.sites[0];
const me = () => (state && state.me) || null;
const mine = () => { const m = me(); return m && m.organismId ? state.organisms[m.organismId] : null; };
const creaturesHere = () => Object.values(state.creatures).filter((c) => c.siteId === state.scene.siteId);
const lastRoll = () => state.rolls.slice().reverse().find((r) => r.kind !== 'frequency') || null;
const playerName = (o) => (o.playerId && state.players[o.playerId] ? state.players[o.playerId].name : '');

function diceHtml(dice, fresh) {
  return `<span class="dice">${dice.map((d) => `<i class="die${d === 1 ? ' one' : d === 6 ? ' six' : ''}${fresh ? ' fresh' : ''}">${d}</i>`).join('')}</span>`;
}

function receipt(pool) {
  const terms = pool.parts.map((p, i) => {
    const label = p.label === 'Baseline' && pool.baselineName ? pool.baselineName : p.label === 'Pathway' && pool.pathwayName ? pool.pathwayName : p.label;
    const sign = i === 0 ? '' : p.dice >= 0 ? '+ ' : '− ';
    return `${sign}${esc(label)} <b>${Math.abs(p.dice)}</b>`;
  }).join(' ');
  return `<div class="receipt"><div class="ln"><b>Pool</b><span>${terms}${pool.capped ? ' (modifiers capped at 5)' : ''}</span><em>${pool.dice} dice</em></div></div>`;
}

function verdict(r) {
  if (r.source === 'baseline') return '<span class="verdict ok">Success · no roll needed</span>';
  if (r.at == null) return `<span class="verdict plain">Total ${r.total}</span>`;
  return r.success
    ? `<span class="verdict ok">Success · Overflow ${r.overflow}</span>`
    : `<span class="verdict no">Short by ${r.shortBy}</span>`;
}

function resultCard(r, { big = false, title = 'Last roll' } = {}) {
  const fresh = r.id === ui.freshId;
  const src = r.source === 'own' ? 'own dice' : r.source === 'baseline' ? 'Baseline' : 'rolled in the app';
  const lines = [];
  if (r.dice.length) lines.push(`<div class="ln"><b>Total</b><span>${r.inhibitors ? `${r.inhibitors} Inhibitor${r.inhibitors > 1 ? 's' : ''} removed` : 'no Inhibitors'}${r.at != null ? ` · against ${r.at}` : ''}</span><em>${r.total}</em></div>`);
  if (r.working) lines.push(`<div class="ln"><b>${r.segments != null ? 'Segments' : 'Damage'}</b><span>${esc(r.working)}</span><em>${r.segments != null ? r.segments : r.damage}</em></div>`);
  if (r.stressMarked) lines.push(`<div class="ln"><b>Stress</b><span>${r.stressMarked} marked for the 1s</span><em>now ${r.stressNow}</em></div>`);
  return `<section class="card result${big ? ' big' : ''}">
    <h3>${esc(title)}<span class="right src">${src}${r.practice ? ' · practice' : ''}</span></h3>
    <div><span class="who">${esc(r.who)}</span> <span class="dim">· ${esc(r.label)}</span></div>
    ${r.dice.length ? diceHtml(r.dice, fresh) : ''}
    <div class="row">${verdict(r)}${r.runaway ? '<span class="chip warn">Runaway Catalysis</span>' : ''}</div>
    ${lines.length ? `<div class="receipt">${lines.join('')}</div>` : ''}
    ${(r.notes || []).map((n) => `<div class="note${/Runaway|Cascade/.test(n) ? ' hot' : ''}">${esc(n)}</div>`).join('')}
  </section>`;
}

function sceneCard({ full = false } = {}) {
  const s = site();
  const zones = s.zones.map((z) => `<div class="z"><span class="zb">${esc(z.band || '·')}</span><span><b>${esc(z.name)}</b>${z.note ? ` <span class="dim">— ${esc(z.note)}</span>` : ''}</span></div>`).join('');
  return `<section class="card scene${full ? ' fill' : ''}">
    <h3>Where you are<span class="right">${state.cohesion ? `<span class="chip ok" title="The table's shared trust: an Oath kept pays one">Cohesion ${state.cohesion}</span>` : ''}<span class="chip">${esc(s.tonic)}</span><span class="chip">Viscosity ${s.visc}</span><span class="chip">Flow ${s.flow}</span></span></h3>
    <div class="${full ? 'scroll' : ''}" data-scroll="scene" style="display:flex;flex-direction:column;gap:10px">
      <div><div class="n">SITE ${s.n} OF ${sc.sites.length}</div><h2>${esc(s.name)}</h2><div class="dim">${esc(s.inWhale)}</div></div>
      <p class="tale">${esc(s.where)}</p>
      <div><div class="fl dim small">IN FRONT OF YOU</div><div>${esc(s.front)}</div></div>
      <div><div class="fl dim small">ZONES AND DISTANCE</div><div class="zones">${zones}</div></div>
      <div><div class="fl dim small">EXITS</div><ul class="plain">${s.exits.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>
      <details><summary>The whale, and the bands</summary>
        <p class="small dim" style="margin-top:6px">${esc(sc.whale)}</p>
        <p class="small dim" style="margin-top:6px">One Drift is about two metres. Contact 0 · Near 1–3 · Mid 4–9 · Far 10–20 · Loose 21+ Drifts.</p>
      </details>
    </div>
  </section>`;
}

function clocksCard({ edit = false } = {}) {
  const rows = Object.values(state.clocks).map((c) => {
    const def = sc.clocks.find((x) => x.id === c.id) || {};
    const stage = def.stages && def.stages[c.filled] ? def.stages[c.filled] : '';
    const segs = Array.from({ length: c.segments }, (_, i) => `<i class="${i < c.filled ? `on${c.filled >= c.segments - 1 ? ' hot' : ''}` : ''}"></i>`).join('');
    return `<div class="clock" title="${esc(c.says)}"><b>${esc(c.name)}</b><div class="segs">${segs}</div>
      <span class="small dim">${c.filled}/${c.segments}${stage ? ` · ${esc(stage)}` : ''}</span></div>
      ${edit ? `<div class="row" style="justify-content:flex-end;margin-top:-4px"><button class="btn sm" data-act="h.clock" data-id="${c.id}" data-d="-1">Rewind −1</button><button class="btn sm" data-act="h.clock" data-id="${c.id}" data-d="1">Advance +1</button></div>` : ''}`;
  }).join('');
  return `<section class="card"><h3>Clocks</h3>${rows}</section>`;
}

function bandMap() {
  const here = creaturesHere();
  const rows = BAND_IDS.slice().reverse().map((id) => {
    const b = R.BANDS.find((x) => x.id === id);
    const toks = here.filter((c) => (c.band || 'near') === id).map((c) => `<span class="tok${c.down ? ' down' : ''}">${esc(c.name)}${c.looks || c.segments != null ? ` <small>${esc(c.looks || `${c.segments}/${c.segMax}`)}</small>` : ''}</span>`).join(' ');
    const range = b.max === Infinity ? `${b.min}+` : b.min === b.max ? `${b.min}` : `${b.min}–${b.max}`;
    return `<div class="band"><span class="bn">${b.name}<small>${range} Drifts</small></span><span class="row">${toks}</span></div>`;
  }).join('');
  const cohort = Object.values(state.organisms).filter((o) => o.playerId).map((o) => `<span class="tok org${o.dormant ? ' down' : ''}">${esc(o.name)}${o.band ? ` <small>${esc(o.band)}</small>` : ''}</span>`).join(' ');
  return `<section class="card"><h3>Distance from the Cohort</h3><div class="bands">${rows}
    <div class="band cohort"><span class="bn">The Cohort</span><span class="row">${cohort || '<span class="faint small">no organisms yet</span>'}</span></div></div></section>`;
}

function pips(pp, max, waiting) {
  const n = Math.max(max, pp);
  return `<span class="pips">${Array.from({ length: n }, (_, i) => `<i class="pip${i < pp ? ' on' : ''}${waiting ? ' wait' : ''}"></i>`).join('')}</span>`;
}

function orderList({ numbers = true } = {}) {
  const f = state.fight;
  return `<div class="order">${f.order.map((k) => {
    const a = f.actors[k];
    if (!a) return '';
    const body = a.kind === 'org' ? state.organisms[a.id] : state.creatures[a.id];
    if (!body) return '';
    const st = a.status === 'acting' ? 'acting' : a.status === 'holding' ? `holding ${a.pp ?? ''}` : a.status === 'done' ? 'done' : 'waiting';
    const showPips = a.kind === 'org' || role === 'host';
    const extra = a.kind === 'org' && numbers ? `<small>MI ${body.mi}/${body.miMax} · Stress ${body.stress}</small>` : '';
    return `<div class="o ${a.kind}${f.turn === k ? ' now' : ''}${a.status === 'done' ? ' done' : ''}">
      <span class="f">${a.freq}</span>
      <span class="nm">${esc(body.name)}${a.reserve ? ' <span class="chip on">Reserve</span>' : ''} ${extra}</span>
      <span class="row">${showPips && a.status !== 'waiting' && a.status !== 'done' ? pips(a.pp, a.ppMax) : ''}<span class="small dim">${st}</span></span></div>`;
  }).join('')}</div>`;
}

// The story: what players said and what the Director narrated. Newest at the bottom;
// the list is drawn bottom-up so it stays pinned to the latest line.
function storyCard({ fill = false, input = '', n = 40, title = 'The story' } = {}) {
  const d = state.director || {};
  const rows = (state.story || []).slice(-n).reverse().map((e) => (e.kind === 'narration'
    ? `<div class="st dir"><p class="tale">${esc(e.text)}</p></div>`
    : `<div class="st say"><b>${esc(e.who)}</b> ${esc(e.text)}</div>`)).join('');
  return `<section class="card${fill ? ' fill' : ''}"><h3>${esc(title)}<span class="right">${(d.on || (state.story || []).some((e) => e.kind === 'narration')) && (canSpeakLocal() || serverVoice()) ? `<button class="chip${speakOn() ? ' on' : ''}" data-act="speak" title="Read the Director's narration aloud on this screen">${V.blocked ? 'Tap to start the voice' : speakOn() ? 'Voice on' : 'Voice off'}</button>` : ''}${d.on ? `<span class="chip${d.thinking ? ' on' : ''}">${d.thinking ? 'The Director is thinking…' : 'AI Director'}</span>` : ''}</span></h3>
    <div class="story${fill ? ' scroll' : ' scroll short'}" data-scroll="story">${rows || '<div class="empty">Nothing has been said yet.</div>'}</div>
    ${input}</section>`;
}

function logHtml(n = 40) {
  const rows = state.log.slice(-n).reverse().map((l) => `<div class="l ${esc(l.kind)}">${esc(l.text)}</div>`).join('');
  return `<div class="log">${rows || '<div class="empty">Nothing has happened yet.</div>'}</div>`;
}

function rollsHtml() {
  const mineId = mine() ? mine().id : null;
  const list = state.rolls.filter((r) => !ui.rollsMine || r.whoId === mineId).slice().reverse();
  const rows = list.map((r) => `<div class="r">
      <div class="top"><b>${esc(r.who)}</b><span class="dim">${esc(r.label)}</span><span class="grow"></span><span class="src">${r.source === 'own' ? 'own dice' : r.source === 'baseline' ? 'Baseline' : 'app'}${r.practice ? ' · practice' : ''}</span></div>
      <div class="row">${r.dice.length ? diceHtml(r.dice, false) : ''}${verdict(r)}${r.runaway ? '<span class="chip warn">Runaway</span>' : ''}${r.at != null && r.dice.length ? `<span class="small dim">${r.total} against ${r.at}</span>` : ''}${r.working ? `<span class="small dim">${esc(r.working)}</span>` : ''}</div>
    </div>`).join('');
  const rollsCard = `<section class="card fill"><h3>Recorded rolls<span class="right">${mineId ? `<button class="chip${ui.rollsMine ? ' on' : ''}" data-act="rolls.mine">only mine</button>` : ''}<span class="dim small">${list.length} shown</span></span></h3>
    <div class="rolls scroll" data-scroll="rolls">${rows || '<div class="empty">No rolls yet. Every roll made here is kept in this list.</div>'}</div></section>`;
  const story = `<section class="card fill"><h3>What happened</h3><div class="scroll" data-scroll="log">${logHtml(200)}</div></section>`;
  if (role === 'player') return `<div class="stack">${rollsCard}</div>`;
  return `<div class="lay-two">${rollsCard}${story}</div>`;
}

// ------------------------------------------------------------------ colours
const COLOURS = [
  ['--bg', 'Background'], ['--panel', 'Panels'], ['--panel2', 'Raised panels'], ['--line', 'Lines'],
  ['--ink', 'Text'], ['--dim', 'Quiet text'], ['--faint', 'Faint text'], ['--accent', 'Accent'],
  ['--ok', 'Success, 6s'], ['--no', 'Failure, 1s'], ['--warn-c', 'Warnings, creatures'], ['--input', 'Fields'], ['--btn', 'Buttons'],
];
const STYLE = (bg, panel, panel2, line, ink, dim, faint, accent, ok, no, warn, input, btn) => ({ '--bg': bg, '--panel': panel, '--panel2': panel2, '--line': line, '--ink': ink, '--dim': dim, '--faint': faint, '--accent': accent, '--ok': ok, '--no': no, '--warn-c': warn, '--input': input, '--btn': btn });
const STYLES = {
  'Deep Flow': STYLE('#12141a', '#1a1d24', '#22262f', '#333947', '#e6e9ef', '#98a2b3', '#6b7280', '#7aa2f7', '#5bbf7a', '#e06c6c', '#d8a24a', '#10131a', '#2b3140'),
  'Whale Fall': STYLE('#17110f', '#201815', '#2a201c', '#47352d', '#f0e6dc', '#bba898', '#857268', '#e8935a', '#7fbf7a', '#ec7a70', '#e0b04e', '#120d0b', '#35271f'),
  Brine: STYLE('#0c1618', '#122023', '#182b2f', '#2b464a', '#e0efee', '#96b3b2', '#648180', '#4fd1c5', '#6fcf8a', '#f07f7f', '#e3b65a', '#081011', '#1e363a'),
  Bloom: STYLE('#14111c', '#1c1828', '#252033', '#3d3553', '#ebe6f5', '#aaa2c3', '#756d8e', '#c08cf5', '#6fd0a0', '#f27a96', '#e6b450', '#0f0d16', '#2f2842'),
  Ash: STYLE('#f3f1ec', '#ffffff', '#ebe8e1', '#cfcabf', '#1f2328', '#555c66', '#7d848e', '#2f5fc4', '#1f7a3d', '#b83232', '#8a5a00', '#ffffff', '#e4e0d7'),
  Tallow: STYLE('#efe4cf', '#f7eedd', '#e8dcc3', '#c9b994', '#2b2218', '#5c4e3d', '#84745c', '#9c4a1a', '#2f6b2f', '#a32a2a', '#7a5200', '#fbf5e8', '#e0d2b4'),
  'High Contrast': STYLE('#000000', '#0b0b0b', '#171717', '#6e6e6e', '#ffffff', '#d4d4d4', '#a3a3a3', '#ffd60a', '#4cff8f', '#ff7b7b', '#ffb347', '#000000', '#242424'),
};
const DEFAULTS = { '--bg': '#12141a', '--panel': '#1a1d24', '--panel2': '#22262f', '--line': '#333947', '--ink': '#e6e9ef', '--dim': '#98a2b3', '--faint': '#6b7280', '--accent': '#7aa2f7', '--ok': '#5bbf7a', '--no': '#e06c6c', '--warn-c': '#d8a24a', '--input': '#10131a', '--btn': '#2b3140' };

function savedColours() {
  try { return JSON.parse(store.get('oxd.colours') || '{}') || {}; } catch (e) { return {}; }
}
function applyColours() {
  const c = { ...DEFAULTS, ...savedColours() };
  for (const [k, v] of Object.entries(c)) document.documentElement.style.setProperty(k, v);
  const bg = c['--bg'].replace('#', '');
  const lum = (parseInt(bg.slice(0, 2), 16) * 299 + parseInt(bg.slice(2, 4), 16) * 587 + parseInt(bg.slice(4, 6), 16) * 114) / 1000;
  document.documentElement.style.colorScheme = lum > 140 ? 'light' : 'dark';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = c['--bg'];
}
function coloursHtml() {
  const c = { ...DEFAULTS, ...savedColours() };
  const active = Object.keys(STYLES).find((n) => Object.keys(STYLES[n]).every((k) => STYLES[n][k].toLowerCase() === String(c[k]).toLowerCase())) || '';
  const styles = Object.entries(STYLES).map(([name, st]) => `<button class="style${active === name ? ' on' : ''}" data-act="col.style" data-id="${esc(name)}" style="background:${st['--panel']};color:${st['--ink']};border-color:${active === name ? st['--accent'] : st['--line']}">
      <span class="bar">${['--bg', '--panel2', '--accent', '--ok', '--no', '--warn-c'].map((k) => `<i style="background:${st[k]}"></i>`).join('')}</span>
      <b>${esc(name)}</b></button>`).join('');
  const sw = COLOURS.map(([k, name]) => `<label class="swatch"><input type="color" data-colour="${k}" value="${esc(c[k])}"><span><b>${name}</b><br><span class="small faint">${esc(c[k])}</span></span></label>`).join('');
  const inner = `<section class="card fill"><h3>Colours<span class="right"><span class="dim small">${active ? esc(active) : 'Custom'}</span><button class="btn sm" data-act="col.reset">Reset to default</button></span></h3>
      <div class="scroll" data-scroll="col" style="display:flex;flex-direction:column;gap:12px">
        <div><div class="fl dim small">STYLES</div><div class="styles">${styles}</div></div>
        <div><div class="fl dim small">FINE TUNE</div><p class="dim small" style="margin-bottom:8px">Pick a style, then change any colour. Saved on this device only.</p><div class="swatches">${sw}</div></div>
      </div>
      <div class="row"><span class="dice">${diceHtml([1, 3, 6, 6], false)}</span><span class="verdict ok">Success · Overflow 4</span><span class="verdict no">Short by 2</span><span class="chip warn">Runaway Catalysis</span>${pips(3, 5)}<button class="btn primary sm">Button</button></div>
    </section>`;
  return role === 'player' ? `<div class="stack">${inner}</div>` : `<div class="lay-one">${inner}</div>`;
}

// --------------------------------------------------------------------- home
function homeHtml() {
  return `<div class="home"><div class="box">
    <section class="card"><h3>The Osmotic Expanse · Director prototype</h3>
      <p class="tale">Pick the screen for this device.</p>
      <a class="btn primary big" href="/play">Join as a player</a>
      <a class="btn big" href="/table">Table screen (the shared display)</a>
      <a class="btn big" href="/host">Host console (needs the host key)</a>
      <p class="dim small">The host key is printed in the window where the Director host was started.</p>
    </section></div></div>`;
}
function keyHtml() {
  return `<div class="home"><div class="box"><section class="card"><h3>Host key</h3>
    <p class="dim">Type the host key shown in the window where the Director host is running.</p>
    <label class="fld"><span class="fl">Host key</span><input type="text" data-k="keyTry" data-bind="keyTry" value="${esc(ui.keyTry)}" autocomplete="off" autocapitalize="characters"></label>
    <button class="btn primary" data-act="key.go">Open the host console</button></section></div></div>`;
}

function codeHtml() {
  return `<div class="home"><div class="box"><section class="card"><h3>Table code</h3>
    <p class="dim">You are joining from outside the host's network. Type the table code the host gave you. It is the four characters at the end of the join link.</p>
    <label class="fld"><span class="fl">Table code</span><input type="text" data-k="keyTry" data-bind="keyTry" value="${esc(ui.keyTry)}" autocomplete="off" autocapitalize="characters" maxlength="8"></label>
    <button class="btn primary" data-act="code.go">Join the table</button></section></div></div>`;
}

// -------------------------------------------------------------------- names
// A name in the Expanse's own register: short, hard names (Dol, Ock, Vaal, Vesk),
// often followed by an epithet (Nine-Grudge, of the Sixth Reach). This is the same
// generator the Director's Assistant uses, without the job titles: it is the
// app's own, not a printed table.
function osmoticName() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ON = ['V', 'K', 'D', 'Br', 'S', 'Y', 'M', 'T', 'Gr', 'H', 'Sk', 'Dr', 'N', 'R', 'Th', 'Z', 'Kr', 'L', 'Sl', 'Q', 'Ves', 'Ol', 'Bl', 'Ch'];
  const VO = ['a', 'e', 'o', 'u', 'i', 'aa', 'ei', 'ou', 'y', 'e', 'o', 'a'];
  const CO = ['k', 'sh', 'l', 'n', 'st', 'x', 'rk', 'm', 'ss', 'sk', 'ck', 'th', 'r', '', 'l', 'sht', 'nd', 'v'];
  const syl = () => {
    const w = Math.random() < 0.12 ? pick(['O', 'U', 'A', 'E']) + pick(['ck', 'd', 'l', 'sk', 'rn', 'sh']) : pick(ON) + pick(VO) + pick(CO);
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  };
  const word = () => { let w = syl(); while (w.length < 3) w = syl(); return w; };
  const core = () => (Math.random() < 0.18 ? `${word()}-${word()}` : word());
  const NUM = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Nine', 'Twelve'];
  const ORD = ['Second', 'Third', 'Fourth', 'Sixth', 'Seventh', 'Ninth'];
  const EPI = [
    () => `${pick(['Nine', 'Three', 'Seven'])}-${pick(['Grudge', 'Yards', 'Debts', 'Salts', 'Tides', 'Mouths', 'Scars', 'Knots'])}`,
    () => `of ${pick(['Shift', 'Arch', 'Vent', 'Channel', 'Berth', 'Vat'])} ${pick(NUM)}`,
    () => `of the ${pick(ORD)} ${pick(['Reach', 'Tide', 'Choir', 'Vigil', 'Current'])}`,
    () => `of the ${pick(ORD)} ${pick(['Reach', 'Tide', 'Choir', 'Vigil', 'Current'])}`,
    () => `${pick(['Hush', 'Salt', 'Ash', 'Tallow', 'Glaze'])}-of-${pick(ORD)}`,
  ];
  return Math.random() < 0.15 ? core() : `${core()} ${pick(EPI)()}`;
}

// ------------------------------------------------------------------- sheets
function poolOf(o, baseline, pathway) {
  return R.buildPool({ baseline: o.base[baseline], pathway: pathway ? (o.pathways[pathway] || 0) : 0, stress: o.stress });
}

function sheetCard(o, { own = false, edit = false } = {}) {
  const adj = (field, v) => (edit ? `<span class="row" style="justify-content:center;gap:3px;margin-top:3px"><button class="btn sm" data-act="h.adj" data-id="${o.id}" data-field="${field}" data-v="${v - 1}">−</button><button class="btn sm" data-act="h.adj" data-id="${o.id}" data-field="${field}" data-v="${v + 1}">+</button></span>` : '');
  const tile = (label, value, cls = '', extra = '') => `<div class="tile ${cls}"><div class="tl">${label}</div><div class="tv">${value}</div>${extra}</div>`;
  const paths = Object.entries(o.pathways).map(([name, rank]) => {
    const base = (USUAL[name] || ['OSM']).slice().sort((a, b) => o.base[b] - o.base[a])[0];
    const p = poolOf(o, base, name);
    return `<div class="ln"><b>${esc(name)} ${rank}</b><span>${base} ${o.base[base]} + ${rank}${p.modsApplied ? ` − ${-p.modsApplied} Stress` : ''} · unhurried ${R.homeostatic(p.dice)}</span><em>${p.dice} dice</em></div>`;
  }).join('');
  const weapons = o.weapons.map((w) => {
    const baseName = w.cls === 'Weight' ? 'VSC' : w.cls === 'Resonator' ? 'RTC' : 'DFF';
    const p = R.buildPool({ baseline: o.base[baseName], pathway: o.pathways['Membrane Penetration'] || 0, mods: w.bonus ? [{ label: w.name, dice: w.bonus }] : [], stress: o.stress });
    const heavy = w.props.includes('Heavy');
    const choice = w.choice ? (w.carried !== false ? '<span class="chip on">carried</span>' : (own || edit ? `<button class="chip" data-act="weapon" data-org="${o.id}" data-id="${w.id}">carry this instead</button>` : '<span class="chip">not carried</span>')) : '';
    return `<div class="cre${w.carried === false ? ' down' : ''}"><div class="row"><b>${esc(w.name)}</b>${choice}<span class="grow"></span><span class="chip">${p.dice} dice</span><span class="chip">${heavy ? 3 : 2} PP</span></div>
      <div class="stat">${w.cls} · ${w.band} · BD ${w.bd[0]} ${w.type} · ${w.props.join(', ')}</div></div>`;
  }).join('');
  return `<section class="card fill">
    <h3>${esc(o.hand)}<span class="right dim small">${esc(playerName(o) || 'not played')}</span></h3>
    <div class="scroll" data-scroll="sheet-${o.id}" style="display:flex;flex-direction:column;gap:10px">
      <div><h2 style="font-size:19px">${esc(o.name)}</h2><div class="dim small">${esc(o.phenotype)} · Level ${o.level}${o.dormant ? ' · <b style="color:var(--no)">Dormant</b>' : ''}</div></div>
      ${own ? `<div class="row"><input type="text" class="grow" data-k="rename" data-bind="claim.name" value="${esc(ui.claim.name)}" placeholder="Rename your organism" maxlength="40"><button class="btn" data-act="name.random" title="Suggest a name">Random</button><button class="btn" data-act="rename">Rename</button></div>` : ''}
      <div class="tiles">${tile('MI', `${o.mi}<small>/${o.miMax}</small>`, o.mi <= o.miMax / 3 ? 'bad' : '', adj('mi', o.mi))}${tile('ATP', `${o.atp}<small>/${o.atpMax}</small>`, '', adj('atp', o.atp))}${tile('Stress', `${o.stress}<small>/8</small>`, o.stress >= 5 ? 'bad' : o.stress >= 3 ? 'warn' : '', adj('stress', o.stress))}${tile('Lysis', `${o.countdown}<small>/${o.countdownMax}</small>`, o.countdown ? 'bad' : '', adj('countdown', o.countdown))}</div>
      <div class="small dim">Stress ${o.stress}: ${R.stressNote(o.stress)}.</div>
      <div class="tiles">${tile('PP / Cycle', o.ppMax)}${tile('MT', o.mt)}${tile('Flow', o.flow)}${tile('Soak', o.soak)}</div>
      <div class="tiles">${tile('Substrate', `${o.substrate}<small> S</small>`, '', adj('substrate', o.substrate))}${tile('Codon', o.codon, '', adj('codon', o.codon))}${tile('Oath', o.oath == null ? '<small>not printed</small>' : `${o.oath}<small>/${o.oathMax}</small>`, '', o.oath == null ? '' : adj('oath', o.oath))}</div>
      ${o.bulk || o.specimens || o.stamped ? `<div class="small"><span class="dim">Cut carried:</span> ${['C', 'G', 'P', 'T'].filter((k) => (o.specimens || {})[k]).map((k) => `${o.specimens[k]} ${k}`).join(', ') || 'none'} unstamped · ${['C', 'G', 'P', 'T'].filter((k) => (o.stamped || {})[k]).map((k) => `${o.stamped[k]} ${k}`).join(', ') || 'none'} stamped · <span class="dim">Bulk</span> ${o.bulk || 0}/${(o.base.VSC || 0) * 5}</div>` : ''}
      ${(o.oaths || []).map((v) => `<div class="small row"><span>${v.open ? '<span class="chip warn">open</span>' : `<span class="chip${v.kept ? ' ok' : ' no'}">${v.kept ? 'kept' : 'broken'}</span>`} “${esc(v.promise)}”${v.witness ? ` <span class="dim">(${esc(v.witness)})</span>` : ''}</span>${edit && v.open ? `<span class="right"><button class="btn sm" data-act="h.oath.settle" data-id="${o.id}" data-oath="${v.id}" data-kept="1" title="Keeping it pays the table a Cohesion">Kept</button> <button class="btn sm no" data-act="h.oath.settle" data-id="${o.id}" data-oath="${v.id}" title="Breaking it marks two Lysis boxes and a scar">Broken</button></span>` : ''}</div>`).join('')}
      ${edit && o.oath ? `<div class="row"><input type="text" class="grow" data-k="oath.${o.id}" data-bind="oath.text" value="${esc(ui.oath.text)}" maxlength="200" placeholder="Swear an Oath: what is promised"><button class="btn sm" data-act="h.oath" data-id="${o.id}">Swear</button></div>` : ''}
      <div class="tiles">${R.BASELINES.map((b) => tile(b, o.base[b])).join('')}</div>
      ${o.conditions.length ? `<div class="row">${o.conditions.map((c) => `<span class="chip warn" title="${esc((R.CONDITIONS[c.name] || {}).effect || '')}">${esc(c.name)}</span>`).join('')}</div>` : ''}
      <div><div class="fl dim small">PATHWAYS</div><div class="receipt">${paths}</div></div>
      <div><div class="fl dim small">APPARATUS</div><div style="display:flex;flex-direction:column;gap:6px">${weapons}</div></div>
      <div><div class="fl dim small">KIT</div><ul class="plain">${o.kit.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div>
      <div class="note">${esc(o.tie)}</div>
      ${o.firstMove ? `<div class="small dim">First move: ${esc(o.firstMove)}</div>` : ''}
      ${o.notes ? `<div class="small faint">${esc(o.notes)}</div>` : ''}
    </div></section>`;
}

// ------------------------------------------------------------------- player
function playerHtml() {
  const m = me();
  if (!m) {
    return `<div class="home"><div class="box"><section class="card"><h3>Join the table</h3>
      <p class="tale">${esc(sc.title)}</p>
      <label class="fld"><span class="fl">Your name</span><input type="text" data-k="join.name" data-bind="join.name" value="${esc(ui.join.name)}" maxlength="24" placeholder="What the table calls you" autocomplete="off"></label>
      <button class="btn primary big" data-act="join">Join</button></section></div></div>`;
  }
  if (!m.agreed) return zeroHtml();
  const o = mine();
  if (!o) return chooseHandHtml();
  if (ui.tab === 'sheet') return `<div class="stack">${sheetCard(o, { own: true })}</div>`;
  return `<div class="stack" data-scroll="play">${playHtml(o)}</div>`;
}

// Session zero: read before anyone takes an organism.
function zeroCard({ host = false } = {}) {
  const z = state.zero || { pauseWord: 'SLACK WATER', lines: [] };
  return `<section class="card"><h3>Session zero<span class="right"><span class="chip warn">${esc(z.pauseWord)}</span></span></h3>
    <p class="tale">This is a game for adults. It is about a dead whale being taken apart for parts, and it can get close and bodily.</p>
    <p class="tale">Say <b>${esc(z.pauseWord)}</b> at any time, for any reason, and the scene stops where it is. No explanation is owed. We step back a moment and carry on from there.</p>
    ${z.tone ? `<div class="note">${esc(z.tone)}</div>` : ''}
    <div class="fl">Off the page for this table</div>
    ${z.lines.length ? `<div class="row">${z.lines.map((l) => `<span class="chip warn">${esc(l)}${host ? ` <button class="btn sm" data-act="zero.drop" data-line="${esc(l)}" title="Take it off the list">x</button>` : ''}</span>`).join('')}</div>`
    : '<p class="small dim">Nothing yet. Anything on this list stays out of the game.</p>'}
    <div class="row"><input type="text" class="grow" data-k="zero.line" data-bind="zero.line" value="${esc(ui.zero.line)}" maxlength="120" placeholder="Something to leave out (nobody is told who asked)"><button class="btn" data-act="zero.add">Add</button></div>
  </section>`;
}

function zeroHtml() {
  const waiting = Object.values(state.players || {}).filter((p) => !p.agreed).length;
  return `<div class="stack">${zeroCard()}
    <section class="card"><h3>Ready?</h3>
      <p class="small dim">Add anything you want left out first: the list is shared with the table, your name is not. You can add more at any time during play.</p>
      ${canHear() ? `<div class="fl">Talking to the Director</div>${hearConsentHtml()}` : ''}
      <button class="btn primary big grow" data-act="zero.agree">I have read this, and I am ready to play</button>
      ${waiting > 1 ? `<p class="small dim">${waiting - 1} other${waiting > 2 ? 's have' : ' has'} not answered yet.</p>` : ''}
    </section></div>`;
}

function chooseHandHtml() {
  const hands = Object.values(state.organisms).map((o) => {
    const taken = o.playerId && o.playerId !== pid;
    return `<button class="hand${ui.claim.hand === o.id ? ' on' : ''}" ${taken ? 'disabled' : ''} data-act="claim.pick" data-id="${o.id}">
      <b>${esc(o.hand)}</b><span class="dim small">${esc(o.phenotype)}</span>
      <span class="small">${esc(o.tie)}</span>
      <span class="small faint">${taken ? `played by ${esc(playerName(o))}` : `MI ${o.miMax} · PP ${o.ppMax} · MT ${o.mt}`}</span></button>`;
  }).join('');
  return `<div class="stack"><section class="card"><h3>Choose your organism</h3>
    <div class="hands">${hands}</div>
    ${ui.claim.hand ? `<div class="fld"><span class="fl">Name your organism</span><div class="row"><input type="text" class="grow" data-k="claim.name" data-bind="claim.name" value="${esc(ui.claim.name)}" maxlength="40" placeholder="For example: Bresk of the Sixth Choir" autocomplete="off"><button class="btn" data-act="name.random">Random name</button></div>
      <span class="small faint">Tap Random name as often as you like, or type your own.</span></div>
    <button class="btn primary big" data-act="claim.go">Play this organism</button>` : '<p class="dim small">Tap a Hand to read it, then give it a name.</p>'}
  </section></div>`;
}

function ownPad(n) {
  const d = ui.own.dice;
  const slots = Array.from({ length: n }, (_, i) => (d[i] ? `<i class="die${d[i] === 1 ? ' one' : d[i] === 6 ? ' six' : ''}">${d[i]}</i>` : '<i class="die blank">·</i>')).join('');
  return `<div class="small dim">Roll ${n} real dice, then tap in each die.</div>
    <div class="dice">${slots}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6].map((v) => `<button class="btn" data-act="own.add" data-d="${v}" ${d.length >= n ? 'disabled' : ''}>${v}</button>`).join('')}</div>
    <div class="row"><button class="btn grow" data-act="own.back" ${d.length ? '' : 'disabled'}>Undo last die</button><button class="btn ghost grow" data-act="own.cancel">Cancel</button></div>
    <button class="btn primary big" data-act="own.submit" ${d.length === n ? '' : 'disabled'}>${d.length === n ? 'Record these dice' : `${n - d.length} more to enter`}</button>`;
}

function askCard(q, { hostView = false } = {}) {
  const name = R.thresholdName(q.at);
  const owning = ui.own && ui.own.reqId === q.id;
  const buttons = owning ? ownPad(q.pool.dice)
    : `<div class="row"><button class="btn primary big grow" data-act="roll" data-id="${q.id}">Roll the dice</button><button class="btn big" data-act="own.start" data-id="${q.id}" data-n="${q.pool.dice}">I rolled my own</button></div>`;
  return `<section class="card ask">
    <h3>${hostView ? `Waiting on ${esc(q.actor.name)}` : 'Your roll'}<span class="right">${q.chance != null ? `<span class="chip on">${pct(q.chance)} to succeed</span>` : ''}</span></h3>
    <div class="hero"><div class="n">${q.pool.dice}<small>dice</small></div>
      <div class="grow"><b>${esc(q.label)}</b><div class="dim">${q.at != null ? `against ${esc(q.atLabel || 'Threshold')} <b style="color:var(--ink)">${q.at}</b>${name ? ` (${name})` : ''}` : 'no Threshold: just the total'}</div></div></div>
    ${receipt(q.pool)}
    ${q.note ? `<div class="note">${esc(q.note)}</div>` : ''}
    ${q.reaction === 'deflect' ? `<div class="note hot">${esc(q.reactor || 'It')} spends its Reserve to Deflect: Membrane Threshold +4 against this attack.</div>` : ''}
    ${hostView || owning ? '' : (() => {
    const me2 = state.organisms[q.actor.id];
    if (!me2) return '';
    if (q.overdrive) return `<div class="small dim">Overdriven with ${q.overdrive === 'mi' ? 'body' : 'ATP'}. Once per roll.</div>`;
    return `<div class="row"><span class="small dim">Overdrive:</span><button class="chip" data-act="overdrive" data-id="${q.id}" data-with="atp" ${me2.atp >= 4 ? '' : 'disabled'} title="CORE 1.8">+2 dice for 4 ATP</button><button class="chip" data-act="overdrive" data-id="${q.id}" data-with="mi" ${me2.mi > 4 ? '' : 'disabled'} title="Marks 1 Stress whatever happens">+4 dice for 4 MI and 1 Stress</button></div>`;
  })()}
    ${buttons}
  </section>`;
}

function incomingCard(q, o) {
  const a = state.fight ? state.fight.actors[`org:${o.id}`] : null;
  const can = a && a.reserve && !a.reacted && !q.reaction;
  return `<section class="card ask danger">
    <h3>Incoming<span class="right">${q.chance != null ? `<span class="chip no">${pct(q.chance)} to hit</span>` : ''}</span></h3>
    <div><b>${esc(q.actor.name)}</b> strikes at you: <b>${q.pool.dice} dice</b> against your Membrane Threshold <b>${q.at}</b>.</div>
    ${q.reaction ? `<div class="note hot">${esc(q.reactor || 'You')} spent a Reserve: ${cap(q.reaction)}.</div>` : ''}
    ${can ? `<div class="acts"><button class="btn primary" data-act="react" data-id="${q.id}" data-kind="deflect" title="Your Membrane Threshold is +4 against this attack">Deflect: MT +4</button><button class="btn" data-act="react" data-id="${q.id}" data-kind="brace" title="Halve Kinetic and Osmotic damage; ignore the push">Brace: halve it</button><button class="btn" data-act="react" data-id="${q.id}" data-kind="inhibit" ${o.atp >= 3 ? '' : 'disabled'} title="The attacker rolls 2 fewer dice">Inhibit: −2 dice <span class="cost">3 ATP</span></button></div>
      <div class="small dim">You are holding a Reserve. Spend it on one of these, or let the dice fall.</div>`
    : `<div class="small dim">${q.reaction ? '' : 'You are not holding a Reserve, so you cannot Deflect, Brace or Inhibit. Set one aside on your turn (1 PP).'}</div>`}
    <button class="btn grow" data-act="roll" data-id="${q.id}">Let the dice fall</button>
  </section>`;
}

// Sharing out the harvest: one Specimen at a time, round the picking order.
function shareItem() {
  const L = state.loot || {};
  if (!L.offer || !(L.queue || []).length) return null;
  return { L, item: L.queue.find((x) => x.id === L.offer.itemId) || L.queue[0], who: state.organisms[L.offer.orgId] };
}
function shareOrder(L, mine) {
  return L.order.map((id, i) => `<span class="chip${id === L.offer.orgId ? ' on' : ''}${id === mine ? ' ok' : ''}">${i + 1}. ${esc(state.organisms[id].name.replace(/ of .*$/, ''))}</span>`).join(' ');
}
function shareCard(o) {
  const x = shareItem();
  if (!x) return '';
  const { L, item, who } = x;
  const left = L.queue.length - 1;
  if (who.id === o.id) {
    return `<section class="card ask"><h3>Your pick<span class="right"><span class="chip">${left} more after this</span></span></h3>
      <div class="tale">A <b>${item.grade} Specimen</b> from ${esc(item.from)}. Take it, or pass it to the next in line.</div>
      <div class="small dim">Either way you go to the back of the picking order.</div>
      <div class="row"><button class="btn primary big grow" data-act="loot.take" data-id="${esc(item.id)}">Take it</button><button class="btn big" data-act="loot.pass" data-id="${esc(item.id)}">Pass</button></div>
      <div class="row"><button class="btn sm grow" data-act="loot.always" data-id="${esc(item.id)}" data-rule="take">Take it, and every ${item.grade} that comes to me</button><button class="btn sm" data-act="loot.always" data-id="${esc(item.id)}" data-rule="pass">Pass every ${item.grade}</button></div>
      ${standingLine(L, o.id)}
      <div class="row small">${shareOrder(L, o.id)}</div>
    </section>`;
  }
  return `<section class="card"><h3>Sharing out the harvest<span class="right"><span class="chip">${L.queue.length} left</span></span></h3>
    <div class="small"><b>${esc(who.name)}</b> is choosing whether to take a ${item.grade} Specimen from ${esc(item.from)}.</div>
    ${standingLine(L, o.id)}
    <div class="row small">${shareOrder(L, o.id)}</div>
  </section>`;
}
// A player's standing choices, each with a way to stop it. They answer only when it is their turn.
function standingLine(L, orgId) {
  const rules = Object.entries((L.auto || {})[orgId] || {});
  if (!rules.length) return '';
  return `<div class="row small"><span class="dim">You will</span>${rules.map(([g, r]) => `<span class="chip${r === 'take' ? ' ok' : ''}">${r} every ${g} <button class="btn sm" data-act="loot.auto.off" data-grade="${g}" title="Choose each one again">x</button></span>`).join(' ')}<span class="dim">when it comes to you.</span></div>`;
}

function playHtml(o) {
  const out = [];
  const myAsks = state.requests.filter((q) => q.actor.kind === 'org' && q.actor.id === o.id);
  const incoming = state.requests.filter((q) => q.kind === 'incoming' && q.target && q.target.id === o.id);
  for (const q of incoming) out.push(incomingCard(q, o));
  for (const q of myAsks) out.push(askCard(q));
  const share = shareCard(o);
  if (share) out.push(share);
  // Two panels stay folded away until asked for, so the story and the last roll stay in view.
  const sw = (what, label) => `<button class="btn grow${ui.show[what] ? ' primary' : ''}" data-act="p.show" data-what="${what}" aria-pressed="${ui.show[what] ? 'true' : 'false'}">${ui.show[what] ? 'Hide: ' : ''}${label}</button>`;
  // Harvest: destroyed bodies not yet harvested, and the site itself where it can be cut.
  const bodies = creaturesHere().filter((c) => c.down && !c.harvested);
  const cut = site().harvest;
  const canHarvest = (bodies.length || cut) && !o.dormant;
  out.push(`<div class="row showbar">${sw('scene', 'Where you are')}${state.fight ? '' : sw('quick', 'Roll something')}${canHarvest ? sw('harvest', 'Harvest') : ''}${sw('zero', 'Session zero')}</div>`);
  if (ui.show.zero) out.push(zeroCard());
  if (ui.show.scene) out.push(sceneCard());
  if (ui.show.harvest && canHarvest) {
    const cap = (o.base.VSC || 0) * 5;
    const busy = myAsks.length > 0;
    out.push(`<section class="card"><h3>Harvest<span class="right"><span class="chip">Bulk ${o.bulk || 0}/${cap}</span></span></h3>
      <div class="small dim">Each harvest takes 1 Bulk. ${state.fight ? 'In a Pulse War it is a Synthesise action: 2 Pulse Points, on your turn.' : 'Outside a fight it takes about ten minutes, and may need no roll.'} A failed roll ruins the sample.</div>
      <div class="acts">${bodies.map((c) => `<button class="btn" data-act="p.harvest" data-org="${o.id}" data-id="${c.cid}" ${busy ? 'disabled' : ''}>Harvest ${esc(c.name)}</button>`).join('')}${cut ? `<button class="btn" data-act="p.harvest" data-org="${o.id}" data-id="" ${busy ? 'disabled' : ''}>Cut ${esc(cut.what || 'the site')}</button>` : ''}</div>
      ${site().post ? '<div class="small dim">A Tally Post stands here. A cut is worth nothing outside until it is stamped: ask at the post.</div>' : ''}
    </section>`);
  }
  if (ui.show.quick && !state.fight) out.push(quietCard(o));
  out.push(storyCard({ n: 12, input: `<div class="row"><input type="text" class="grow" data-k="say" data-bind="say.text" value="${esc(ui.say.text)}" maxlength="600" placeholder="What does ${esc(o.name.split(' ')[0])} do?" autocomplete="off">${talkButtonHtml()}<button class="btn primary" data-act="say">Say</button></div>${ui.talkAsk && !hearOk() && canHear() ? hearConsentHtml() : ''}` }));
  if (ui.own && ui.own.mode === 'quick') out.push(`<section class="card ask"><h3>Your own dice</h3><div><b>${esc(ui.own.label)}</b></div>${ownPad(ui.own.n)}</section>`);
  // In a fight everyone watches every roll; outside one, show your own latest.
  // A roll that has only just landed goes on top; an older one sits under the fight.
  const recent = state.rolls.filter((r) => r.kind !== 'frequency').slice(-3).reverse();
  const show = state.fight ? recent[0] : recent.find((r) => r.whoId === o.id);
  const card = show ? resultCard(show, { title: show.whoId === o.id ? 'Your last roll' : 'Last roll' }) : '';
  const justNow = show && show.seq >= state.seq - 1;
  if (card && (justNow || !state.fight)) out.push(card);
  if (state.fight) out.push(fightCard(o));
  if (card && !justNow && state.fight) out.push(card);
  return out.join('');
}

function fightCard(o) {
  const f = state.fight;
  const a = f.actors[`org:${o.id}`];
  if (!a) return `<section class="card"><h3>Pulse War · Cycle ${f.cycle}</h3><div class="dim">${esc(o.name)} is not in this fight.</div>${orderList()}</section>`;
  const current = f.turn ? f.actors[f.turn] : null;
  const curName = current ? (current.kind === 'org' ? state.organisms[current.id].name : (state.creatures[current.id] || {}).name) : '';
  const canAct = (a.status === 'acting' || a.status === 'holding') && !o.dormant;
  let banner;
  if (o.dormant) banner = '<div class="turn">You are Dormant. An ally at Contact can stabilise you.</div>';
  else if (a.status === 'acting') banner = '<div class="turn mine">Your turn</div>';
  else if (a.status === 'holding') banner = `<div class="turn mine">Holding ${a.pp} PP. Step back in after anyone else acts.</div>`;
  else if (a.status === 'done') banner = `<div class="turn">You are done this Cycle${curName ? `. ${esc(curName)} is acting.` : '.'}</div>`;
  else banner = `<div class="turn">${curName ? `${esc(curName)} is acting.` : 'Waiting.'} Your full ${a.ppMax} PP arrive when your turn starts.</div>`;
  const waiting = a.status === 'waiting' || a.status === 'done';
  const carried = o.weapons.filter((w) => w.carried !== false);
  const strikeCost = (w) => 2 + (w.props.includes('Heavy') ? 1 : 0);
  const minStrike = carried.length ? Math.min(...carried.map(strikeCost)) : 99;
  const btn = (act, label, cost, extra = '', disabled = false) => `<button class="btn" data-act="act" data-a="${act}" ${extra} ${!canAct || a.pp < cost || disabled ? 'disabled' : ''}>${label} <span class="cost">${cost}</span></button>`;
  const targets = creaturesHere().filter((c) => !c.down);
  let strikeBox = '';
  if (ui.strike) {
    const w = carried.find((x) => x.id === ui.strike.weaponId) || carried[0];
    strikeBox = `<div class="card ask" style="padding:10px">
      ${carried.length > 1 ? `<div class="seg">${carried.map((x) => `<button class="${x.id === w.id ? 'on' : ''}" data-act="strike.weapon" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : `<b>${esc(w.name)}</b>`}
      <div class="small dim">Choose a target.</div>
      <div class="row">${targets.map((c) => `<button class="chip${ui.strike.targetId === c.cid ? ' on' : ''}" data-act="strike.pick" data-id="${c.cid}">${esc(c.name)} · ${esc(c.band || '')}</button>`).join('') || '<span class="faint small">Nothing to strike.</span>'}</div>
      <div class="fl dim small">THE SITUATION (tap what applies)</div>
      <div class="row">${[['ally1', 'An ally helps +1'], ['ally2', 'Two allies help +2'], ['position', 'Good position +1'], ['tonic1', 'Wrong tonic −1'], ['tonic2', 'Wrong tonic −2'], ['cover2', 'Target in partial cover −2'], ['cover4', 'Target in heavy cover −4'], ['squeezed', 'Squeezed or pinned −2']].map(([id, label]) => `<button class="chip${ui.strike.sit[id] ? ' on' : ''}" data-act="strike.sit" data-id="${id}">${label}</button>`).join('')}</div>
      ${/hypertonic|hypotonic|acid/i.test(site().tonic) ? `<div class="small" style="color:var(--warn-c)">The fluid here is ${esc(site().tonic)}.</div>` : ''}
      ${w.props.includes('Braced') ? `<div class="small dim">${a.drifted ? 'You Drifted this Cycle: no Braced die.' : 'Braced: +1 die, because you have not Drifted this Cycle.'}</div>` : `<label class="chip${ui.strike.momentum ? ' on' : ''}"><input type="checkbox" data-bind="strike.momentum" ${ui.strike.momentum ? 'checked' : ''}> Momentum: I Drifted 3 in a straight line (+2 dice, Kinetic)</label>`}
      <div class="row"><button class="btn primary grow" data-act="strike.go" ${ui.strike.targetId && a.pp >= strikeCost(w) ? '' : 'disabled'}>Strike <span class="cost">${strikeCost(w)}</span></button><button class="btn ghost" data-act="strike.cancel">Cancel</button></div></div>`;
  }
  let driftBox = '';
  if (ui.drift) {
    driftBox = `<div class="card ask" style="padding:10px"><div class="small dim">Drift up to ${o.flow} Drifts. Where do you end up, relative to the enemy?</div>
      <div class="row">${R.BANDS.map((b) => `<button class="chip" data-act="act" data-a="drift" data-band="${b.name}">${b.name}</button>`).join('')}<button class="chip" data-act="act" data-a="drift">just Drift</button><button class="btn ghost sm" data-act="drift.cancel">Cancel</button></div></div>`;
  }
  const fallen = Object.values(state.organisms).filter((x) => x.dormant && x.id !== o.id);
  return `<section class="card">
    <h3>Pulse War · Cycle ${f.cycle}<span class="right big">${pips(waiting ? 0 : a.pp, a.ppMax, waiting)}<b>${waiting ? '' : `${a.pp} PP`}</b></span></h3>
    ${banner}
    <div class="tiles"><div class="tile${o.mi <= o.miMax / 3 ? ' bad' : ''}"><div class="tl">MI</div><div class="tv">${o.mi}<small>/${o.miMax}</small></div></div>
      <div class="tile"><div class="tl">ATP</div><div class="tv">${o.atp}<small>/${o.atpMax}</small></div></div>
      <div class="tile${o.stress >= 5 ? ' bad' : o.stress >= 3 ? ' warn' : ''}"><div class="tl">Stress</div><div class="tv">${o.stress}<small>/8</small></div></div>
      <div class="tile"><div class="tl">MT</div><div class="tv">${o.mt}</div></div></div>
    ${o.stress >= 3 ? `<div class="small dim">Stress ${o.stress}: ${R.stressNote(o.stress)}.</div>` : ''}
    ${o.conditions.length ? `<div class="row">${o.conditions.map((c) => `<span class="chip warn" title="${esc((R.CONDITIONS[c.name] || {}).effect || '')}">${esc(c.name)}</span>`).join('')}${a.reserve ? '<span class="chip on">Reserve held</span>' : ''}</div>` : (a.reserve ? '<div class="row"><span class="chip on">Reserve held</span></div>' : '')}
    ${strikeBox || driftBox || `<div class="acts">
      <button class="btn primary" data-act="strike.open" ${!canAct || a.pp < minStrike ? 'disabled' : ''}>Strike <span class="cost">${minStrike === 99 ? 2 : minStrike}</span></button>
      <button class="btn" data-act="drift.open" ${!canAct || a.pp < 1 ? 'disabled' : ''}>Drift <span class="cost">1</span></button>
      ${btn('sense', 'Sense', 1)}
      ${btn('vent', 'Vent', 1, 'title="Stress −2, costs 2 ATP"', o.stress === 0)}
      ${btn('synthesise', 'Synthesise', 2)}
      ${btn('reserve', 'Reserve', 1, 'title="Hold 1 PP to Deflect, Brace or Inhibit when you are attacked later this Cycle"', a.reserve)}
      <button class="btn" data-act="act" data-a="burst" data-cost="3" ${!canAct || a.pp < 3 ? 'disabled' : ''}>Burst <span class="cost">3+</span></button>
      ${fallen.map((x) => `<button class="btn danger" data-act="stabilise" data-id="${x.id}" ${!canAct || a.pp < 2 ? 'disabled' : ''}>Stabilise ${esc(x.name)} <span class="cost">2</span></button>`).join('')}
    </div>
    <div class="row"><button class="btn grow" data-act="turn.end" ${canAct ? '' : 'disabled'}>${a.status === 'holding' ? 'Finish for this Cycle' : 'End my turn'}</button>
      ${a.status === 'acting' ? `<button class="btn grow" data-act="turn.hold" ${a.pp > 0 ? '' : 'disabled'} title="Split Frequency: stop now, keep your PP, step back in after anyone else acts">Hold ${a.pp} PP for later</button>` : ''}</div>`}
    <details open><summary>Order this fight</summary>${orderList({ numbers: false })}</details>
  </section>`;
}

function quietCard(o) {
  const q = ui.quick;
  const pool = poolOf(o, q.baseline, q.pathway);
  const at = q.at === '' ? null : Number(q.at);
  const odds = at ? oddsCard(Math.min(30, pool.dice), at) : null;
  return `<section class="card">
    <h3>Roll something<span class="right dim small">No Pulse War: no Pulse Points to track</span></h3>
    <div class="fields">
      <label class="fld"><span class="fl">Baseline</span><select data-k="q.b" data-bind="quick.baseline">${R.BASELINES.map((b) => `<option value="${b}" ${q.baseline === b ? 'selected' : ''}>${BASE_NAMES[b]} ${o.base[b]}</option>`).join('')}</select></label>
      <label class="fld"><span class="fl">Pathway</span><select data-k="q.p" data-bind="quick.pathway"><option value="">none</option>${Object.entries(o.pathways).map(([n, r]) => `<option value="${esc(n)}" ${q.pathway === n ? 'selected' : ''}>${esc(n)} ${r}</option>`).join('')}</select></label>
      <label class="fld"><span class="fl">Threshold, if you know it</span><input type="number" data-k="q.at" data-bind="quick.at" value="${esc(q.at)}" min="1" max="40" placeholder="none"></label>
      <label class="fld"><span class="fl">Practice roll</span><span class="row" style="min-height:36px"><label class="chip${q.practice ? ' on' : ''}"><input type="checkbox" data-bind="quick.practice" ${q.practice ? 'checked' : ''}> 1s do not mark Stress</label></span></label>
    </div>
    <div class="receipt"><div class="ln"><b>Pool</b><span>${q.baseline} ${o.base[q.baseline]}${q.pathway ? ` + ${esc(q.pathway)} ${o.pathways[q.pathway] || 0}` : ''}${pool.modsApplied ? ` − ${-pool.modsApplied} for Stress ${o.stress}` : ''} · unhurried ${R.homeostatic(pool.dice)}</span><em>${pool.dice} dice</em></div>
      ${odds ? `<div class="ln"><b>Odds</b><span>against ${at} · mean Overflow ${odds.meanOverflow.toFixed(1)} · any 1: ${pct(odds.anyInhibitor)}</span><em>${pct(odds.success)}</em></div>` : ''}</div>
    <div class="row"><button class="btn primary grow" data-act="quick.go">Roll ${pool.dice} dice</button><button class="btn" data-act="quick.own" data-n="${pool.dice}">I rolled my own</button></div>
  </section>`;
}

// -------------------------------------------------------------------- table
function tableHtml() {
  const last = lastRoll();
  const waiting = state.requests.map((q) => `<div class="note hot"><b>${esc(q.kind === 'incoming' ? q.actor.name : q.actor.name)}</b>: ${esc(q.label)} · ${q.pool.dice} dice against ${q.at ?? 'no Threshold'}${q.chance != null ? ` · ${pct(q.chance)}` : ''}</div>`).join('');
  const join = info && info.addresses && info.addresses.length ? `http://${info.addresses[0]}:${info.port}/play` : `${location.origin}/play`;
  const right = `${state.fight ? `<section class="card"><h3>Pulse War · Cycle ${state.fight.cycle}</h3><div class="scroll" data-scroll="order" style="max-height:34vh">${orderList()}</div></section>` : ''}
    ${(state.story || []).length || (state.director || {}).on ? storyCard({ fill: true }) : `<section class="card fill"><h3>What happened</h3><div class="scroll" data-scroll="log">${logHtml(30)}</div></section>`}`;
  return `<div class="lay-table">
    <div class="col" style="grid-template-rows:minmax(0,1fr) auto">${sceneCard({ full: true })}
      <section class="card"><div class="face-slot"></div><div class="row"><span class="dim small">Players join at</span><b style="font-family:var(--mono)">${esc(join)}</b></div>
        ${info && info.online ? `<div class="row"><span class="dim small">From outside this network</span><b style="font-family:var(--mono);overflow-wrap:anywhere">${esc(info.online)}</b></div>` : ''}</section></div>
    <div class="col" style="grid-template-rows:auto minmax(0,1fr)">${bandMap()}
      <div class="scroll" data-scroll="mid" style="display:flex;flex-direction:column;gap:12px">${waiting ? `<section class="card ask"><h3>Waiting for dice</h3>${waiting}</section>` : ''}${last ? resultCard(last, { big: true }) : '<section class="card"><h3>Last roll</h3><div class="empty">No dice yet.</div></section>'}</div></div>
    <div class="col" style="display:flex;flex-direction:column">${clocksCard()}${right}</div>
  </div>`;
}

// --------------------------------------------------------------------- host
function hostHtml() {
  if (ui.tab === 'sheets') {
    const L = state.loot || {};
    const order = (L.order || []).filter((id) => state.organisms[id]);
    const bar = order.length > 1 ? `<div class="row small" style="margin-bottom:8px"><span class="dim">Picking order for the harvest (kept for the game):</span> ${order.map((id, i) => `<span class="chip">${i + 1}. ${esc(state.organisms[id].name.replace(/ of .*$/, ''))}${i ? ` <button class="btn sm" data-act="loot.up" data-id="${esc(id)}" title="Move up the order">↑</button>` : ''}</span>`).join(' ')}</div>` : '';
    return `<div style="display:flex;flex-direction:column;height:100%;min-height:0">${bar}<div class="sheets" style="flex:1;height:auto">${Object.values(state.organisms).map((o) => sheetCard(o, { edit: true })).join('')}</div></div>`;
  }
  if (ui.tab === 'bestiary') return bestiaryHtml();
  if (ui.tab === 'director') return directorHtml();
  if (ui.tab === 'memory') return memoryHtml();
  if (ui.tab === 'voice') return `<div class="stack" style="max-width:760px">${voiceCard()}</div>`;
  return `<div class="lay-host">
    <div class="col">${hostSceneCard()}</div>
    <div class="col">${hostAskCard()}${hostWaitingCard()}</div>
    <div class="col">${hostFightCard()}${hostToolsCard()}${shareItem() ? hostShareCard() : hostZeroCard()}</div>
  </div>`;
}

// Session zero on the host console: set the pause word and the tone, see who has agreed.
// The host sees the sharing, can decide for a player who is away, and can set the order.
function hostShareCard() {
  const { L, item, who } = shareItem();
  return `<section class="card"><h3>Sharing out the harvest<span class="right"><span class="chip">${L.queue.length} left</span></span></h3>
    <div class="small"><b>${esc(who.name)}</b> is offered a ${item.grade} Specimen from ${esc(item.from)}.</div>
    <div class="row"><button class="btn sm grow" data-act="loot.take" data-id="${esc(item.id)}">Take for them</button><button class="btn sm grow" data-act="loot.pass" data-id="${esc(item.id)}">Pass for them</button></div>
    <div class="row small">${L.order.map((id, i) => `<span class="chip${id === L.offer.orgId ? ' on' : ''}">${i + 1}. ${esc(state.organisms[id].name.replace(/ of .*$/, ''))}${i ? ` <button class="btn sm" data-act="loot.up" data-id="${esc(id)}" title="Move up the order">↑</button>` : ''}</span>`).join(' ')}</div>
  </section>`;
}

function hostZeroCard() {
  const z = state.zero || { pauseWord: '', tone: '', lines: [] };
  const ps = Object.values(state.players || {});
  const waiting = ps.filter((p) => !p.agreed).map((p) => p.name);
  return `<section class="card"><h3>Session zero<span class="right"><span class="chip${waiting.length ? ' warn' : ' ok'}">${ps.length ? (waiting.length ? `${waiting.length} not ready` : 'all ready') : 'nobody yet'}</span></span></h3>
    <div class="row"><input type="text" class="grow" data-k="zero.pw" data-bind="zero.pauseWord" value="${esc(ui.zero.pauseWord || z.pauseWord)}" maxlength="24" placeholder="Pause word"><button class="btn" data-act="h.zero">Set</button></div>
    <div class="fld"><span class="fl">A line for the table, in your own words (optional)</span>
      <input type="text" data-k="zero.tone" data-bind="zero.tone" value="${esc(ui.zero.tone || z.tone)}" maxlength="300" placeholder="For example: body horror is in, cruelty to animals is out"></div>
    ${z.lines.length ? `<div class="row">${z.lines.map((l) => `<span class="chip warn">${esc(l)} <button class="btn sm" data-act="zero.drop" data-line="${esc(l)}">x</button></span>`).join('')}</div>` : '<p class="small dim">Nothing is off the page yet.</p>'}
    ${waiting.length ? `<p class="small dim">Waiting on: ${waiting.map(esc).join(', ')}. They cannot take an organism until they agree.</p>` : ''}
  </section>`;
}

function hostSceneCard() {
  const s = site();
  const h = s.host || {};
  const enc = (s.encounter || []).map((e) => {
    const b = (sc.bestiary || []).find((x) => x.id === e.blockId) || { name: e.blockId };
    const k = `${s.id}.${e.blockId}`;
    const cur = ui.host.enc[k] || { count: e.count, band: 'near' };
    return `<div class="row"><input type="number" style="width:58px" min="0" max="12" data-k="enc.${k}" data-enc="${k}" data-f="count" value="${cur.count}">
      <span class="grow"><b>${esc(b.name)}</b> <span class="small faint">${esc(b.statLine || '')}</span></span>
      <select style="width:96px" data-k="encb.${k}" data-enc="${k}" data-f="band">${R.BANDS.map((x) => `<option value="${x.id}" ${cur.band === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div>`;
  }).join('');
  const row = (label, text) => (text ? `<dt>${label}</dt><dd>${esc(text)}</dd>` : '');
  return `<section class="card fill">
    <h3>Scene<span class="right"><span class="seg">${sc.sites.map((x) => `<button class="${x.id === s.id ? 'on' : ''}" data-act="h.site" data-id="${x.id}" title="${esc(x.name)}">${x.n}</button>`).join('')}</span></span></h3>
    <div class="scroll" data-scroll="hscene" style="display:flex;flex-direction:column;gap:10px">
      <div><h2 style="font-size:19px">${s.n} · ${esc(s.name)}</h2><div class="dim small">${esc(s.short)} · ${esc(h.cite || '')}</div></div>
      <p class="small">${esc(s.where)}</p>
      <dl class="kv">${row('Play', h.play)}${row('Danger', h.danger)}${row('Wants', h.wants)}${row('Weakness', h.weakness)}${row('Hazard', h.hazard)}${row('Pays', h.pays)}${row('Tells', h.tells)}${row('Lesson', h.lesson)}</dl>
      <hr class="sep"><div class="fl dim small">THIS SITE'S CREATURES (printed for a Cohort of four)</div>
      ${enc}
      <div class="row"><button class="btn grow" data-act="h.enc.add">Bring them into the scene</button></div>
    </div></section>`;
}

function hostAskCard() {
  const H = ui.host;
  const orgs = Object.values(state.organisms).filter((o) => o.playerId);
  const who = orgs.find((o) => o.id === H.who) || orgs[0];
  if (!who) return '<section class="card"><h3>Call for a roll</h3><div class="empty">No organisms in play yet. Players join at the address on the table screen, then choose a Hand.</div></section>';
  const pool = R.buildPool({ baseline: who.base[H.baseline], pathway: H.pathway ? (who.pathways[H.pathway] || 0) : 0, mods: H.mods, stress: who.stress });
  const at = Number(H.at) || 12;
  const odds = oddsCard(Math.min(30, pool.dice), at);
  const base = R.homeostatic(pool.dice);
  const quick = [['Tool', 1], ['Ally helps', 1], ['Good position', 1], ['Wrong tonic', -1], ['Wrong tonic', -2], ['Partial cover', -2], ['Squeezed', -2]];
  return `<section class="card">
    <h3>Call for a roll<span class="right"><span class="seg">${orgs.map((o) => `<button class="${o.id === who.id ? 'on' : ''}" data-act="h.who" data-id="${o.id}">${esc(o.name.split(' ')[0])}</button>`).join('')}</span></span></h3>
    <div class="fields four">
      <label class="fld"><span class="fl">Baseline</span><select data-k="h.b" data-bind="host.baseline">${R.BASELINES.map((b) => `<option value="${b}" ${H.baseline === b ? 'selected' : ''}>${b} ${who.base[b]}</option>`).join('')}</select></label>
      <label class="fld" style="grid-column:span 2"><span class="fl">Pathway</span><select data-k="h.p" data-bind="host.pathway"><option value="">none (Baseline only)</option>${R.PATHWAYS.map((p) => `<option value="${esc(p)}" ${H.pathway === p ? 'selected' : ''}>${esc(p)} ${who.pathways[p] || 0}</option>`).join('')}</select></label>
      <label class="fld"><span class="fl">Threshold</span><input type="number" data-k="h.at" data-bind="host.at" value="${esc(H.at)}" min="1" max="40"></label>
      <div class="wide row"><span class="seg">${R.LADDER.map((l) => `<button class="${at === l.at ? 'on' : ''}" data-act="h.at" data-v="${l.at}" title="${esc(l.who)}">${l.at} ${l.name}</button>`).join('')}</span></div>
      <label class="fld wide"><span class="fl">What for</span><input type="text" data-k="h.label" data-bind="host.label" value="${esc(H.label)}" placeholder="For example: cross the wound lip" maxlength="60"></label>
      <div class="wide row">${quick.map(([l, d]) => `<button class="chip" data-act="h.mod" data-label="${l}" data-dice="${d}">${l} ${d > 0 ? '+' : '−'}${Math.abs(d)}</button>`).join('')}</div>
      ${H.mods.length ? `<div class="wide row">${H.mods.map((m, i) => `<button class="chip on" data-act="h.mod.del" data-i="${i}" title="Remove">${esc(m.label)} ${m.dice > 0 ? '+' : '−'}${Math.abs(m.dice)} ✕</button>`).join('')}</div>` : ''}
    </div>
    <div class="receipt">
      <div class="ln"><b>Pool</b><span>${H.baseline} ${who.base[H.baseline]}${H.pathway ? ` + ${esc(H.pathway)} ${who.pathways[H.pathway] || 0}` : ''}${pool.mods.map((m) => ` ${m.dice > 0 ? '+' : '−'} ${esc(m.label)} ${Math.abs(m.dice)}`).join('')}${pool.capped ? ' (capped at 5)' : ''}</span><em>${pool.dice} dice</em></div>
      <div class="ln"><b>Odds</b><span>against ${at} · mean Overflow ${odds.meanOverflow.toFixed(1)} · any Inhibitor ${pct(odds.anyInhibitor)} · Runaway ${pct(odds.runaway)}</span><em>${pct(odds.success)}</em></div>
      <div class="ln"><b>Unhurried</b><span>Baseline ${pool.dice} × 3 = ${base}: ${base >= at ? 'meets the Threshold, so no roll is needed if unopposed and unhurried' : 'does not meet the Threshold'}</span><em>${base}</em></div>
    </div>
    <div class="row"><button class="btn primary grow" data-act="h.ask">Ask ${esc(who.name.split(' ')[0])} to roll</button>
      <button class="btn" data-act="h.ask" data-unhurried="1" title="Unopposed and unhurried: compare the Baseline, no dice">Unhurried: use Baseline</button></div>
    <details><summary>Open roll for a creature or the Director</summary>
      <div class="fields four" style="margin-top:8px">
        <label class="fld"><span class="fl">Dice</span><input type="number" data-k="o.n" data-bind="host.open.n" value="${esc(H.open.n)}" min="1" max="30"></label>
        <label class="fld"><span class="fl">Threshold</span><input type="number" data-k="o.at" data-bind="host.open.at" value="${esc(H.open.at)}" placeholder="none"></label>
        <label class="fld" style="grid-column:span 2"><span class="fl">Who and what</span><input type="text" data-k="o.label" data-bind="host.open.label" value="${esc(H.open.label)}" placeholder="The drone opens the lip"></label>
      </div><div class="row" style="margin-top:8px"><button class="btn grow" data-act="h.open">Roll in the open</button></div></details>
  </section>`;
}

function hostWaitingCard() {
  const reqs = state.requests.map((q) => {
    const owning = ui.own && ui.own.reqId === q.id;
    return `<div class="cre now"><div class="row"><b>${esc(q.actor.name)}</b><span class="dim small">${esc(q.label)}</span><span class="grow"></span><span class="chip on">${q.pool.dice} dice · ${q.at ?? '—'}${q.chance != null ? ` · ${pct(q.chance)}` : ''}</span></div>
      ${q.reaction ? `<div class="small" style="color:var(--warn-c)">${esc(q.reactor || '')} reacts: ${cap(q.reaction)}</div>` : q.canReact ? '<div class="small" style="color:var(--warn-c)">The target holds a Reserve: give them a moment to Deflect or Brace.</div>' : ''}
      ${owning ? ownPad(q.pool.dice) : `<div class="row"><button class="btn sm primary" data-act="roll" data-id="${q.id}">Roll${q.actor.kind === 'org' ? ' for them' : ''}</button><button class="btn sm" data-act="own.start" data-id="${q.id}" data-n="${q.pool.dice}">Enter dice</button>
        <button class="btn sm" data-act="h.req.adj" data-id="${q.id}" data-d="1">+1 die</button><button class="btn sm" data-act="h.req.adj" data-id="${q.id}" data-d="-1">−1 die</button><span class="grow"></span><button class="btn sm danger" data-act="h.req.cancel" data-id="${q.id}">Withdraw</button></div>`}</div>`;
  }).join('');
  const last = lastRoll();
  return `<section class="card fill"><h3>Waiting for dice, and the last roll</h3>
    <div class="scroll" data-scroll="hwait" style="display:flex;flex-direction:column;gap:8px">${reqs || '<div class="empty">No rolls are waiting.</div>'}
    ${last ? resultCard(last) : ''}</div></section>`;
}

function hostCreature(c) {
  const f = state.fight;
  const a = f ? f.actors[`cre:${c.cid}`] : null;
  const st = ui.host.cre[c.cid] || {};
  const orgs = Object.values(state.organisms).filter((o) => o.playerId && !o.dormant);
  const target = st.target || (orgs[0] || {}).id || '';
  const block = (sc.bestiary || []).find((b) => b.id === c.blockId);
  const health = c.segments != null ? `Segments ${c.segments}/${c.segMax}` : `MI ${c.mi}/${c.miMax}`;
  const myTurn = a && (a.status === 'acting' || a.status === 'holding');
  return `<div class="cre${f && f.turn === `cre:${c.cid}` ? ' now' : ''}${c.down ? ' down' : ''}">
    <div class="row"><b>${esc(c.name)}</b>${a ? `${pips(a.pp, a.ppMax)}<span class="small dim">${a.status}</span>${a.reserve ? '<span class="chip on">Reserve</span>' : ''}` : ''}${c.stoodDown ? `<span class="chip" title="${esc(c.stoodDown.why || '')}">Stood down</span>` : ''}<span class="grow"></span>
      <select style="width:96px" data-cre-band="${c.cid}" data-k="band.${c.cid}">${R.BANDS.map((x) => `<option value="${x.id}" ${c.band === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div>
    <div class="stat">MT ${c.mt} · ${health} · soak ${c.soak}${c.bracedSoak ? ` (+${c.bracedSoak} braced)` : ''} · ${c.pool}d · BD ${c.bd} ${esc(c.type)}${c.conditions.length ? ` · ${c.conditions.map((x) => x.name).join(', ')}` : ''}</div>
    ${c.down ? '' : `<div class="row">
      <select style="width:auto;flex:1;min-width:110px" data-cre-target="${c.cid}" data-k="tgt.${c.cid}">${orgs.map((o) => `<option value="${o.id}" ${target === o.id ? 'selected' : ''}>at ${esc(o.name.split(' ')[0])}</option>`).join('')}</select>
      <button class="btn sm primary" data-act="h.cre.strike" data-id="${c.cid}" data-cost="2" ${f && !myTurn ? 'disabled' : ''}>Strike <span class="cost">2</span></button>
      ${c.segments != null ? `<button class="btn sm" data-act="h.cre.strike" data-id="${c.cid}" data-cost="0" title="A swarm gets 1 Strike per 2 Segments (CORE 4.13)" ${f && !myTurn ? 'disabled' : ''}>Bite <span class="cost">0</span></button>` : ''}
      ${f ? `<button class="btn sm" data-act="h.cre.act" data-id="${c.cid}" data-what="Drift" data-cost="1" ${myTurn ? '' : 'disabled'}>Drift <span class="cost">1</span></button>
      <button class="btn sm" data-act="h.cre.act" data-id="${c.cid}" data-what="Brace" data-cost="1" ${myTurn ? '' : 'disabled'}>Brace <span class="cost">1</span></button>
      <button class="btn sm" data-act="h.cre.act" data-id="${c.cid}" data-what="Reserve" data-cost="1" title="It will Deflect the next attack against it this Cycle (+4 MT)" ${myTurn && !(a && a.reserve) ? '' : 'disabled'}>Reserve <span class="cost">1</span></button>
      <button class="btn sm" data-act="h.cre.act" data-id="${c.cid}" data-what="Special" data-cost="2" ${myTurn ? '' : 'disabled'}>Special <span class="cost">2</span></button>
      <button class="btn sm" data-act="h.cre.end" data-id="${c.cid}" ${myTurn ? '' : 'disabled'}>End turn</button>` : ''}
      <button class="btn sm" data-act="h.cre.stand" data-id="${c.cid}" data-off="${c.stoodDown ? '1' : ''}" title="${c.stoodDown ? 'Put it back into the fight' : 'It has yielded, fled or was never fighting: it takes no more turns and no longer holds the Pulse War open'}">${c.stoodDown ? 'Back in the fight' : 'Stand down'}</button>
    </div>`}
    <div class="row"><button class="btn sm" data-act="h.cre.dmg" data-id="${c.cid}" data-n="1">${c.segments != null ? '−1 Segment' : '1 damage'}</button><button class="btn sm" data-act="h.cre.dmg" data-id="${c.cid}" data-n="5">${c.segments != null ? '−5' : '5 damage'}</button>
      <button class="btn sm" data-act="h.cre.cond" data-id="${c.cid}" data-name="Jostled">Jostled</button><button class="btn sm" data-act="h.cre.cond" data-id="${c.cid}" data-name="Marked">Marked</button>
      <span class="grow"></span><button class="btn sm danger" data-act="h.cre.remove" data-id="${c.cid}">Remove</button></div>
    ${block ? `<details><summary>${esc(block.cls)} · Tier ${block.tier} · what it does</summary><div class="small dim" style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
      <div><b>Traits:</b> ${esc(block.traits)}</div>${(block.special || []).map((x) => `<div>${esc(x)}</div>`).join('')}<div><b>Weakness:</b> ${esc(block.weakness)}</div><div><b>Tactics:</b> ${esc(block.tactics)}</div><div><b>Harvest:</b> ${esc(block.harvest)}</div></div></details>` : ''}
  </div>`;
}

function hostFightCard() {
  const f = state.fight;
  const here = creaturesHere();
  const orgRows = f ? f.order.filter((k) => k.startsWith('org:')).map((k) => {
    const a = f.actors[k];
    const o = state.organisms[a.id];
    return `<div class="o org${f.turn === k ? ' now' : ''}${a.status === 'done' ? ' done' : ''}"><span class="f">${a.freq}</span>
      <span class="nm">${esc(o.name)} <span class="small dim">MI ${o.mi}/${o.miMax} · ATP ${o.atp} · Stress ${o.stress}${a.reserve ? ' · Reserve' : ''}</span></span>
      <span class="row">${a.status === 'acting' || a.status === 'holding' ? pips(a.pp, a.ppMax) : ''}<span class="small dim">${a.status}</span>${a.status === 'acting' || a.status === 'holding' ? `<button class="btn sm" data-act="h.org.end" data-id="${o.id}">End</button>` : ''}</span></div>`;
  }).join('') : '';
  const head = f
    ? `<div class="row"><button class="btn primary grow" data-act="h.turn.next">Next turn</button><button class="btn" data-act="h.cycle.end">End the Cycle</button><button class="btn danger" data-act="h.fight.end">End the Pulse War</button></div>
       <div class="small dim">Order: ${f.order.map((k) => { const a = f.actors[k]; const b = a.kind === 'org' ? state.organisms[a.id] : state.creatures[a.id]; return b ? `${esc(b.name.split(' ')[0])} ${a.freq}` : ''; }).join(' › ')}</div>
       <div class="order">${orgRows}</div>`
    : `<div class="row"><button class="btn primary grow" data-act="h.fight.start">Start a Pulse War with what is in the scene</button></div>
       <div class="small dim">Frequency is rolled for everyone, and each organism gets its full PP when its turn starts.</div>`;
  return `<section class="card fill"><h3>${f ? `Pulse War · Cycle ${f.cycle}` : 'Creatures in the scene'}</h3>
    ${head}
    <div class="scroll" data-scroll="hfight" style="display:flex;flex-direction:column;gap:8px">${here.map(hostCreature).join('') || '<div class="empty">No creatures here. Bring in this site\'s creatures from the Scene card, or add any block from the Bestiary tab.</div>'}</div></section>`;
}

// A new game: choose the Vector, and whether the table stays seated. It takes the clocks
// card's place while it is open, so the Run tab keeps its size.
function newGameCard() {
  const N = ui.newGame;
  const vs = sc.vectors || [{ id: sc.id, title: sc.title, blurb: '' }];
  const pick = vs.find((v) => v.id === (N.vectorId || state.scenarioId)) || vs[0];
  const same = pick.id === state.scenarioId;
  const seated = Object.values(state.players || {});
  const keepNote = !seated.length ? 'Nobody is at the table yet.'
    : same ? `${seated.length} stay${seated.length === 1 ? 's' : ''} seated, with the same organisms on fresh sheets, and the session-zero terms carry over.`
      : `${seated.length} stay${seated.length === 1 ? 's' : ''} at the table and the session-zero terms carry over. A different Vector has different organisms, so everyone chooses again.`;
  return `<section class="card"><h3>New game<span class="right"><button class="btn sm" data-act="h.new.cancel">Cancel</button></span></h3>
    <label class="fld"><span class="fl">Vector</span><select data-k="ng.v" data-bind="newGame.vectorId">${vs.map((v) => `<option value="${esc(v.id)}" ${v.id === pick.id ? 'selected' : ''}>${esc(v.title)}${v.id === state.scenarioId ? ' (playing now)' : ''}</option>`).join('')}</select></label>
    ${pick.blurb ? `<p class="small dim">${esc(pick.blurb)}</p>` : ''}
    <label class="chip${N.keep ? ' on' : ''}"><input type="checkbox" data-bind="newGame.keep" ${N.keep ? 'checked' : ''}> Keep the players seated</label>
    <p class="small dim">${N.keep ? esc(keepNote) : 'Everyone joins again from the start, through session zero.'}</p>
    <div class="row"><span class="small dim grow">Clocks, sheets, creatures, rolls and the story start fresh. Undo brings this game back.</span><button class="btn danger" data-act="h.new.go">Start the new game</button></div>
  </section>`;
}

function hostToolsCard() {
  if (ui.newGame.open) return newGameCard();
  const A = ui.host.award;
  const clocks = Object.values(state.clocks).map((c) => `<div class="row"><b style="width:74px;font-size:13px">${esc(c.name)}</b><div class="segs grow">${Array.from({ length: c.segments }, (_, i) => `<i class="${i < c.filled ? 'on' : ''}"></i>`).join('')}</div><span class="small dim">${c.filled}/${c.segments}</span>
    <button class="btn sm" data-act="h.clock" data-id="${c.id}" data-d="-1">−</button><button class="btn sm" data-act="h.clock" data-id="${c.id}" data-d="1">+</button></div>`).join('');
  return `<section class="card"><h3>Clocks, rest and rewards<span class="right">${state.cohesion ? `<span class="chip ok" title="The table's shared trust: an Oath kept pays one">Cohesion ${state.cohesion}</span> ` : ''}<button class="btn sm" data-act="h.undo" title="Take back the last change">Undo</button></span></h3>
    ${clocks}
    <div class="row"><input type="number" style="width:86px" data-k="aw.c" data-bind="host.award.codon" value="${esc(A.codon)}" placeholder="Codon"><input type="number" style="width:86px" data-k="aw.s" data-bind="host.award.substrate" value="${esc(A.substrate)}" placeholder="S">
      <input type="text" class="grow" data-k="aw.w" data-bind="host.award.why" value="${esc(A.why)}" placeholder="What for"><button class="btn sm" data-act="h.award">Award each</button></div>
    ${info && info.online ? `<div class="row"><span class="small dim">Outside link</span><span class="small grow" style="font-family:var(--mono);overflow-wrap:anywhere">${esc(info.online)}</span><button class="btn sm" data-act="link.copy" data-v="${esc(info.online)}">Copy</button></div>` : ''}
    <div class="row"><button class="btn sm grow" data-act="h.rest" ${state.fight ? 'disabled' : ''} title="One Fugue Interval. In this Vector it costs a CARCASS segment.">Reconstitution (CARCASS +1)</button><button class="btn sm danger" data-act="h.new">New game…</button></div>
  </section>`;
}

function toolLine(c) {
  const args = Object.entries(c.args || {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
  return `<div class="ln"><b>${esc(c.name.replace(/_/g, ' '))}</b><span>${esc(args)}${c.refused ? ` <span style="color:var(--no)">Refused: ${esc(c.refused)}</span>` : ''}</span></div>`;
}

function directorHtml() {
  const d = state.director || {};
  const p = d.proposal;
  const proposal = p ? `<section class="card ask">
      <h3>${p.held ? 'Held for you: the check found something' : 'The Director proposes'}<span class="right">${p.stale ? '<span class="chip warn">The table has moved on: approving will ask it again</span>' : ''}</span></h3>
      ${p.flags.map((f) => `<div class="note hot"><b>${f.kind === 'leak' ? 'Possible leak' : f.kind === 'rule' ? 'Rules' : 'Style'}:</b> ${esc(f.text)}</div>`).join('')}
      ${p.calls.length ? `<div><div class="fl dim small">WHAT IT DID WITH THE ENGINE (takes effect when you approve)</div><div class="receipt">${p.calls.map(toolLine).join('')}</div></div>` : '<div class="small dim">It changed nothing in the Engine: narration only.</div>'}
      <label class="fld"><span class="fl">What it will say (you can edit this)</span><textarea rows="5" data-k="dir.edit" data-bind="dir.edit">${esc(ui.dir.edit)}</textarea></label>
      <div class="row"><button class="btn primary grow" data-act="d.approve">Approve</button><button class="btn" data-act="d.retry">Try again</button><button class="btn danger" data-act="d.discard">Discard</button></div>
    </section>` : '';
  const story = storyCard({ fill: true, input: `<div class="row"><input type="text" class="grow" data-k="dir.narrate" data-bind="dir.narrate" value="${esc(ui.dir.narrate)}" maxlength="2000" placeholder="Narrate something yourself, as the Director"><button class="btn" data-act="d.narrate">Narrate</button></div>` });
  const last = d.last;
  const provs = d.providers || [];
  const pv = provs.find((x) => x.id === d.provider) || { id: 'gemini', name: 'Google Gemini', key: 'required', group: 'cloud', hint: '', base: '' };
  const phase = { idle: 'Waiting for the players', thinking: 'Thinking…', proposal: 'Waiting for your approval', error: 'Stopped on a problem' }[d.phase] || '';
  const settings = `<section class="card fill"><h3>The AI Director<span class="right"><span class="chip${d.phase === 'error' ? ' no' : d.on ? ' ok' : ''}">${d.mode === 'off' ? 'Off' : esc(phase)}</span></span></h3>
    <div class="scroll" data-scroll="dset" style="display:flex;flex-direction:column;gap:12px">
      <div class="fld"><span class="fl">Who runs the table</span>
        <div class="seg">${[['off', 'Off: a person'], ['copilot', 'Co-pilot: you approve'], ['auto', 'Auto: it runs']].map(([id, name]) => `<button class="${d.mode === id ? 'on' : ''}" data-act="d.mode" data-id="${id}">${name}</button>`).join('')}</div>
        <span class="small dim">${d.mode === 'auto' ? 'The Director answers the players by itself. A turn that fails the leak check is still held for you.' : d.mode === 'copilot' ? 'The Director prepares each turn and nothing reaches the table until you approve it.' : 'The AI is off. Run the table from the Run tab.'}</span></div>
      ${d.error ? `<div class="note hot" style="border-color:var(--no)">${esc(d.error)}</div>` : ''}
      <div class="fld"><span class="fl">Which AI</span>
        <select data-k="dir.provider" data-dprov="1">${[['cloud', 'Online, with an API key'], ['local', 'On your own computer or network']].map(([g, label]) => `<optgroup label="${label}">${provs.filter((x) => x.group === g).map((x) => `<option value="${x.id}" ${x.id === d.provider ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}</select>
        ${pv.hint ? `<span class="small dim">${esc(pv.hint)}</span>` : ''}</div>
      ${pv.url ? `<div class="fld"><span class="fl">Address of the AI server</span>
        <div class="row"><input type="text" class="grow" data-k="dir.url" data-bind="dir.url" value="${esc(ui.dir.url)}" placeholder="${esc(pv.base || 'http://192.168.1.50:8000/v1')}" autocomplete="off" spellcheck="false"><button class="btn" data-act="d.url">Connect</button></div>
        <span class="small dim">${pv.id === 'custom' ? 'The full address, usually ending in /v1.' : `On this computer it is ${esc(pv.base)}.`} For another computer on your network, use its address, for example http://192.168.1.50${esc((pv.base.match(/:\d+.*$/) || [':8000/v1'])[0])}</span></div>` : ''}
      ${pv.key !== 'none' ? `<div class="fld"><span class="fl">${esc(pv.name.replace(/ \(.*$/, ''))} API key ${pv.key === 'optional' ? '(only if the server asks for one) ' : ''}${d.keySet ? '· saved on this computer' : '· not set'}</span>
        <div class="row"><input type="password" class="grow" data-k="dir.key" data-bind="dir.key" value="${esc(ui.dir.key)}" placeholder="${d.keySet ? 'Paste a new key to replace the saved one' : pv.keyFrom ? `Paste your key from ${esc(pv.keyFrom)}` : 'Paste the key'}" autocomplete="off"><button class="btn" data-act="d.key">Save key</button></div>
        <span class="small dim">${pv.keyFrom ? `Create a key at ${esc(pv.keyFrom)}. ` : ''}It is kept in the saves folder on the host computer and is never sent to players or to GitHub.</span></div>` : ''}
      <div class="fld"><span class="fl">Model</span>
        <div class="row"><select class="grow" data-k="dir.model" data-dmodel="1">${(d.models || []).length ? `${d.model && d.models.some((m) => m.id === d.model) ? '' : '<option value="" selected>Choose a model…</option>'}${d.models.map((m) => `<option value="${esc(m.id)}" ${m.id === d.model ? 'selected' : ''}>${esc(m.name)}${m.name === m.id ? '' : ` (${esc(m.id)})`}</option>`).join('')}` : `<option value="">${d.usable ? 'Press Refresh to load the models' : pv.key === 'required' ? 'Save a key first' : 'Enter the address first'}</option>`}</select><button class="btn" data-act="d.models" ${d.usable ? '' : 'disabled'}>Refresh</button><button class="btn" data-act="d.test" ${d.usable && d.model && !(d.test && d.test.busy) ? '' : 'disabled'} title="Checks the connection and that this model can use the Director's tools">Test</button></div>
        ${d.test ? `<div class="note${d.test.ok ? '' : ' hot'}" ${d.test.busy ? '' : `style="border-color:var(--${d.test.ok ? 'ok' : 'no'})"`}>${esc(d.test.text)}</div>` : `<span class="small dim">${pv.group === 'local' ? 'The list is what that server has loaded or downloaded.' : 'The list comes from your own account.'} Test checks that the model can use the Director's tools.</span>`}</div>
      ${pv.ctx ? `<div class="fld"><span class="fl">Context size (how much the model can read at once)</span>
        <select data-k="dir.ctx" data-dctx="1">${[8192, 16384, 32768, 65536].map((n) => `<option value="${n}" ${Number(d.numCtx) === n ? 'selected' : ''}>${n.toLocaleString()} tokens${n === 16384 ? ' (recommended)' : n === 8192 ? ' (tight: long scenes may be cut off)' : ''}</option>`).join('')}</select>
        <span class="small dim">Bigger needs more video memory. If the Director forgets the scene or stops using its tools, raise this.</span></div>` : ''}
      ${pv.group === 'local' ? `<div class="fld"><span class="fl">Thinking before each reply <span class="i" title="Less thinking is faster but leans harder on the Engine's guard rails. Low has benched clean and quick; Off was quickest and made rule errors.">&#9432;</span></span>
        <div class="seg">${[['default', 'Model default'], ['medium', 'Medium'], ['low', 'Low'], ['off', 'Off']].map(([id, name]) => `<button class="${(d.thinking || 'default') === id ? 'on' : ''}" data-act="d.think" data-id="${id}">${name}</button>`).join('')}</div>
        <span class="small dim">Some local models reason silently before answering, which costs seconds on every turn. Off is fastest and may cost some accuracy. If your server does not know the setting, it is ignored.</span></div>` : ''}
      <hr class="sep">
      <div class="fld"><span class="fl">Ask for a turn now</span>
        <div class="row"><input type="text" class="grow" data-k="dir.note" data-bind="dir.note" value="${esc(ui.dir.note)}" maxlength="400" placeholder="Optional note to the Director, for example: open the scene"><button class="btn primary" data-act="d.run" ${d.mode === 'off' || !d.usable || !d.model || d.thinking ? 'disabled' : ''}>Take a turn</button></div>
        <span class="small dim">The Director also takes a turn by itself after a player speaks, rolls or ends a turn.</span></div>
      ${last ? `<div><div class="fl dim small">ITS LAST TURN · ${(last.ms / 1000).toFixed(1)} s · ${last.usage.in + last.usage.out} tokens</div>
        <div class="receipt">${last.calls.map(toolLine).join('') || '<div class="ln"><span>Narration only.</span></div>'}</div>
        ${last.flags.map((f) => `<div class="note">${esc(f.text)}</div>`).join('')}</div>` : ''}
      ${d.totals && d.totals.turns ? `<div class="small faint">This session: ${d.totals.turns} turns, ${d.totals.in} tokens in, ${d.totals.out} tokens out.</div>` : ''}
    </div></section>`;
  return `<div class="lay-two"><div style="display:flex;flex-direction:column;gap:12px;min-height:0">${proposal}${story}</div>${settings}</div>`;
}

// Where the Director's voice and the players' Talk buttons get their speech from.
function voiceCard() {
  const hv = (sc && sc.voice) || null;
  if (!hv) return '';
  const v = ui.voice;
  if (!v.loaded) {
    Object.assign(v, { outEngine: hv.out.engine, outUrl: hv.out.url, outModel: hv.out.model, outVoice: hv.out.voice, outSpeed: String(hv.out.speed), inEngine: hv.in.engine, inUrl: hv.in.url, inModel: hv.in.model, inLang: hv.in.language, loaded: true });
  }
  const seg = (act, cur, opts) => `<div class="seg">${opts.map(([id, name]) => `<button class="${cur === id ? 'on' : ''}" data-act="${act}" data-id="${id}">${name}</button>`).join('')}</div>`;
  const f = (label, bind, val, ph = '', type = 'text') => `<label class="fld"><span class="fl">${label}</span><input type="${type}" data-k="${bind}" data-bind="${bind}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"></label>`;
  return `<section class="card"><h3>Voice<span class="right"><span class="chip">${hv.out.engine === 'server' ? 'Speech server' : 'Each screen\'s own voice'}</span></span></h3>
    <div class="stack-in" style="display:flex;flex-direction:column;gap:10px">
      <div class="fld"><span class="fl">The Director speaks with</span>${seg('v.out', v.outEngine, [['browser', 'Each screen\'s own voice'], ['server', 'A speech server']])}
        <span class="small dim">The table screen reads the narration aloud; phones and this screen have a Voice switch of their own. A speech server (for example Kokoro on this computer) gives one steady voice everywhere and keeps working on a phone with no voice installed. Only the Director's narration is ever sent to it.</span></div>
      ${v.outEngine === 'server' ? `${f('Speech server address', 'voice.outUrl', v.outUrl, 'http://localhost:8880/v1')}${f(hv.out.keySet ? 'API key · saved on this computer' : 'API key (only if the server asks for one)', 'voice.outKey', v.outKey, hv.out.keySet ? 'Paste a new key to replace the saved one' : '', 'password')}
      <div class="row">${f('Model', 'voice.outModel', v.outModel)}${f('Voice', 'voice.outVoice', v.outVoice)}${f('Speed', 'voice.outSpeed', v.outSpeed)}</div>` : ''}
      <div class="fld"><span class="fl">Players' Talk button listens with</span>${seg('v.in', v.inEngine, [['browser', 'The phone\'s own recognition'], ['server', 'A speech server']])}
        <span class="small dim">Each player agrees to this at session zero, and the screen tells them where their voice goes. A phone's own recognition is done by Google or Apple. A speech server (for example Whisper on this computer) keeps it on your own network.</span></div>
      ${v.inEngine === 'server' ? `${f('Speech-to-text address', 'voice.inUrl', v.inUrl, 'http://localhost:8000/v1')}${f(hv.in.keySet ? 'API key · saved on this computer' : 'API key (only if the server asks for one)', 'voice.inKey', v.inKey, hv.in.keySet ? 'Paste a new key to replace the saved one' : '', 'password')}
      <div class="row">${f('Model', 'voice.inModel', v.inModel)}${f('Language', 'voice.inLang', v.inLang)}</div>` : ''}
      <div class="row"><button class="btn primary" data-act="v.save">Save voice settings</button></div>
    </div></section>`;
}

// The table's memory: the chronicle of what happened, and the people, places and threads met.
function memoryHtml() {
  const d = state.director || {};
  const M = ui.mem;
  const chapters = (d.chronicle || []).slice().reverse();
  const siteName = (id) => ((sc.sites || []).find((x) => x.id === id) || {}).name || id;
  const ORIGIN = { page: ['from the page', ''], table: ['came up in play', ' ok'], improvised: ['made up by the Director', ' warn'] };
  const cards = Object.values(state.cast || {}).sort((a, b) => b.lastSeq - a.lastSeq);
  const chron = `<section class="card fill"><h3>The chronicle<span class="right">${d.writing ? '<span class="chip on">Writing…</span>' : ''}<button class="btn sm" data-act="m.night" title="Write a chapter for everything since the last one">End the night</button></span></h3>
    <div class="small dim">A paragraph is written each time the Cohort leaves a site, and when you end the night. The Director reads the latest three every turn.${d.kept ? ` Kept so far: ${d.kept.lines} line${d.kept.lines === 1 ? '' : 's'}, ${d.kept.chapters} chapter${d.kept.chapters === 1 ? '' : 's'}.` : ''}</div>
    <div class="fld"><span class="fl">How far the Director may go beyond the page</span>
      <div class="seg">${[['page', 'Page only'], ['callbacks', 'Callbacks']].map(([id, name]) => `<button class="${(state.improv || 'callbacks') === id ? 'on' : ''}" data-act="m.improv" data-id="${id}">${name}</button>`).join('')}</div>
      <span class="small dim">${(state.improv || 'callbacks') === 'page' ? 'It uses only what this site prints.' : 'People and threads from earlier may come back, in conversation and scene-dressing. Fights still use only the creatures printed for the site.'}</span></div>
    <div class="scroll" data-scroll="chron" style="display:flex;flex-direction:column;gap:10px">
      ${chapters.length ? chapters.map((c) => `<div class="note"><div class="row small"><b>${esc(c.site)}</b><span class="dim">${c.why === 'night' ? 'end of a night' : 'left'}${c.t ? ` · ${esc(new Date(c.t).toLocaleDateString())}` : ''}${c.by === 'engine' ? ' · written plainly' : ''}</span><span class="grow"></span><button class="btn sm" data-act="m.chdrop" data-id="${esc(c.id)}" title="Remove this chapter">x</button></div><div>${esc(c.text)}</div></div>`).join('')
        : '<p class="small dim">Nothing yet. The first chapter is written when the Cohort leaves its first site.</p>'}
    </div></section>`;
  const R = d.recall;
  const found = R ? `<div class="receipt">${R.hits.length ? R.hits.map((h) => `<div class="ln"><b>${esc(h.who || '')}</b><span>${esc(h.text)} <span class="faint">· ${esc(siteName(h.site) || '')}${h.when ? ` · ${esc(h.when)}` : ''}${h.seen ? '' : ' · host only'}</span></span></div>`).join('') : '<div class="ln"><span>Nothing on record matches.</span></div>'}</div>` : '';
  const castCard = `<section class="card fill"><h3>People, places and threads<span class="right dim small">${cards.length} on record</span></h3>
    <div class="row"><input type="text" class="grow" data-k="m.q" data-bind="mem.q" value="${esc(M.q)}" placeholder="Search the whole game: what did the clerk say about Neth?"><button class="btn" data-act="m.search">Search</button></div>
    ${found}
    <div class="scroll" data-scroll="cast" style="display:flex;flex-direction:column;gap:8px">
      ${cards.length ? cards.map((c) => `<div class="cre"><div class="row"><b>${esc(c.name)}</b><span class="chip">${esc(c.kind)}</span><span class="chip${(ORIGIN[c.origin] || ['', ''])[1]}">${esc((ORIGIN[c.origin] || [c.origin])[0])}</span><span class="small faint">${esc(siteName(c.siteId))}</span><span class="grow"></span><button class="btn sm" data-act="m.forget" data-id="${esc(c.id)}" title="Forget this card">x</button></div>
        ${c.facts.map((f, i) => `<div class="small row"><span class="grow">${esc(f.text)}${f.seen ? '' : ' <span class="chip warn">players not told</span>'}</span><button class="btn sm" data-act="m.forget" data-id="${esc(c.id)}" data-fact="${i}" title="Forget this fact">x</button></div>`).join('')}</div>`).join('')
        : '<p class="small dim">Nobody yet. The Director writes people down as it names them, and each chapter adds who the table met.</p>'}
    </div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 120px minmax(0,2fr) auto;gap:8px;align-items:center"><input type="text" data-k="m.name" data-bind="mem.name" value="${esc(M.name)}" placeholder="Name"><select data-k="m.kind" data-bind="mem.kind">${['person', 'faction', 'place', 'thread'].map((k) => `<option ${M.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select><input type="text" data-k="m.fact" data-bind="mem.fact" value="${esc(M.fact)}" placeholder="A fact to remember"><button class="btn" data-act="m.add">Add</button></div>
  </section>`;
  return `<div class="lay-two">${chron}${castCard}</div>`;
}

function bestiaryHtml() {
  const q = ui.host.bq.trim().toLowerCase();
  const list = (sc.bestiary || []).filter((b) => !q || `${b.name} ${b.order} ${b.cls}`.toLowerCase().includes(q));
  const rows = list.map((b) => `<div class="cre"><div class="row"><b>${esc(b.name)}</b><span class="chip">${esc(b.cls)} · T${b.tier}</span><span class="small faint">${esc(b.order)}</span><span class="grow"></span><button class="btn sm" data-act="h.best.add" data-id="${b.id}">Add to this scene</button></div>
    <div class="stat">${esc(b.statLine)}</div>
    <details><summary>Traits, weakness, tactics</summary><div class="small dim" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"><div><b>Traits:</b> ${esc(b.traits)}</div>${(b.special || []).map((x) => `<div>${esc(x)}</div>`).join('')}<div><b>Weakness:</b> ${esc(b.weakness)}</div><div><b>Tactics:</b> ${esc(b.tactics)}</div><div><b>Harvest:</b> ${esc(b.harvest)}</div></div></details></div>`).join('');
  return `<div class="lay-one"><section class="card fill"><h3>The Lytic Bestiary<span class="right dim small">${list.length} of ${(sc.bestiary || []).length} blocks, read from the book</span></h3>
    <input type="text" data-k="bq" data-bind="host.bq" data-live="1" value="${esc(ui.host.bq)}" placeholder="Search by name, Order or class">
    <div class="scroll" data-scroll="best" style="display:flex;flex-direction:column;gap:8px">${rows}</div></section></div>`;
}

// ------------------------------------------------------------------- events
function setPath(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}

function hostWho() {
  const orgs = Object.values(state.organisms).filter((o) => o.playerId);
  return orgs.find((o) => o.id === ui.host.who) || orgs[0];
}

const ACT = {
  tab: (d) => { ui.tab = d.t; },
  'p.show': (d) => { ui.show[d.what] = !ui.show[d.what]; },
  'zero.agree': () => send({ type: 'zero.agree' }),
  'zero.add': () => { const t = (ui.zero.line || '').trim(); if (!t) return; send({ type: 'zero.line', text: t }); ui.zero.line = ''; },
  'zero.drop': (d) => send({ type: 'zero.line', remove: d.line }),
  'h.zero': () => send({ type: 'zero.set', pauseWord: ui.zero.pauseWord || undefined, tone: ui.zero.tone }),
  'p.harvest': (d) => send({ type: 'harvest', organismId: d.org, cid: d.id || null }),
  'rolls.mine': () => { ui.rollsMine = !ui.rollsMine; },
  speak: () => {
    const was = speakOn();
    store.set(speechOutKey, was ? '0' : '1');
    if (was) stopVoice();
    else { V.seen = V.seen || new Set(); V.blocked = false; try { if (canSpeakLocal()) speechSynthesis.resume(); } catch (e) { /* fine */ } }
  },
  talk,
  'hear.yes': () => { store.set('oxd.hear', 'yes'); ui.talkAsk = false; },
  'hear.no': () => { store.set('oxd.hear', 'no'); ui.talkAsk = false; if (T.rec && ui.talk === 'listening') { try { T.rec.stop(); } catch (e) { /* idle */ } } },
  'v.save': async () => {
    const v = ui.voice;
    const body = { op: 'voice', out: { engine: v.outEngine, url: v.outUrl, model: v.outModel, voice: v.outVoice, speed: v.outSpeed }, in: { engine: v.inEngine, url: v.inUrl, model: v.inModel, language: v.inLang } };
    if (v.outKey.trim()) body.out.key = v.outKey.trim();
    if (v.inKey.trim()) body.in.key = v.inKey.trim();
    if (await sendDirector(body)) { v.outKey = ''; v.inKey = ''; v.loaded = false; await reloadScenario(); toast('Voice settings saved.', true); }
  },
  'v.out': (d) => { ui.voice.outEngine = d.id; },
  'v.in': (d) => { ui.voice.inEngine = d.id; },
  say: async () => {
    const text = ui.say.text.trim();
    if (!text) return;
    if (await send({ type: 'say', text })) ui.say.text = '';
  },
  'd.mode': (d) => sendDirector({ op: 'config', mode: d.id }),
  'd.think': (d) => sendDirector({ op: 'config', thinking: d.id }),
  'd.key': async () => {
    if (!ui.dir.key.trim()) { toast('Paste the key first.'); return; }
    if (await sendDirector({ op: 'config', apiKey: ui.dir.key.trim() })) { ui.dir.key = ''; toast('Key saved. Loading your models…', true); }
  },
  'd.models': () => sendDirector({ op: 'models' }),
  'd.test': () => sendDirector({ op: 'test' }),
  'd.url': async () => { if (await sendDirector({ op: 'config', baseUrl: ui.dir.url.trim() })) toast('Looking for the AI server…', true); },
  'd.run': async () => { if (await sendDirector({ op: 'run', note: ui.dir.note })) ui.dir.note = ''; },
  'd.approve': () => {
    const p = state.director.proposal;
    return sendDirector({ op: 'approve', text: p && ui.dir.edit.trim() !== p.narration ? ui.dir.edit : '' });
  },
  'd.retry': () => sendDirector({ op: 'run', note: ui.dir.note }),
  'd.discard': () => sendDirector({ op: 'discard' }),
  'd.narrate': async () => { if (ui.dir.narrate.trim() && await send({ type: 'narrate', text: ui.dir.narrate })) ui.dir.narrate = ''; },
  'name.random': () => { ui.claim.name = osmoticName(); },
  'code.go': () => {
    const q = new URLSearchParams(location.search);
    q.set('t', ui.keyTry.trim().toUpperCase());
    location.href = `${location.pathname}?${q}`;
  },
  'col.style': (d) => {
    store.set('oxd.colours', JSON.stringify(STYLES[d.id]));
    store.set('oxd.style', d.id);
    applyColours();
  },
  'link.copy': async (d) => {
    try { await navigator.clipboard.writeText(d.v); toast('Link copied.', true); } catch (e) { toast('Could not copy. Select the link and copy it by hand.'); }
  },
  'key.go': () => { location.href = `/host?key=${encodeURIComponent(ui.keyTry.trim().toUpperCase())}`; },
  'col.reset': () => { store.del('oxd.colours'); store.del('oxd.style'); applyColours(); },

  join: async () => {
    const name = ui.join.name.trim();
    if (!name) { toast('Type your name first.'); return; }
    store.set('oxd.name', name);
    await send({ type: 'join', name });
  },
  'claim.pick': (d) => { ui.claim.hand = d.id; },
  'claim.go': async () => {
    if (!ui.claim.name.trim()) { toast('Give your organism a name first.'); return; }
    if (await send({ type: 'claim', organismId: ui.claim.hand, name: ui.claim.name.trim() })) ui.claim = { hand: null, name: '' };
  },
  rename: async () => { if (await send({ type: 'rename', organismId: mine().id, name: ui.claim.name })) ui.claim.name = ''; },
  weapon: (d) => send({ type: 'weapon', organismId: d.org, weaponId: d.id }),

  roll: (d) => send({ type: 'roll', requestId: d.id }),
  'own.start': (d) => { ui.own = { mode: 'req', reqId: d.id, n: Number(d.n), dice: [] }; },
  'own.add': (d) => { if (ui.own && ui.own.dice.length < ui.own.n) ui.own.dice.push(Number(d.d)); },
  'own.back': () => { if (ui.own) ui.own.dice.pop(); },
  'own.cancel': () => { ui.own = null; },
  'own.submit': async () => {
    const o = ui.own;
    if (!o) return;
    const ok = o.mode === 'quick'
      ? await send({ type: 'quickRoll', organismId: mine().id, baseline: o.baseline, pathway: o.pathway, at: o.at, practice: o.practice, dice: o.dice })
      : await send({ type: 'roll', requestId: o.reqId, dice: o.dice });
    if (ok) ui.own = null;
  },
  'quick.go': () => send({ type: 'quickRoll', organismId: mine().id, baseline: ui.quick.baseline, pathway: ui.quick.pathway, at: ui.quick.at, practice: ui.quick.practice }),
  'quick.own': (d) => {
    const q = ui.quick;
    ui.own = { mode: 'quick', n: Number(d.n), dice: [], baseline: q.baseline, pathway: q.pathway, at: q.at, practice: q.practice, label: `${q.baseline}${q.pathway ? ` + ${q.pathway}` : ''}: ${d.n} dice` };
  },

  react: (d) => send({ type: 'react', requestId: d.id, kind: d.kind }),
  act: async (d) => {
    const a = { type: 'act', organismId: mine().id, action: d.a };
    if (d.band) a.band = d.band;
    if (d.cost) a.cost = Number(d.cost);
    await send(a);
    ui.drift = false;
  },
  'drift.open': () => { ui.drift = true; ui.strike = null; },
  'drift.cancel': () => { ui.drift = false; },
  'strike.open': () => {
    const o = mine();
    const carried = o.weapons.filter((w) => w.carried !== false);
    const targets = creaturesHere().filter((c) => !c.down);
    ui.strike = { weaponId: carried[0] && carried[0].id, targetId: targets.length === 1 ? targets[0].cid : null, momentum: false, sit: {} };
    ui.drift = false;
  },
  'strike.weapon': (d) => { ui.strike.weaponId = d.id; },
  'strike.pick': (d) => { ui.strike.targetId = d.id; },
  'strike.sit': (d) => {
    const sit = ui.strike.sit;
    const group = d.id.replace(/\d$/, '');
    const was = sit[d.id];
    for (const k of Object.keys(sit)) if (k.replace(/\d$/, '') === group) delete sit[k]; // one of each kind
    if (!was) sit[d.id] = true;
  },
  overdrive: (d) => send({ type: 'overdrive', requestId: d.id, with: d.with }),
  'strike.cancel': () => { ui.strike = null; },
  'strike.go': async () => {
    const s = ui.strike;
    if (await send({ type: 'strike', organismId: mine().id, weaponId: s.weaponId, targetId: s.targetId, momentum: s.momentum, situation: Object.keys(s.sit) })) ui.strike = null;
  },
  'turn.end': () => send({ type: 'turn.end', organismId: mine().id }),
  'turn.hold': () => send({ type: 'turn.end', organismId: mine().id, hold: true }),
  stabilise: (d) => send({ type: 'stabilise', organismId: mine().id, targetId: d.id }),

  // host
  'h.site': (d) => send({ type: 'scene.set', siteId: d.id }),
  'h.who': (d) => { ui.host.who = d.id; },
  'h.at': (d) => { ui.host.at = Number(d.v); },
  'h.mod': (d) => { ui.host.mods.push({ label: d.label, dice: Number(d.dice) }); },
  'h.mod.del': (d) => { ui.host.mods.splice(Number(d.i), 1); },
  'h.ask': async (d) => {
    const H = ui.host;
    const who = hostWho();
    if (!who) return;
    if (await send({ type: 'request.check', organismId: who.id, baseline: H.baseline, pathway: H.pathway, mods: H.mods, at: Number(H.at) || 12, label: H.label, unhurried: !!d.unhurried })) { H.mods = []; H.label = ''; }
  },
  'h.open': () => {
    const o = ui.host.open;
    return send({ type: 'creature.roll', n: Number(o.n) || 1, at: o.at, label: o.label || 'Open roll', who: 'The Director' });
  },
  'h.req.adj': (d) => send({ type: 'request.adjust', requestId: d.id, dice: Number(d.d), label: 'Director' }),
  'h.req.cancel': (d) => send({ type: 'request.cancel', requestId: d.id }),
  'h.enc.add': () => {
    const s = site();
    const list = (s.encounter || []).map((e) => {
      const cur = ui.host.enc[`${s.id}.${e.blockId}`] || { count: e.count, band: 'near' };
      return { blockId: e.blockId, count: Number(cur.count) || 0, band: cur.band };
    }).filter((x) => x.count > 0);
    if (!list.length) { toast('Set a count above zero first.'); return null; }
    return send({ type: 'creature.add', creatures: list });
  },
  'h.best.add': (d) => send({ type: 'creature.add', creatures: [{ blockId: d.id, count: 1, band: 'near' }] }).then((ok) => { if (ok) toast('Added to the scene.', true); }),
  'h.fight.start': () => send({ type: 'fight.start' }),
  'h.fight.end': () => send({ type: 'fight.end' }),
  'h.turn.next': () => send({ type: 'turn.next' }),
  'h.cycle.end': () => send({ type: 'cycle.end' }),
  'h.org.end': (d) => send({ type: 'turn.end', organismId: d.id }),
  'h.cre.strike': (d) => {
    const st = ui.host.cre[d.id] || {};
    const orgs = Object.values(state.organisms).filter((o) => o.playerId && !o.dormant);
    const target = st.target || (orgs[0] || {}).id;
    if (!target) { toast('There is no organism to strike.'); return null; }
    return send({ type: 'creature.strike', cid: d.id, targetId: target, cost: Number(d.cost) });
  },
  'h.cre.act': (d) => send({ type: 'creature.act', cid: d.id, what: d.what, cost: Number(d.cost) }),
  'h.cre.end': (d) => send({ type: 'turn.end', cid: d.id }),
  'h.cre.stand': (d) => send({ type: 'creature.standDown', cid: d.id, off: !!d.off }),
  'h.oath.settle': (d) => send({ type: 'oath.settle', organismId: d.id, oathId: d.oath, kept: d.kept === '1', why: '' }),
  'h.oath': (d) => { const t = (ui.oath.text || '').trim(); if (!t) return; send({ type: 'oath.swear', organismId: d.id, promise: t, witness: '' }); ui.oath.text = ''; },
  'h.cre.dmg': (d) => send({ type: 'damage', target: { kind: 'cre', id: d.id }, amount: Number(d.n), ignoreSoak: true }),
  'h.cre.cond': (d) => {
    const c = state.creatures[d.id];
    return send({ type: 'condition', target: { kind: 'cre', id: d.id }, name: d.name, on: !c.conditions.some((x) => x.name === d.name) });
  },
  'h.cre.remove': (d) => send({ type: 'creature.remove', cid: d.id }),
  'h.adj': (d) => send({ type: 'set', target: { kind: 'org', id: d.id }, field: d.field, value: Number(d.v) }),
  'h.clock': (d) => send({ type: 'clock', id: d.id, delta: Number(d.d) }),
  'h.award': async () => {
    const A = ui.host.award;
    if (await send({ type: 'award', codon: Number(A.codon) || 0, substrate: Number(A.substrate) || 0, why: A.why })) ui.host.award = { codon: '', substrate: '', why: '' };
  },
  'h.rest': () => send({ type: 'rest' }),
  'h.undo': () => send({ type: 'undo' }),
  'loot.take': (d) => send({ type: 'loot.take', itemId: d.id }),
  'loot.always': (d) => send({ type: d.rule === 'take' ? 'loot.take' : 'loot.pass', itemId: d.id, always: true }),
  'loot.auto.off': (d) => send({ type: 'loot.auto', grade: d.grade, rule: null }),
  'loot.pass': (d) => send({ type: 'loot.pass', itemId: d.id }),
  'loot.up': (d) => { const o = state.loot.order.slice(); const i = o.indexOf(d.id); if (i > 0) { [o[i - 1], o[i]] = [o[i], o[i - 1]]; } return send({ type: 'loot.order', order: o }); },
  'm.night': () => sendDirector({ op: 'chapter' }),
  'm.chdrop': (d) => sendDirector({ op: 'chapter.drop', id: d.id }),
  'm.search': () => sendDirector({ op: 'recall', query: ui.mem.q }),
  'm.improv': (d) => send({ type: 'improv.set', improv: d.id }),
  'm.forget': (d) => send({ type: 'cast.forget', id: d.id, fact: d.fact != null && d.fact !== '' ? Number(d.fact) : undefined }),
  'm.add': () => { const M = ui.mem; if (!M.name.trim()) return null; const r = send({ type: 'cast.remember', name: M.name, kind: M.kind, fact: M.fact }); ui.mem = { ...M, name: '', fact: '' }; return r; },
  'h.new': () => { ui.newGame = { open: true, vectorId: state.scenarioId, keep: true }; },
  'h.new.cancel': () => { ui.newGame.open = false; },
  'h.new.go': () => { const N = ui.newGame; ui.newGame = { open: false, vectorId: '', keep: true }; return send({ type: 'session.new', vectorId: N.vectorId || state.scenarioId, keepPlayers: !!N.keep }); },
};

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = ACT[b.dataset.act];
  if (!fn) return;
  if (b.tagName === 'A') return;
  e.preventDefault();
  await fn(b.dataset, b);
  render();
});

function onField(e) {
  const t = e.target;
  if (t.dataset.colour) {
    const c = savedColours();
    c[t.dataset.colour] = t.value;
    store.set('oxd.colours', JSON.stringify(c));
    applyColours();
    if (e.type === 'change') render();
    return;
  }
  if (t.dataset.enc) {
    const k = t.dataset.enc;
    const s = site();
    const dflt = (s.encounter || []).find((x) => `${s.id}.${x.blockId}` === k) || { count: 1 };
    ui.host.enc[k] = { count: dflt.count, band: 'near', ...(ui.host.enc[k] || {}) };
    ui.host.enc[k][t.dataset.f] = t.dataset.f === 'count' ? Number(t.value) : t.value;
    return;
  }
  if (t.dataset.dmodel) { if (e.type === 'change' && t.value) sendDirector({ op: 'config', model: t.value }); return; }
  if (t.dataset.dprov) { if (e.type === 'change') sendDirector({ op: 'config', provider: t.value }); return; }
  if (t.dataset.dctx) { if (e.type === 'change') sendDirector({ op: 'config', numCtx: Number(t.value) }); return; }
  if (t.dataset.creTarget) { ui.host.cre[t.dataset.creTarget] = { ...(ui.host.cre[t.dataset.creTarget] || {}), target: t.value }; return; }
  if (t.dataset.creBand) { if (e.type === 'change') send({ type: 'set', target: { kind: 'cre', id: t.dataset.creBand }, field: 'band', value: t.value }); return; }
  if (!t.dataset.bind) return;
  const value = t.type === 'checkbox' ? t.checked : t.value;
  setPath(ui, t.dataset.bind, value);
  // Text fields keep their own value while you type; only choices redraw the screen.
  if (t.dataset.live || t.tagName === 'SELECT' || t.type === 'checkbox' || (t.type === 'number' && e.type === 'input')) render();
}
document.addEventListener('input', onField);
document.addEventListener('change', onField);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  const more = { say: 'say', 'dir.narrate': 'd.narrate', 'dir.note': 'd.run', 'dir.key': 'd.key', 'dir.url': 'd.url', 'm.q': 'm.search', 'm.fact': 'm.add' }[e.target.getAttribute('data-k')];
  if (more) { e.preventDefault(); Promise.resolve(ACT[more]({})).then(render); return; }
  const k = e.target.getAttribute('data-k');
  const map = { 'join.name': 'join', 'claim.name': 'claim.go', keyTry: codeBad ? 'code.go' : 'key.go', 'h.label': 'h.ask', rename: 'rename' };
  if (map[k]) { e.preventDefault(); Promise.resolve(ACT[map[k]]({})).then(render); }
});

// -------------------------------------------------------------------- voice
// The Director speaks what it narrates (per screen, the table on by default), and a player can
// talk instead of typing. Speech comes from this device's own voice, or from the host's speech
// server when it has one (info.voice says which).
const V = { seen: null, q: [], playing: false, blocked: false, audio: null, face: 'rest' };
const speechOutKey = `oxd.speak.${role}`;
const canSpeakLocal = () => 'speechSynthesis' in window;
const speakOn = () => {
  const v = store.get(speechOutKey);
  return (v == null ? role === 'table' : v === '1') && (canSpeakLocal() || serverVoice());
};
const serverVoice = () => !!(info && info.voice && info.voice.out === 'server');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canHear = () => role === 'player' && !!(info && info.voice && (info.voice.in === 'server' ? (navigator.mediaDevices && window.MediaRecorder) : SR));

// Narration split into sentences small enough that the first sound comes quickly.
function splitSentences(text) {
  const parts = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g) || [];
  const out = [];
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    if (out.length && (out[out.length - 1].length < 40 || t.length < 40) && out[out.length - 1].length + t.length < 240) out[out.length - 1] += ` ${t}`;
    else out.push(t);
  }
  return out;
}

function setFace(f) {
  if (V.face === f) return;
  V.face = f;
  faceEl.className = `face ${f}`;
}
const faceEl = (() => {
  const el = document.createElement('div');
  el.className = 'face rest';
  const cil = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    return `<line x1="${(60 + Math.cos(a) * 44).toFixed(1)}" y1="${(60 + Math.sin(a) * 44).toFixed(1)}" x2="${(60 + Math.cos(a) * 54).toFixed(1)}" y2="${(60 + Math.sin(a) * 54).toFixed(1)}"/>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true"><g class="cil">${cil}</g>
    <path class="mem" d="M60 14c22 0 42 16 42 40s-14 52-42 52S16 84 18 56 38 14 60 14z"/>
    <g class="inner"><circle class="nuc" cx="60" cy="58" r="13"/><circle class="v v1" cx="40" cy="48" r="5"/><circle class="v v2" cx="82" cy="70" r="6"/><circle class="v v3" cx="72" cy="40" r="3.5"/></g></svg>`;
  return el;
})();
function placeFace() {
  const slot = $('.face-slot');
  if (!slot || faceEl.parentNode === slot) return;
  faceEl.style.setProperty('--ph', `${-((performance.now() / 1000) % 6).toFixed(2)}s`); // keep the breathing in step after a redraw
  slot.appendChild(faceEl);
}
function faceFollows() {
  if (V.playing || V.q.length) return;
  setFace(state && state.director && state.director.thinking ? 'think' : 'rest');
}

function speakBrowser(text, done) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.onend = done;
    u.onerror = (e) => { if (e.error === 'not-allowed') { V.blocked = true; V.playing = false; V.q.unshift({ text }); render(); return; } done(); };
    speechSynthesis.speak(u);
  } catch (e) { done(); }
}
async function fetchClip(text) {
  const res = await fetch('/api/voice/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role, pid, key, t: tcode, text }) });
  if (!res.ok || /json/.test(res.headers.get('content-type') || '')) throw new Error('no audio');
  return URL.createObjectURL(await res.blob());
}
function playClip(item, done) {
  item.clip.then((url) => {
    const a = new Audio(url);
    V.audio = a;
    const fin = () => { URL.revokeObjectURL(url); V.audio = null; done(); };
    a.onended = fin;
    a.onerror = fin;
    a.play().catch((e) => { URL.revokeObjectURL(url); V.audio = null; if (e && e.name === 'NotAllowedError') { V.blocked = true; V.playing = false; item.clip = fetchClip(item.text); V.q.unshift(item); render(); } else done(); });
  }).catch(() => (canSpeakLocal() ? speakBrowser(item.text, done) : done()));
}
function pumpVoice() {
  if (V.playing || V.blocked) return;
  const item = V.q.shift();
  if (!item) { faceFollows(); return; }
  V.playing = true;
  setFace('speak');
  const done = () => { V.playing = false; pumpVoice(); };
  if (item.clip) playClip(item, done); else speakBrowser(item.text, done);
}
function stopVoice() {
  V.q = [];
  V.playing = false;
  try { if (canSpeakLocal()) speechSynthesis.cancel(); } catch (e) { /* nothing to stop */ }
  if (V.audio) { try { V.audio.pause(); } catch (e) { /* gone */ } V.audio = null; }
  faceFollows();
}
function voiceFollows() {
  const lines = (state.story || []).filter((e) => e.kind === 'narration');
  if (!V.seen) { V.seen = new Set(lines.map((e) => e.id)); faceFollows(); return; } // what was said before this screen joined is not read out
  const fresh = lines.filter((e) => !V.seen.has(e.id));
  for (const e of fresh) V.seen.add(e.id);
  if (fresh.length && speakOn()) {
    for (const e of fresh) for (const text of splitSentences(e.text)) V.q.push({ text, clip: serverVoice() ? fetchClip(text) : null });
    pumpVoice();
  }
  faceFollows();
}
// A browser will not make a sound until the person has touched the page once.
document.addEventListener('pointerdown', () => { if (V.blocked) { V.blocked = false; pumpVoice(); render(); } }, true);

// Talk button: one tap to start, one to stop. The words land in the text box to check before Say.
const T = { rec: null, chunks: [], busy: false };
const hearOk = () => store.get('oxd.hear') === 'yes';
function hearConsentHtml() {
  const where = info && info.voice ? info.voice.hearWhere : 'your phone\'s own speech service';
  return `<div class="note"><b>Talk instead of typing?</b> When you use the Talk button, your voice is sent to ${esc(where)} and turned into words that appear in your text box for you to check. It is not kept as a recording. Nobody has to: if you would rather not, you type and tap and nothing else changes.
    <div class="row" style="margin-top:8px"><button class="btn${store.get('oxd.hear') === 'yes' ? ' primary' : ''}" data-act="hear.yes">Yes, let me talk</button><button class="btn${store.get('oxd.hear') === 'no' ? ' primary' : ''}" data-act="hear.no">No, I will type</button></div></div>`;
}
function talkButtonHtml() {
  if (!canHear() || store.get('oxd.hear') === 'no') return '';
  return `<button class="btn${ui.talk === 'listening' ? ' primary' : ''}" data-act="talk" ${ui.talk === 'sending' ? 'disabled' : ''}>${ui.talk === 'listening' ? 'Stop' : ui.talk === 'sending' ? '…' : 'Talk'}</button>`;
}
function addToSay(text) {
  const t = String(text || '').trim();
  if (!t) { toast('Nothing was heard. Try again, or type.'); return; }
  ui.say.text = `${ui.say.text ? `${ui.say.text} ` : ''}${t}`.slice(0, 600);
  render();
}
async function talk() {
  if (!hearOk()) { ui.talkAsk = !ui.talkAsk; return; }
  if (ui.talk === 'listening') { if (T.rec) T.rec.stop(); return; }
  stopVoice(); // the Director stops talking while you do
  if (info.voice.in === 'server') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      T.rec = rec; T.chunks = [];
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) T.chunks.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        ui.talk = 'sending'; render();
        const blob = new Blob(T.chunks, { type: rec.mimeType || 'audio/webm' });
        try {
          const res = await fetch(`/api/voice/hear?${auth()}`, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
          const out = await res.json();
          if (out.ok) addToSay(out.text); else toast(out.error || 'Could not hear that.');
        } catch (e) { toast('Cannot reach the Director host. Is it still running?'); }
        ui.talk = 'idle'; render();
      };
      rec.start();
      ui.talk = 'listening';
    } catch (e) { toast('This phone would not let the page use its microphone.'); ui.talk = 'idle'; }
    return;
  }
  try {
    const r = new SR();
    r.lang = navigator.language || 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (ev) => addToSay(Array.from(ev.results).map((x) => x[0].transcript).join(' '));
    r.onerror = (ev) => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast('This phone would not let the page use its microphone.'); else if (ev.error !== 'no-speech' && ev.error !== 'aborted') toast('Could not hear that. Try again, or type.'); };
    r.onend = () => { ui.talk = 'idle'; T.rec = null; render(); };
    T.rec = r;
    r.start();
    ui.talk = 'listening';
  } catch (e) { toast('Talking is not available on this phone. Type and tap instead.'); ui.talk = 'idle'; }
}

boot();
