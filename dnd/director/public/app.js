// The D&D 5e AI Director's screens: the player's phone or laptop (/play), the shared table screen
// (/table) and the Dungeon Master's console (/host). One file, no build step. The screens draw the
// Ledger the server sends and post actions back; the Engine on the server decides everything.

import * as R from '/engine/rules.js';
import * as PG from '/engine/pregen.js';

// ------------------------------------------------------------------ basics
const path = location.pathname.replace(/\/+$/, '') || '/';
// The Assistants are the same screens with no server (public/local.js): window.DND_LOCAL says which.
const LOCAL = (typeof window !== 'undefined' && window.DND_LOCAL) || null;
const PAGE_ROLE = (typeof window !== 'undefined' && window.DND_ROLE) || '';
const role = LOCAL ? LOCAL.role : PAGE_ROLE || (['/host', '/director'].includes(path) ? 'host' : ['/play', '/player'].includes(path) ? 'player' : path === '/table' ? 'table' : 'home');
let local = null;
const params = new URLSearchParams(location.search);
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const sg = R.signed;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* same */ } },
};
let pid = params.get('pid') || store.get('dnd.pid');
if (!pid) { pid = `p${Math.random().toString(36).slice(2, 10)}`; store.set('dnd.pid', pid); }
let key = (params.get('key') || store.get('dnd.hostKey') || '').toUpperCase();
let tcode = (params.get('t') || store.get('dnd.t') || '').toUpperCase();
const auth = () => `role=${role}&pid=${encodeURIComponent(pid)}&key=${encodeURIComponent(key)}&t=${encodeURIComponent(tcode)}`;

let state = null; // the Ledger as this screen may see it
let adv = null; // the adventure (the host gets the DM's notes)
let srd = null; // the SRD rules data
let ix = null;
let info = null;
let online = false;
let keyBad = false;
let codeBad = false;

const TABS = LOCAL ? {
  player: [['sheet', 'Sheet'], ['spells', 'Spells'], ['build', 'Character'], ['dice', 'Dice'], ['rules', 'Rules'], ['backup', 'Backup'], ['colours', 'Colours']],
  host: [['run', 'Table'], ['party', 'Party'], ['encounter', 'Encounter'], ['bestiary', 'Bestiary'], ['adventure', 'Adventure'], ['seeds', 'Notes'], ['rules', 'Rules'], ['dice', 'Dice'], ['backup', 'Backup'], ['colours', 'Colours']],
} : {
  player: [['play', 'Play'], ['sheet', 'Sheet'], ['spells', 'Spells'], ['build', 'Character'], ['rules', 'Rules'], ['dice', 'Dice'], ['story', 'Story'], ['colours', 'Colours']],
  table: [['table', 'Table'], ['story', 'Story'], ['rules', 'Rules'], ['colours', 'Colours']],
  host: [['run', 'Run'], ['director', 'Director'], ['party', 'Party'], ['encounter', 'Encounter'], ['bestiary', 'Bestiary'], ['adventure', 'Adventure'], ['rules', 'Rules'], ['seeds', 'Seeds'], ['memory', 'Chronicle'], ['saves', 'Saves'], ['voice', 'Voice'], ['dice', 'Dice'], ['colours', 'Colours']],
  home: [],
};

const BLANK_BUILD = () => ({
  name: '', race: 'human', subrace: '', class: 'fighter', subclass: '', level: 1, method: 'standard',
  base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, raceChoice: [], raceSkills: [], skills: [],
  background: 'acolyte', bgSkills: [], kit: [], kitPick: {}, style: '', expertise: [], ancestry: 'red', alignment: '',
  spells: { cantrips: [], known: [], prepared: [], raceCantrip: '' }, languages: [],
});
const loadDraft = () => { try { return { ...BLANK_BUILD(), ...JSON.parse(store.get('dnd.build') || '{}') }; } catch (e) { return BLANK_BUILD(); } };

function backupHtml() {
  return `<div class="stack" style="max-width:760px"><section class="card"><h3>Keep your game safe</h3>
    <p>Everything is saved in this browser on this device. To move it to another device, or keep a copy, download it as a file and load it there.</p>
    <div class="row"><button class="btn primary" data-act="bk.save">Download a copy</button><label class="btn">Load a copy<input type="file" accept=".json,application/json" data-loadfile="1" hidden></label></div>
    <div class="note">Loading a copy replaces what is here (Undo brings it back while this page stays open).</div></section>
    ${role === 'host' ? '<section class="card"><h3>Undo</h3><button class="btn" data-act="undo">Undo the last change</button></section>' : ''}</div>`;
}
function notesHtml() {
  return `<div class="lay-two"><section class="card fill"><h3>DM notes<span class="right"><button class="btn sm" data-act="notes.save">Save</button></span></h3><textarea class="grow" style="min-height:300px" data-k="h.notes" data-hostnotes="1">${esc(ui.host.note ?? state.notes ?? '')}</textarea></section>
    <section class="card fill"><h3>Story seeds</h3><p class="small dim">Your own side-quests and villains, kept with the game.</p>${seedsHtml().replace(/^[\s\S]*?<section class="card fill"><h3>Your seeds<\/h3>/, '').replace(/<\/section><\/div>$/, '')}
      <textarea rows="6" data-k="sd.text" data-bind="seeds.text" placeholder="Write a seed (or start from the template)">${esc(ui.seeds.text)}</textarea><div class="row"><button class="btn" data-act="sd.template">Template</button><button class="btn primary" data-act="sd.save" ${ui.seeds.text.trim() ? '' : 'disabled'}>Save seed</button></div></section></div>`;
}

const ui = {
  tab: (TABS[role][0] || [''])[0],
  join: { name: store.get('dnd.name') || '' },
  say: '',
  build: loadDraft(),
  buildStep: 'basics',
  target: '', adv: '', own: '', sneak: false, smite: 0, twoHanded: false, castLevel: {}, castTargets: {},
  comp: { cat: 'spells', q: '', sel: null, level: '', cls: '' },
  dice: { expr: '1d20', label: '' },
  freeRoll: { kind: 'check', what: 'perception', adv: '' },
  lvl: { asi: { a: '', b: '' }, subclass: '', spells: null },
  host: {
    ask: { pcs: [], kind: 'check', skill: 'perception', ability: 'wis', dc: 12, reason: '', adv: '' },
    foe: {}, add: { q: '', count: 1, hidden: false }, enc: { list: [], q: '', cr: '' }, pcHp: {}, cond: {}, loot: { pc: '', gold: '', item: '' }, xp: { amount: '', why: '' },
    quest: '', narrate: '', sayAs: '', note: null, best: { q: '', sel: null, type: '' },
  },
  newGame: { open: false, adv: '', keepChars: true },
  dir: { key: '', note: '', edit: '', editId: null, url: '', urlFor: null, narrate: '' },
  seeds: { idea: '', text: '', edit: null },
  saves: { slots: null, cloud: null, cloudSlots: null, name: '', url: '', key: '', busy: false },
  mem: { q: '' },
  seenReq: {}, lastRollId: null, freshId: null, keyTry: '',
  readAloud: store.get('dnd.read') == null ? role === 'table' : store.get('dnd.read') === 'on',
  talk: 'idle', talkAsk: false,
  voice: { outScreen: 'gb-male', outEngine: 'browser', outUrl: '', outKey: '', outModel: '', outVoice: '', outSpeed: '', inEngine: 'browser', inUrl: '', inKey: '', inModel: '', inLang: '', loaded: false },
};

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

// ------------------------------------------------------------- the big beat
let fxTimer = null;
function showFx(r) {
  if (r.kind !== 'attack' || r.secret && role !== 'host' && !r.label) return;
  const p = myPc();
  const atMe = p && r.foeId && String(r.label).endsWith(p.name);
  const mineRoll = p && r.pcId === p.id;
  if (role === 'player' && !mineRoll && !atMe) return;
  const el = $('#fx');
  let word = r.success ? (r.crit ? 'CRITICAL!' : 'HIT') : 'MISS';
  let kind = r.crit && r.success ? 'crit' : r.success ? 'ok' : 'no';
  if (atMe) { word = r.success ? (r.crit ? 'CRITICAL HIT ON YOU' : 'YOU ARE HIT') : 'IT MISSES YOU'; kind = r.success ? 'no' : 'ok'; }
  el.className = `fx ${kind}`;
  el.innerHTML = `<div class="fxbox"><div class="fxwho">${esc(r.who)} · ${esc(r.label)}</div><div class="fxword">${word}</div>
    ${r.dice ? `<div class="big">${diceHtml(r, true)}</div>` : ''}
    ${r.total != null && !r.secret ? `<div class="fxwho">total ${r.total}</div>` : ''}
    ${r.dmg && r.dmg.total != null && r.success ? `<div class="fxeff">${r.dmg.total} damage</div>` : ''}</div>`;
  el.hidden = false;
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => { el.hidden = true; }, 2300);
}
document.addEventListener('click', (e) => { if (e.target.closest('#fx')) { $('#fx').hidden = true; clearTimeout(fxTimer); } }, true);

// ---------------------------------------------------------------- transport
async function send(action) {
  if (local) {
    const out = local.act(action, pid);
    if (!out.ok) toast(out.error || 'That did not work.');
    // Drawn on the next tick: a change event fired while a field loses focus must not have its
    // field replaced under it.
    else setTimeout(() => onState(local.view(pid)), 0);
    return out.ok;
  }
  try {
    const res = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role, pid, key, t: tcode, action }) });
    const out = await res.json();
    if (!out.ok) toast(out.error || 'That did not work.');
    return !!out.ok;
  } catch (e) { toast('Cannot reach the Director host. Is it still running?'); return false; }
}
async function sendDirector(body) {
  if (local) return false;
  try {
    const res = await fetch('/api/director', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, ...body }) });
    if (!res.ok) toast('The Director host refused that.');
    return res.ok;
  } catch (e) { toast('Cannot reach the Director host. Is it still running?'); return false; }
}
let reloading = false;
async function reloadAdventure() {
  if (reloading) return;
  reloading = true;
  try { const res = await fetch(`/api/scenario?${auth()}`); if (res.ok) adv = await res.json(); } catch (e) { /* next update retries */ }
  reloading = false;
  render();
}

let stream = null; let gotLive = 0; let polling = null; let lastPoll = '';
function connect() {
  if (stream) stream.close();
  const es = new EventSource(`/api/events?${auth()}`);
  stream = es;
  es.addEventListener('state', (ev) => { gotLive = Date.now(); onState(JSON.parse(ev.data)); });
  es.onerror = () => { online = false; render(); };
  if (!polling) polling = setInterval(async () => {
    if (Date.now() - gotLive < 6000) return;
    try {
      const res = await fetch(`/api/poll?${auth()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const txt = await res.text();
      if (txt !== lastPoll || !online) { lastPoll = txt; onState(JSON.parse(txt)); }
      online = true;
    } catch (e) { if (online) { online = false; render(); } }
  }, 2000);
}

function onState(data) {
  state = data;
  online = true;
  if (adv && state.adventure && state.adventure !== adv.id) {
    if (local) { const a = local.adventure(); adv = { ...a, adventures: adv.adventures }; } else { reloadAdventure(); return; }
  }
  const last = state.rolls[state.rolls.length - 1];
  if (last && last.id !== ui.lastRollId) {
    if (ui.lastRollId !== null) { showFx(last); ui.freshId = last.id; setTimeout(() => { if (ui.freshId === last.id) ui.freshId = null; }, 900); }
    ui.lastRollId = last.id;
  } else if (!last) ui.lastRollId = '';
  const p = myPc();
  if (role === 'player' && p) for (const q of state.requests) if (q.pcId === p.id && !ui.seenReq[q.id]) { ui.seenReq[q.id] = true; if (ui.tab !== 'play') { ui.tab = 'play'; } buzz(); }
  const prop = state.director && state.director.proposal;
  if (prop && prop.id !== ui.dir.editId) { ui.dir.edit = prop.narration; ui.dir.editId = prop.id; }
  if (state.director && state.director.provider && state.director.provider !== ui.dir.urlFor) { ui.dir.url = state.director.url || ''; ui.dir.urlFor = state.director.provider; ui.dir.key = ''; }
  voiceFollows();
  render();
}
const buzz = () => { try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch (e) { /* fine */ } };

async function boot() {
  applyColours();
  document.body.classList.add(`role-${role}`);
  if (LOCAL) {
    const { createLocal } = await import('./local.js');
    srd = LOCAL.srd; ix = R.index(srd);
    local = createLocal({ role, srd, adventures: LOCAL.adventures, storeKey: LOCAL.storeKey || `dnd.local.${role}` });
    const a = local.adventure();
    adv = { ...a, adventures: LOCAL.adventures.map((x) => ({ id: x.id, name: x.name, levels: x.levels, blurb: x.blurb })) };
    pid = 'me';
    online = true;
    ui.tab = TABS[role][0][0];
    const v = local.view(pid);
    if (role === 'player' && !v.players.me) { onState(v); return; }
    onState(v);
    return;
  }
  if (role === 'home') { render(); return; }
  const res = await fetch(`/api/scenario?${auth()}`);
  if (res.status === 403) {
    const why = await res.json().catch(() => ({}));
    if (why.need === 'code') codeBad = true; else keyBad = true;
    render();
    return;
  }
  adv = await res.json();
  if (role === 'host') store.set('dnd.hostKey', key);
  if (tcode) store.set('dnd.t', tcode);
  try { srd = await (await fetch('/srd.json')).json(); ix = R.index(srd); } catch (e) { toast('The rules data could not be loaded.'); }
  const getInfo = async () => {
    try { const next = await (await fetch(`/api/info?${auth()}`)).json(); const ch = JSON.stringify(next) !== JSON.stringify(info); info = next; if (ch) render(); } catch (e) { /* host away */ }
  };
  await getInfo();
  setInterval(getInfo, 15000);
  connect();
  render();
}

// ------------------------------------------------------------------ drawing
let patching = false;
function patch(el, html) {
  if (el._html === html) return;
  const active = document.activeElement;
  const k = active && el.contains(active) ? active.getAttribute('data-k') : null;
  const caret = k && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  // Let a focused field finish (its change event) before it is replaced, so nothing redraws mid-removal.
  if (active && el.contains(active) && active !== document.body) { patching = true; try { active.blur(); } finally { patching = false; } }
  const scrolls = {};
  el.querySelectorAll('[data-scroll]').forEach((n) => { scrolls[n.dataset.scroll] = n.scrollTop; });
  const stickBottom = {};
  el.querySelectorAll('[data-stick]').forEach((n) => { stickBottom[n.dataset.stick] = n.scrollHeight - n.scrollTop - n.clientHeight < 40; });
  el.innerHTML = html;
  el._html = html;
  el.querySelectorAll('[data-scroll]').forEach((n) => { if (scrolls[n.dataset.scroll] != null) n.scrollTop = scrolls[n.dataset.scroll]; });
  el.querySelectorAll('[data-stick]').forEach((n) => { if (stickBottom[n.dataset.stick] !== false) n.scrollTop = n.scrollHeight; });
  if (k) {
    const n = el.querySelector(`[data-k="${CSS.escape(k)}"]`);
    if (n) { n.focus(); if (caret && n.setSelectionRange) { try { n.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not text */ } } }
  }
}
let pressing = false;
let renderWaiting = false;
document.addEventListener('pointerdown', () => { pressing = true; }, true);
const release = () => setTimeout(() => { pressing = false; if (renderWaiting) { renderWaiting = false; render(); } }, 0);
document.addEventListener('pointerup', release, true);
document.addEventListener('pointercancel', release, true);

function render() {
  if (pressing || patching) { renderWaiting = true; if (patching) setTimeout(() => { if (renderWaiting && !pressing) { renderWaiting = false; render(); } }, 0); return; }
  const tabs = TABS[role].map(([id, name]) => `<button class="tab${ui.tab === id ? ' on' : ''}" data-act="tab" data-t="${id}">${name}${id === 'play' && myRequests().length ? ' •' : ''}</button>`).join('');
  const roleName = LOCAL ? (role === 'host' ? 'Dungeon Master\'s Assistant' : 'Players\' Assistant') : { host: 'Dungeon Master', table: 'Table screen', player: 'Player', home: '' }[role];
  const d = state && state.director;
  patch($('#head'), `
    <div class="brand"><b>Dungeons &amp; Dragons</b><span>${LOCAL ? esc(roleName) : `${esc(adv ? adv.name : 'AI Director')}${roleName ? ` · ${roleName}` : ''}`}</span></div>
    ${role === 'home' || LOCAL ? '' : `<div class="link"><i class="dot${online ? '' : ' off'}"></i>${online ? 'live' : 'reconnecting'}</div>`}
    ${d && d.thinking ? '<span class="chip warn">The DM is thinking…</span>' : ''}
    ${role === 'host' && d && d.proposal && ui.tab !== 'director' ? '<button class="chip warn" data-act="tab" data-t="director">The Director has a proposal</button>' : ''}
    <div class="tabs">${tabs}</div>`);
  patch($('#nav'), role !== 'home' && state ? tabs : '');
  patch($('#main'), mainHtml());
}

function mainHtml() {
  if (role === 'home') return homeHtml();
  if (keyBad) return keyHtml();
  if (codeBad) return codeHtml();
  if (!state || !adv || !srd) return '<div class="empty">Connecting to the table…</div>';
  const t = ui.tab;
  if (t === 'colours') return coloursHtml();
  if (t === 'rules') return compendiumHtml();
  if (t === 'dice') return diceTabHtml();
  if (t === 'story') return `<div class="stack">${storyCard({ n: 400, title: 'The whole story' })}</div>`;
  if (t === 'backup') return backupHtml();
  if (role === 'player') {
    const p = state.players[pid];
    if (!p) return joinHtml();
    if (t === 'build' || !myPc()) return buildHtml();
    if (t === 'sheet') return `<div class="stack">${sheetHtml(myPc(), { own: true })}${seatCard(myPc())}</div>`;
    if (t === 'spells') return spellsTabHtml(myPc());
    if (LOCAL) return `<div class="lay-two"><div class="col scroll" data-scroll="ls1">${sheetHtml(myPc(), { own: true })}</div><div class="col scroll" data-scroll="ls2">${actionsCard(myPc())}${xpCard(myPc())}${rollsCard(25, 'Your rolls')}</div></div>`;
    return playHtml();
  }
  if (role === 'table') return tableHtml();
  if (t === 'director') return directorHtml();
  if (t === 'party') return partyHtml();
  if (t === 'encounter') return encounterHtml();
  if (t === 'bestiary') return bestiaryHtml();
  if (t === 'adventure') return adventureHtml();
  if (t === 'seeds') return LOCAL ? notesHtml() : seedsHtml();
  if (t === 'memory') return memoryHtml();
  if (t === 'saves') return savesHtml();
  if (t === 'voice') return voiceTabHtml();
  return hostRunHtml();
}

// ------------------------------------------------------------------ helpers
const site = () => (adv.sites || []).find((x) => x.id === state.scene.siteId) || adv.sites[0] || { id: '', name: '' };
const myPc = () => { if (!state) return null; const p = state.players[pid]; return p && p.pcId ? state.pcs[p.pcId] : null; };
const myRequests = () => { const p = myPc(); return p && state ? state.requests.filter((q) => q.pcId === p.id) : []; };
const foesHere = () => Object.values(state.foes).filter((f) => f.siteId === state.scene.siteId);
const curKey = () => (state.fight && state.fight.phase === 'turns' ? (state.fight.order[state.fight.turn] || {}).key : null);
const nameOfKey = (k) => { if (!k) return ''; const [kind, id] = k.split(':'); return kind === 'pc' ? (state.pcs[id] || {}).name : (state.foes[id] || {}).name; };
const myTurn = () => { const p = myPc(); return !!(p && curKey() === `pc:${p.id}`); };
const skillName = (id) => (ix.skill[id] || {}).name || cap(id);
const AB = R.ABILITIES;
const ABN = R.ABILITY_NAMES;
const spellOf = (id) => ix.spell[id];
const hpClass = (hp, max) => (hp / Math.max(1, max) > 0.5 ? '' : hp / Math.max(1, max) > 0.25 ? 'mid' : 'low');
function hpBar(p) {
  const pctv = Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100));
  return `<div class="hpbar" title="${p.hp} of ${p.maxHp} hit points"><i class="${hpClass(p.hp, p.maxHp)}" style="width:${pctv}%"></i></div>`;
}
function diceHtml(r, fresh = false) {
  const dice = r.dice || [];
  if (!dice.length) return '';
  const d20s = ['check', 'save', 'attack', 'initiative', 'death'].includes(r.kind);
  // With advantage or disadvantage, the die that was not kept is struck through.
  let off = -1;
  if (d20s && dice.length === 2 && r.mode) { const kept = r.mode === 'adv' ? Math.max(...dice) : Math.min(...dice); off = dice[0] === kept ? 1 : 0; }
  return `<span class="dice">${dice.map((v, i) => {
    let cls = d20s ? 'd20' : '';
    if (d20s && v === 20) cls += ' nat20';
    if (d20s && v === 1) cls += ' nat1';
    if (i === off) cls += ' off';
    return `<i class="die ${cls}${fresh || r.id === ui.freshId ? ' fresh' : ''}">${v}</i>`;
  }).join('')}</span>`;
}
function verdict(r) {
  if (r.success === true) return `<span class="verdict ok">${r.kind === 'attack' ? (r.crit ? 'Critical hit' : 'Hit') : 'Success'}</span>`;
  if (r.success === false) return `<span class="verdict no">${r.kind === 'attack' ? 'Miss' : 'Fail'}</span>`;
  return '';
}
function rollRow(r) {
  if (r.secret && role !== 'host') return `<div class="rollrow"><span class="grow"><b>${esc(r.who)}</b> <span class="dim">${esc(r.label)}</span></span>${verdict(r)}</div>`;
  const d20s = ['check', 'save', 'attack', 'initiative', 'death'].includes(r.kind);
  const mod = r.mod ? `${r.mod > 0 ? '+' : '−'}${Math.abs(r.mod)}` : '';
  return `<div class="rollrow">${diceHtml(r)}<span class="grow"><b>${esc(r.who)}</b> <span class="dim">${esc(r.label)}${mod ? ` (${d20s ? 'd20 ' : ''}${mod})` : ''}${r.mode ? ` · ${r.mode === 'adv' ? 'advantage' : 'disadvantage'}` : ''}${r.at != null && (role === 'host' || r.kind === 'death') ? ` · vs ${r.at}` : ''}${r.secret ? ' · secret' : ''}</span>${r.why && r.why.length ? `<br><span class="small faint">${esc(r.why.join(', '))}</span>` : ''}</span><span class="tot">${r.total ?? ''}</span>${verdict(r)}${r.dmg && r.dmg.total != null && r.success !== false ? `<span class="chip no">${r.dmg.total} dmg</span>` : ''}</div>`;
}
function rollsCard(n = 30, title = 'Rolls') {
  const list = state.rolls.slice(-n).reverse();
  return `<section class="card fill"><h3>${title}</h3><div class="scroll" data-scroll="rolls">${list.length ? list.map(rollRow).join('') : '<div class="empty">No rolls yet.</div>'}</div></section>`;
}
function storyCard({ n = 60, title = 'The story', input = '', fill = true } = {}) {
  const lines = state.story.slice(-n);
  const html = lines.map((e) => {
    if (e.kind === 'narration') return `<div class="narr">${esc(e.text).replace(/\n/g, '<br>')}</div>`;
    if (e.kind === 'say') return `<div class="say"><b>${esc(e.who)}:</b> ${esc(e.text)}</div>`;
    if (e.move) return `<div class="move">${esc(e.text)}</div>`;
    return `<div class="ev${e.roll ? ' roll' : ''}">${esc(e.text)}</div>`;
  }).join('');
  return `<section class="card${fill ? ' fill' : ''}"><h3>${title}<span class="right"><button class="chip${ui.readAloud ? ' on' : ''}" data-act="readaloud" title="Read each new narration aloud on this device">${ui.readAloud ? 'Reading aloud' : 'Read aloud'}</button></span></h3>
    <div class="scroll story" data-stick="story" style="flex:1">${html || `<div class="empty">The story has not begun. ${LOCAL ? 'Narrate or note what happens below; it becomes the session log.' : role === 'host' ? 'Take a turn on the Director tab, or narrate the opening yourself.' : 'Waiting for the Dungeon Master.'}</div>`}</div>${input}</section>`;
}

// ------------------------------------------------------------------ colours
const DEFAULTS = { '--bg': '#14110e', '--panel': '#1e1a16', '--panel2': '#29231d', '--line': '#3d342b', '--ink': '#efe6d8', '--dim': '#b2a38f', '--faint': '#7d705f', '--accent': '#d4a84a', '--ok': '#6fbf73', '--no': '#e0675c', '--warn-c': '#e09a4a', '--input': '#110e0b', '--btn': '#332b23' };
const COLOURS = [['--bg', 'Background'], ['--panel', 'Panels'], ['--panel2', 'Inner panels'], ['--line', 'Lines'], ['--ink', 'Text'], ['--dim', 'Quiet text'], ['--faint', 'Faint text'], ['--accent', 'Accent (gold)'], ['--ok', 'Good'], ['--no', 'Bad'], ['--warn-c', 'Warning'], ['--input', 'Fields'], ['--btn', 'Buttons']];
const THEMES = {
  Tavern: DEFAULTS,
  Dungeon: { '--bg': '#0f1114', '--panel': '#171a1f', '--panel2': '#1f242b', '--line': '#2f3640', '--ink': '#e3e7ec', '--dim': '#97a1ad', '--faint': '#66707c', '--accent': '#8fb8de', '--ok': '#66c08a', '--no': '#e2685f', '--warn-c': '#dda24c', '--input': '#0c0e11', '--btn': '#242a33' },
  Parchment: { '--bg': '#efe4cc', '--panel': '#f8f0dc', '--panel2': '#eadcbc', '--line': '#cdb98f', '--ink': '#2b2016', '--dim': '#6c5a43', '--faint': '#93806a', '--accent': '#8a2c1b', '--ok': '#2f7a3a', '--no': '#a5281b', '--warn-c': '#9a5a12', '--input': '#fffaf0', '--btn': '#e8d9b5' },
  Feywild: { '--bg': '#120f1a', '--panel': '#1b1726', '--panel2': '#252036', '--line': '#3a3152', '--ink': '#efe9fb', '--dim': '#ad9fcf', '--faint': '#776a96', '--accent': '#c79bff', '--ok': '#6fd3a5', '--no': '#ff7a9a', '--warn-c': '#f2b46b', '--input': '#0e0b15', '--btn': '#2c2540' },
};
const savedColours = () => { try { return JSON.parse(store.get('dnd.colours') || '{}'); } catch (e) { return {}; } };
function applyColours() { const c = { ...DEFAULTS, ...savedColours() }; for (const [k, v] of Object.entries(c)) document.documentElement.style.setProperty(k, v); }
function coloursHtml() {
  const c = { ...DEFAULTS, ...savedColours() };
  return `<div class="stack"><section class="card"><h3>Colours<span class="right"><button class="btn sm" data-act="col.reset">Reset</button></span></h3>
    <div class="row">${Object.keys(THEMES).map((n) => `<button class="btn" data-act="col.theme" data-n="${n}">${n}</button>`).join('')}</div>
    <div class="fields four">${COLOURS.map(([k, n]) => `<label class="fld"><span class="fl">${n}</span><div class="row nw"><input type="color" value="${c[k]}" data-colour="${k}"><span class="small dim">${c[k]}</span></div></label>`).join('')}</div>
    <div class="note">Colours are saved on this device only.</div></section></div>`;
}

// ------------------------------------------------------------------ getting in
function homeHtml() {
  return `<div class="stack" style="max-width:640px;margin:0 auto"><section class="card"><h3>Dungeons &amp; Dragons · AI Director</h3>
    <p class="tale">Choose your screen.</p>
    <div class="row"><a class="btn primary big" href="/play">I am a player</a><a class="btn big" href="/table">Table screen</a><a class="btn big" href="/host">Dungeon Master</a></div>
    <div class="note">The DM's console needs the host key printed in the server window.</div></section></div>`;
}
function keyHtml() {
  return `<div class="stack" style="max-width:520px;margin:0 auto"><section class="card ask"><h3>Host key</h3><p>Type the host key from the server window.</p>
    <div class="row"><input type="text" class="grow" data-k="keyTry" data-bind="keyTry" value="${esc(ui.keyTry)}" autocomplete="off"><button class="btn primary" data-act="key.go">Open</button></div></section></div>`;
}
function codeHtml() {
  return `<div class="stack" style="max-width:520px;margin:0 auto"><section class="card ask"><h3>Table code</h3><p>This table is reached from outside its home network. Ask the DM for the table code.</p>
    <div class="row"><input type="text" class="grow" data-k="keyTry" data-bind="keyTry" value="${esc(ui.keyTry)}" autocomplete="off"><button class="btn primary" data-act="code.go">Join</button></div></section></div>`;
}
function joinHtml() {
  return `<div class="stack" style="max-width:560px;margin:0 auto"><section class="card ask"><h3>${LOCAL ? 'Welcome' : 'Join the table'}</h3>
    <p class="tale">${LOCAL ? 'Build a fifth-edition character, keep the sheet, roll the dice and look up any rule. Everything stays in this browser.' : esc(adv.blurb || '')}</p>
    <label class="fld"><span class="fl">Your name (the player, not the character)</span><input type="text" data-k="join.name" data-bind="join.name" value="${esc(ui.join.name)}" maxlength="30" autocomplete="name"></label>
    <button class="btn primary big" data-act="join">${LOCAL ? 'Begin' : 'Sit down'}</button></section></div>`;
}

// ------------------------------------------------------------- the character
const nextXp = (p) => (p.level >= 20 ? null : srd.xpTable[p.level]);
const canLevel = (p) => p && !p.dead && nextXp(p) != null && (p.xp || 0) >= nextXp(p);
function vitalsTiles(p) {
  const hd = p.level - (p.hitDiceUsed || 0);
  return `<div class="tiles">
    <div class="tile"><div class="tl">AC</div><div class="tv">${p.ac}</div><div class="ts">${esc(p.acNote)}</div></div>
    <div class="tile ${p.hp <= 0 ? 'bad' : hpClass(p.hp, p.maxHp) === 'low' ? 'bad' : hpClass(p.hp, p.maxHp) === 'mid' ? 'warn' : 'good'}"><div class="tl">Hit points</div><div class="tv">${p.hp}<small>/${p.maxHp}</small></div><div class="ts">${p.tempHp ? `+${p.tempHp} temp` : '&nbsp;'}</div></div>
    <div class="tile"><div class="tl">Speed</div><div class="tv">${p.speed}<small> ft</small></div><div class="ts">&nbsp;</div></div>
    <div class="tile"><div class="tl">Initiative</div><div class="tv">${sg(p.mods.dex)}</div><div class="ts">&nbsp;</div></div>
    <div class="tile"><div class="tl">Proficiency</div><div class="tv">${sg(p.prof)}</div><div class="ts">&nbsp;</div></div>
    <div class="tile"><div class="tl">Hit dice</div><div class="tv">${hd}<small>/${p.level}</small></div><div class="ts">d${p.hitDie}</div></div>
  </div>`;
}
function deathHtml(p) {
  if (p.dead) return '<div class="note hot"><b>Dead.</b> Only powerful magic can bring them back.</div>';
  if (p.hp > 0) return '';
  const pips = (n, cls) => [0, 1, 2].map((k) => `<i class="pip ${k < n ? cls : 'blank'}"></i>`).join('');
  return `<div class="row"><b>${p.stable ? 'Unconscious, stable' : 'Dying'}</b><span class="small dim">Successes</span><span class="slot"><span class="pips">${pips(p.death.s, 'ok')}</span></span><span class="small dim">Failures</span><span class="slot"><span class="pips">${pips(p.death.f, 'no')}</span></span>
    ${!p.stable ? '<button class="btn sm" data-act="stabilize" data-id="' + p.id + '">Stabilize</button>' : ''}</div>`;
}
function hpControls(p) {
  const v = ui.host.pcHp[p.id] ?? '';
  return `<div class="row nw"><input type="number" min="0" style="max-width:90px" data-k="hp.${p.id}" data-bind="host.pcHp.${p.id}" value="${esc(v)}" placeholder="0">
    <button class="btn sm danger" data-act="hp" data-id="${p.id}" data-op="damage">Damage</button><button class="btn sm good" data-act="hp" data-id="${p.id}" data-op="heal">Heal</button><button class="btn sm" data-act="hp" data-id="${p.id}" data-op="temp">Temp</button></div>`;
}
function condControls(p, kind = 'pc') {
  const ref = `${kind}:${p.id}`;
  const conds = p.conds || [];
  return `<div class="chips">${conds.map((c) => `<button class="chip warn" data-act="cond.rm" data-ref="${ref}" data-c="${c}" title="${esc((ix.cond[c] || {}).desc || '')}">${cap(c)} ✕</button>`).join('')}
    ${kind === 'pc' && p.exhaustion ? `<button class="chip no" data-act="cond.rm" data-ref="${ref}" data-c="exhaustion">Exhaustion ${p.exhaustion} ✕</button>` : ''}
    <select class="sm" style="width:auto;min-height:28px;padding:2px 6px" data-addcond="${ref}"><option value="">+ condition</option>${srd.conditions.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>`;
}
function sheetHtml(p, { own = false, host = false } = {}) {
  if (!p) return '<section class="card"><div class="empty">No character yet. Make one on the Character tab.</div></section>';
  const edit = own || host;
  const sb = (a) => R.saveBonus(p, a);
  const ab = `<div class="abil">${AB.map((a) => `<button class="tile" data-act="free" data-pc="${p.id}" data-kind="check" data-ab="${a}" title="Roll a ${ABN[a]} check"><div class="tl">${ABN[a]}</div><div class="tv">${sg(p.mods[a])}</div><div class="sc">${p.ab[a]}</div></button>`).join('')}</div>
    <div class="abil">${AB.map((a) => `<button class="tile" data-act="free" data-pc="${p.id}" data-kind="save" data-ab="${a}" title="Roll a ${ABN[a]} saving throw"><div class="tl">${a.toUpperCase()} save${p.saves.includes(a) ? ' ●' : ''}</div><div class="tv" style="font-size:17px">${sg(sb(a))}</div></button>`).join('')}</div>`;
  const skills = `<div class="skills">${srd.skills.map((s) => { const b = R.skillBonus(p, s.id, srd).bonus; const ex = (p.expertise || []).includes(s.id); return `<button class="skill" data-act="free" data-pc="${p.id}" data-kind="check" data-skill="${s.id}"><i class="p${ex ? ' ex' : p.skills.includes(s.id) ? ' on' : ''}"></i><span class="b">${sg(b)}</span><span>${esc(s.name)} <span class="faint small">${s.ability.toUpperCase()}</span></span></button>`; }).join('')}</div>`;
  const res = (p.resources || []).length ? `<div class="chips">${p.resources.map((r) => `<span class="chip${r.used >= r.max ? '' : ' on'}">${esc(r.name)} ${r.pool ? `${r.max - r.used}/${r.max}` : `${r.max - r.used}/${r.max}`}${r.die ? ` (${r.die})` : ''}</span>${edit ? `<button class="btn sm" data-act="res.use" data-pc="${p.id}" data-id="${r.id}" ${r.used >= r.max && r.id !== 'rage' ? 'disabled' : ''}>${r.id === 'rage' && p.raging ? 'End rage' : 'Use'}</button>` : ''}`).join('')}</div>` : '';
  const slots = p.cast && p.cast.slots.some((x) => x[0]) ? `<div class="slots">${p.cast.slots.map(([m, u], k) => (m ? `<div class="slot"><span>${R.ordinal(k + 1)}</span><span class="pips">${Array.from({ length: m }, (_, n) => `<button class="pip${n < u ? ' used' : ''}" ${edit ? `data-act="slot" data-pc="${p.id}" data-l="${k + 1}" data-u="${n < u ? n : n + 1}"` : 'disabled'} title="${n < u ? 'Spent' : 'Ready'}"></button>`).join('')}</span></div>` : '')).join('')}</div>` : '';
  const attacks = `<div>${p.attacks.map((a) => `<div class="atk"><span><b>${esc(a.name)}</b> <span class="small dim">${esc(a.range)}${a.props.length ? ` · ${esc(a.props.filter((x) => x !== 'spell').join(', '))}` : ''}${a.proficient ? '' : ' · not proficient'}</span></span><span class="h">${sg(a.hit)}</span><span>${esc(a.dmg)}${a.versatile ? ` <span class="faint small">(${esc(a.versatile)})</span>` : ''}</span><span class="small dim">${esc(a.type)}</span></div>`).join('')}</div>`;
  const inv = `<div class="list">${p.inventory.map((x) => `<div class="row" style="padding:3px 0;border-bottom:1px solid color-mix(in srgb,var(--line) 50%,transparent)"><span class="grow">${esc(x.name)}${x.magic ? ' <span class="chip on">magic</span>' : ''}</span>${edit ? `<button class="btn sm" data-act="item" data-pc="${p.id}" data-n="${esc(x.name)}" data-q="${x.qty - 1}">−</button><b>${x.qty}</b><button class="btn sm" data-act="item" data-pc="${p.id}" data-n="${esc(x.name)}" data-q="${x.qty + 1}">+</button>` : `<b>${x.qty}</b>`}</div>`).join('')}</div>`;
  const feats = [...p.features.map((f) => ({ ...f, src: `${f.from}, level ${f.level}` })), ...p.traits.map((t) => ({ ...t, src: p.raceName }))];
  const nx = nextXp(p);
  return `<section class="card">
      <h3><span>${esc(p.name)}</span><span class="right">${edit ? `<button class="chip" data-act="sheet.print" data-pc="${p.id}" title="Print this character sheet, or save it as a PDF">Print</button>` : ''}${p.inspiration ? '<span class="chip on">Inspiration</span>' : ''}${p.conc ? `<span class="chip warn">Concentrating: ${esc(p.conc.name)}${edit ? ` <button class="chip" data-act="conc.end" data-pc="${p.id}">end</button>` : ''}</span>` : ''}${p.raging ? '<span class="chip no">Raging</span>' : ''}</span></h3>
      <div class="dim">Level ${p.level} ${esc(p.raceName)} ${esc(p.clsName)}${p.subclassName ? ` (${esc(p.subclassName)})` : ''} · ${esc(p.background)}${p.alignment ? ` · ${esc(p.alignment)}` : ''} · XP ${p.xp || 0}${nx != null ? ` / ${nx}` : ''}${canLevel(p) ? ' · <b style="color:var(--ok)">ready to level up</b>' : ''}</div>
      ${hpBar(p)}${vitalsTiles(p)}${deathHtml(p)}
      ${edit ? hpControls(p) : ''}
      ${condControls(p)}
      ${canLevel(p) && own ? '<button class="btn primary" data-act="tab" data-t="build">Level up</button>' : ''}
    </section>
    <section class="card"><h3>Abilities and saves <span class="right small dim">tap to roll</span></h3>${ab}</section>
    <section class="card"><h3>Skills <span class="right small dim">● proficient · green: expertise · passive Perception ${p.passive}</span></h3>${skills}</section>
    <section class="card"><h3>Attacks</h3>${attacks}${p.sneak ? `<div class="note">Sneak Attack: ${p.sneak} once a turn, with advantage or an ally next to the target.</div>` : ''}${p.extraAttacks ? `<div class="note">Extra Attack: ${p.extraAttacks + 1} attacks with the Attack action.</div>` : ''}</section>
    ${p.cast ? `<section class="card"><h3>Spellcasting<span class="right"><span class="chip">${ABN[p.cast.ability]}</span><span class="chip">Save DC ${p.cast.dc}</span><span class="chip">Attack ${sg(p.cast.atk)}</span></span></h3>${slots}<button class="btn" data-act="tab" data-t="spells">Spells</button></section>` : ''}
    ${res ? `<section class="card"><h3>Class abilities</h3>${res}</section>` : ''}
    ${edit ? `<section class="card"><h3>Rest</h3><div class="row"><span class="small dim">Short rest: spend hit dice</span>${[0, 1, 2, 3].filter((n) => n <= p.level - (p.hitDiceUsed || 0)).map((n) => `<button class="btn sm" data-act="rest.short" data-pc="${p.id}" data-n="${n}">${n ? `${n} di${n > 1 ? 'ce' : 'e'}` : 'No dice'}</button>`).join('')}${host ? `<button class="btn sm" data-act="rest.long1" data-pc="${p.id}">Long rest (this character)</button>` : ''}</div></section>` : ''}
    <section class="card"><h3>Equipment<span class="right"><span class="chip on">${p.gold || 0} gp</span></span></h3>${inv}
      ${edit ? `<div class="row"><input type="text" class="grow" data-k="newitem.${p.id}" data-bind="newItem" value="${esc(ui.newItem || '')}" placeholder="Add an item"><button class="btn sm" data-act="item.add" data-pc="${p.id}">Add</button><input type="number" style="max-width:100px" data-k="gold.${p.id}" data-bind="goldSet" value="${esc(ui.goldSet ?? '')}" placeholder="gold"><button class="btn sm" data-act="gold" data-pc="${p.id}">Set gold</button></div>` : ''}
      ${state.loot.length && edit ? `<div class="note gold">Party loot: ${state.loot.map((x, n) => `<button class="chip" data-act="loot.take" data-pc="${p.id}" data-i="${n}">${esc(x.qty > 1 ? `${x.qty} × ` : '')}${esc(x.name)} · take</button>`).join(' ')}</div>` : ''}</section>
    <section class="card"><h3>Features and traits</h3>${feats.map((f) => `<details class="feature"><summary>${esc(f.name)} <span class="faint small">${esc(f.src)}</span></summary><p>${esc(f.desc || 'See the rules.')}</p></details>`).join('')}
      <div class="small dim">Proficiencies: ${esc(p.profs.join(', ') || 'none')}. Languages: ${esc(p.langs.join(', '))}.</div></section>
    ${edit ? `<section class="card"><h3>Notes</h3><textarea rows="4" data-k="notes.${p.id}" data-notes="${p.id}">${esc(p.notes || '')}</textarea></section>` : ''}`;
}

// ------------------------------------------------------------------ printed sheet
// A paper character sheet: the classic 5e layout in black on white (whatever the screen's colours, to
// save ink). Page one is the character and always fits one page; then the full text of the features and
// traits; then, for a caster, the spells. Printed with the browser's print dialog, which also saves a PDF.
const box = (n) => Array.from({ length: n }, () => '<i class="ps-box"></i>').join('');
function printSheetHtml(p) {
  const player = p.playerId && state.players[p.playerId] ? state.players[p.playerId].name : '';
  const nx = nextXp(p);
  const meta = [
    ['Class and level', `${p.clsName} ${p.level}${p.subclassName ? ` (${p.subclassName})` : ''}`],
    ['Race', p.raceName], ['Background', p.background || '—'], ['Alignment', p.alignment || '—'],
    ['Player', player || '—'], ['Experience', `${p.xp || 0}${nx != null ? ` / ${nx}` : ''}`],
  ];
  const abil = AB.map((a) => `<div class="ps-ab"><div class="ps-l">${ABN[a]}</div><div class="ps-big">${sg(p.mods[a])}</div><div class="ps-sc">${p.ab[a]}</div></div>`).join('');
  const saves = AB.map((a) => `<div class="ps-r"><span class="ps-dot">${p.saves.includes(a) ? '●' : '○'}</span><b>${sg(R.saveBonus(p, a))}</b> ${ABN[a]}</div>`).join('');
  const skills = srd.skills.map((k) => { const ex = (p.expertise || []).includes(k.id); const pr = ex || (p.skills || []).includes(k.id); return `<div class="ps-r"><span class="ps-dot">${ex ? '◆' : pr ? '●' : '○'}</span><b>${sg(R.skillBonus(p, k.id, srd).bonus)}</b> ${esc(k.name)} <span class="ps-dim">(${k.ability.replace(/^./, (c) => c.toUpperCase())})</span></div>`; }).join('');
  const attacks = p.attacks.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td>${sg(a.hit)}</td><td>${esc(a.dmg)}${a.versatile ? ` (${esc(a.versatile)})` : ''} ${esc(a.type)}</td><td class="ps-dim">${esc(a.range)}${a.props.length ? `, ${esc(a.props.filter((x) => x !== 'spell').join(', '))}` : ''}${a.proficient ? '' : ', not proficient'}</td></tr>`).join('');
  const res = (p.resources || []).map((r) => `<div class="ps-r"><b>${esc(r.name)}</b>${r.die ? ` (${esc(r.die)})` : ''} ${r.pool || r.max > 10 ? `<span class="ps-dim">pool of ${r.max}</span>` : box(r.max)} <span class="ps-dim">${r.reset ? `per ${esc(r.reset)} rest` : ''}</span></div>`).join('');
  const inv = p.inventory.map((x) => `<div class="ps-r">${x.qty > 1 ? `${x.qty} × ` : ''}${esc(x.name)}${x.magic ? ' <span class="ps-dim">(magic)</span>' : ''}</div>`).join('');
  const featList = [...p.features.map((f) => ({ ...f, src: `${f.from}, level ${f.level}` })), ...p.traits.map((t) => ({ ...t, src: p.raceName }))];
  const featNames = featList.map((f) => `<div class="ps-r"><b class="ps-fn">${esc(f.name)}</b> <span class="ps-dim">${esc(f.src)}</span></div>`).join('');
  const feats = featList.map((f) => `<div class="ps-feat"><b>${esc(f.name)}</b> <span class="ps-dim">${esc(f.src)}</span><div>${esc(f.desc || 'See the rules.')}</div></div>`).join('');
  const conds = [...(p.conds || []), ...(p.exhaustion ? [`exhaustion ${p.exhaustion}`] : [])];
  const page1 = `<div class="ps-page">
    <div class="ps-head"><div class="ps-name">${esc(p.name)}</div><div class="ps-meta">${meta.map(([k, v]) => `<div><span>${k}</span>${esc(v)}</div>`).join('')}</div></div>
    <div class="ps-cols">
      <div class="ps-c">
        <div class="ps-abils">${abil}</div>
        <div class="ps-card"><div class="ps-r"><i class="ps-box"></i> Inspiration${p.inspiration ? ' (has it)' : ''}</div><div class="ps-r"><b>${sg(p.prof)}</b> Proficiency bonus</div><div class="ps-r"><b>${p.passive}</b> Passive Perception</div></div>
        <div class="ps-card"><h4>Saving throws</h4>${saves}</div>
        <div class="ps-card"><h4>Skills</h4>${skills}<div class="ps-dim ps-key">● proficient · ◆ expertise</div></div>
      </div>
      <div class="ps-c">
        <div class="ps-vit"><div><span>Armour class</span><b>${p.ac}</b><em>${esc(p.acNote || '')}</em></div><div><span>Initiative</span><b>${sg(p.mods.dex)}</b><em></em></div><div><span>Speed</span><b>${p.speed} ft</b><em></em></div></div>
        <div class="ps-vit"><div><span>Hit point maximum</span><b>${p.maxHp}</b><em></em></div><div><span>Current hit points</span><b>${p.hp}</b><em>when printed</em></div><div><span>Temporary</span><b>${p.tempHp || ''}</b><em></em></div></div>
        <div class="ps-vit"><div><span>Hit dice</span><b>${p.level}d${p.hitDie}</b><em>${p.hitDiceUsed ? `${p.hitDiceUsed} used` : ''}</em></div><div><span>Death saves</span><em>Successes ${box(3)}</em><em>Failures ${box(3)}</em></div></div>
        ${conds.length ? `<div class="ps-card"><b>Conditions when printed:</b> ${esc(conds.join(', '))}</div>` : ''}
        <div class="ps-card"><h4>Attacks</h4><table class="ps-tab"><tr><th>Name</th><th>Hit</th><th>Damage</th><th>Notes</th></tr>${attacks}</table>
          ${p.extraAttacks ? `<div class="ps-note">Extra Attack: ${p.extraAttacks + 1} attacks when you take the Attack action.</div>` : ''}${p.sneak ? `<div class="ps-note">Sneak Attack: ${esc(p.sneak)} once a turn, with advantage or an ally next to the target.</div>` : ''}</div>
        ${res ? `<div class="ps-card"><h4>Class abilities</h4>${res}</div>` : ''}
        <div class="ps-card"><h4>Equipment <span class="ps-right">${p.gold || 0} gp</span></h4>${inv || '<div class="ps-dim">Nothing yet.</div>'}</div>
      </div>
      <div class="ps-c">
        <div class="ps-card"><h4>Proficiencies and languages</h4><div>${esc(p.profs.join(', ') || 'none')}.</div><div><b>Languages:</b> ${esc(p.langs.join(', '))}.</div></div>
        <div class="ps-card"><h4>Features and traits</h4>${featNames}${featList.length ? '<div class="ps-dim ps-key">Full text on the next page.</div>' : ''}</div>
        <div class="ps-card ps-notes"><h4>Notes</h4><div class="ps-pre">${esc(p.notes || '')}</div></div>
      </div>
    </div></div>`;
  const page2 = featList.length ? `<div class="ps-page ps-break">
    <div class="ps-head ps-head-sm"><div class="ps-name">${esc(p.name)} <span class="ps-dim">features and traits</span></div><div class="ps-meta"><div><span>Class and level</span>${esc(`${p.clsName} ${p.level}`)}</div><div><span>Race</span>${esc(p.raceName)}</div></div></div>
    <div class="ps-flow">${feats}</div></div>` : '';
  if (!p.cast) return page1 + page2;
  const c = p.cast;
  const by = {};
  for (const sp of castable(p)) (by[sp.level] = by[sp.level] || []).push(sp);
  const slots = c.slots.map(([m], k) => (m ? `<div class="ps-slot"><span>${R.ordinal(k + 1)} level</span>${box(m)}</div>` : '')).join('');
  const spells = Object.keys(by).sort((a, b) => a - b).map((l) => `<h4 class="ps-lvl">${Number(l) ? `${R.ordinal(Number(l))} level` : 'Cantrips'}</h4>${by[l].map((sp) => `<div class="ps-spell"><b>${esc(sp.name)}</b> <span class="ps-dim">${esc(sp.time)} · ${esc(sp.range)} · ${esc(sp.comp)} · ${esc(sp.dur)}${sp.conc ? ' · concentration' : ''}${sp.ritual ? ' · ritual' : ''}</span><div>${esc(sp.desc)}</div>${sp.higher ? `<div><i>At higher levels.</i> ${esc(sp.higher)}</div>` : ''}</div>`).join('')}`).join('');
  const page3 = `<div class="ps-page ps-break">
    <div class="ps-head ps-head-sm"><div class="ps-name">${esc(p.name)} <span class="ps-dim">spells</span></div><div class="ps-meta">${[['Spellcasting ability', ABN[c.ability]], ['Spell save DC', c.dc], ['Spell attack', sg(c.atk)]].map(([k, v]) => `<div><span>${k}</span>${esc(v)}</div>`).join('')}</div></div>
    <div class="ps-card ps-slots">${slots}</div>
    <div class="ps-flow">${spells}</div></div>`;
  return page1 + page2 + page3;
}
function printSheet(p) {
  if (!p) return;
  let el = document.getElementById('print-sheet');
  if (!el) { el = document.createElement('div'); el.id = 'print-sheet'; document.body.appendChild(el); }
  el.innerHTML = printSheetHtml(p);
  const title = document.title;
  document.title = `${p.name} - character sheet`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); document.title = title; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

// ------------------------------------------------------------------ spells
function spellCard(s, { cast = null } = {}) {
  if (!s) return '';
  const lvl = s.level ? `${R.ordinal(s.level)}-level ${s.school.toLowerCase()}` : `${s.school} cantrip`;
  return `<details class="feature"><summary>${esc(s.name)} <span class="faint small">${lvl}${s.conc ? ' · concentration' : ''}${s.ritual ? ' · ritual' : ''}</span></summary>
    <div class="small dim">${esc(s.time)} · ${esc(s.range)} · ${esc(s.comp)}${s.mat ? ` (${esc(s.mat)})` : ''} · ${esc(s.dur)}</div><p>${esc(s.desc)}</p>${s.higher ? `<p><b>At higher levels.</b> ${esc(s.higher)}</p>` : ''}${cast || ''}</details>`;
}
function targetsHtml(key, { foes = true, pcs = true, multi = false } = {}) {
  const sel = ui.castTargets[key] || [];
  const list = [...(foes ? foesHere().filter((f) => !f.dead && !f.hidden).map((f) => ({ ref: `foe:${f.id}`, name: f.name, foe: true })) : []), ...(pcs ? Object.values(state.pcs).filter((p) => !p.dead).map((p) => ({ ref: `pc:${p.id}`, name: p.name })) : [])];
  if (!list.length) return '<span class="small faint">No targets here.</span>';
  return `<div class="chips">${list.map((t) => `<button class="chip${sel.includes(t.ref) ? ' on' : ''}${t.foe ? '' : ''}" data-act="tgt" data-key="${key}" data-ref="${t.ref}" data-multi="${multi ? 1 : ''}">${t.foe ? '⚔ ' : ''}${esc(t.name)}</button>`).join('')}</div>`;
}
function castable(p) {
  if (!p.cast) return [];
  const c = p.cast;
  const ids = [...c.cantrips, ...(c.raceCantrip ? [c.raceCantrip] : []), ...(c.kind === 'prepared' ? c.prepared : c.known)];
  return [...new Set(ids)].map(spellOf).filter(Boolean);
}
function castControls(p, s) {
  const c = p.cast;
  const lv = Number(ui.castLevel[s.id] || s.level);
  const levels = s.level ? c.slots.map((x, k) => ({ l: k + 1, left: x[0] - x[1], max: x[0] })).filter((x) => x.l >= s.level && x.max) : [];
  const needsT = s.attack || s.save || s.heal || s.dmgSlot || s.dmgLevel || s.id === 'magic-missile';
  const multi = !s.attack && (s.save || s.id === 'magic-missile' || /mass/.test(s.id) || s.id === 'bless' || s.id === 'bane');
  return `<div class="row" style="margin-top:6px">
    ${s.level ? `<select style="width:auto" data-castlvl="${s.id}">${levels.map((x) => `<option value="${x.l}" ${x.l === lv ? 'selected' : ''} ${x.left ? '' : 'disabled'}>${R.ordinal(x.l)} level (${x.left} left)</option>`).join('')}</select>` : ''}
    <button class="btn primary sm" data-act="cast" data-pc="${p.id}" data-s="${s.id}">Cast</button>
    ${s.ritual && c.kind !== 'pact' ? `<button class="btn sm" data-act="cast" data-pc="${p.id}" data-s="${s.id}" data-ritual="1" title="Takes 10 minutes longer and uses no slot">As a ritual</button>` : ''}</div>
    ${needsT ? `<div class="small dim" style="margin-top:4px">Target${multi ? 's' : ''}:</div>${targetsHtml(`s:${s.id}`, { multi })}` : ''}`;
}
function spellsTabHtml(p) {
  if (!p) return buildHtml();
  if (!p.cast) return '<div class="stack"><section class="card"><div class="empty">Your character does not cast spells.</div></section></div>';
  const c = p.cast;
  const list = castable(p);
  const by = {};
  for (const s of list) (by[s.level] = by[s.level] || []).push(s);
  const prep = c.kind === 'prepared';
  const pool = prep ? srd.spells.filter((s) => s.level >= 1 && s.level <= c.maxSlot && s.classes.includes(p.cls) && (!c.spellbook || c.known.includes(s.id))) : [];
  const chosen = new Set(c.prepared);
  return `<div class="lay-two"><div class="col scroll" data-scroll="sp1">
      <section class="card"><h3>Spells you can cast<span class="right"><span class="chip">Save DC ${c.dc}</span><span class="chip">Attack ${sg(c.atk)}</span></span></h3>
        <div class="slots">${c.slots.map(([m, u], k) => (m ? `<div class="slot"><span>${R.ordinal(k + 1)}</span><span class="pips">${Array.from({ length: m }, (_, n) => `<button class="pip${n < u ? ' used' : ''}" data-act="slot" data-pc="${p.id}" data-l="${k + 1}" data-u="${n < u ? n : n + 1}"></button>`).join('')}</span></div>` : '')).join('')}</div>
        ${Object.keys(by).sort((a, b) => a - b).map((l) => `<div><div class="fl dim small" style="margin-top:6px">${Number(l) ? `${R.ordinal(Number(l))} level` : 'Cantrips'}</div>${by[l].map((s) => spellCard(s, { cast: castControls(p, s) })).join('')}</div>`).join('') || '<div class="empty">No spells chosen yet.</div>'}
      </section></div>
    <div class="col scroll" data-scroll="sp2">
      ${prep ? `<section class="card"><h3>Prepared spells<span class="right"><span class="chip${c.prepared.length > c.prepMax ? ' no' : ''}">${c.prepared.length} of ${c.prepMax}</span></span></h3>
        <div class="small dim">${c.spellbook ? 'From your spellbook. ' : ''}Change these after a long rest.</div>
        <div class="chips">${pool.map((s) => `<button class="chip${chosen.has(s.id) ? ' on' : ''}" data-act="prep" data-pc="${p.id}" data-s="${s.id}" ${!chosen.has(s.id) && c.prepared.length >= c.prepMax ? 'disabled' : ''}>${esc(s.name)} <span class="faint">${s.level}</span></button>`).join('')}</div></section>` : ''}
      ${c.spellbook ? `<section class="card"><h3>Spellbook</h3>${c.known.map((id) => spellCard(spellOf(id))).join('')}</section>` : ''}
    </div></div>`;
}

// ------------------------------------------------------------- roll requests
function requestCard(q, p) {
  const what = q.kind === 'initiative' ? 'Roll initiative' : q.kind === 'death' ? 'Death saving throw' : q.kind === 'save' ? `${ABN[q.ability]} saving throw` : q.skill ? `${skillName(q.skill)} check` : `${ABN[q.ability]} check`;
  const bonus = q.kind === 'initiative' ? p.mods.dex : q.kind === 'death' ? 0 : q.kind === 'save' ? R.saveBonus(p, q.ability) : q.skill ? R.skillBonus(p, q.skill, srd).bonus : p.mods[q.ability];
  const fx = R.selfEffects(p, q.kind === 'save' ? 'save' : 'check', q.ability);
  const advNow = ui.adv || q.adv || '';
  return `<section class="card ask${q.kind === 'death' ? ' danger' : ''}"><h3>${esc(what)}<span class="right"><span class="chip on">d20 ${sg(bonus)}</span></span></h3>
    ${q.reason ? `<p class="tale">${esc(q.reason)}</p>` : ''}
    ${fx.why.length ? `<div class="note hot">${fx.fail ? 'You fail this automatically' : `Your ${fx.adv && !fx.dis ? 'advantage' : 'disadvantage'}`}: ${esc(fx.why.join(', '))}.</div>` : ''}
    ${q.kind !== 'death' ? `<div class="row"><div class="seg">${[['', 'Normal'], ['adv', 'Advantage'], ['dis', 'Disadvantage']].map(([id, n]) => `<button class="${advNow === id ? 'on' : ''}" data-act="advset" data-v="${id}">${n}</button>`).join('')}</div><span class="small dim">if the DM or a feature says so</span></div>` : ''}
    <div class="row"><button class="btn primary big grow" data-act="roll" data-id="${q.id}">Roll</button>
      <input type="text" style="max-width:150px" data-k="own" data-bind="own" value="${esc(ui.own)}" placeholder="or my dice: 14" inputmode="numeric" title="Rolled real dice? Type what the d20 showed (two numbers with advantage)"></div></section>`;
}

// --------------------------------------------------------------- the play screen
function fightCard() {
  const f = state.fight;
  if (!f) return '';
  if (f.phase === 'initiative') return `<section class="card ask danger"><h3>Battle! Rolling initiative</h3><div class="small dim">Waiting for: ${esc(state.requests.filter((q) => q.kind === 'initiative').map((q) => (state.pcs[q.pcId] || {}).name).join(', ') || 'the DM')}</div>
    ${role === 'host' ? `<div class="order">${f.order.map((o) => `<div class="o"><input type="number" class="in" style="width:56px;min-height:26px;padding:2px 4px" data-init="${o.key}" value="${o.init ?? ''}" placeholder="?"><span class="grow">${esc(nameOfKey(o.key))}</span></div>`).join('')}</div><div class="small dim">Type initiatives rolled at the table, or let the Engine roll the rest.</div><button class="btn" data-act="fight.begin">Roll the rest and start</button>` : ''}</section>`;
  const cur = curKey();
  return `<section class="card${myTurn() ? ' ask turn' : ''}"><h3>Round ${f.round}<span class="right">${myTurn() ? '<span class="chip ok">Your turn</span>' : `<span class="chip">${esc(nameOfKey(cur))}'s turn</span>`}</span></h3>
    <div class="order">${f.order.map((o) => {
      const [kind, id] = o.key.split(':');
      const x = kind === 'pc' ? state.pcs[id] : state.foes[id];
      if (!x) return '';
      const dead = kind === 'pc' ? x.dead : x.dead;
      const hp = kind === 'pc' ? `${x.hp}/${x.maxHp}` : role === 'host' ? `${x.hp}/${x.maxHp}` : (x.health || '');
      const initCell = role === 'host' ? `<input type="number" class="in" style="width:52px;min-height:26px;padding:2px 4px" data-init="${o.key}" value="${o.init ?? ''}" title="Initiative (type the number rolled at the table)">` : `<span class="in">${kind === 'pc' ? o.init ?? '' : ''}</span>`;
      return `<div class="o${o.key === cur ? ' now' : ''}${dead ? ' dead' : ''}${kind === 'foe' ? ' enemy' : ''}">${initCell}<span class="nm grow">${esc(x.name)}</span><span class="small dim">${esc(hp)}</span>${(x.conds || []).length ? `<span class="small" style="color:var(--warn-c)">${esc(x.conds.join(', '))}</span>` : ''}</div>`;
    }).join('')}</div>
    ${myTurn() ? `<div class="row"><span class="small dim">Action ${state.fight.used.action ? '✓ used' : 'ready'} · Bonus ${state.fight.used.bonus ? '✓ used' : 'ready'}</span><button class="btn primary grow" data-act="endturn">End my turn</button></div>` : ''}
    ${role === 'host' ? '<div class="row"><button class="btn primary grow" data-act="fight.next">Next turn</button><button class="btn danger" data-act="fight.end">End fight</button></div>' : ''}</section>`;
}
function actionsCard(p) {
  if (!p || p.dead || p.hp <= 0) return '';
  const foes = foesHere().filter((f) => !f.dead && !f.hidden);
  const tgt = ui.target && foes.some((f) => `foe:${f.id}` === ui.target) ? ui.target : foes[0] ? `foe:${foes[0].id}` : '';
  const atkBtns = p.attacks.map((a) => `<button class="btn" data-act="attack" data-pc="${p.id}" data-a="${a.id}">${esc(a.name)} <span class="small" style="opacity:.75">${sg(a.hit)} · ${esc(a.dmg)}</span></button>`).join('');
  const smiteSlots = p.cls === 'paladin' && p.cast ? p.cast.slots.map((x, k) => ({ l: k + 1, left: x[0] - x[1] })).filter((x) => x.left > 0) : [];
  return `<section class="card"><h3>Attack</h3>
    ${foes.length ? `<div class="chips">${foes.map((f) => `<button class="chip${`foe:${f.id}` === tgt ? ' on' : ''}" data-act="target" data-ref="foe:${f.id}">⚔ ${esc(f.name)} <span class="faint">${esc(f.health || '')}</span></button>`).join('')}</div>` : '<div class="small faint">No monster on the table: the roll shows your total to hit and the damage, and the DM says whether it lands.</div>'}
    <div class="row">${atkBtns}</div>
    <div class="row">
      <div class="seg">${[['', 'Normal'], ['adv', 'Advantage'], ['dis', 'Disadvantage']].map(([id, n]) => `<button class="${ui.adv === id ? 'on' : ''}" data-act="advset" data-v="${id}">${n}</button>`).join('')}</div>
      ${p.sneak ? `<button class="chip${ui.sneak ? ' on' : ''}" data-act="sneak">Sneak Attack ${esc(p.sneak)}</button>` : ''}
      ${p.attacks.some((a) => a.versatile) ? `<button class="chip${ui.twoHanded ? ' on' : ''}" data-act="twohand">Two hands (versatile)</button>` : ''}
      ${smiteSlots.length ? `<select style="width:auto" data-k="smite" data-bind="smite"><option value="0">No smite</option>${smiteSlots.map((x) => `<option value="${x.l}" ${Number(ui.smite) === x.l ? 'selected' : ''}>Divine Smite (${R.ordinal(x.l)})</option>`).join('')}</select>` : ''}
    </div>
    ${p.resources.length ? `<div class="chips">${p.resources.filter((r) => ['rage', 'secondwind', 'surge', 'breath', 'layonhands', 'inspiration', 'ki', 'channel'].includes(r.id)).map((r) => `<button class="chip${r.used >= r.max ? '' : ' on'}" data-act="res.use" data-pc="${p.id}" data-id="${r.id}" ${r.used >= r.max && !(r.id === 'rage' && p.raging) ? 'disabled' : ''}>${r.id === 'rage' && p.raging ? 'End rage' : esc(r.name)} ${r.max - r.used}/${r.max}</button>`).join('')}</div>` : ''}
  </section>`;
}
function xpCard(p) {
  if (!p) return '';
  return `<section class="card"><h3>Experience<span class="right"><span class="chip on">${p.xp || 0} XP</span></span></h3>
    <div class="row nw"><input type="number" min="1" class="grow" data-k="xpadd" data-bind="xpAdd" value="${esc(ui.xpAdd || '')}" placeholder="XP the DM gave you"><button class="btn" data-act="xp.add" data-pc="${p.id}">Add</button></div>
    ${canLevel(p) ? '<button class="btn primary" data-act="tab" data-t="build">Level up</button>' : `<div class="small dim">${nextXp(p) != null ? `Level ${p.level + 1} at ${nextXp(p)} XP.` : ''}</div>`}</section>`;
}
function partyMini() {
  const pcs = Object.values(state.pcs);
  return `<section class="card"><h3>The party</h3>${pcs.map((p) => `<div class="row nw"><b class="grow">${esc(p.name)}</b><span class="small dim">${p.dead ? 'dead' : p.hp <= 0 ? (p.stable ? 'stable' : 'dying') : `${p.hp}/${p.maxHp}`}</span>${(p.conds || []).length ? `<span class="small" style="color:var(--warn-c)">${esc(p.conds.join(', '))}</span>` : ''}</div><div>${hpBar(p)}</div>`).join('') || '<div class="empty">Nobody yet.</div>'}
    ${foesHere().filter((f) => !f.hidden).length ? `<div class="fl dim small">Foes</div>${foesHere().filter((f) => !f.hidden).map((f) => `<div class="row nw"><span class="grow" style="color:var(--no)">${esc(f.name)}</span><span class="small dim">${esc(f.dead ? (f.fled ? 'fled' : 'down') : f.health || '')}</span></div>`).join('')}` : ''}
    ${state.quests.length ? `<div class="fl dim small">Quests</div>${state.quests.map((q) => `<div class="small${q.done ? ' faint' : ''}">${q.done ? '✓' : '•'} ${esc(q.text)}</div>`).join('')}` : ''}</section>`;
}
function sayBox() {
  return `<div class="row nw"><input type="text" class="grow" data-k="say" data-bind="say" value="${esc(ui.say)}" maxlength="1000" placeholder="Say or do something…">${talkButtonHtml()}<button class="btn primary" data-act="say">Send</button></div>${ui.talkAsk && !hearOk() && canHear() ? hearConsentHtml() : ''}`;
}
function playHtml() {
  const p = myPc();
  const reqs = myRequests();
  const lvl = canLevel(p) ? '<section class="card ask"><h3>Level up!</h3><div>You have enough experience for the next level.</div><button class="btn primary" data-act="tab" data-t="build">Level up now</button></section>' : '';
  return `<div class="lay-two">
    <div class="col">${reqs.map((q) => requestCard(q, p)).join('')}${storyCard({ input: sayBox() })}</div>
    <div class="col scroll" data-scroll="play2">${lvl}${fightCard()}${clocksCard()}
      ${p ? `<section class="card"><h3>${esc(p.name)}<span class="right"><span class="chip">AC ${p.ac}</span><span class="chip">${p.hp}/${p.maxHp} hp${p.tempHp ? ` +${p.tempHp}` : ''}</span></span></h3>${hpBar(p)}${deathHtml(p)}${condControls(p)}
        ${p.cast && p.cast.slots.some((x) => x[0]) ? `<div class="slots">${p.cast.slots.map(([m, u], k) => (m ? `<div class="slot"><span>${R.ordinal(k + 1)}</span><span class="pips">${Array.from({ length: m }, (_, n) => `<i class="pip${n < u ? ' used' : ''}"></i>`).join('')}</span></div>` : '')).join('')}</div>` : ''}</section>` : ''}
      ${actionsCard(p)}
      ${p && p.cast ? `<section class="card"><h3>Quick spells<span class="right"><button class="btn sm" data-act="tab" data-t="spells">All spells</button></span></h3>${castable(p).filter((s) => s.level === 0 || s.attack || s.save || s.heal || s.dmgSlot).slice(0, 8).map((s) => spellCard(s, { cast: castControls(p, s) })).join('')}</section>` : ''}
      ${partyMini()}
    </div></div>`;
}

function tableHtml() {
  const s = site();
  return `<div class="lay-two"><div class="col">${storyCard({ n: 80 })}</div>
    <div class="col scroll" data-scroll="t2"><section class="card"><h3>${esc(s.name)}<span class="right small dim">Day ${state.time.day}</span></h3><div class="small dim">${esc(s.region || '')}</div></section>
      ${fightCard()}${clocksCard()}${partyMini()}${rollsCard(12, 'Latest rolls')}
      ${info && info.addresses ? `<section class="card"><h3>Join this table</h3>${info.addresses.map((a) => `<div><b>http://${esc(a)}:${info.port}/player.html</b></div>`).join('')}${info.online ? `<div>From anywhere: <b>${esc(info.online)}</b></div>` : ''}</section>` : ''}</div></div>`;
}

// The adventure's own ready-made characters (The Ashen Crown has ten), else the builder's six.
const pregenList = () => (adv && Array.isArray(adv.pregens) && adv.pregens.length ? adv.pregens : PG.PREGENS);

// Characters a player can take over: nobody plays them, or their player has offered them.
const takeable = () => (state ? Object.values(state.pcs).filter((c) => !c.dead && !c.quick && (!c.playerId || c.open) && c.playerId !== pid) : []);
function takeoverHtml() {
  if (role !== 'player' || LOCAL || myPc()) return '';
  const list = takeable();
  if (!list.length) return '';
  return `<section class="card ask"><h3>Take over a character<span class="right small dim">${list.length} free</span></h3>
    <div class="small dim">Play one already in the party: the DM has been running them, or their player has offered them.</div>
    <div class="takeover">${list.map((c) => `<div class="pc-free"><div class="grow"><b>${esc(c.name)}</b> <span class="small dim">level ${c.level} ${esc(c.raceName || '')} ${esc(c.clsName || '')}</span>
      <div class="small">${c.hp}/${c.maxHp} hp · AC ${c.ac}${c.playerId ? ` · offered by ${esc((state.players[c.playerId] || {}).name || 'a player')}` : ' · played by the DM for now'}</div></div>
      <button class="btn primary" data-act="pc.take" data-id="${c.id}">Take over</button></div>`).join('')}</div>
    <div class="small dim">Or pick a ready-made hero below, or make your own.</div></section>`;
}
// Offering, stepping back from or handing back the character you play.
function seatCard(p) {
  if (role !== 'player' || LOCAL || !p) return '';
  const b = p.borrow;
  return `<section class="card"><h3>Your seat at the table</h3>
    ${b ? `<div class="small">You are playing ${esc(p.name)} for ${esc(b.name)}.</div>` : ''}
    <div class="row">${b ? `<button class="btn" data-act="pc.return">Hand ${esc(p.name)} back to ${esc(b.name)}</button>` : ''}
      <button class="btn${p.open ? ' on' : ''}" data-act="pc.open" title="Another player may take ${esc(p.name)} over; you keep playing until they do">${p.open ? 'Offered to the table ✓' : 'Offer to another player'}</button>
      <button class="btn ghost" data-act="pc.leave" title="Stop playing ${esc(p.name)}: the DM runs them until someone takes them over">Step back</button></div></section>`;
}

// Clocks: dangers and plans that fill up (the burning bridge, the invasion of Brindol).
function clockSvg(c) {
  const n = c.size; const r = 18; const cx = 22; const cy = 22;
  const seg = (k) => { const a0 = (k / n) * 2 * Math.PI - Math.PI / 2; const a1 = ((k + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const p = (a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    return `<path d="M${cx},${cy} L${p(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z" class="${k < c.filled ? 'on' : ''}"/>`; };
  return `<svg viewBox="0 0 44 44" class="clock-face${c.done ? ' full' : ''}" aria-hidden="true">${Array.from({ length: n }, (_, k) => seg(k)).join('')}</svg>`;
}
function clocksCard() {
  const host = role === 'host';
  const here = state && state.scene ? state.scene.siteId : '';
  // This place's clocks and the ones that run everywhere (the DM also sees those left elsewhere, below).
  const all = (state && state.clocks) || [];
  const list = all.filter((c) => !c.siteId || c.siteId === here || (host && !c.done));
  if (!list.length) return '';
  const placeName = (id) => ((adv.sites || []).find((x) => x.id === id) || {}).name || id;
  return `<section class="card"><h3>Clocks</h3><div class="clocks">${list.map((c) => `<div class="clock${c.done ? ' full' : ''}">${clockSvg(c)}<div class="grow"><b>${esc(c.name)}</b><div class="small dim">${c.filled} of ${c.size}${c.hidden ? ' · hidden from players' : ''}${c.siteId && c.siteId !== here ? ` · at ${esc(placeName(c.siteId))}` : ''}</div>${c.done && c.note ? `<div class="small">${esc(c.note)}</div>` : host && c.note ? `<div class="small faint">${esc(c.note)}</div>` : ''}</div>
    ${host ? `<span class="row nw"><button class="btn sm" data-act="clock.back" data-id="${c.id}" title="Take a segment off">−</button><button class="btn sm" data-act="clock.tick" data-id="${c.id}" title="Fill a segment">+</button><button class="btn sm ghost" data-act="clock.remove" data-id="${c.id}" title="Remove the clock">✕</button></span>` : ''}</div>`).join('')}</div></section>`;
}

// ------------------------------------------------------------------ the builder
const B = () => ui.build;
const saveDraft = () => store.set('dnd.build', JSON.stringify(ui.build));
function preview(input) { try { return R.derive(input, srd); } catch (e) { return null; } }
const STEPS = [['basics', '1 Race & class'], ['abilities', '2 Abilities'], ['skills', '3 Skills & background'], ['gear', '4 Equipment'], ['magic', '5 Spells'], ['review', '6 Review']];
function pickChips(list, chosen, max, act, extra = '') {
  const set = new Set(chosen);
  return `<div class="chips">${list.map((x) => `<button class="chip${set.has(x.id) ? ' on' : ''}" data-act="${act}" data-id="${x.id}" ${extra} ${!set.has(x.id) && set.size >= max ? 'disabled' : ''} ${x.title ? `title="${esc(x.title)}"` : ''}>${esc(x.name)}</button>`).join('')}</div>`;
}
function spellPicker(input, pv, ctx) {
  if (!pv || !pv.cast || pv.cast.kind === 'none') return '<div class="empty">This class does not cast spells at this level.</div>';
  const c = pv.cast;
  const cls = input.class;
  const sp = input.spells || {};
  const can = (lv) => srd.spells.filter((s) => s.classes.includes(cls) && (lv === 0 ? s.level === 0 : s.level >= 1 && s.level <= c.maxSlot));
  const toTitle = (s) => `${s.level ? `${R.ordinal(s.level)} level` : 'cantrip'}: ${s.desc.slice(0, 220)}…`;
  const asList = (arr) => arr.map((s) => ({ id: s.id, name: `${s.name}${s.level ? ` (${s.level})` : ''}`, title: toTitle(s) }));
  const parts = [];
  if (c.cantripsMax) parts.push(`<div class="fld"><span class="fl">Cantrips: ${(sp.cantrips || []).length} of ${c.cantripsMax}</span>${pickChips(asList(can(0)), sp.cantrips || [], c.cantripsMax, 'sp.pick', `data-list="cantrips" data-ctx="${ctx}"`)}</div>`);
  if (c.spellbook) parts.push(`<div class="fld"><span class="fl">Spellbook: ${(sp.known || []).length} of ${c.knownMax}</span>${pickChips(asList(can(1)), sp.known || [], c.knownMax, 'sp.pick', `data-list="known" data-ctx="${ctx}"`)}</div>`);
  if (c.kind === 'prepared') {
    const pool = c.spellbook ? can(1).filter((s) => (sp.known || []).includes(s.id)) : can(1);
    parts.push(`<div class="fld"><span class="fl">Prepared today: ${(sp.prepared || []).filter((id) => pool.some((s) => s.id === id)).length} of ${c.prepMax}</span>${pool.length ? pickChips(asList(pool), sp.prepared || [], c.prepMax, 'sp.pick', `data-list="prepared" data-ctx="${ctx}"`) : '<div class="small faint">Choose spellbook spells first.</div>'}</div>`);
  } else if (c.knownMax) parts.push(`<div class="fld"><span class="fl">Spells known: ${(sp.known || []).length} of ${c.knownMax}</span>${pickChips(asList(can(1)), sp.known || [], c.knownMax, 'sp.pick', `data-list="known" data-ctx="${ctx}"`)}</div>`);
  return parts.join('');
}
function buildHtml() {
  const p = myPc();
  if (p && !p.dead) return levelUpHtml(p);
  const b = B();
  const race = ix.race[b.race] || srd.races[0];
  const cls = ix.cls[b.class] || srd.classes[0];
  const pv = preview(b);
  const errs = R.validateInput(b, srd);
  let body = '';
  if (ui.buildStep === 'basics') {
    body = `<div class="fld"><span class="fl">Ready-made characters: pick one to play straight away, or change anything after</span><div class="pregens">${pregenList().map((x) => { const v = preview(PG.pregenBuild(x, srd)); return v ? `<button class="pregen${b.pregen === x.id ? ' on' : ''}" data-act="b.pregen" data-id="${x.id}" title="${esc(x.blurb)}"><b>${esc(x.input.name)}</b><span class="small">${esc(v.raceName)} ${esc(v.clsName)}</span><span class="row nw"><span class="chip">${esc(x.role)}</span>${x.hook ? `<span class="chip dim">${esc(x.hook)}</span>` : ''}</span><span class="small dim">${esc(x.blurb)}</span></button>` : ''; }).join('')}</div></div>
      <div class="fields">
      <label class="fld wide"><span class="fl">Character name</span><input type="text" data-k="b.name" data-bind="build.name" data-save="1" value="${esc(b.name)}" maxlength="40"></label>
      <label class="fld"><span class="fl">Race</span><select data-k="b.race" data-bind="build.race" data-save="1" data-live="1">${srd.races.map((r) => `<option value="${r.id}" ${r.id === b.race ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      ${race.subraces.length ? `<label class="fld"><span class="fl">Subrace</span><select data-k="b.sub" data-bind="build.subrace" data-save="1" data-live="1">${race.subraces.map((r) => `<option value="${r.id}" ${r.id === (b.subrace || race.subraces[0].id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : '<div></div>'}
      <label class="fld"><span class="fl">Class</span><select data-k="b.class" data-bind="build.class" data-save="1" data-live="1">${srd.classes.map((c) => `<option value="${c.id}" ${c.id === b.class ? 'selected' : ''}>${esc(c.name)} (d${c.hitDie})</option>`).join('')}</select></label>
      <label class="fld"><span class="fl">Alignment</span><select data-k="b.al" data-bind="build.alignment" data-save="1" data-live="1">${['', 'Lawful good', 'Neutral good', 'Chaotic good', 'Lawful neutral', 'Neutral', 'Chaotic neutral', 'Lawful evil', 'Neutral evil', 'Chaotic evil'].map((a) => `<option ${a === b.alignment ? 'selected' : ''} value="${a}">${a || 'Choose…'}</option>`).join('')}</select></label>
      ${b.race === 'dragonborn' ? `<label class="fld"><span class="fl">Draconic ancestry</span><select data-k="b.anc" data-bind="build.ancestry" data-save="1" data-live="1">${Object.entries(R.DRAGON_ANCESTRY).map(([k, v]) => `<option value="${k}" ${k === b.ancestry ? 'selected' : ''}>${cap(k)} (${v})</option>`).join('')}</select></label>` : ''}
      ${role === 'host' ? `<label class="fld"><span class="fl">Level</span><input type="number" min="1" max="20" data-k="b.lvl" data-bind="build.level" data-save="1" data-live="1" value="${b.level}"></label>` : ''}
      ${R.subclassLevel(b.class) <= (Number(b.level) || 1) ? `<label class="fld"><span class="fl">${esc((cls.subclasses[0] || {}).flavor || 'Subclass')}</span><select data-k="b.subc" data-bind="build.subclass" data-save="1" data-live="1"><option value="">Choose…</option>${cls.subclasses.map((s) => `<option value="${s.id}" ${s.id === b.subclass ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      ${R.styleLevel(b.class) && R.styleLevel(b.class) <= (Number(b.level) || 1) ? `<label class="fld"><span class="fl">Fighting style</span><select data-k="b.style" data-bind="build.style" data-save="1" data-live="1"><option value="">Choose…</option>${Object.entries(R.FIGHTING_STYLES).map(([k, v]) => `<option value="${k}" ${k === b.style ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>` : ''}
    </div>
    <details class="feature" open><summary>${esc(race.name)}</summary><p>${esc(race.age)}</p><p>${esc(race.sizeDesc)}</p>${race.traits.map((t) => `<p><b>${esc(t.name)}.</b> ${esc(t.desc)}</p>`).join('')}</details>
    <details class="feature"><summary>${esc(cls.name)} at 1st level</summary>${(cls.levels['1'].features || []).map((f) => `<p><b>${esc(f)}.</b> ${esc(cls.features[f] || '')}</p>`).join('')}<p><b>Saving throws:</b> ${cls.saves.map((a) => ABN[a]).join(', ')}. <b>Proficiencies:</b> ${esc(cls.profs.join(', '))}.</p></details>`;
  } else if (ui.buildStep === 'abilities') {
    const m = b.method;
    const spent = AB.reduce((s, a) => s + (R.POINT_COST[b.base[a]] ?? 99), 0);
    const bonus = (a) => (race.bonus[a] || 0) + (((race.subraces.find((x) => x.id === b.subrace) || race.subraces[0] || {}).bonus || {})[a] || 0) + ((b.raceChoice || []).includes(a) && !race.bonus[a] ? 1 : 0);
    body = `<div class="row"><div class="seg">${[['standard', 'Standard array'], ['pointbuy', 'Point buy'], ['manual', 'Rolled / manual']].map(([id, n]) => `<button class="${m === id ? 'on' : ''}" data-act="b.method" data-v="${id}">${n}</button>`).join('')}</div>
      ${m === 'pointbuy' ? `<span class="chip${spent > 27 ? ' no' : ' on'}">${27 - spent} points left</span>` : ''}${m === 'manual' ? '<button class="btn sm" data-act="b.roll4d6">Roll 4d6 drop lowest</button>' : ''}</div>
      <div class="fields six">${AB.map((a) => `<div class="fld"><span class="fl">${ABN[a]}</span>
        ${m === 'standard' ? `<select data-k="b.ab.${a}" data-abil="${a}">${R.STANDARD_ARRAY.map((v) => `<option ${Number(b.base[a]) === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`
          : m === 'pointbuy' ? `<div class="row nw"><button class="btn sm" data-act="b.pb" data-a="${a}" data-d="-1" ${b.base[a] <= 8 ? 'disabled' : ''}>−</button><b style="min-width:24px;text-align:center">${b.base[a]}</b><button class="btn sm" data-act="b.pb" data-a="${a}" data-d="1" ${b.base[a] >= 15 ? 'disabled' : ''}>+</button></div>`
            : `<input type="number" min="3" max="20" data-k="b.ab.${a}" data-abil="${a}" value="${b.base[a]}">`}
        <span class="small dim">${bonus(a) ? `${sg(bonus(a))} race → ` : ''}<b>${Number(b.base[a]) + bonus(a)}</b> (${sg(R.mod(Number(b.base[a]) + bonus(a)))})</span></div>`).join('')}</div>
      ${race.bonusChoice ? `<div class="fld"><span class="fl">${esc(race.name)}: +1 to ${race.bonusChoice} other abilities</span>${pickChips(AB.filter((a) => !race.bonus[a]).map((a) => ({ id: a, name: ABN[a] })), b.raceChoice || [], race.bonusChoice, 'b.list', 'data-list="raceChoice"')}</div>` : ''}
      <div class="note">${m === 'standard' ? 'Give each of 15, 14, 13, 12, 10 and 8 to one ability.' : m === 'pointbuy' ? 'Every score starts at 8. You have 27 points: 9 to 13 cost 1 each, 14 and 15 cost 2 each.' : 'Roll four six-sided dice for each ability and add the highest three, or type scores your DM allows.'} Put your best score in your class's main ability: ${esc(({ barbarian: 'Strength', bard: 'Charisma', cleric: 'Wisdom', druid: 'Wisdom', fighter: 'Strength or Dexterity', monk: 'Dexterity and Wisdom', paladin: 'Strength and Charisma', ranger: 'Dexterity and Wisdom', rogue: 'Dexterity', sorcerer: 'Charisma', warlock: 'Charisma', wizard: 'Intelligence' })[b.class] || '')}.</div>`;
  } else if (ui.buildStep === 'skills') {
    const bg = ix.bg[b.background];
    const fromBg = bg ? bg.skills : (b.bgSkills || []);
    body = `<div class="fld"><span class="fl">${esc(cls.name)} skills: choose ${cls.skillChoose}</span>${pickChips(cls.skillFrom.map((s) => ({ id: s, name: skillName(s), title: (ix.skill[s] || {}).desc })).filter((x) => !fromBg.includes(x.id)), (b.skills || []).filter((s) => !fromBg.includes(s)), cls.skillChoose, 'b.list', 'data-list="skills"')}</div>
      <div class="fld"><span class="fl">Background</span><div class="seg">${srd.backgrounds.map((x) => `<button class="${b.background === x.id ? 'on' : ''}" data-act="b.bg" data-v="${x.id}">${esc(x.name)}</button>`).join('')}<button class="${!bg ? 'on' : ''}" data-act="b.bg" data-v="">Custom</button></div></div>
      ${bg ? `<div class="note gold"><b>${esc(bg.name)}</b>: skills ${bg.skills.map(skillName).join(' and ')}, ${bg.languages} extra language${bg.languages > 1 ? 's' : ''}, ${bg.gold} gp. <b>${esc(bg.feature.name)}.</b> ${esc(bg.feature.desc.slice(0, 300))}…</div>`
        : `<div class="fld"><span class="fl">Custom background: choose 2 skills</span>${pickChips(srd.skills.map((s) => ({ id: s.id, name: s.name })).filter((x) => !(b.skills || []).includes(x.id)), b.bgSkills || [], 2, 'b.list', 'data-list="bgSkills"')}</div>`}
      ${(race.traits || []).some((t) => t.name === 'Skill Versatility') ? `<div class="fld"><span class="fl">Half-elf: 2 more skills</span>${pickChips(srd.skills.map((s) => ({ id: s.id, name: s.name })), b.raceSkills || [], 2, 'b.list', 'data-list="raceSkills"')}</div>` : ''}
      ${b.class === 'rogue' || (b.class === 'bard' && b.level >= 3) ? `<div class="fld"><span class="fl">Expertise: double proficiency in 2 of your skills</span>${pickChips((pv ? pv.skills : []).map((s) => ({ id: s, name: skillName(s) })), b.expertise || [], 2, 'b.list', 'data-list="expertise"')}</div>` : ''}
      <div class="fld"><span class="fl">Extra languages (comma separated)</span><input type="text" data-k="b.lang" data-langs="1" value="${esc((b.languages || []).join(', '))}" placeholder="Elvish, Dwarvish"></div>`;
  } else if (ui.buildStep === 'gear') {
    body = `${cls.kit.choices.map((ch, n) => `<div class="fld"><span class="fl">${esc(ch.desc)}</span><div class="seg">${ch.options.map((o, k) => `<button class="${Number((b.kit || [])[n] || 0) === k ? 'on' : ''}" data-act="b.kit" data-n="${n}" data-k2="${k}">${esc(o.label)}</button>`).join('')}</div>
        ${(ch.options[Number((b.kit || [])[n] || 0)] || { items: [] }).items.map(([id, q], k) => (String(id).startsWith('@') ? Array.from({ length: q }, (_, c) => `<select style="width:auto" data-kitpick="${n}:${k}" data-c="${c}">${R.categoryItems(srd, id).map((x) => `<option value="${x.id}" ${((b.kitPick || {})[`${n}:${k}`] || [])[c] === x.id ? 'selected' : ''}>${esc(x.name)}${x.dmg ? ` (${x.dmg} ${x.type})` : ''}</option>`).join('')}</select>`).join(' ') : '')).join('')}</div>`).join('')}
      ${cls.kit.fixed.length ? `<div class="note">Also: ${cls.kit.fixed.map(([id, q]) => `${q > 1 ? `${q} ` : ''}${(R.item(srd, id) || { name: id }).name}`).join(', ')}.</div>` : ''}
      ${pv ? `<div class="note gold">You will carry: ${esc(pv.inventory.map((x) => `${x.qty > 1 ? `${x.qty} ` : ''}${x.name}`).join(', '))}. AC ${pv.ac} (${esc(pv.acNote)}).</div>` : ''}`;
  } else if (ui.buildStep === 'magic') {
    body = spellPicker(b, pv, 'build') + ((race.traits || []).some((t) => t.name === 'High Elf Cantrip') || (race.subraces.find((x) => x.id === (b.subrace || (race.subraces[0] || {}).id)) || { traits: [] }).traits.some((t) => t.name === 'High Elf Cantrip')
      ? `<div class="fld"><span class="fl">High elf cantrip (one wizard cantrip)</span><select data-k="b.rc" data-racecantrip="1"><option value="">Choose…</option>${srd.spells.filter((s) => s.level === 0 && s.classes.includes('wizard')).map((s) => `<option value="${s.id}" ${(b.spells || {}).raceCantrip === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : '');
  } else {
    body = pv ? `<dl class="kv"><dt>Name</dt><dd>${esc(b.name || '—')}</dd><dt>Race and class</dt><dd>${esc(pv.raceName)} ${esc(pv.clsName)}, level ${pv.level}</dd><dt>Hit points</dt><dd>${pv.maxHp}</dd><dt>Armor Class</dt><dd>${pv.ac} (${esc(pv.acNote)})</dd><dt>Abilities</dt><dd>${AB.map((a) => `${a.toUpperCase()} ${pv.ab[a]} (${sg(pv.mods[a])})`).join(' · ')}</dd><dt>Skills</dt><dd>${esc(pv.skills.map(skillName).join(', '))}</dd><dt>Attacks</dt><dd>${esc(pv.attacks.map((a) => `${a.name} ${sg(a.hit)} (${a.dmg})`).join('; '))}</dd>${pv.cast ? `<dt>Spells</dt><dd>${esc([...pv.cast.cantrips, ...(pv.cast.kind === 'prepared' ? pv.cast.prepared : pv.cast.known)].map((id) => (spellOf(id) || {}).name).join(', ') || 'none chosen')}</dd>` : ''}</dl>` : '';
  }
  const stepIdx = STEPS.findIndex(([id]) => id === ui.buildStep);
  return `<div class="lay-two"><div class="col scroll" data-scroll="b1">${takeoverHtml()}<section class="card"><h3>Make a character<span class="right"><button class="btn sm" data-act="b.random" title="Fill every choice at random: race, class, scores, skills, gear and spells. Change anything you like after.">&#127922; Random fill</button><button class="btn sm ghost" data-act="b.reset">Start again</button></span></h3>
      <div class="seg">${STEPS.map(([id, n]) => `<button class="${ui.buildStep === id ? 'on' : ''}" data-act="b.step" data-v="${id}">${n}</button>`).join('')}</div>
      ${body}
      <div class="row">${stepIdx > 0 ? `<button class="btn" data-act="b.step" data-v="${STEPS[stepIdx - 1][0]}">Back</button>` : ''}<span class="grow"></span>${stepIdx < STEPS.length - 1 ? `<button class="btn primary" data-act="b.step" data-v="${STEPS[stepIdx + 1][0]}">Next</button>` : `<button class="btn primary big" data-act="b.create" ${errs.length ? 'disabled' : ''}>Create ${esc(b.name || 'character')}</button>`}</div>
      ${errs.length ? `<div class="note hot">${errs.map(esc).join('<br>')}</div>` : ''}</section></div>
    <div class="col scroll" data-scroll="b2">${pv ? sheetPreview(pv) : ''}</div></div>`;
}
function sheetPreview(pv) {
  return `<section class="card"><h3>${esc(pv.name || 'Your character')}<span class="right"><span class="chip">AC ${pv.ac}</span><span class="chip">${pv.maxHp} hp</span><span class="chip">Speed ${pv.speed}</span></span></h3>
    <div class="dim">Level ${pv.level} ${esc(pv.raceName)} ${esc(pv.clsName)}${pv.subclassName ? ` (${esc(pv.subclassName)})` : ''}</div>
    <div class="abil">${AB.map((a) => `<div class="tile"><div class="tl">${a.toUpperCase()}</div><div class="tv">${sg(pv.mods[a])}</div><div class="sc">${pv.ab[a]}</div></div>`).join('')}</div>
    <div class="small"><b>Saves:</b> ${pv.saves.map((a) => ABN[a]).join(', ')} · <b>Skills:</b> ${esc(pv.skills.map(skillName).join(', ') || 'none yet')}</div>
    <div class="small"><b>Attacks:</b> ${esc(pv.attacks.map((a) => `${a.name} ${sg(a.hit)} (${a.dmg} ${a.type})`).join('; '))}</div>
    ${pv.cast ? `<div class="small"><b>Spell save DC</b> ${pv.cast.dc} · <b>attack</b> ${sg(pv.cast.atk)} · <b>slots</b> ${pv.cast.slots.filter((x) => x[0]).map((x, k) => `${R.ordinal(k + 1)}: ${x[0]}`).join(', ') || 'none yet'}</div>` : ''}
    <div class="small"><b>Features:</b> ${esc(pv.features.map((f) => f.name).join(', '))}</div>
    <div class="small"><b>Traits:</b> ${esc(pv.traits.map((t) => t.name).join(', ') || 'none')}</div>
    <div class="small"><b>Languages:</b> ${esc(pv.langs.join(', '))}</div></section>`;
}

// Levelling up: the same choices with one more level, plus whatever the new level asks for.
function lvlInput(p) {
  const base = p.input;
  const next = p.level + 1;
  const L = ui.lvl;
  const cls = ix.cls[p.cls];
  const asiNow = (cls.levels[next] || {}).asi > (cls.levels[p.level] || {}).asi;
  const asi = [...(base.asi || [])];
  if (asiNow && L.asi.a) { const ab = {}; ab[L.asi.a] = (ab[L.asi.a] || 0) + 1; const second = L.asi.b || L.asi.a; ab[second] = (ab[second] || 0) + 1; asi.push({ level: next, ab }); }
  return { ...base, level: next, subclass: L.subclass || base.subclass || '', asi, spells: L.spells || base.spells || {}, style: L.style || base.style || '' };
}
function levelUpHtml(p) {
  if (!canLevel(p)) {
    return `<div class="stack"><section class="card"><h3>${esc(p.name)}</h3><div>Level ${p.level}. ${nextXp(p) != null ? `Level ${p.level + 1} at ${nextXp(p)} XP (you have ${p.xp || 0}).` : 'The highest level.'}</div>
      <div class="note">To make a new character, your current one must be retired by the DM (or fall in battle).</div></section>${sheetPreview(p)}</div>`;
  }
  if (!ui.lvl.spells) ui.lvl.spells = JSON.parse(JSON.stringify(p.input.spells || {}));
  const input = lvlInput(p);
  const pv = preview(input);
  const cls = ix.cls[p.cls];
  const next = p.level + 1;
  const asiNow = (cls.levels[next] || {}).asi > (cls.levels[p.level] || {}).asi;
  const subNow = R.subclassLevel(p.cls) === next || (R.subclassLevel(p.cls) <= next && !p.subclass);
  const newFeats = pv ? pv.features.filter((f) => f.level === next) : [];
  const needs = [];
  if (subNow && !input.subclass) needs.push('Choose your subclass.');
  if (asiNow && !ui.lvl.asi.a) needs.push('Choose your ability score improvement.');
  return `<div class="lay-two"><div class="col scroll" data-scroll="lv1"><section class="card ask"><h3>${esc(p.name)} reaches level ${next}</h3>
      ${pv ? `<div>Hit points: ${p.maxHp} → <b>${pv.maxHp}</b> (+${pv.maxHp - p.maxHp}). Proficiency bonus ${sg(pv.prof)}.</div>` : ''}
      ${newFeats.length ? newFeats.map((f) => `<details class="feature"><summary>${esc(f.name)}</summary><p>${esc(f.desc)}</p></details>`).join('') : '<div class="small dim">No new features at this level.</div>'}
      ${subNow ? `<label class="fld"><span class="fl">${esc((cls.subclasses[0] || {}).flavor || 'Subclass')}</span><select data-k="lvl.sub" data-bind="lvl.subclass" data-live="1"><option value="">Choose…</option>${cls.subclasses.map((s) => `<option value="${s.id}" ${s.id === input.subclass ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select><span class="small dim">${esc((cls.subclasses.find((s) => s.id === input.subclass) || cls.subclasses[0] || {}).desc || '')}</span></label>` : ''}
      ${asiNow ? `<div class="fields"><label class="fld"><span class="fl">Ability score improvement: +1</span><select data-k="lvl.a" data-bind="lvl.asi.a" data-live="1"><option value="">Choose…</option>${AB.map((a) => `<option value="${a}" ${ui.lvl.asi.a === a ? 'selected' : ''} ${p.ab[a] >= 20 ? 'disabled' : ''}>${ABN[a]} (${p.ab[a]})</option>`).join('')}</select></label>
        <label class="fld"><span class="fl">and another +1 (the same for +2)</span><select data-k="lvl.b" data-bind="lvl.asi.b" data-live="1"><option value="">Same ability</option>${AB.map((a) => `<option value="${a}" ${ui.lvl.asi.b === a ? 'selected' : ''} ${p.ab[a] >= 20 ? 'disabled' : ''}>${ABN[a]} (${p.ab[a]})</option>`).join('')}</select></label></div>` : ''}
      ${R.styleLevel(p.cls) === next ? `<label class="fld"><span class="fl">Fighting style</span><select data-k="lvl.style" data-bind="lvl.style" data-live="1"><option value="">Choose…</option>${Object.entries(R.FIGHTING_STYLES).map(([k, v]) => `<option value="${k}" ${k === ui.lvl.style ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>` : ''}
      ${pv && pv.cast ? `<div class="fl dim small">Spells</div>${spellPicker(input, pv, 'lvl')}` : ''}
      ${needs.length ? `<div class="note hot">${needs.join(' ')}</div>` : ''}
      <button class="btn primary big" data-act="lvl.go" ${needs.length ? 'disabled' : ''}>Reach level ${next}</button></section></div>
    <div class="col scroll" data-scroll="lv2">${pv ? sheetPreview(pv) : ''}</div></div>`;
}

// ------------------------------------------------------------------ the rules
function md(text) {
  // The SRD rules sections are Markdown: headings, bold, lists and simple tables.
  const lines = String(text || '').split('\n');
  let out = ''; let inTable = false; let list = false;
  const inline = (s) => esc(s).replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^\|/.test(l)) {
      if (/^\|[\s:-|]+\|$/.test(l)) continue;
      if (!inTable) { out += '<table>'; inTable = true; }
      out += `<tr>${l.split('|').slice(1, -1).map((c) => `<td>${inline(c.trim())}</td>`).join('')}</tr>`;
      continue;
    } else if (inTable) { out += '</table>'; inTable = false; }
    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    if (/^#+\s/.test(l)) { out += `<h4>${inline(l.replace(/^#+\s*/, ''))}</h4>`; continue; }
    if (l.trim()) out += `<p>${inline(l)}</p>`;
  }
  if (inTable) out += '</table>';
  if (list) out += '</ul>';
  return out;
}
function statBlockHtml(m, { add = false } = {}) {
  const abl = AB.map((a, k) => `<div><b>${a.toUpperCase()}</b>${m.ab[k]} (${sg(R.mod(m.ab[k]))})</div>`).join('');
  const line = (k, v) => (v ? `<p><b>${k}</b> ${esc(v)}</p>` : '');
  const acts = (list) => list.map((x) => `<p><b><i>${esc(x.n)}${x.use ? ` (${esc(x.use)})` : ''}.</i></b> ${esc(x.d)}</p>`).join('');
  return `<div class="statblock"><div class="nm">${esc(m.name)}</div><div class="ty">${esc(m.size)} ${esc(m.type)}${m.sub ? ` (${esc(m.sub)})` : ''}, ${esc(m.align)}</div><hr>
    <p><b>Armor Class</b> ${m.ac}${m.acNote ? ` (${esc(m.acNote)})` : ''}</p><p><b>Hit Points</b> ${m.hp} (${esc(m.hd)})</p><p><b>Speed</b> ${esc(m.speed)}</p><hr>
    <div class="ab">${abl}</div><hr>
    ${line('Saving Throws', Object.entries(m.saves).map(([a, v]) => `${cap(a)} ${sg(v)}`).join(', '))}${line('Skills', Object.entries(m.skills).map(([a, v]) => `${a} ${sg(v)}`).join(', '))}
    ${line('Damage Vulnerabilities', m.vuln.join(', '))}${line('Damage Resistances', m.res.join(', '))}${line('Damage Immunities', m.imm.join(', '))}${line('Condition Immunities', m.cimm.join(', '))}
    ${line('Senses', m.senses)}${line('Languages', m.lang)}<p><b>Challenge</b> ${R.crText(m.cr)} (${m.xp.toLocaleString()} XP) · <b>Proficiency</b> ${sg(m.pb)}</p><hr>
    ${acts(m.traits)}<div class="sec">Actions</div>${acts(m.actions)}${m.reactions ? `<div class="sec">Reactions</div>${acts(m.reactions)}` : ''}${m.legendary ? `<div class="sec">Legendary Actions</div>${acts(m.legendary)}` : ''}
    ${add ? `<div class="row"><input type="number" min="1" max="12" style="max-width:80px" data-k="add.count" data-bind="host.add.count" value="${ui.host.add.count}"><label class="row small"><input type="checkbox" data-bind="host.add.hidden" ${ui.host.add.hidden ? 'checked' : ''}> hidden</label><button class="btn primary" data-act="foe.add" data-m="${m.id}">Place here</button><button class="btn" data-act="enc.add" data-m="${m.id}">Add to encounter</button></div>` : ''}</div>`;
}
const COMP = [['spells', 'Spells'], ['conditions', 'Conditions'], ['rules', 'Rules'], ['items', 'Magic items'], ['gear', 'Equipment'], ['classes', 'Classes'], ['races', 'Races']];
function compendiumHtml() {
  const c = ui.comp;
  const cats = role === 'host' ? [...COMP, ['monsters', 'Monsters']] : COMP;
  const q = c.q.trim().toLowerCase();
  const hit = (x) => !q || x.name.toLowerCase().includes(q);
  let list = []; let detail = '';
  if (c.cat === 'spells') {
    list = srd.spells.filter((s) => hit(s) && (c.level === '' || String(s.level) === c.level) && (!c.cls || s.classes.includes(c.cls))).map((s) => ({ id: s.id, name: s.name, sub: s.level ? `${R.ordinal(s.level)}` : 'cantrip' }));
    const s = spellOf(c.sel);
    if (s) detail = `<div class="prose"><h4>${esc(s.name)}</h4><div class="dim">${s.level ? `${R.ordinal(s.level)}-level ${s.school.toLowerCase()}` : `${s.school} cantrip`}${s.ritual ? ' (ritual)' : ''}</div>
      <dl class="kv"><dt>Casting time</dt><dd>${esc(s.time)}</dd><dt>Range</dt><dd>${esc(s.range)}${s.area ? ` (${esc(s.area)})` : ''}</dd><dt>Components</dt><dd>${esc(s.comp)}${s.mat ? ` (${esc(s.mat)})` : ''}</dd><dt>Duration</dt><dd>${s.conc ? 'Concentration, ' : ''}${esc(s.dur)}</dd><dt>Classes</dt><dd>${esc(s.classes.map(cap).join(', '))}</dd></dl>${md(s.desc)}${s.higher ? `<p><b>At Higher Levels.</b> ${esc(s.higher)}</p>` : ''}</div>`;
  } else if (c.cat === 'conditions') {
    list = srd.conditions.filter(hit).map((x) => ({ id: x.id, name: x.name }));
    const x = ix.cond[c.sel]; if (x) detail = `<div class="prose"><h4>${esc(x.name)}</h4>${md(x.desc)}</div>`;
  } else if (c.cat === 'rules') {
    list = srd.rules.filter((r) => hit(r) || (q && r.text.toLowerCase().includes(q))).map((r) => ({ id: r.id, name: r.name }));
    const r = srd.rules.find((x) => x.id === c.sel); if (r) detail = `<div class="prose">${md(r.text)}</div>`;
  } else if (c.cat === 'items') {
    list = srd.magicItems.filter(hit).map((x) => ({ id: x.id, name: x.name, sub: x.rarity }));
    const x = ix.magic[c.sel]; if (x) detail = `<div class="prose"><h4>${esc(x.name)}</h4><div class="dim">${esc(x.cat)}, ${esc(x.rarity)}</div>${md(x.desc)}</div>`;
  } else if (c.cat === 'gear') {
    const all = [...srd.weapons.map((w) => ({ ...w, k: 'w' })), ...srd.armor.map((a) => ({ ...a, k: 'a' })), ...srd.gear.map((g) => ({ ...g, k: 'g' }))];
    list = all.filter(hit).map((x) => ({ id: x.id, name: x.name, sub: x.cost }));
    const x = all.find((y) => y.id === c.sel);
    if (x) detail = `<div class="prose"><h4>${esc(x.name)}</h4><dl class="kv"><dt>Cost</dt><dd>${esc(x.cost)}</dd><dt>Weight</dt><dd>${x.weight} lb.</dd>${x.k === 'w' ? `<dt>Damage</dt><dd>${esc(x.dmg)} ${esc(x.type)}${x.versatile ? ` (versatile ${esc(x.versatile)})` : ''}</dd><dt>Kind</dt><dd>${esc(x.cat)} ${esc(x.range.toLowerCase())} weapon</dd><dt>Properties</dt><dd>${esc(x.props.join(', ') || 'none')}${x.reach ? `, range ${esc(x.reach)} ft.` : ''}${x.thrown ? `, thrown ${esc(x.thrown)} ft.` : ''}</dd>` : ''}${x.k === 'a' ? `<dt>Armor Class</dt><dd>${x.cat === 'Shield' ? '+2' : x.ac}${x.dex ? ` + Dex modifier${x.max != null ? ` (max ${x.max})` : ''}` : ''}</dd><dt>Kind</dt><dd>${esc(x.cat)}</dd>${x.str ? `<dt>Strength</dt><dd>${x.str}</dd>` : ''}${x.stealth ? '<dt>Stealth</dt><dd>Disadvantage</dd>' : ''}` : ''}</dl>${x.desc ? md(x.desc) : ''}${x.contents ? `<p>Contains: ${esc(x.contents.join(', '))}.</p>` : ''}</div>`;
  } else if (c.cat === 'classes') {
    list = srd.classes.filter(hit).map((x) => ({ id: x.id, name: x.name, sub: `d${x.hitDie}` }));
    const x = ix.cls[c.sel];
    if (x) detail = `<div class="prose"><h4>${esc(x.name)}</h4><p><b>Hit die</b> d${x.hitDie} · <b>Saves</b> ${x.saves.map((a) => ABN[a]).join(', ')} · <b>Skills</b> choose ${x.skillChoose} from ${esc(x.skillFrom.map(skillName).join(', '))}</p><p><b>Proficiencies</b> ${esc(x.profs.join(', '))}</p>
      <table><tr><td><b>Level</b></td><td><b>Prof.</b></td><td><b>Features</b></td>${x.casting ? '<td><b>Slots</b></td>' : ''}</tr>${Array.from({ length: 20 }, (_, k) => { const L = x.levels[k + 1] || {}; return `<tr><td>${k + 1}</td><td>${sg(L.prof || 2)}</td><td>${esc((L.features || []).join(', '))}</td>${x.casting ? `<td>${(L.slots || []).filter(Boolean).join('/')}</td>` : ''}</tr>`; }).join('')}</table>
      ${Object.entries(x.features).map(([n, d]) => `<details class="feature"><summary>${esc(n)}</summary>${md(d)}</details>`).join('')}</div>`;
  } else if (c.cat === 'races') {
    list = srd.races.filter(hit).map((x) => ({ id: x.id, name: x.name }));
    const x = ix.race[c.sel];
    if (x) detail = `<div class="prose"><h4>${esc(x.name)}</h4><p><b>Ability scores</b> ${Object.entries(x.bonus).map(([a, v]) => `${ABN[a]} ${sg(v)}`).join(', ')}${x.bonusChoice ? `, and +1 to ${x.bonusChoice} others` : ''} · <b>Speed</b> ${x.speed} ft. · <b>Size</b> ${esc(x.size)}</p><p>${esc(x.age)}</p><p>${esc(x.alignment)}</p><p>${esc(x.sizeDesc)}</p><p>${esc(x.langDesc)}</p>${x.traits.map((t) => `<p><b>${esc(t.name)}.</b> ${esc(t.desc)}</p>`).join('')}${x.subraces.map((s) => `<h4>${esc(s.name)}</h4><p>${esc(s.desc)}</p>${s.traits.map((t) => `<p><b>${esc(t.name)}.</b> ${esc(t.desc)}</p>`).join('')}`).join('')}</div>`;
  } else if (c.cat === 'monsters') {
    list = srd.monsters.filter(hit).map((x) => ({ id: x.id, name: x.name, sub: `CR ${R.crText(x.cr)}` }));
    const x = ix.monster[c.sel]; if (x) detail = statBlockHtml(x, { add: role === 'host' });
  }
  return `<div class="lay-list"><section class="card"><h3>Rules (SRD 5.1)</h3>
      <div class="chips">${cats.map(([id, n]) => `<button class="chip${c.cat === id ? ' on' : ''}" data-act="comp.cat" data-v="${id}">${n}</button>`).join('')}</div>
      <input type="search" data-k="comp.q" data-bind="comp.q" data-live="1" value="${esc(c.q)}" placeholder="Search…">
      ${c.cat === 'spells' ? `<div class="row nw"><select data-bind="comp.level" data-live="1"><option value="">Any level</option>${Array.from({ length: 10 }, (_, k) => `<option value="${k}" ${c.level === String(k) ? 'selected' : ''}>${k ? R.ordinal(k) : 'Cantrip'}</option>`).join('')}</select><select data-bind="comp.cls" data-live="1"><option value="">Any class</option>${srd.classes.filter((x) => x.casting).map((x) => `<option value="${x.id}" ${c.cls === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div>` : ''}
      <div class="scroll list" data-scroll="comp" style="flex:1">${list.slice(0, 400).map((x) => `<button class="li${c.sel === x.id ? ' on' : ''}" data-act="comp.sel" data-id="${x.id}">${esc(x.name)}${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('') || '<div class="empty">Nothing matches.</div>'}</div></section>
    <section class="card"><div class="scroll" data-scroll="compd" style="flex:1">${detail || '<div class="empty">Choose something on the left.</div>'}</div>
      <div class="small faint">${esc(srd.attribution)}</div></section></div>`;
}

// -------------------------------------------------------------------- dice
function diceTabHtml() {
  const p = myPc();
  return `<div class="lay-two"><div class="col"><section class="card"><h3>Roll dice</h3>
      <div class="row">${['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100', '2d6', '4d6'].map((d) => `<button class="btn" data-act="dice.quick" data-d="${d}">${d}</button>`).join('')}</div>
      <div class="row nw"><input type="text" class="grow" data-k="dice.expr" data-bind="dice.expr" value="${esc(ui.dice.expr)}" placeholder="2d6+3"><input type="text" class="grow" data-k="dice.label" data-bind="dice.label" value="${esc(ui.dice.label)}" placeholder="What for (optional)"><button class="btn primary" data-act="dice.roll">Roll</button></div>
      ${role === 'host' ? '<label class="row small"><input type="checkbox" data-bind="dice.secret" ' + (ui.dice.secret ? 'checked' : '') + '> Secret (players see nothing)</label>' : ''}
      ${p ? `<div class="fld"><span class="fl">A check or save for ${esc(p.name)}</span><div class="row nw"><select data-bind="freeRoll.what" data-live="1">${srd.skills.map((s) => `<option value="skill:${s.id}" ${ui.freeRoll.what === `skill:${s.id}` ? 'selected' : ''}>${esc(s.name)} check</option>`).join('')}${AB.map((a) => `<option value="check:${a}" ${ui.freeRoll.what === `check:${a}` ? 'selected' : ''}>${ABN[a]} check</option><option value="save:${a}" ${ui.freeRoll.what === `save:${a}` ? 'selected' : ''}>${ABN[a]} save</option>`).join('')}</select>
        <div class="seg">${[['', 'Normal'], ['adv', 'Adv'], ['dis', 'Dis']].map(([id, n]) => `<button class="${ui.freeRoll.adv === id ? 'on' : ''}" data-act="free.adv" data-v="${id}">${n}</button>`).join('')}</div><button class="btn primary" data-act="free.go">Roll</button></div></div>` : ''}
    </section></div><div class="col">${rollsCard(60)}</div></div>`;
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
  const story = storyCard({ input: `<div class="row"><input type="text" class="grow" data-k="dir.narrate" data-bind="dir.narrate" value="${esc(ui.dir.narrate)}" maxlength="2000" placeholder="Narrate something yourself, as the Director"><button class="btn" data-act="d.narrate">Narrate</button></div>` });
  const last = d.last;
  const provs = d.providers || [];
  const pv = provs.find((x) => x.id === d.provider) || { id: 'gemini', name: 'Google Gemini', key: 'required', group: 'cloud', hint: '', base: '' };
  const phase = { idle: 'Waiting for the players', thinking: 'Thinking…', proposal: 'Waiting for your approval', error: 'Stopped on a problem' }[d.phase] || '';
  const settings = `<section class="card fill"><h3>The AI Director<span class="right"><span class="chip${d.phase === 'error' ? ' no' : d.on ? ' ok' : ''}">${d.mode === 'off' ? 'Off' : esc(phase)}</span></span></h3>
    <div class="scroll" data-scroll="dset" style="display:flex;flex-direction:column;gap:12px">
      <div class="fld"><span class="fl">Who runs the table</span>
        <div class="seg">${[['off', 'Off: a person'], ['copilot', 'Co-pilot: you approve'], ['auto', 'Auto: it runs']].map(([id, name]) => `<button class="${d.mode === id ? 'on' : ''}" data-act="d.mode" data-id="${id}">${name}</button>`).join('')}</div>
        <span class="small dim">${d.mode === 'auto' ? 'The Director answers the players by itself. A turn that fails the leak check is still held for you.' : d.mode === 'copilot' ? 'The Director prepares each turn and nothing reaches the table until you approve it.' : 'The AI is off. Run the table yourself from the Run tab.'}</span></div>
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
        <div class="seg">${[['default', 'Model default'], ['medium', 'Medium'], ['low', 'Low'], ['off', 'Off']].map(([id, name]) => `<button class="${(d.thinkingLevel || 'default') === id ? 'on' : ''}" data-act="d.think" data-id="${id}" aria-pressed="${(d.thinkingLevel || 'default') === id}">${name}</button>`).join('')}</div>
        <span class="small dim">Some local models reason silently before answering, which costs seconds on every turn. Off is fastest and may cost some accuracy. If your server does not know the setting, it is ignored.</span></div>` : ''}
      <hr class="sep">
      <div class="fld"><span class="fl">Ask for a turn now</span>
        <div class="row"><input type="text" class="grow" data-k="dir.note" data-bind="dir.note" value="${esc(ui.dir.note)}" maxlength="400" placeholder="Optional note to the Director, for example: open the scene">${d.thinking
          ? `<button class="btn alert" data-act="d.cancel" title="Stop this turn. Nothing it has worked out is kept.">Stop thinking</button><button class="btn primary" data-act="d.restart" title="Stop this turn and start a new one with the same note.">Restart</button>`
          : `<button class="btn primary" data-act="d.run" ${d.mode === 'off' || !d.usable || !d.model ? 'disabled' : ''}>Take a turn</button>`}</div>
        <span class="small dim">In Co-pilot and Auto, the Director also takes a turn by itself after a player speaks, rolls, attacks, casts or ends a turn.</span></div>
      ${last ? `<div><div class="fl dim small">ITS LAST TURN · ${(last.ms / 1000).toFixed(1)} s · ${last.usage.in + last.usage.out} tokens</div>
        <div class="receipt">${last.calls.map(toolLine).join('') || '<div class="ln"><span>Narration only.</span></div>'}</div>
        ${last.flags.map((f) => `<div class="note">${esc(f.text)}</div>`).join('')}</div>` : ''}
      ${d.totals && d.totals.turns ? `<div class="small faint">This session: ${d.totals.turns} turns, ${d.totals.in} tokens in, ${d.totals.out} tokens out.</div>` : ''}
    </div></section>`;
  return `<div class="lay-two"><div style="display:flex;flex-direction:column;gap:12px;min-height:0">${proposal}${story}</div>${settings}</div>`;
}


const MY_SUPABASE = 'https://rqxejhkatenyytjqpuzy.supabase.co';
async function savesOp(body) {
  const S = ui.saves;
  S.busy = true;
  render();
  let out = { ok: false, error: 'Cannot reach the Director host.' };
  try {
    const res = await fetch('/api/saves', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, ...body }) });
    out = await res.json();
  } catch (e) { /* reported below */ }
  S.busy = false;
  if (out.slots) S.slots = out.slots;
  if (out.cloud) { S.cloud = out.cloud; if (!S.url) S.url = out.cloud.url || MY_SUPABASE; }
  if (out.cloudSlots) S.cloudSlots = out.cloudSlots;
  if (!out.ok) toast(out.error || 'That did not work.');
  render();
  return out;
}
const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso || ''; } };
function savesHtml() {
  const S = ui.saves;
  if (S.slots === null && !S.busy) setTimeout(() => savesOp({ op: 'list' }), 0);
  const st = site();
  if (!S.name) S.name = `${adv.name} · ${st.name}`;
  const slotsList = (S.slots || []).map((x) => {
    const sureLoad = S.sure === `load:${x.id}`;
    const sureDel = S.sure === `del:${x.id}`;
    return `<div class="row slotrow"><div class="grow"><b>${esc(x.name)}</b>${x.auto ? ' <span class="chip">autosave</span>' : ''}${x.cloud ? ' <span class="chip ok" title="A copy is in Supabase">backed up</span>' : ''}
        <div class="small dim">${esc(x.vector || '')}${x.site ? ` · ${esc(x.site)}` : ''}${x.players ? ` · ${esc(x.players)}` : ''}</div><div class="small faint">${esc(when(x.savedAt))}</div></div>
      <div class="row">${sureLoad ? `<button class="btn sm primary" data-act="sv.load" data-id="${esc(x.id)}">Yes, load it</button><button class="btn sm" data-act="sv.sure" data-id="">Cancel</button>`
        : sureDel ? `<button class="btn sm danger" data-act="sv.del" data-id="${esc(x.id)}">Yes, delete</button><button class="btn sm" data-act="sv.sure" data-id="">Cancel</button>`
          : `<button class="btn sm" data-act="sv.sure" data-id="load:${esc(x.id)}">Load</button><button class="btn sm" data-act="sv.sure" data-id="del:${esc(x.id)}">Delete</button>`}</div></div>`;
  }).join('');
  const C = S.cloud || {};
  const status = !C.configured ? '<span class="chip">not set up</span>' : C.status === 'ok' ? `<span class="chip ok">working${C.at ? `, last copy ${esc(when(C.at))}` : ''}</span>` : C.status === 'error' ? '<span class="chip warn">not working</span>' : '<span class="chip">set up, not tested</span>';
  const cloudRows = (S.cloudSlots || []).map((x) => `<div class="row slotrow"><div class="grow"><b>${esc(x.name)}</b><div class="small dim">${esc(x.vector || '')}${x.site ? ` · ${esc(x.site)}` : ''}</div><div class="small faint">${esc(when(x.savedAt))}</div></div>
    <div class="row"><button class="btn sm" data-act="sv.restore" data-id="${esc(x.id)}" title="Bring this copy onto this computer as a saved game">Bring back</button></div></div>`).join('');
  return `<div class="lay-two">
    <section class="card fill"><h3>Saved games<span class="right">${S.busy ? '<span class="small dim">Working…</span>' : ''}</span></h3>
      <div class="row"><input type="text" class="grow" data-k="sv.name" data-bind="saves.name" value="${esc(S.name)}" maxlength="60" placeholder="A name for this save"><button class="btn primary" data-act="sv.save" ${S.busy ? 'disabled' : ''}>Save this game</button></div>
      <p class="small dim">Saves stay on this computer. The same name saves over the old one. An autosave of each game is kept every five minutes while you play. Loading a game replaces the one on the table; Undo brings it back.</p>
      <div class="scroll" data-scroll="slots">${S.slots === null ? '<div class="dim">Reading the saves…</div>' : slotsList || '<div class="empty">No saved games yet.</div>'}</div>
    </section>
    <section class="card fill"><h3>Backup copy in Supabase<span class="right">${status}</span></h3>
      <p class="small dim">Every save, and the autosave, is copied to your Supabase project, so a game survives this computer. The copies go to one table only the secret key can open. Supabase's free plan pauses a project after 7 days without use and keeps no backups of its own: open the dashboard now and then.</p>
      <label class="fld"><span class="fl">Project address</span><input type="text" data-k="sv.url" data-bind="saves.url" value="${esc(S.url || MY_SUPABASE)}" placeholder="https://your-project.supabase.co"></label>
      <label class="fld"><span class="fl">Secret key ${C.keySet ? '(saved on this computer; paste a new one to change it)' : ''}</span><input type="password" data-k="sv.key" data-bind="saves.key" value="${esc(S.key)}" placeholder="${C.keySet ? '••••••••' : 'sb_secret_… from Project Settings, API Keys'}" autocomplete="off"></label>
      <div class="row"><button class="btn primary" data-act="sv.cfg" ${S.busy ? 'disabled' : ''}>Save and test</button><button class="btn" data-act="sv.pushAll" ${!C.configured || S.busy ? 'disabled' : ''}>Copy all saves now</button><button class="btn" data-act="sv.cloud" ${!C.configured || S.busy ? 'disabled' : ''}>Show the backups</button></div>
      ${C.error ? `<div class="note warn small">${esc(C.error)}</div>` : ''}
      ${S.cloudSlots ? `<div class="fl dim small">IN SUPABASE</div><div class="scroll" data-scroll="cloud">${cloudRows || '<div class="empty">No copies yet.</div>'}</div>` : ''}
    </section></div>`;
}


// ------------------------------------------------------------------ voice
function voiceCard() {
  const hv = (adv && adv.voice) || null;
  if (!hv) return '<section class="card"><div class="empty">Voice settings are on the host computer\'s Director only.</div></section>';
  const v = ui.voice;
  if (!v.loaded) {
    Object.assign(v, { outScreen: hv.out.screenVoice || 'gb-male', outEngine: hv.out.engine, outUrl: hv.out.url, outModel: hv.out.model, outVoice: hv.out.voice, outSpeed: String(hv.out.speed), inEngine: hv.in.engine, inUrl: hv.in.url, inModel: hv.in.model, inLang: hv.in.language, loaded: true });
  }
  const seg = (act, cur, opts) => `<div class="seg">${opts.map(([id, name]) => `<button class="${cur === id ? 'on' : ''}" data-act="${act}" data-id="${id}">${name}</button>`).join('')}</div>`;
  const f = (label, bind, val, ph = '', type = 'text') => `<label class="fld"><span class="fl">${label}</span><input type="${type}" data-k="${bind}" data-bind="${bind}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"></label>`;
  return `<section class="card"><h3>Voice<span class="right"><span class="chip">${hv.out.engine === 'server' ? 'Speech server' : 'Each screen\'s own voice'}</span></span></h3>
    <div class="stack-in" style="display:flex;flex-direction:column;gap:10px">
      <div class="fld"><span class="fl">The Director speaks with</span>${seg('v.out', v.outEngine, [['browser', 'Each screen\'s own voice'], ['server', 'A speech server']])}
        <span class="small dim">The table screen reads the narration aloud; phones and this screen have a Read aloud switch of their own. A speech server (for example Kokoro on this computer) gives one steady voice everywhere and keeps working on a phone with no voice installed. Only the Director's narration is ever sent to it.</span></div>
      ${v.outEngine === 'browser' ? `<div class="fld"><span class="fl">Which of the screen's voices</span>${seg('v.screen', v.outScreen, [['gb-male', 'British man'], ['gb-female', 'British woman'], ['us-male', 'American man'], ['us-female', 'American woman'], ['any', 'Screen default']])}
        <span class="small dim">Each screen picks the closest voice it has installed. Windows has "George" or "Ryan"; Macs and iPhones have "Daniel"; Chrome has "Google UK English Male". If a screen has no British man, it falls back to the nearest English voice.</span></div>` : ''}
      ${v.outEngine === 'server' ? `${f('Speech server address', 'voice.outUrl', v.outUrl, 'http://localhost:8880/v1')}${f(hv.out.keySet ? 'API key · saved on this computer' : 'API key (only if the server asks for one)', 'voice.outKey', v.outKey, hv.out.keySet ? 'Paste a new key to replace the saved one' : '', 'password')}
      <div class="row">${f('Model', 'voice.outModel', v.outModel)}<label class="fld"><span class="fl">Voice</span><input type="text" list="kokoro-voices" data-k="voice.outVoice" data-bind="voice.outVoice" value="${esc(v.outVoice)}" autocomplete="off" spellcheck="false"><datalist id="kokoro-voices"><option value="bm_fable">British man, warm storyteller</option><option value="bm_george">British man, deeper</option><option value="bm_lewis">British man, brisk</option><option value="bm_daniel">British man, plain</option><option value="bf_emma">British woman</option><option value="am_michael">American man</option><option value="af_heart">American woman</option></datalist></label>${f('Speed', 'voice.outSpeed', v.outSpeed)}</div>` : ''}
      <div class="fld"><span class="fl">Players' Talk button listens with</span>${seg('v.in', v.inEngine, [['browser', 'The phone\'s own recognition'], ['server', 'A speech server']])}
        <span class="small dim">Each player agrees to this the first time they tap Talk, and the screen tells them where their voice goes. A phone's own recognition is done by Google or Apple. A speech server (for example Whisper on this computer) keeps it on your own network.</span></div>
      ${v.inEngine === 'server' ? `${f('Speech-to-text address', 'voice.inUrl', v.inUrl, 'http://localhost:8000/v1')}${f(hv.in.keySet ? 'API key · saved on this computer' : 'API key (only if the server asks for one)', 'voice.inKey', v.inKey, hv.in.keySet ? 'Paste a new key to replace the saved one' : '', 'password')}
      <div class="row">${f('Model', 'voice.inModel', v.inModel)}${f('Language', 'voice.inLang', v.inLang)}</div>` : ''}
      <div class="row"><button class="btn primary" data-act="v.save">Save voice settings</button></div>
    </div></section>`;
}

function voiceTabHtml() {
  return `<div class="lay-two"><div class="col scroll" data-scroll="vo1">${voiceCard()}</div>
    <div class="col"><section class="card"><h3>On this screen</h3>
      <div class="row"><button class="btn${ui.readAloud ? ' primary' : ''}" data-act="readaloud">${ui.readAloud ? 'Reading the narration aloud' : 'Read the narration aloud'}</button><button class="btn" data-act="v.test">Test the voice</button></div>
      <div class="note">Every screen has its own Read aloud switch (on the story card). The table screen starts with it on. A phone or browser will not make a sound until it has been tapped once.</div></section></div></div>`;
}

// ------------------------------------------------------------------ the DM's console
function foeCard(f) {
  const m = ix.monster[f.mid];
  const F = ui.host.foe[f.id] || {};
  const pcs = Object.values(state.pcs).filter((p) => !p.dead);
  const tgt = F.target || (pcs[0] ? pcs[0].id : '');
  const acts = m ? [...m.actions, ...(m.reactions || []), ...(m.legendary || [])] : [];
  const now = curKey() === `foe:${f.id}`;
  return `<div class="foe${f.dead ? ' down' : ''}${f.hidden ? ' hidden' : ''}${now ? ' now' : ''}">
    <div class="row nw"><b class="grow" style="color:var(--no)">${esc(f.name)}</b><span class="small dim">AC ${f.ac} · CR ${R.crText(f.cr)}</span>${f.hidden ? '<span class="chip">hidden</span>' : ''}${f.dead ? `<span class="chip">${f.fled ? 'fled' : 'down'}</span>` : ''}
      <details style="position:relative"><summary class="small">more</summary><div class="row" style="margin-top:4px"><button class="btn sm" data-act="foe.flee" data-id="${f.id}">Flees</button><button class="btn sm danger" data-act="foe.rm" data-id="${f.id}">Remove</button>${f.hidden ? `<button class="btn sm" data-act="foe.reveal1" data-id="${f.id}">Reveal</button>` : ''}<button class="btn sm" data-act="comp.go" data-cat="monsters" data-id="${f.mid}">Stat block</button></div></details></div>
    <div class="hpbar"><i class="${hpClass(f.hp, f.maxHp)}" style="width:${Math.max(0, f.hp / Math.max(1, f.maxHp) * 100)}%"></i></div>
    <div class="row nw"><span class="small"><b>${f.hp}</b>/${f.maxHp} hp</span><input type="number" min="0" style="max-width:76px;min-height:28px" data-bind="host.foe.${f.id}.amt" data-k="famt.${f.id}" value="${esc(F.amt ?? '')}" placeholder="0"><button class="btn sm danger" data-act="foe.hp" data-id="${f.id}" data-op="damage">Damage</button><button class="btn sm good" data-act="foe.hp" data-id="${f.id}" data-op="heal">Heal</button></div>
    ${f.note ? `<div class="small faint">${esc(f.note)}</div>` : ''}
    ${!f.dead && m ? `<div class="row nw"><span class="small dim">Target</span><select style="min-height:28px" data-bind="host.foe.${f.id}.target" data-live="1">${pcs.map((p) => `<option value="${p.id}" ${p.id === tgt ? 'selected' : ''}>${esc(p.name)} (AC ${p.ac})</option>`).join('')}</select></div>
      <div class="chips">${acts.map((a) => `<button class="chip${a.hit != null || a.dc ? ' on' : ''}" data-act="foe.act" data-id="${f.id}" data-a="${esc(a.n)}" title="${esc(a.d)}" ${f.spent && f.spent[a.n] ? 'disabled' : ''}>${esc(a.n)}${a.hit != null ? ` ${sg(a.hit)}` : a.dc ? ` DC ${a.dc[1]}` : ''}${a.use ? ` · ${esc(a.use)}` : ''}</button>`).join('')}</div>` : ''}
    ${condControls(f, 'foe')}</div>`;
}
function hostSceneCard() {
  const s = site();
  return `<section class="card"><h3>${esc(s.name)}<span class="right small dim">Day ${state.time.day}, ${String(Math.floor(state.time.hour)).padStart(2, '0')}:00</span></h3>
    ${s.read ? `<details class="feature" ${state.story.some((e) => e.kind === 'narration' && e.site === s.id) ? '' : 'open'}><summary>Read aloud</summary><p class="tale" style="color:var(--ink)">${esc(s.read)}</p><button class="btn sm" data-act="h.readout">Narrate this</button></details>` : ''}
    ${s.notes ? `<details class="feature" open><summary>DM notes</summary><p>${esc(s.notes)}</p></details>` : ''}
    ${(s.npcs || []).length ? `<details class="feature"><summary>People (${s.npcs.length})</summary>${s.npcs.map((n) => `<p><b>${esc(n.name)}</b>, ${esc(n.who)}. <i>${esc(n.voice)}.</i> Wants: ${esc(n.wants)}</p>`).join('')}</details>` : ''}
    ${(s.checks || []).length ? `<details class="feature"><summary>Checks (${s.checks.length})</summary>${s.checks.map((c, n) => `<p><b>${esc(skillName(c.skill))} DC ${c.dc}:</b> ${esc(c.find)} <button class="btn sm" data-act="h.askcheck" data-n="${n}">Ask</button></p>`).join('')}</details>` : ''}
    ${s.treasure ? `<details class="feature"><summary>Treasure</summary><p>${esc(s.treasure)}</p></details>` : ''}
    <div class="fl dim small">Exits</div><div class="chips">${(s.exits || []).map((e) => `<button class="chip on" data-act="move" data-id="${e.to}" title="${esc(e.label)}">→ ${esc(((adv.sites || []).find((x) => x.id === e.to) || {}).name || e.to)}</button>`).join('') || '<span class="small faint">none</span>'}</div>
  </section>`;
}
function askRollCard() {
  const A = ui.host.ask;
  const pcs = Object.values(state.pcs).filter((p) => !p.dead);
  return `<section class="card"><h3>Ask for a roll</h3>
    <div class="chips">${pcs.map((p) => `<button class="chip${A.pcs.includes(p.id) ? ' on' : ''}" data-act="h.askpc" data-id="${p.id}">${esc(p.name)}</button>`).join('')}<button class="chip" data-act="h.askall">Everyone</button></div>
    <div class="row"><div class="seg" style="flex-wrap:nowrap"><button class="${A.kind === 'check' ? 'on' : ''}" data-act="h.askkind" data-v="check">Check</button><button class="${A.kind === 'save' ? 'on' : ''}" data-act="h.askkind" data-v="save">Save</button></div>
      ${A.kind === 'check' ? `<select style="flex:1;min-width:120px" data-bind="host.ask.skill" data-live="1"><option value="">Plain ability</option>${srd.skills.map((s) => `<option value="${s.id}" ${A.skill === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
      ${A.kind === 'save' || !A.skill ? `<select style="flex:1;min-width:110px" data-bind="host.ask.ability" data-live="1">${AB.map((a) => `<option value="${a}" ${A.ability === a ? 'selected' : ''}>${ABN[a]}</option>`).join('')}</select>` : ''}
      <label class="row nw small">DC <input type="number" min="1" max="35" style="width:64px" data-bind="host.ask.dc" data-k="ask.dc" value="${A.dc}"></label></div>
    <div class="row"><input type="text" class="grow" style="min-width:140px" data-bind="host.ask.reason" data-k="ask.reason" value="${esc(A.reason)}" placeholder="What for (the player sees this)"><div class="seg" style="flex-wrap:nowrap">${[['', '—'], ['adv', 'Adv'], ['dis', 'Dis']].map(([id, n]) => `<button class="${A.adv === id ? 'on' : ''}" data-act="h.askadv" data-v="${id}">${n}</button>`).join('')}</div><button class="btn primary" data-act="h.ask" ${A.pcs.length ? '' : 'disabled'}>Ask</button></div>
    ${state.requests.length ? `<div class="fl dim small">Waiting</div>${state.requests.map((q) => `<div class="row nw small"><span class="grow">${esc((state.pcs[q.pcId] || {}).name)}: ${q.kind === 'initiative' ? 'initiative' : q.kind === 'death' ? 'death save' : q.skill ? `${esc(skillName(q.skill))} DC ${q.dc}` : `${ABN[q.ability]} ${q.kind} DC ${q.dc}`}${q.reason ? ` · <span class="dim">${esc(q.reason)}</span>` : ''}</span><button class="btn sm" data-act="h.rollfor" data-id="${q.id}" title="Roll it for them">Roll for them</button><button class="btn sm" data-act="h.cancel" data-id="${q.id}">✕</button></div>`).join('')}` : ''}</section>`;
}
function hostRunHtml() {
  const foes = foesHere();
  const pcs = Object.values(state.pcs);
  const narr = `<div class="row nw"><select style="max-width:130px" data-bind="host.sayAs" data-live="1"><option value="">Narrate</option><option value="DM" ${ui.host.sayAs === 'DM' ? 'selected' : ''}>Say as DM</option>${((site().npcs) || []).map((n) => `<option value="${esc(n.name)}" ${ui.host.sayAs === n.name ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select><input type="text" class="grow" data-k="h.narr" data-bind="host.narrate" value="${esc(ui.host.narrate)}" maxlength="4000" placeholder="${ui.host.sayAs ? 'What they say…' : 'Describe what happens…'}"><button class="btn primary" data-act="h.narrate">Send</button></div>
    ${state.director && state.director.mode !== 'off' ? `<div class="row nw"><input type="text" class="grow" data-k="dir.note" data-bind="dir.note" value="${esc(ui.dir.note)}" placeholder="Note to the AI Director (optional)">${state.director.thinking ? '<button class="btn alert" data-act="d.cancel">Stop thinking</button>' : '<button class="btn" data-act="d.run">AI: take a turn</button>'}</div>` : ''}`;
  return `<div class="lay-three">
    <div class="col scroll" data-scroll="r1">${hostSceneCard()}${clocksCard()}
      <section class="card"><h3>Quests</h3>${state.quests.map((q) => `<div class="row nw small"><button class="chip${q.done ? ' ok' : ''}" data-act="quest" data-id="${q.id}">${q.done ? '✓' : '○'}</button><span class="grow${q.done ? ' faint' : ''}">${esc(q.text)}</span></div>`).join('') || '<div class="empty">None.</div>'}
        <div class="row nw"><input type="text" class="grow" data-k="h.quest" data-bind="host.quest" value="${esc(ui.host.quest)}" placeholder="New quest"><button class="btn sm" data-act="quest.add">Add</button></div></section></div>
    <div class="col">${storyCard({ input: narr })}</div>
    <div class="col scroll" data-scroll="r3">${fightCard()}
      ${!state.fight && foes.some((f) => !f.dead) ? `<section class="card"><div class="row wrap"><button class="btn primary grow" data-act="fight.start">Start a fight here</button><button class="btn" data-act="fight.startauto" title="Roll everyone's initiative now">…rolling for everyone</button>${foes.some((f) => f.hidden && !f.dead) ? '<button class="btn" data-act="foe.reveal">Reveal hidden</button>' : ''}</div></section>` : ''}
      <section class="card"><h3>Monsters here<span class="right"><button class="btn sm" data-act="tab" data-t="encounter">Add</button></span></h3>${foes.length ? foes.map(foeCard).join('') : '<div class="empty">None here.</div>'}</section>
      ${askRollCard()}
      <section class="card"><h3>Party</h3>${pcs.map((p) => `<div class="pcard${curKey() === `pc:${p.id}` ? ' now' : ''}"><div class="row nw"><b class="grow">${esc(p.name)}</b><span class="small dim">L${p.level} ${esc(p.clsName)} · AC ${p.ac} · PP ${p.passive}</span></div>${hpBar(p)}<div class="row nw small"><span>${p.dead ? 'dead' : p.hp <= 0 ? (p.stable ? 'stable' : `dying ${p.death.s}✓ ${p.death.f}✗`) : `${p.hp}/${p.maxHp}${p.tempHp ? ` +${p.tempHp}` : ''}`}</span>${p.conc ? `<span class="chip warn">${esc(p.conc.name)}</span>` : ''}<span class="grow"></span>${!p.playerId ? '<span class="chip">no player</span>' : ''}</div>${hpControls(p)}${condControls(p)}</div>`).join('') || (LOCAL ? '<div class="empty">No characters yet. Add the party on the Party tab.</div>' : '<div class="empty">No characters yet. Players make them on their own screens, or you can on the Party tab.</div>')}</section>
      ${rollsCard(14, 'Latest rolls')}
    </div></div>`;
}

function partyHtml() {
  const pcs = Object.values(state.pcs);
  const players = Object.values(state.players);
  const L = ui.host.loot; const X = ui.host.xp;
  return `<div class="lay-two"><div class="col scroll" data-scroll="pa1">
      <section class="card"><h3>Rewards and rests</h3>
        <div class="row nw"><input type="number" style="max-width:110px" data-bind="host.xp.amount" data-k="xp.a" value="${esc(X.amount)}" placeholder="XP"><input type="text" class="grow" data-bind="host.xp.why" data-k="xp.w" value="${esc(X.why)}" placeholder="for…"><button class="btn" data-act="xp.give">Share XP</button><button class="btn" data-act="xp.each">XP each</button></div>
        <div class="row nw"><select style="max-width:180px" data-bind="host.loot.pc" data-live="1"><option value="">The party (split)</option>${pcs.map((p) => `<option value="${p.id}" ${L.pc === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><input type="number" style="max-width:90px" data-bind="host.loot.gold" data-k="loot.g" value="${esc(L.gold)}" placeholder="gp"><input type="text" class="grow" list="itemlist" data-bind="host.loot.item" data-k="loot.i" value="${esc(L.item)}" placeholder="Item (e.g. Potion of Healing)"><button class="btn" data-act="loot.give">Give</button></div>
        <datalist id="itemlist">${[...srd.magicItems, ...srd.weapons, ...srd.armor, ...srd.gear].map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist>
        <div class="row"><button class="btn" data-act="rest.long">Long rest for everyone</button><button class="btn" data-act="time" data-h="1">+1 hour</button><button class="btn" data-act="time" data-h="8">+8 hours</button></div>
        ${state.loot.length ? `<div class="note gold">Unclaimed loot: ${esc(state.loot.map((x) => `${x.qty > 1 ? `${x.qty} × ` : ''}${x.name}`).join(', '))}</div>` : ''}</section>
      <section class="card"><h3>Players at the table</h3>${players.map((p) => `<div class="row nw"><b class="grow">${esc(p.name)}</b><select style="max-width:220px" data-assign="${p.id}"><option value="">No character</option>${pcs.map((c) => `<option value="${c.id}" ${p.pcId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`).join('') || '<div class="empty">Nobody has joined yet.</div>'}</section>
      <section class="card"><h3>Add a character</h3>
        <div class="small dim">A ready-made hero, with no player yet: the AI Director plays them until a player takes them over.</div>
        <div class="row nw"><select class="grow" data-bind="host.pg" data-live="1">${pregenList().map((x) => `<option value="${x.id}" ${ui.host.pg === x.id ? 'selected' : ''}>${esc(x.input.name)} · ${esc(x.role)}</option>`).join('')}</select><button class="btn" data-act="h.pregen">Add to the party</button></div>
        <div class="small dim">Quick: just the numbers you track at the table.</div>
        <div class="fields three"><label class="fld wide"><span class="fl">Name</span><input type="text" data-k="q.name" data-bind="host.q.name" value="${esc((ui.host.q || {}).name || '')}"></label>
          <label class="fld"><span class="fl">Class</span><input type="text" data-k="q.cls" data-bind="host.q.cls" value="${esc((ui.host.q || {}).cls || '')}" placeholder="Fighter"></label>
          <label class="fld"><span class="fl">Level</span><input type="number" min="1" max="20" data-k="q.level" data-bind="host.q.level" value="${esc((ui.host.q || {}).level || '1')}"></label>
          <label class="fld"><span class="fl">AC</span><input type="number" data-k="q.ac" data-bind="host.q.ac" value="${esc((ui.host.q || {}).ac || '')}"></label>
          <label class="fld"><span class="fl">Max HP</span><input type="number" data-k="q.hp" data-bind="host.q.hp" value="${esc((ui.host.q || {}).hp || '')}"></label>
          <label class="fld"><span class="fl">Initiative bonus</span><input type="number" data-k="q.init" data-bind="host.q.init" value="${esc((ui.host.q || {}).init || '')}"></label>
          <label class="fld"><span class="fl">Passive Perception</span><input type="number" data-k="q.pp" data-bind="host.q.passive" value="${esc((ui.host.q || {}).passive || '')}"></label></div>
        <div class="row"><button class="btn primary" data-act="q.add">Add to the party</button><span class="grow"></span><button class="btn" data-act="h.build">Full character builder</button></div>
        <div class="small dim">${LOCAL ? 'The full builder makes a complete sheet with attacks, spells and features.' : 'A character with no player is played by the AI Director.'}</div></section>
    </div><div class="col scroll" data-scroll="pa2">${ui.host.building ? buildHostHtml() : pcs.map((p) => `${sheetHtml(p, { host: true })}<section class="card"><div class="row"><button class="btn sm" data-act="insp" data-id="${p.id}">${p.inspiration ? 'Spend inspiration' : 'Give inspiration'}</button><button class="btn sm danger" data-act="retire" data-id="${p.id}">Retire ${esc(p.name)}</button></div></section>`).join('') || '<section class="card"><div class="empty">No characters yet. Add them on the left.</div></section>'}</div></div>`;
}
function buildHostHtml() {
  // The host's builder: the same screens as a player's (the host has no character of their own).
  return `<section class="card"><div class="row"><b class="grow">Character builder</b><button class="btn sm" data-act="h.build">Close</button></div></section><div style="min-height:720px;display:flex;flex-direction:column">${buildHtml()}</div>`;
}

function encounterHtml() {
  const E = ui.host.enc;
  const levels = Object.values(state.pcs).filter((p) => !p.dead).map((p) => p.level);
  const xps = E.list.flatMap((x) => Array.from({ length: x.count }, () => (ix.monster[x.id] || {}).xp || 0));
  const diff = levels.length && xps.length ? R.encounterDifficulty(levels, xps, srd) : null;
  const q = E.q.trim().toLowerCase();
  const found = srd.monsters.filter((m) => (!q || m.name.toLowerCase().includes(q) || m.type.includes(q)) && (E.cr === '' || String(m.cr) === E.cr)).slice(0, 120);
  return `<div class="lay-two"><div class="col"><section class="card fill"><h3>Find monsters</h3>
      <div class="row nw"><input type="search" class="grow" data-k="enc.q" data-bind="host.enc.q" data-live="1" value="${esc(E.q)}" placeholder="Name or type (undead, beast…)"><select style="max-width:120px" data-bind="host.enc.cr" data-live="1"><option value="">Any CR</option>${[...new Set(srd.monsters.map((m) => m.cr))].sort((a, b) => a - b).map((c) => `<option value="${c}" ${E.cr === String(c) ? 'selected' : ''}>CR ${R.crText(c)}</option>`).join('')}</select></div>
      <div class="scroll list" data-scroll="enc" style="flex:1">${found.map((m) => `<div class="row nw" style="padding:4px 0;border-bottom:1px solid color-mix(in srgb,var(--line) 50%,transparent)"><span class="grow">${esc(m.name)} <span class="small faint">${esc(m.size)} ${esc(m.type)}</span></span><span class="small dim">CR ${R.crText(m.cr)} · ${m.xp} XP</span><button class="btn sm" data-act="enc.add" data-m="${m.id}">Add</button><button class="btn sm ghost" data-act="comp.go" data-cat="monsters" data-id="${m.id}">Stats</button></div>`).join('')}</div></section></div>
    <div class="col"><section class="card"><h3>This encounter${diff ? `<span class="right"><span class="chip ${diff.rating === 'Deadly' ? 'no' : diff.rating === 'Hard' ? 'warn' : 'ok'}">${diff.rating}</span></span>` : ''}</h3>
      ${E.list.map((x, n) => `<div class="row nw"><span class="grow">${esc((ix.monster[x.id] || {}).name || x.id)}</span><button class="btn sm" data-act="enc.n" data-i="${n}" data-d="-1">−</button><b>${x.count}</b><button class="btn sm" data-act="enc.n" data-i="${n}" data-d="1">+</button></div>`).join('') || '<div class="empty">Add monsters from the list.</div>'}
      ${diff ? `<dl class="kv"><dt>Party</dt><dd>${levels.length} character${levels.length > 1 ? 's' : ''}, levels ${levels.join(', ')}</dd><dt>Monster XP</dt><dd>${diff.base} (×${diff.multiplier} for ${xps.length} monster${xps.length > 1 ? 's' : ''} = ${diff.adjusted})</dd><dt>Thresholds</dt><dd>Easy ${diff.thresholds[0]} · Medium ${diff.thresholds[1]} · Hard ${diff.thresholds[2]} · Deadly ${diff.thresholds[3]}</dd><dt>XP earned</dt><dd>${diff.base} (${Math.floor(diff.base / Math.max(1, levels.length))} each)</dd></dl>` : levels.length ? '' : '<div class="note">Difficulty appears once the party has characters.</div>'}
      <div class="row"><button class="btn primary" data-act="enc.place" ${E.list.length ? '' : 'disabled'}>Place here</button><button class="btn" data-act="enc.place" data-hidden="1" ${E.list.length ? '' : 'disabled'}>Place hidden</button><button class="btn" data-act="enc.fight" ${E.list.length ? '' : 'disabled'}>Place and fight</button><button class="btn ghost" data-act="enc.clear">Clear</button></div></section>
      <section class="card"><div class="note">Easy: no real threat. Medium: a few hit points spent. Hard: someone may drop. Deadly: someone may die. A day of adventuring can hold six to eight medium or hard encounters.</div></section></div></div>`;
}
function bestiaryHtml() { ui.comp.cat = 'monsters'; return compendiumHtml(); }

function adventureHtml() {
  const N = ui.newGame;
  return `<div class="lay-two"><div class="col scroll" data-scroll="ad1"><section class="card"><h3>${esc(adv.name)}<span class="right"><span class="chip">levels ${esc(adv.levels || '')}</span></span></h3>
      <p class="tale">${esc(adv.blurb || '')}</p><details class="feature"><summary>Introduction</summary><p>${esc(adv.intro || '')}</p></details>${adv.ending ? `<details class="feature"><summary>Ending</summary><p>${esc(adv.ending)}</p></details>` : ''}</section>
      ${(adv.sites || []).map((s) => `<section class="card${s.id === state.scene.siteId ? ' ask' : ''}"><h3>${esc(s.name)}<span class="right">${s.id === state.scene.siteId ? '<span class="chip ok">The party is here</span>' : `<button class="btn sm" data-act="move" data-id="${s.id}">Move the party here</button>`}</span></h3>
        <div class="small dim">${esc(s.region || '')}${state.scene.visited.includes(s.id) ? ' · visited' : ''}</div>
        <details class="feature"><summary>Read aloud</summary><p>${esc(s.read || '')}</p></details><details class="feature"><summary>Notes</summary><p>${esc(s.notes || '')}</p></details>
        ${(s.foes || []).length ? `<div class="small"><b>Monsters:</b> ${s.foes.map((f) => `${f.count} ${esc(f.name || f.monster)} (${esc((ix.monster[f.monster] || {}).name || f.monster)})`).join(', ')}</div>` : ''}
        ${s.treasure ? `<div class="small"><b>Treasure:</b> ${esc(s.treasure)}</div>` : ''}</section>`).join('')}</div>
    <div class="col scroll" data-scroll="ad2"><section class="card"><h3>New game</h3>
      <label class="fld"><span class="fl">Adventure</span><select data-bind="newGame.adv" data-live="1">${(adv.adventures || []).map((a) => `<option value="${a.id}" ${(N.adv || adv.id) === a.id ? 'selected' : ''}>${esc(a.name)} (levels ${esc(a.levels)})</option>`).join('')}</select></label>
      <div class="small dim">${esc(((adv.adventures || []).find((a) => a.id === (N.adv || adv.id)) || {}).blurb || '')}</div>
      <label class="row"><input type="checkbox" data-bind="newGame.keepChars" ${N.keepChars ? 'checked' : ''}> Keep the characters (healed and rested)</label>
      ${N.open ? '<div class="row"><button class="btn danger" data-act="newgame.go">Yes, start the new game</button><button class="btn" data-act="newgame.no">Cancel</button></div>' : '<button class="btn" data-act="newgame">Start a new game…</button>'}
      <div class="note">${LOCAL ? 'Undo brings the old game back while this page stays open. Download a copy on the Backup tab first to keep it.' : 'Undo brings the old game back. Save it first on the Saves tab to keep it.'}</div></section>
      <section class="card"><h3>Undo</h3><button class="btn" data-act="undo">Undo the last change</button></section>
      <section class="card"><h3>DM notes</h3><textarea rows="10" data-k="h.notes" data-hostnotes="1">${esc(ui.host.note ?? state.notes ?? '')}</textarea><button class="btn sm" data-act="notes.save">Save notes</button></section></div></div>`;
}

const SEED_TEMPLATE_TEXT = `# Seed: A title for your story
Where: any
Hook: How the party is drawn in.
Truth: What is really going on.
People:
- Name: who they are; what they want; how they talk
Encounter: none
Clues:
- Something the party can find (Investigation DC 12)
Reward: What it pays.
Ending: How it can end.`;
function seedsHtml() {
  const d = state.director || {};
  const S = ui.seeds;
  const D = d.seed || null;
  if (D && D.text && S.from !== D.text) { S.text = D.text; S.from = D.text; S.edit = null; }
  const ai = d.usable && d.model && d.mode !== 'off';
  const checks = D && !D.busy && D.text === S.text ? [...(D.problems || []).map((x) => `<div class="note hot small">${esc(x)}</div>`), ...(D.warnings || []).map((x) => `<div class="small" style="color:var(--warn-c)">${esc(x)}</div>`)].join('') : '';
  return `<div class="lay-two"><section class="card fill"><h3>Write a story seed<span class="right">${D && D.busy ? '<span class="chip on">Writing…</span>' : ''}</span></h3>
      <p class="small dim">Your own side-quests, villains and twists. Type an idea and the AI writes it up in the layout it plays best (checked against the SRD monsters and this adventure's places), or write one from the template.</p>
      <textarea rows="4" data-k="sd.idea" data-bind="seeds.idea" maxlength="6000" placeholder="For example: a halfling smuggler in Thornwick owes money to a hag in the marsh and wants the party to pay it for him.">${esc(S.idea)}</textarea>
      <div class="row"><button class="btn primary" data-act="sd.write" ${!ai || (D && D.busy) || !S.idea.trim() ? 'disabled' : ''}>Write it up</button><button class="btn" data-act="sd.template">Start from the template</button></div>
      ${D && D.error ? `<div class="note hot small">${esc(D.error)}</div>` : ''}
      <textarea class="grow" style="min-height:220px" data-k="sd.text" data-bind="seeds.text" maxlength="8000" placeholder="The seed appears here.">${esc(S.text)}</textarea>${checks}
      <div class="row"><button class="btn primary" data-act="sd.save" ${S.text.trim() ? '' : 'disabled'}>${S.edit ? 'Save changes' : 'Save this seed'}</button>${S.text ? '<button class="btn" data-act="sd.clear">Clear</button>' : ''}</div></section>
    <section class="card fill"><h3>Your seeds</h3><p class="small dim">Seeds switched on are given to the AI Director every turn to weave in when they fit. Players never see them.</p>
      <div class="scroll" data-scroll="seeds">${(state.seeds || []).map((x) => `<div class="row slotrow"><div class="grow"><b>${esc(x.title)}</b><div class="small faint">${esc(x.text.split('\n').slice(1, 3).join(' · ').slice(0, 160))}</div></div><div class="seg"><button class="${x.on ? 'on' : ''}" data-act="sd.on" data-id="${x.id}">On</button><button class="${x.on ? '' : 'on'}" data-act="sd.on" data-id="${x.id}">Off</button></div><button class="btn sm" data-act="sd.edit" data-id="${x.id}">Edit</button><button class="btn sm danger" data-act="sd.del" data-id="${x.id}">Delete</button></div>`).join('') || '<div class="empty">No seeds yet.</div>'}</div></section></div>`;
}

function memoryHtml() {
  const d = state.director || {};
  const chapters = (d.chronicle || []).slice().reverse();
  const Rr = d.recall;
  return `<div class="lay-two"><section class="card fill"><h3>The chronicle<span class="right">${d.writing ? '<span class="chip on">Writing…</span>' : ''}<button class="btn sm" data-act="m.night">End the session</button></span></h3>
      <div class="small dim">A paragraph is written each time the party leaves a place and when you end the session. The AI Director reads the latest three every turn.</div>
      <div class="scroll" data-scroll="chron" style="display:flex;flex-direction:column;gap:10px">${chapters.map((c) => `<div class="note"><div class="row small"><b>${esc(c.site)}</b><span class="dim">${c.why === 'night' ? 'end of a session' : 'left'}${c.t ? ` · ${esc(new Date(c.t).toLocaleDateString())}` : ''}</span><span class="grow"></span><button class="btn sm" data-act="m.chdrop" data-id="${esc(c.id)}">x</button></div><div>${esc(c.text)}</div></div>`).join('') || '<p class="small dim">Nothing yet.</p>'}</div></section>
    <section class="card fill"><h3>Search the game</h3><div class="row nw"><input type="text" class="grow" data-k="m.q" data-bind="mem.q" value="${esc(ui.mem.q)}" placeholder="What did Marta say about Nell?"><button class="btn" data-act="m.search">Search</button></div>
      ${Rr ? `<div class="receipt scroll">${Rr.hits.length ? Rr.hits.map((h) => `<div class="ln"><b>${esc(h.who || '')}</b><span>${esc(h.text)}</span></div>`).join('') : '<div class="ln"><span>Nothing matches.</span></div>'}</div>` : ''}</section></div>`;
}

// ------------------------------------------------------------------ actions
const ownDice = () => (ui.own.trim() ? ui.own.trim().split(/[\s,]+/).map(Number).filter((n) => n >= 1 && n <= 20).slice(0, 2) : null);
const toggleIn = (arr, id, max) => { const a = arr || []; if (a.includes(id)) return a.filter((x) => x !== id); return a.length < max ? [...a, id] : a; };
function setPath(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let o = obj;
  for (let k = 0; k < parts.length - 1; k++) { if (o[parts[k]] == null || typeof o[parts[k]] !== 'object') o[parts[k]] = {}; o = o[parts[k]]; }
  o[parts[parts.length - 1]] = value;
}
function spellsCtx(ctx) { return ctx === 'lvl' ? ui.lvl.spells : (ui.build.spells = ui.build.spells || { cantrips: [], known: [], prepared: [] }); }
const ACT = {
  'sheet.print': (d) => printSheet(state.pcs[d.pc]),
  tab: (d) => { ui.tab = d.t; if (d.t !== 'build') ui.lvl = { asi: { a: '', b: '' }, subclass: '', spells: null }; },
  readaloud: () => { ui.readAloud = !ui.readAloud; store.set('dnd.read', ui.readAloud ? 'on' : 'off'); if (!ui.readAloud) stopVoice(); else { V.blocked = false; pumpVoice(); } },
  talk: () => talk(),
  'hear.yes': () => { store.set('dnd.hear', 'yes'); ui.talkAsk = false; },
  'hear.no': () => { store.set('dnd.hear', 'no'); ui.talkAsk = false; if (T.rec && ui.talk === 'listening') { try { T.rec.stop(); } catch (e) { /* idle */ } } },
  'v.save': async () => {
    const v = ui.voice;
    const body = { op: 'voice', out: { engine: v.outEngine, screenVoice: v.outScreen, url: v.outUrl, model: v.outModel, voice: v.outVoice, speed: v.outSpeed }, in: { engine: v.inEngine, url: v.inUrl, model: v.inModel, language: v.inLang } };
    if (v.outKey.trim()) body.out.key = v.outKey.trim();
    if (v.inKey.trim()) body.in.key = v.inKey.trim();
    if (await sendDirector(body)) { v.outKey = ''; v.inKey = ''; v.loaded = false; await reloadAdventure(); toast('Voice settings saved.', true); }
  },
  'v.out': (d) => { ui.voice.outEngine = d.id; },
  'v.screen': (d) => { ui.voice.outScreen = d.id; },
  'v.in': (d) => { ui.voice.inEngine = d.id; },
  'v.test': () => { V.blocked = false; V.q.push({ text: 'The fog curls along the river, and somewhere in it a lantern swings.', clip: serverVoice() ? fetchClip('The fog curls along the river, and somewhere in it a lantern swings.') : null }); pumpVoice(); },
  'col.reset': () => { store.del('dnd.colours'); applyColours(); },
  'col.theme': (d) => { store.set('dnd.colours', JSON.stringify(THEMES[d.n] || DEFAULTS)); applyColours(); },
  'key.go': () => { const q = new URLSearchParams(location.search); q.set('key', ui.keyTry.trim().toUpperCase()); location.href = `${location.pathname}?${q}`; },
  'code.go': () => { const q = new URLSearchParams(location.search); q.set('t', ui.keyTry.trim().toUpperCase()); location.href = `${location.pathname}?${q}`; },
  'pc.take': (d) => send({ type: 'pc.take', pcId: d.id }).then((ok) => { if (ok) { ui.tab = 'play'; toast(`You are now playing ${(state.pcs[d.id] || {}).name || 'them'}.`, true); } return ok; }),
  'pc.open': () => { const p = myPc(); return p ? send({ type: 'pc.open', pcId: p.id, open: !p.open }) : null; },
  'pc.leave': () => { const p = myPc(); if (!p || !confirm(`Step back from ${p.name}? The DM plays them until someone takes them over; you can take them back yourself.`)) return null; return send({ type: 'pc.open', pcId: p.id, open: true, leave: true }); },
  'pc.return': () => { const p = myPc(); return p ? send({ type: 'pc.return', pcId: p.id }) : null; },
  'clock.tick': (d) => send({ type: 'clock.tick', id: d.id, by: 1 }),
  'clock.back': (d) => send({ type: 'clock.tick', id: d.id, by: -1 }),
  'clock.remove': (d) => { const c = (state.clocks || []).find((x) => x.id === d.id); if (!c || !confirm(`Remove the clock "${c.name}"?`)) return null; return send({ type: 'clock.remove', id: d.id }); },
  'h.pregen': () => {
    const list = pregenList(); const x = list.find((p) => p.id === ui.host.pg) || list[0];
    if (!x) return null;
    const lv = Math.max(1, ...Object.values(state.pcs).map((p) => p.level || 1));
    const input = PG.pregenBuild(x, srd, lv, list);
    return send({ type: 'pc.create', input });
  },
  join: async () => { const name = ui.join.name.trim(); if (!name) { toast('Type your name first.'); return; } store.set('dnd.name', name); if (await send({ type: 'join', name })) ui.tab = 'build'; },
  say: async () => { const text = ui.say.trim(); if (text && await send({ type: 'say', text })) ui.say = ''; },
  stabilize: (d) => send({ type: 'stabilize', target: `pc:${d.id}` }),
  hp: async (d) => {
    const v = Number(ui.host.pcHp[d.id]);
    if (!(v >= 0)) { toast('Type a number first.'); return; }
    const ok = d.op === 'damage' ? await send({ type: 'damage', target: `pc:${d.id}`, amount: v }) : d.op === 'heal' ? await send({ type: 'heal', target: `pc:${d.id}`, amount: v }) : await send({ type: 'hp.temp', target: `pc:${d.id}`, amount: v });
    if (ok) ui.host.pcHp[d.id] = '';
  },
  'cond.rm': (d) => send({ type: 'cond.remove', target: d.ref, cond: d.c }),
  free: (d) => send({ type: 'roll.free', pcId: d.pc, kind: d.kind, ability: d.ab || '', skill: d.skill || '', adv: ui.adv }),
  'res.use': (d) => {
    const p = state.pcs[d.pc]; const r = p && p.resources.find((x) => x.id === d.id);
    if (r && r.id === 'layonhands') { const n = Number(prompt(`How many hit points of Lay on Hands (${r.max - r.used} left)?`, '5')); if (!(n > 0)) return null; return send({ type: 'resource.use', pcId: d.pc, id: d.id, amount: n, target: ui.target && ui.target.startsWith('pc:') ? ui.target : `pc:${d.pc}` }); }
    if (r && r.id === 'breath') return send({ type: 'resource.use', pcId: d.pc, id: d.id, targets: ui.castTargets.breath || (ui.target ? [ui.target] : []) });
    return send({ type: 'resource.use', pcId: d.pc, id: d.id });
  },
  slot: (d) => send({ type: 'slot.set', pcId: d.pc, level: Number(d.l), used: Number(d.u) }),
  'conc.end': (d) => send({ type: 'conc.end', pcId: d.pc }),
  'rest.short': (d) => send({ type: 'rest.short', pcId: d.pc, dice: Number(d.n) }),
  'rest.long1': (d) => send({ type: 'rest.long', pcId: d.pc }),
  'rest.long': () => send({ type: 'rest.long' }),
  item: (d) => send({ type: 'item.edit', pcId: d.pc, name: d.n, qty: Number(d.q) }),
  'item.add': async (d) => { const n = String(ui.newItem || '').trim(); if (n && await send({ type: 'item.edit', pcId: d.pc, name: n, qty: 1 })) ui.newItem = ''; },
  gold: async (d) => { const p = state.pcs[d.pc]; if (ui.goldSet === '' || ui.goldSet == null) return; if (await send({ type: 'item.edit', pcId: d.pc, name: (p.inventory[0] || { name: 'Pouch' }).name, qty: (p.inventory[0] || { qty: 1 }).qty, gold: Number(ui.goldSet) })) ui.goldSet = ''; },
  'xp.add': async (d) => { if (await send({ type: 'xp.add', pcId: d.pc, amount: Number(ui.xpAdd) })) ui.xpAdd = ''; },
  'loot.take': (d) => send({ type: 'loot.take', pcId: d.pc, index: Number(d.i) }),
  tgt: (d) => { const cur = ui.castTargets[d.key] || []; ui.castTargets[d.key] = d.multi ? (cur.includes(d.ref) ? cur.filter((x) => x !== d.ref) : [...cur, d.ref]) : (cur[0] === d.ref ? [] : [d.ref]); },
  cast: async (d) => {
    const s = spellOf(d.s);
    const targets = ui.castTargets[`s:${d.s}`] || [];
    const ok = await send({ type: 'spell.cast', pcId: d.pc, spell: d.s, level: Number(ui.castLevel[d.s] || (s && s.level) || 0), targets, ritual: !!d.ritual, adv: ui.adv });
    if (ok) { ui.castTargets[`s:${d.s}`] = []; ui.adv = ''; }
  },
  prep: (d) => { const p = state.pcs[d.pc]; const sp = { ...(p.input.spells || {}) }; sp.prepared = toggleIn(sp.prepared || p.cast.prepared, d.s, p.cast.prepMax); return send({ type: 'pc.rebuild', pcId: p.id, input: { spells: sp } }); },
  advset: (d) => { ui.adv = d.v; },
  roll: async (d) => { const own = ownDice(); if (await send({ type: 'roll.make', id: d.id, adv: ui.adv, own })) { ui.own = ''; ui.adv = ''; } },
  endturn: () => send({ type: 'fight.next' }),
  'fight.begin': () => send({ type: 'fight.begin' }),
  'fight.next': () => send({ type: 'fight.next' }),
  'fight.end': () => send({ type: 'fight.end' }),
  'fight.start': () => send({ type: 'fight.start' }),
  'fight.startauto': () => send({ type: 'fight.start', autoRoll: true }),
  attack: async (d) => {
    const foes = foesHere().filter((f) => !f.dead && !f.hidden);
    const tgt = ui.target && foes.some((f) => `foe:${f.id}` === ui.target) ? ui.target : foes[0] ? `foe:${foes[0].id}` : '';
    const ok = await send({ type: 'attack', pcId: d.pc, attack: d.a, target: tgt || undefined, adv: ui.adv, sneak: ui.sneak, smite: Number(ui.smite) || 0, twoHanded: ui.twoHanded });
    if (ok) { ui.sneak = false; ui.smite = 0; ui.adv = ''; }
  },
  target: (d) => { ui.target = d.ref; },
  sneak: () => { ui.sneak = !ui.sneak; },
  twohand: () => { ui.twoHanded = !ui.twoHanded; },
  // ---- the builder
  'sp.pick': (d) => {
    const sp = spellsCtx(d.ctx);
    const input = d.ctx === 'lvl' ? lvlInput(myPc()) : ui.build;
    const pv = preview(input);
    if (!pv || !pv.cast) return;
    const max = d.list === 'cantrips' ? pv.cast.cantripsMax : d.list === 'prepared' ? pv.cast.prepMax : pv.cast.knownMax;
    sp[d.list] = toggleIn(sp[d.list], d.id, max);
    if (d.list === 'known' && pv.cast.spellbook) sp.prepared = (sp.prepared || []).filter((x) => sp.known.includes(x));
    if (d.ctx !== 'lvl') saveDraft();
  },
  'b.list': (d) => { const b = ui.build; const max = { raceChoice: (ix.race[b.race] || {}).bonusChoice || 0, skills: (ix.cls[b.class] || {}).skillChoose || 0, bgSkills: 2, raceSkills: 2, expertise: 2 }[d.list] || 2; b[d.list] = toggleIn(b[d.list], d.id, max); saveDraft(); },
  'b.method': (d) => { const b = ui.build; b.method = d.v; if (d.v === 'standard') b.base = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }; if (d.v === 'pointbuy') b.base = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }; saveDraft(); },
  'b.pb': (d) => { const b = ui.build; const v = b.base[d.a] + Number(d.d); if (v < 8 || v > 15) return; const spent = AB.reduce((s2, a) => s2 + R.POINT_COST[a === d.a ? v : b.base[a]], 0); if (spent > 27) { toast('That would spend more than 27 points.'); return; } b.base[d.a] = v; saveDraft(); },
  'b.roll4d6': () => { const b = ui.build; for (const a of AB) { const r = [0, 0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6)).sort((x, y) => y - x); b.base[a] = r[0] + r[1] + r[2]; } saveDraft(); toast('Rolled on this device. Your DM may want to see you roll them for real.', true); },
  'b.bg': (d) => { ui.build.background = d.v; saveDraft(); },
  'b.kit': (d) => { const b = ui.build; b.kit = b.kit || []; b.kit[Number(d.n)] = Number(d.k2); saveDraft(); },
  'b.step': (d) => { ui.buildStep = d.v; },
  'b.random': () => { const lv = role === 'host' ? Number(ui.build.level) || 1 : 1; ui.build = { ...BLANK_BUILD(), ...PG.randomBuild(srd, Math.random, lv) }; ui.buildStep = 'review'; saveDraft(); toast(`Rolled up ${ui.build.name}. Change anything you like, then create.`, true); },
  'b.pregen': (d) => { const lv = role === 'host' ? Number(ui.build.level) || 1 : 1; const x = PG.pregenBuild(d.id, srd, lv, pregenList()); if (!x) return; ui.build = { ...BLANK_BUILD(), ...x, pregen: d.id }; ui.buildStep = 'review'; saveDraft(); toast(`${x.name} is ready to check. Create them on this page.`, true); },
  'b.reset': () => { ui.build = BLANK_BUILD(); ui.buildStep = 'basics'; saveDraft(); },
  'b.create': async () => {
    const b = { ...ui.build, level: role === 'host' ? Number(ui.build.level) || 1 : 1 };
    if (await send({ type: 'pc.create', input: b })) { toast(`${b.name} is ready.`, true); store.del('dnd.build'); ui.build = BLANK_BUILD(); ui.buildStep = 'basics'; ui.tab = role === 'host' ? 'party' : 'play'; ui.host.building = false; }
  },
  'lvl.go': async () => { const p = myPc(); if (await send({ type: 'pc.rebuild', pcId: p.id, input: lvlInput(p) })) { ui.lvl = { asi: { a: '', b: '' }, subclass: '', spells: null }; ui.tab = 'sheet'; toast('Level up!', true); } },
  // ---- the rules
  'comp.cat': (d) => { ui.comp.cat = d.v; ui.comp.sel = null; },
  'comp.sel': (d) => { ui.comp.sel = d.id; },
  'comp.go': (d) => { ui.comp.cat = d.cat; ui.comp.sel = d.id; ui.tab = role === 'host' && d.cat === 'monsters' ? 'bestiary' : 'rules'; },
  'dice.quick': (d) => send({ type: 'roll.free', dice: d.d, label: d.d, secret: !!ui.dice.secret }),
  'dice.roll': () => send({ type: 'roll.free', dice: ui.dice.expr, label: ui.dice.label || ui.dice.expr, secret: !!ui.dice.secret }),
  'free.adv': (d) => { ui.freeRoll.adv = d.v; },
  'free.go': () => { const p = myPc(); const [k, v] = ui.freeRoll.what.split(':'); return send({ type: 'roll.free', pcId: p.id, kind: k === 'save' ? 'save' : 'check', skill: k === 'skill' ? v : '', ability: k === 'skill' ? '' : v, adv: ui.freeRoll.adv }); },
  // ---- the DM: monsters and encounters
  'foe.add': (d) => send({ type: 'foe.add', monster: d.m, count: Number(ui.host.add.count) || 1, hidden: !!ui.host.add.hidden }),
  'enc.add': (d) => { const E = ui.host.enc; const x = E.list.find((y) => y.id === d.m); if (x) x.count += 1; else E.list.push({ id: d.m, count: 1 }); toast(`${ix.monster[d.m].name} added to the encounter.`, true); },
  'enc.n': (d) => { const E = ui.host.enc; const x = E.list[Number(d.i)]; x.count += Number(d.d); if (x.count <= 0) E.list.splice(Number(d.i), 1); },
  'enc.clear': () => { ui.host.enc.list = []; },
  'enc.place': async (d) => { for (const x of ui.host.enc.list) if (!(await send({ type: 'foe.add', monster: x.id, count: x.count, hidden: !!d.hidden }))) return; ui.host.enc.list = []; ui.tab = 'run'; },
  'enc.fight': async () => { for (const x of ui.host.enc.list) if (!(await send({ type: 'foe.add', monster: x.id, count: x.count }))) return; ui.host.enc.list = []; await send({ type: 'fight.start' }); ui.tab = 'run'; },
  'foe.flee': (d) => send({ type: 'foe.flee', foeId: d.id }),
  'foe.rm': (d) => send({ type: 'foe.remove', foeId: d.id }),
  'foe.reveal1': (d) => send({ type: 'foe.reveal', foeIds: [d.id] }),
  'foe.reveal': () => send({ type: 'foe.reveal' }),
  'foe.hp': async (d) => { const F = ui.host.foe[d.id] || {}; const v = Number(F.amt); if (!(v >= 0)) { toast('Type a number first.'); return; } if (await send({ type: d.op === 'heal' ? 'heal' : 'damage', target: `foe:${d.id}`, amount: v })) F.amt = ''; },
  'foe.act': (d) => { const F = ui.host.foe[d.id] || {}; const pcs = Object.values(state.pcs).filter((p) => !p.dead); return send({ type: 'foe.act', foeId: d.id, action: d.a, targets: [F.target || (pcs[0] || {}).id].filter(Boolean) }); },
  // ---- the DM: scene, rolls, story
  'h.readout': () => send({ type: 'narrate', text: site().read }),
  'h.askcheck': (d) => { const c = site().checks[Number(d.n)]; const A = ui.host.ask; A.kind = 'check'; A.skill = c.skill; A.dc = c.dc; A.reason = ''; if (!A.pcs.length) A.pcs = Object.values(state.pcs).filter((p) => !p.dead).map((p) => p.id); },
  move: (d) => send({ type: 'site.move', siteId: d.id }),
  'h.askpc': (d) => { const A = ui.host.ask; A.pcs = A.pcs.includes(d.id) ? A.pcs.filter((x) => x !== d.id) : [...A.pcs, d.id]; },
  'h.askall': () => { ui.host.ask.pcs = Object.values(state.pcs).filter((p) => !p.dead).map((p) => p.id); },
  'h.askkind': (d) => { ui.host.ask.kind = d.v; },
  'h.askadv': (d) => { ui.host.ask.adv = d.v; },
  'h.ask': async () => { const A = ui.host.ask; if (await send({ type: 'roll.ask', pcIds: A.pcs, kind: A.kind, skill: A.kind === 'check' ? A.skill : '', ability: A.ability, dc: Number(A.dc), reason: A.reason, adv: A.adv })) { A.reason = ''; } },
  'h.rollfor': (d) => send({ type: 'roll.make', id: d.id }),
  'h.cancel': (d) => send({ type: 'roll.cancel', id: d.id }),
  'h.narrate': async () => { const t = ui.host.narrate.trim(); if (!t) return; const ok = ui.host.sayAs ? await send({ type: 'say', text: t, as: ui.host.sayAs }) : await send({ type: 'narrate', text: t }); if (ok) ui.host.narrate = ''; },
  quest: (d) => { const q = state.quests.find((x) => x.id === d.id); return send({ type: 'quest.done', id: d.id, done: !q.done }); },
  'quest.add': async () => { if (ui.host.quest.trim() && await send({ type: 'quest.add', text: ui.host.quest })) ui.host.quest = ''; },
  'xp.give': async () => { if (await send({ type: 'xp.award', amount: Number(ui.host.xp.amount), why: ui.host.xp.why })) ui.host.xp = { amount: '', why: '' }; },
  'xp.each': async () => { if (await send({ type: 'xp.award', amount: Number(ui.host.xp.amount), why: ui.host.xp.why, each: true })) ui.host.xp = { amount: '', why: '' }; },
  'loot.give': async () => { const L = ui.host.loot; if (await send({ type: 'loot.give', pcId: L.pc || undefined, gold: Number(L.gold) || 0, item: L.item })) ui.host.loot = { pc: L.pc, gold: '', item: '' }; },
  time: (d) => send({ type: 'time.pass', hours: Number(d.h) }),
  'h.build': () => { ui.host.building = !ui.host.building; },
  'q.add': async () => { const q = ui.host.q || {}; if (await send({ type: 'pc.quick', name: q.name, cls: q.cls, level: q.level, ac: q.ac, hp: q.hp, init: q.init, passive: q.passive })) ui.host.q = { level: '1' }; },
  insp: (d) => { const p = state.pcs[d.id]; return send({ type: 'inspiration', pcId: d.id, give: !p.inspiration }); },
  retire: (d) => { if (confirm(`Retire ${state.pcs[d.id].name}? They leave the party.`)) return send({ type: 'pc.retire', pcId: d.id }); return null; },
  newgame: () => { ui.newGame.open = true; },
  'newgame.no': () => { ui.newGame.open = false; },
  'newgame.go': async () => { const N = ui.newGame; if (await send({ type: 'session.new', adventureId: N.adv || adv.id, keepCharacters: N.keepChars })) { ui.newGame = { open: false, adv: '', keepChars: true }; ui.tab = 'run'; } },
  undo: () => send({ type: 'undo' }),
  'notes.save': async () => { if (await send({ type: 'note.host', text: ui.host.note ?? state.notes })) { ui.host.note = null; toast('Saved.', true); } },
  // ---- seeds and the chronicle
  'sd.write': () => sendDirector({ op: 'seed.write', idea: ui.seeds.idea }),
  'sd.template': () => { ui.seeds.text = SEED_TEMPLATE_TEXT; ui.seeds.edit = null; },
  'sd.clear': () => { ui.seeds.text = ''; ui.seeds.edit = null; sendDirector({ op: 'seed.clear' }); },
  'sd.save': async () => { if (await send({ type: 'seed.save', text: ui.seeds.text, id: ui.seeds.edit || undefined })) { ui.seeds.text = ''; ui.seeds.edit = null; toast('Seed saved.', true); } },
  'sd.on': (d) => send({ type: 'seed.toggle', id: d.id }),
  'sd.edit': (d) => { const x = (state.seeds || []).find((y) => y.id === d.id); if (x) { ui.seeds.text = x.text; ui.seeds.edit = x.id; } },
  'sd.del': (d) => (confirm('Delete this seed?') ? send({ type: 'seed.remove', id: d.id }) : null),
  'm.night': () => sendDirector({ op: 'chapter' }),
  'm.chdrop': (d) => sendDirector({ op: 'chapter.drop', id: d.id }),
  'm.search': () => sendDirector({ op: 'recall', query: ui.mem.q }),
  // ---- the AI Director
  'd.mode': (d) => sendDirector({ op: 'config', mode: d.id }),
  'd.think': (d) => sendDirector({ op: 'config', thinking: d.id }),
  'd.key': async () => { if (!ui.dir.key.trim()) { toast('Paste the key first.'); return; } if (await sendDirector({ op: 'config', apiKey: ui.dir.key.trim() })) { ui.dir.key = ''; toast('Key saved. Loading your models…', true); } },
  'd.models': () => sendDirector({ op: 'models' }),
  'd.test': () => sendDirector({ op: 'test' }),
  'd.url': async () => { if (await sendDirector({ op: 'config', baseUrl: ui.dir.url.trim() })) toast('Looking for the AI server…', true); },
  'd.run': async () => { if (await sendDirector({ op: 'run', note: ui.dir.note })) ui.dir.note = ''; },
  'd.approve': () => { const p = state.director.proposal; return sendDirector({ op: 'approve', text: p && ui.dir.edit.trim() !== p.narration ? ui.dir.edit : '' }); },
  'd.retry': () => sendDirector({ op: 'run', note: ui.dir.note }),
  'd.cancel': () => sendDirector({ op: 'cancel' }),
  'd.restart': async () => { if (await sendDirector({ op: 'cancel' })) await sendDirector({ op: 'run', note: ui.dir.note }); },
  'd.discard': () => sendDirector({ op: 'discard' }),
  'd.narrate': async () => { if (ui.dir.narrate.trim() && await send({ type: 'narrate', text: ui.dir.narrate })) ui.dir.narrate = ''; },
  // ---- the Assistants' backups
  'bk.save': () => { const blob = new Blob([local.exportJson()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dnd-${role === 'host' ? 'dm' : 'character'}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
  // ---- saved games
  'sv.save': async () => { const out = await savesOp({ op: 'save', name: ui.saves.name }); if (out.ok) toast(out.saved && out.saved.copied ? 'Saved, and a copy is in Supabase.' : 'Saved on this computer.', true); },
  'sv.sure': (d) => { ui.saves.sure = d.id || ''; },
  'sv.load': async (d) => { ui.saves.sure = ''; const out = await savesOp({ op: 'load', id: d.id }); if (out.ok) { toast('Loaded. Undo brings the last game back.', true); ui.tab = 'run'; } },
  'sv.del': async (d) => { ui.saves.sure = ''; await savesOp({ op: 'delete', id: d.id }); },
  'sv.cfg': async () => { const S = ui.saves; const out = await savesOp({ op: 'config', url: S.url || MY_SUPABASE, secret: S.key }); if (!out.ok) return; S.key = ''; const t = await savesOp({ op: 'test' }); if (t.ok) toast('Supabase answered. Saves will be copied there.', true); },
  'sv.pushAll': async () => { const out = await savesOp({ op: 'pushAll' }); if (out.ok) toast(`${out.copied || 0} saved game${out.copied === 1 ? '' : 's'} copied to Supabase.`, true); },
  'sv.cloud': () => savesOp({ op: 'cloudList' }),
  'sv.restore': async (d) => { const out = await savesOp({ op: 'restore', id: d.id }); if (out.ok) toast('It is on this computer now, under Saved games.', true); },
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
  if (t.dataset.colour) { const c = savedColours(); c[t.dataset.colour] = t.value; store.set('dnd.colours', JSON.stringify(c)); applyColours(); if (e.type === 'change') render(); return; }
  if (t.dataset.addcond) { if (e.type === 'change' && t.value) send({ type: 'cond.add', target: t.dataset.addcond, cond: t.value }); return; }
  if (t.dataset.init) { if (e.type === 'change' && t.value !== '') send({ type: 'fight.init', key: t.dataset.init, init: Number(t.value) }); return; }
  if (t.dataset.castlvl) { ui.castLevel[t.dataset.castlvl] = Number(t.value); return; }
  if (t.dataset.abil) { if (e.type === 'change' || t.type === 'number') { ui.build.base[t.dataset.abil] = Number(t.value); saveDraft(); if (e.type === 'change') render(); } return; }
  if (t.dataset.kitpick) { if (e.type === 'change') { const b = ui.build; b.kitPick = b.kitPick || {}; const arr = (b.kitPick[t.dataset.kitpick] || []).slice(); arr[Number(t.dataset.c)] = t.value; b.kitPick[t.dataset.kitpick] = arr; saveDraft(); render(); } return; }
  if (t.dataset.langs) { ui.build.languages = t.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6); saveDraft(); return; }
  if (t.dataset.racecantrip) { if (e.type === 'change') { ui.build.spells = { ...(ui.build.spells || {}), raceCantrip: t.value }; saveDraft(); render(); } return; }
  if (t.dataset.notes) { if (e.type === 'change') send({ type: 'pc.notes', pcId: t.dataset.notes, text: t.value }); return; }
  if (t.dataset.hostnotes) { ui.host.note = t.value; return; }
  if (t.dataset.loadfile) {
    const f = t.files && t.files[0];
    if (f) f.text().then((txt) => { try { local.importJson(txt); onState(local.view(pid)); toast('Loaded.', true); } catch (err) { toast(err.message); } });
    return;
  }
  if (t.dataset.assign) { if (e.type === 'change') { const pcId = t.value; if (pcId) send({ type: 'pc.assign', pcId, pid: t.dataset.assign }); else { const p = state.players[t.dataset.assign]; if (p && p.pcId) send({ type: 'pc.assign', pcId: p.pcId, pid: '' }); } } return; }
  if (t.dataset.dmodel) { if (e.type === 'change' && t.value) sendDirector({ op: 'config', model: t.value }); return; }
  if (t.dataset.dprov) { if (e.type === 'change') sendDirector({ op: 'config', provider: t.value }); return; }
  if (t.dataset.dctx) { if (e.type === 'change') sendDirector({ op: 'config', numCtx: Number(t.value) }); return; }
  if (!t.dataset.bind) return;
  const value = t.type === 'checkbox' ? t.checked : t.value;
  setPath(ui, t.dataset.bind, value);
  if (t.dataset.save) saveDraft();
  if (t.dataset.live || t.tagName === 'SELECT' || t.type === 'checkbox') { if (t.type === 'search' || t.dataset.live) { if (e.type === 'input' || e.type === 'change') render(); } else if (e.type === 'change') render(); }
}
document.addEventListener('input', onField);
document.addEventListener('change', onField);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  const map = { say: 'say', 'join.name': 'join', keyTry: codeBad ? 'code.go' : 'key.go', 'h.narr': 'h.narrate', 'dir.note': 'd.run', 'dir.narrate': 'd.narrate', 'dir.key': 'd.key', 'dir.url': 'd.url', 'm.q': 'm.search', 'dice.expr': 'dice.roll', 'dice.label': 'dice.roll', 'h.quest': 'quest.add', own: null };
  const k = e.target.getAttribute('data-k');
  if (map[k]) { e.preventDefault(); Promise.resolve(ACT[map[k]]({})).then(render); }
});

const V = { seen: null, q: [], playing: false, blocked: false, audio: null, face: 'rest' };

const canSpeakLocal = () => 'speechSynthesis' in window;
const speakOn = () => ui.readAloud && (canSpeakLocal() || serverVoice());
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

function setFace() { /* the D&D screens have no face */ }
function faceFollows() { /* nothing to animate */ }

// The screen's own voices differ by device, so pick by language and by the names each system uses.
const MALE = /\b(male|daniel|arthur|oliver|george|ryan|thomas|alfie|elliot|fred|alex|aaron|david|guy|mark|james|christopher|eric|rocco|reed)\b/i;
const FEMALE = /\b(female|serena|kate|stephanie|martha|hazel|libby|sonia|susan|samantha|zira|jenny|aria|karen|moira|fiona|tessa|victoria|allison|ava|michelle|emma|amy)\b/i;
let pickedVoice = { want: null, voice: null };
function screenVoice() {
  const want = (info && info.voice && info.voice.screenVoice) || 'gb-male';
  if (want === 'any') return null;
  const all = speechSynthesis.getVoices();
  if (!all.length) return null;
  if (pickedVoice.want === want && pickedVoice.voice) return pickedVoice.voice;
  const [place, sex] = want.split('-');
  const lang = place === 'gb' ? /^en[-_]GB/i : /^en[-_]US/i;
  const score = (v) => (lang.test(v.lang) ? 4 : /^en/i.test(v.lang) ? 1 : -9)
    + (sex === 'male' ? (MALE.test(v.name) ? 3 : FEMALE.test(v.name) ? -3 : 0) : (FEMALE.test(v.name) ? 3 : MALE.test(v.name) ? -3 : 0))
    + (/natural|neural|online|premium|enhanced/i.test(v.name) ? 1 : 0) + (v.localService ? 0.5 : 0);
  const best = all.slice().sort((a, b) => score(b) - score(a))[0];
  pickedVoice = { want, voice: best && score(best) > 0 ? best : null };
  return pickedVoice.voice;
}
try { if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { pickedVoice = { want: null, voice: null }; }; } catch (e) { /* no voices */ }

function speakBrowser(text, done) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    const v = screenVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else if (((info && info.voice && info.voice.screenVoice) || 'gb-male').startsWith('gb')) u.lang = 'en-GB';
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
// Phones (iPhones above all) only let a page make sound from a tap. A new audio player for each sentence
// is blocked unless it was started by one, so a remote player's phone stayed silent with the voice on
// (Roly, 20 Nov). One player, unlocked by the first tap anywhere on the page, then plays every sentence.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
function audioEl() {
  if (!V.el) { V.el = new Audio(); V.el.preload = 'auto'; V.el.setAttribute('playsinline', ''); }
  return V.el;
}
function unlockAudio() {
  if (V.unlocked) return;
  const a = audioEl();
  try {
    a.src = SILENT_WAV;
    const p = a.play();
    if (p && p.then) p.then(() => { V.unlocked = true; }, () => { /* not this tap: the next one */ });
    else V.unlocked = true;
  } catch (e) { /* the next tap tries again */ }
  // The browser's own voice needs the same first touch on some phones.
  try { if (canSpeakLocal() && !V.spokeOnce) { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); V.spokeOnce = true; } } catch (e) { /* no voice here */ }
}
for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlockAudio, true);
function playClip(item, done) {
  item.clip.then((url) => {
    const a = audioEl();
    V.audio = a;
    let over = false;
    const fin = () => { if (over) return; over = true; a.onended = null; a.onerror = null; URL.revokeObjectURL(url); V.audio = null; done(); };
    a.onended = fin;
    a.onerror = fin;
    a.src = url;
    a.play().catch((e) => {
      a.onended = null; a.onerror = null; URL.revokeObjectURL(url); V.audio = null;
      if (e && e.name === 'NotAllowedError') { V.unlocked = false; V.blocked = true; V.playing = false; item.clip = fetchClip(item.text); V.q.unshift(item); render(); } else done();
    });
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
  if (V.audio) { try { V.audio.onended = null; V.audio.onerror = null; V.audio.pause(); } catch (e) { /* gone */ } V.audio = null; }
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
// A tap while the voice was blocked unlocks the player (above) and carries on from the sentence it stopped at.
document.addEventListener('pointerdown', () => { if (V.blocked) { unlockAudio(); V.blocked = false; pumpVoice(); render(); } }, true);

// Talk button: one tap to start, one to stop. The words land in the text box to check before Say.
const T = { rec: null, chunks: [], busy: false };
const hearOk = () => store.get('dnd.hear') === 'yes';
function hearConsentHtml() {
  const where = info && info.voice ? info.voice.hearWhere : 'your phone\'s own speech service';
  return `<div class="note"><b>Talk instead of typing?</b> When you use the Talk button, your voice is sent to ${esc(where)} and turned into words that appear in your text box for you to check. It is not kept as a recording. Nobody has to: if you would rather not, you type and tap and nothing else changes.
    <div class="row" style="margin-top:8px"><button class="btn${store.get('dnd.hear') === 'yes' ? ' primary' : ''}" data-act="hear.yes">Yes, let me talk</button><button class="btn${store.get('dnd.hear') === 'no' ? ' primary' : ''}" data-act="hear.no">No, I will type</button></div></div>`;
}
function talkButtonHtml() {
  if (!canHear() || store.get('dnd.hear') === 'no') return '';
  return `<button class="btn${ui.talk === 'listening' ? ' primary' : ''}" data-act="talk" ${ui.talk === 'sending' ? 'disabled' : ''}>${ui.talk === 'listening' ? 'Stop' : ui.talk === 'sending' ? '…' : 'Talk'}</button>`;
}
function addToSay(text) {
  const t = String(text || '').trim();
  if (!t) { toast('Nothing was heard. Try again, or type.'); return; }
  ui.say = `${ui.say ? `${ui.say} ` : ''}${t}`.slice(0, 1000);
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
