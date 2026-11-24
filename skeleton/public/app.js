// The Skeleton screens: the host console (/host?key=...), the table screen (/table) and each
// player's phone (/play). One file; the server sends each screen only what it may see.

import { getSystem, chance, ownDiceHint, SYSTEMS } from '/engine/dicesystems.js';

const ROLE = location.pathname.startsWith('/host') ? 'host' : location.pathname.startsWith('/table') ? 'table' : 'player';
const KEY = new URLSearchParams(location.search).get('key') || '';
const PID = (() => { try { let p = localStorage.getItem('sk-pid'); if (!p) { p = `p${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem('sk-pid', p); } return p; } catch (e) { return `p${Math.random().toString(36).slice(2, 10)}`; } })();
const store = { get(k, d) { try { const v = localStorage.getItem(`sk-${k}`); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(`sk-${k}`, JSON.stringify(v)); } catch (e) { /* private mode */ } } };

let S = null; // the game state (this screen's view)
let HELLO = null; // module, settings
let M = null; // the module
const ui = {
  tab: store.get(`tab-${ROLE}`, null), say: '', narrate: '', hostNote: '', search: '', director: null, convert: { log: [], running: false, result: null },
  build: { origin: '', calling: '', stats: {}, skills: {}, name: '', look: '', want: '' }, lastRollId: null, models: [], readAloud: store.get('read', false),
  form: {},
};

// ---------------------------------------------------------------- tiny DOM helper
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
const opt = (value, text, sel) => h('option', { value, selected: sel }, text);
const T = (k) => (M && M.module.terms[k]) || k;
const statName = (id) => ((M.rules.stats || []).find((x) => x.id === id) || {}).name || id;
const skillName = (id) => ((M.rules.skills || []).find((x) => x.id === id) || {}).name || id;
const condName = (id) => ((M.rules.conditions || []).find((x) => x.id === id) || {}).name || id;
const gearOf = (id) => (M.handbook.gear || []).find((x) => x.id === id);
const abilityOf = (id) => (M.handbook.abilities || []).find((x) => x.id === id);
// The module's dice system, and what a character rolls (the same sums as the Engine's poolFor).
const SYS = () => getSystem(M.rules);
function specFor(c, stat, skill) {
  const S = SYS();
  const mods = c.conds.map((id) => (M.rules.conditions || []).find((x) => x.id === id)).filter((x) => x && (x.dice ?? x.mod)).map((x) => ({ dice: x.dice ?? x.mod }));
  let pen = 0; for (const p of (M.rules.strain && M.rules.strain.penalties) || []) if (c.strain >= p.at) pen = Math.min(pen, p.dice ?? p.mod ?? 0);
  if (pen) mods.push({ dice: pen });
  return S.sys.spec(S.o, { stat: c.stats[stat] ?? 0, skill: skill ? (c.skills[skill] || 0) : 0, mods });
}
const pct = (p) => `${Math.round(p * 100)}%`;
const me = () => { const p = S && S.players[PID]; return p && p.charId ? S.chars[p.charId] : null; };
const curKey = () => (S.fight && S.fight.order.length ? S.fight.order[S.fight.turn].key : null);
const nameOfKey = (key) => { if (!key) return ''; const [k, id] = key.split(':'); return ((k === 'char' ? S.chars : S.creatures)[id] || {}).name || '?'; };

function toast(text, good = false) {
  const t = document.getElementById('toast');
  t.textContent = text; t.className = `toast${good ? ' good' : ''}`; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4500);
}
async function post(path, body) {
  const r = await fetch(`${path}${KEY ? `?key=${encodeURIComponent(KEY)}` : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
}
async function act(action) {
  const r = await post('/api/act', { action, pid: PID });
  if (!r.ok) toast(r.error || 'That did not work.');
  return r.ok;
}

// ---------------------------------------------------------------- voice
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const V = { el: null, queue: [], busy: false, spoken: store.get(`spoken-${ROLE}`, '') };
function audioEl() { if (!V.el) { V.el = new Audio(); V.el.preload = 'auto'; } return V.el; }
function unlockAudio() { const a = audioEl(); if (a.dataset.unlocked) return; a.src = SILENT_WAV; a.play().then(() => { a.dataset.unlocked = '1'; }).catch(() => {}); try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* none */ } }
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, unlockAudio, { passive: true });
function sentences(t) { return String(t).match(/[^.!?]+[.!?]+["'’”]?|[^.!?]+$/g) || [t]; }
function speak(text) { V.queue.push(...sentences(text).map((x) => x.trim()).filter(Boolean)); playNext(); }
async function playNext() {
  if (V.busy || !V.queue.length) return;
  V.busy = true;
  const line = V.queue.shift();
  const done = () => { V.busy = false; playNext(); };
  if (HELLO && HELLO.voice && HELLO.voice.out === 'server') {
    try {
      const r = await fetch('/api/voice/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: line }) });
      if (r.ok && /audio/.test(r.headers.get('content-type') || '')) {
        const a = audioEl(); a.src = URL.createObjectURL(await r.blob()); a.onended = done; a.onerror = done; await a.play().catch(done); return;
      }
    } catch (e) { /* fall back to the screen's voice */ }
  }
  try {
    const u = new SpeechSynthesisUtterance(line);
    const want = (HELLO && HELLO.voice && HELLO.voice.screenVoice) || 'gb-male';
    const vs = speechSynthesis.getVoices();
    const lang = want.startsWith('gb') ? 'en-GB' : want.startsWith('us') ? 'en-US' : 'en';
    u.voice = vs.find((v) => v.lang === lang && (want.endsWith('female') ? /female|woman|zira|susan|serena|libby/i.test(v.name) : /male|man|daniel|george|ryan|david/i.test(v.name))) || vs.find((v) => v.lang === lang) || null;
    u.onend = done; u.onerror = done; speechSynthesis.speak(u);
  } catch (e) { done(); }
}
function speakNew() {
  const narr = S.story.filter((e) => e.kind === 'narration');
  const last = narr.at(-1);
  if (!last) return;
  const idx = narr.findIndex((e) => e.id === V.spoken);
  const fresh = idx >= 0 ? narr.slice(idx + 1) : [];
  V.spoken = last.id; store.set(`spoken-${ROLE}`, last.id);
  if (!ui.readAloud || (ROLE === 'host' && !store.get('host-read', false))) return;
  for (const e of fresh) speak(e.text);
}
const readBtn = (text) => h('button', { title: 'Read aloud', onclick: () => { unlockAudio(); speak(text); } }, '🔊');

// ---------------------------------------------------------------- shared pieces
function diceRow(r, fresh) {
  const faces = r.faces || (r.dice || []).map((v) => ({ v, sides: 6, mark: v === 1 ? 'snag' : v === 6 ? 'six' : '' }));
  return h('div', { class: 'dice' }, faces.map((f) => h('span', { class: `die${f.mark === 'snag' ? ' one' : f.mark === 'six' || f.mark === 'surge' ? ' six' : f.mark === 'hit' ? ' hit' : f.mark === 'wild' ? ' wild' : ''}${f.sides !== 6 ? ' wide' : ''}${fresh ? ' fresh' : ''}`, title: f.sides === 'F' ? 'Fate die' : `d${f.sides}` },
    f.sides === 'F' ? (f.v > 0 ? '+' : f.v < 0 ? '−' : ' ') : f.v, f.sides !== 6 && f.sides !== 'F' ? h('sub', {}, `d${f.sides}`) : null)));
}
function rollCard(r) {
  if (!r) return null;
  const fresh = r.id !== ui.lastRollId;
  ui.lastRollId = r.id;
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, h('b', { class: 'grow' }, `${r.who}: ${r.label}`), r.surge ? h('span', { class: 'pill acc' }, T('surge')) : null, r.snags ? h('span', { class: 'pill no' }, `${r.snags} ${T('snag')}${r.snags > 1 ? 's' : ''}`) : null),
    diceRow(r, fresh),
    h('div', { class: 'row' }, h('span', { class: `result ${r.success === true ? 'ok' : r.success === false ? 'no' : ''}` }, r.total),
      r.shown && r.success != null ? h('span', { class: 'dim' }, `${r.shown}: ${r.success ? (r.partial ? 'partial success' : 'success') : 'failure'}${r.dmg ? `, ${r.dmg} damage` : ''}`)
        : r.at != null && r.shown == null ? h('span', { class: 'dim' }, `against ${r.at}: ${r.success ? `success, ${T('overflow').toLowerCase()} ${r.overflow}` : `short by ${r.shortBy}`}${r.dmg ? `, ${r.dmg} damage` : ''}`)
          : h('span', { class: 'dim' }, `${r.pool || ''} unasked`)),
    r.pool ? h('small', { class: 'faint' }, `Rolled ${r.pool}`) : null,
    r.reason ? h('small', {}, r.reason) : null);
}
function bar(v, max, cls = '') { return h('div', { class: `bar ${cls}`, title: `${v} / ${max}` }, h('i', { style: `width:${Math.max(0, Math.min(100, (100 * v) / Math.max(1, max)))}%` })); }
function storyView(big = false) {
  const box = h('div', { class: `story${big ? ' table-big' : ''}`, 'data-key': 'story' },
    S.story.filter((e) => ROLE === 'host' || e.kind !== 'host').filter((e) => !e.quiet || ROLE === 'host').map((e) => h('div', { class: `ev ${e.kind}` },
      e.kind === 'say' ? h('span', { class: 'who' }, e.who) : null, e.text, e.kind === 'narration' && ROLE !== 'table' ? h('span', { style: 'margin-left:6px' }, readBtn(e.text)) : null)));
  return box;
}
function fightStrip() {
  if (!S.fight) return null;
  const cur = curKey();
  return h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, `Fight: round ${S.fight.round}`), h('span', { class: 'pill acc' }, `${nameOfKey(cur)} is up`)),
    h('div', { class: 'order' }, S.fight.order.map((o) => h('span', { class: `pill${o.key === cur ? ' cur' : ''}` }, nameOfKey(o.key)))));
}
function partyList(compact = false) {
  return Object.values(S.chars).map((c) => h('div', { class: `list-line${c.down ? ' down' : ''}${curKey() === `char:${c.id}` ? ' turn-now' : ''}` },
    h('div', { class: 'grow' }, h('b', {}, c.name), h('small', {}, ` ${(M.handbook.origins.find((x) => x.id === c.origin) || {}).name || ''} ${(M.handbook.callings.find((x) => x.id === c.calling) || {}).name || ''}`),
      h('div', { class: 'grid2' }, h('div', {}, h('small', {}, `${T('health')} ${c.health}/${c.healthMax}`), bar(c.health, c.healthMax)), h('div', {}, h('small', {}, `${T('strain')} ${c.strain}/${M.rules.strain.max}`), bar(c.strain, M.rules.strain.max, 'strain'))),
      c.conds.length ? h('div', { class: 'row' }, c.conds.map((x) => h('span', { class: 'pill no' }, condName(x)))) : null,
      compact ? null : h('small', { class: 'faint' }, c.playerId && S.players[c.playerId] ? `played by ${S.players[c.playerId].name}` : 'no player'))));
}
function placeCard() {
  const adv = M.adventures.find((a) => a.id === S.adventureId) || M.adventures[0];
  const site = (adv.sites || []).find((x) => x.id === S.scene.siteId) || {};
  return h('div', { class: 'card' }, h('h3', {}, adv.name), h('h2', {}, site.name || ''), site.read ? h('small', {}, site.read, ' ', readBtn(site.read)) : null);
}
function clocksQuests(host = false) {
  return h('div', { class: 'card' },
    S.clocks.length ? h('h3', {}, 'Clocks') : null,
    S.clocks.map((c) => h('div', { class: 'row' }, h('span', { class: 'grow' }, c.name), h('span', { class: 'clock' }, Array.from({ length: c.size }, (_, i) => h('i', { class: i < c.filled ? 'f' : '' }))),
      host ? [h('button', { onclick: () => act({ type: 'clock.tick', id: c.id, n: -1 }) }, '−'), h('button', { onclick: () => act({ type: 'clock.tick', id: c.id, n: 1 }) }, '+')] : null)),
    h('h3', {}, 'Quests'),
    S.quests.map((q) => h('div', { class: 'row' }, h('span', { class: `grow${q.done ? ' faint' : ''}` }, q.done ? '✓ ' : '• ', q.text), host && !q.done ? h('button', { onclick: () => act({ type: 'quest.done', id: q.id }) }, 'Done') : null)));
}
function rulesView(includeHidden) {
  const q = ui.search.toLowerCase();
  const all = bookSections(includeHidden).filter((b) => !q || `${b.title} ${b.text}`.toLowerCase().includes(q));
  return h('div', { class: 'view v-one' }, h('div', { class: 'card scroll', 'data-key': 'rules' },
    h('div', { class: 'row' }, h('input', { id: 'rules-search', placeholder: 'Search the books', value: ui.search, oninput: (e) => { ui.search = e.target.value; render(); } })),
    all.slice(0, 120).map((b) => h('div', { class: 'list-line', style: 'align-items:flex-start' }, h('div', { class: 'grow' }, h('b', {}, `${b.book}: ${b.title}`), h('div', { class: 'book dim' }, b.text)), readBtn(b.text)))));
}
// The same books the Director searches, built on the screen from the module it was sent.
function bookSections(hidden) {
  const out = [];
  const add = (book, title, text) => { if (text) out.push({ book, title, text: String(text) }); };
  const R = M.rules;
  { const S = SYS(); add('Rules', `The dice: ${S.name}`, S.sys.describe(S.o, M.module.terms)); }
  add('Rules', `${T('difficulty')} ladder`, R.ladder.map((x) => `${x.at} ${x.name}${x.about ? `: ${x.about}` : ''}`).join('\n'));
  add('Rules', `${T('snag')}s`, [R.snag.effect, ...(R.snag.table || []).map((t) => `${t.snags}${t.snags >= 3 ? '+' : ''} on a failure, ${t.name}: ${t.effect}`)].join('\n'));
  add('Rules', T('surge'), [R.surge.effect, ...(R.surge.options || []).map((o) => `- ${o}`)].join('\n'));
  add('Rules', 'Stats', R.stats.map((s) => `${s.name}: ${s.about || ''}`).join('\n'));
  add('Rules', 'Skills', R.skills.map((s) => `${s.name} (${statName(s.stat)}): ${s.about || ''}`).join('\n'));
  add('Rules', 'Combat', `${R.combat.actionsPerTurn} actions a turn.\n${R.combat.actions.map((a) => `${a.name}: ${a.does}`).join('\n')}`);
  add('Rules', 'Conditions', R.conditions.map((c) => `${c.name}: ${c.effect}${c.ends ? ` Ends: ${c.ends}` : ''}`).join('\n'));
  add('Rules', T('strain'), `0 to ${R.strain.max}. ${(R.strain.penalties || []).map((p) => `At ${p.at}: ${p.dice} dice.`).join(' ')} ${R.strain.atMax || ''}`);
  add('Rules', 'Rest', `Short: ${R.rest.short}\nLong: ${R.rest.long}`);
  for (const q of R.rulings || []) add('Rules', q.q, q.a);
  add('Handbook', 'Introduction', M.handbook.intro);
  for (const o of M.handbook.origins) add('Handbook', `Origin: ${o.name}`, `${o.about || ''} ${o.gift ? `Gift: ${o.gift}` : ''}`);
  for (const c of M.handbook.callings) add('Handbook', `Calling: ${c.name}`, c.about);
  for (const a of M.handbook.abilities || []) add('Handbook', `Ability: ${a.name}`, `${a.cost ? `Cost: ${a.cost}. ` : ''}${a.effect}`);
  for (const g of M.handbook.gear || []) add('Handbook', `Gear: ${g.name}`, `${g.weapon != null ? `Weapon ${g.weapon}. ` : ''}${g.soak != null ? `Soak ${g.soak}. ` : ''}${g.about || ''}`);
  add('Lore', 'The world', M.lore.world);
  for (const s of M.lore.sections || []) add('Lore', s.title, s.text);
  if ((M.lore.glossary || []).length) add('Lore', 'Glossary', M.lore.glossary.map((g) => `${g.term}: ${g.means}`).join('\n'));
  for (const c of M.bestiary.creatures) add('Bestiary', c.name, hidden ? `Tier ${c.tier}. ${c.about || ''} ${T('health')} ${c.health}, soak ${c.soak || 0}, defence ${c.defence}. Attacks: ${c.attacks.map((a) => `${a.name} rating ${a.rating ?? a.dice}, weapon ${a.weapon}`).join('; ')}. ${c.tactics || ''}` : `${c.look || ''}`);
  if (hidden) for (const a of M.adventures) { add('Adventure', `${a.name}: secrets`, a.secrets); for (const s of a.sites) add('Adventure', `${a.name}: ${s.name}`, s.notes); }
  return out;
}

// ---------------------------------------------------------------- Colours tab
const COLOUR_VARS = ['--bg', '--panel', '--panel2', '--line', '--ink', '--dim', '--faint', '--accent', '--accent2', '--ok', '--no', '--warn-c', '--input', '--btn', '--snag', '--six'];
function applyColours() { const c = store.get('colours', {}); for (const [k, v] of Object.entries(c)) document.documentElement.style.setProperty(k, v); }
function coloursView() {
  const cs = getComputedStyle(document.documentElement);
  return h('div', { class: 'view v-one' }, h('div', { class: 'card scroll' }, h('h2', {}, 'Colours'), h('small', {}, 'Every colour on this screen. Saved on this device only.'),
    COLOUR_VARS.map((k) => { const v = cs.getPropertyValue(k).trim(); return h('div', { class: 'swatch' }, h('span', {}, k.slice(2)), h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000', oninput: (e) => { const c = store.get('colours', {}); c[k] = e.target.value; store.set('colours', c); document.documentElement.style.setProperty(k, e.target.value); } }), h('small', {}, v)); }),
    h('div', { class: 'row' }, h('button', { onclick: () => { store.set('colours', {}); for (const k of COLOUR_VARS) document.documentElement.style.removeProperty(k); render(); } }, 'Back to the defaults'))));
}

// ---------------------------------------------------------------- the player's phone
function playerViews() {
  const p = S.players[PID];
  if (!p) {
    return h('div', { class: 'view v-one' }, h('div', { class: 'card', style: 'max-width:520px;margin:auto' }, h('h2', {}, `Join ${M.module.name}`), h('small', {}, M.module.tagline),
      h('label', { class: 'fld' }, h('span', {}, 'Your name'), h('input', { id: 'join-name', value: ui.form.join || '', oninput: (e) => { ui.form.join = e.target.value; } })),
      h('button', { class: 'go', onclick: () => act({ type: 'join', name: ui.form.join || 'Player' }) }, 'Join the table')));
  }
  if (!me()) return chooseView();
  return null;
}
function chooseView() {
  const taken = new Set(Object.values(S.chars).map((c) => c.name));
  const R = M.rules;
  const b = ui.build;
  for (const s of R.stats) if (b.stats[s.id] == null) b.stats[s.id] = R.statPoints.start;
  const calling = M.handbook.callings.find((c) => c.id === b.calling);
  const spentStats = Object.values(b.stats).reduce((a, v) => a + v - R.statPoints.start, 0);
  const skills = { ...b.skills }; for (const k of (calling && calling.skills) || []) skills[k] = Math.max(R.skillPoints.first ?? (getSystem(R).id === 'step' ? 4 : (R.skillPoints.step || 1)), skills[k] || 0);
  const spentSkills = Object.values(skills).reduce((a, v) => a + v, 0);
  const stepper = (val, set, lo, hi, st = 1) => h('div', { class: 'stepper' }, h('button', { disabled: val <= lo, onclick: () => { set(Math.max(lo, val - st)); render(); } }, '−'), h('b', {}, SYS().id === 'step' && val ? `d${val}` : val), h('button', { disabled: val >= hi, onclick: () => { set(Math.min(hi, val === 0 && SYS().id === 'step' ? 4 : val + st)); render(); } }, '+'));
  const first = R.skillPoints.first ?? (SYS().id === 'step' ? 4 : (R.skillPoints.step || 1));
  return h('div', { class: 'view v-two' },
    h('div', { class: 'card scroll', 'data-key': 'pregens' }, h('h2', {}, 'Choose a ready-made character'), h('small', {}, M.handbook.intro, ' ', readBtn(M.handbook.intro)),
      h('div', { class: 'pregens' }, (M.handbook.pregens || []).map((pg, i) => {
        const o = M.handbook.origins.find((x) => x.id === pg.origin) || {}; const c = M.handbook.callings.find((x) => x.id === pg.calling) || {};
        const words = `${pg.name}, ${o.name} ${c.name}. ${pg.look || ''} Wants: ${pg.want || ''}`;
        return h('div', { class: 'choice' }, h('b', {}, pg.name), h('small', {}, `${o.name} ${c.name}`), h('small', { class: 'dim' }, pg.look || ''), h('small', {}, `Wants: ${pg.want || ''}`),
          h('small', { class: 'faint' }, Object.entries(pg.stats || {}).map(([k, v]) => `${statName(k)} ${v}`).join(', ')),
          h('div', { class: 'row' }, h('button', { class: 'go', disabled: taken.has(pg.name), onclick: () => act({ type: 'char.pregen', index: i }) }, taken.has(pg.name) ? 'Taken' : 'Play this one'), readBtn(words)));
      }))),
    h('div', { class: 'card scroll', 'data-key': 'build' }, h('h2', {}, 'Or build your own'),
      (M.handbook.chargen || []).length ? h('small', { class: 'dim' }, M.handbook.chargen.join(' ')) : null,
      h('h3', {}, 'Origin'), h('div', { class: 'grid3' }, M.handbook.origins.map((o) => h('button', { class: `choice${b.origin === o.id ? ' on' : ''}`, onclick: () => { b.origin = o.id; render(); } }, h('b', {}, o.name), h('small', {}, o.about || '')))),
      h('h3', {}, 'Calling'), h('div', { class: 'grid3' }, M.handbook.callings.map((c) => h('button', { class: `choice${b.calling === c.id ? ' on' : ''}`, onclick: () => { b.calling = c.id; render(); } }, h('b', {}, c.name), h('small', {}, c.about || '')))),
      h('small', { class: 'faint' }, `Dice: ${SYS().name}.`),
      h('h3', {}, `Stats (${R.statPoints.spend - spentStats} points left)`),
      h('div', { class: 'grid2' }, R.stats.map((s) => h('div', { class: 'row' }, h('span', { class: 'grow', title: s.about }, s.name), stepper(b.stats[s.id], (v) => { b.stats[s.id] = v; }, R.statPoints.start, R.statPoints.max, R.statPoints.step || 1)))),
      h('h3', {}, `Skills (${R.skillPoints.spend - spentSkills} ranks left)`),
      h('div', { class: 'grid2' }, R.skills.map((s) => h('div', { class: 'row' }, h('span', { class: 'grow', title: s.about }, s.name, h('small', { class: 'faint' }, ` ${statName(s.stat)}`)), stepper(skills[s.id] || 0, (v) => { b.skills[s.id] = v; }, calling && calling.skills.includes(s.id) ? first : 0, R.skillPoints.max, R.skillPoints.step || 1)))),
      h('label', { class: 'fld' }, h('span', {}, 'Name'), h('input', { id: 'b-name', value: b.name, oninput: (e) => { b.name = e.target.value; } })),
      h('label', { class: 'fld' }, h('span', {}, 'Look (one line)'), h('input', { id: 'b-look', value: b.look, oninput: (e) => { b.look = e.target.value; } })),
      h('label', { class: 'fld' }, h('span', {}, 'What they want'), h('input', { id: 'b-want', value: b.want, oninput: (e) => { b.want = e.target.value; } })),
      h('button', { class: 'go', onclick: () => act({ type: 'char.create', input: { ...b, skills } }) }, 'Make my character')));
}
function playerStory() {
  const c = me();
  const mine = S.requests.filter((q) => q.charId === c.id);
  const lastRoll = S.rolls.at(-1);
  const myTurn = S.fight && curKey() === `char:${c.id}`;
  const foes = Object.values(S.creatures).filter((k) => k.siteId === S.scene.siteId && !k.down);
  const weapons = c.gear.map(gearOf).filter((g) => g && g.kind === 'weapon');
  ui.form.weapon = ui.form.weapon && weapons.some((w) => w.id === ui.form.weapon) ? ui.form.weapon : (weapons[0] || {}).id;
  ui.form.target = ui.form.target && foes.some((k) => k.id === ui.form.target) ? ui.form.target : (foes[0] || {}).id;
  return h('div', { class: 'view v-play' },
    h('div', { class: 'card' }, storyView(),
      h('div', { class: 'say-box' }, h('input', { id: 'say', placeholder: `What does ${c.name} do or say?`, value: ui.say, oninput: (e) => { ui.say = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') sendSay(); } }), h('button', { class: 'go', onclick: sendSay }, 'Say'))),
    h('div', { class: 'side' },
      mine.map((q) => { const sp = specFor(c, q.stat, q.skill); return h('div', { class: 'card roll-card' }, h('h2', {}, `Roll ${statName(q.stat)}${q.skill ? ` + ${skillName(q.skill)}` : ''}`), h('small', {}, q.reason),
        h('div', { class: 'row' }, h('span', { class: 'pill acc' }, sp.label), h('small', {}, `about ${pct(chance(SYS(), sp, q.at))} to succeed`)),
        h('div', { class: 'row' }, h('button', { class: 'go', onclick: () => act({ type: 'roll.make', id: q.id }) }, 'Roll the dice'),
          h('input', { id: `own-${q.id}`, placeholder: `or type your dice: ${ownDiceHint(sp)}`, style: 'flex:1;min-width:160px', value: ui.form[`own-${q.id}`] || '', oninput: (e) => { ui.form[`own-${q.id}`] = e.target.value; } }),
          h('button', { onclick: () => act({ type: 'roll.make', id: q.id, dice: String(ui.form[`own-${q.id}`] || '').match(/[+-]|\d+/g) || [] }) }, 'Use mine'))); }),
      rollCard(lastRoll),
      fightStrip(),
      myTurn ? h('div', { class: 'card turn-now' }, h('h2', {}, 'Your turn'), h('small', {}, `${M.rules.combat.actionsPerTurn} actions. Used: ${S.fight.used || 0}.`),
        weapons.length && foes.length ? h('div', { class: 'row' }, h('select', { onchange: (e) => { ui.form.weapon = e.target.value; } }, weapons.map((w) => opt(w.id, `${w.name} (${w.weapon})`, w.id === ui.form.weapon))),
          h('select', { onchange: (e) => { ui.form.target = e.target.value; } }, foes.map((k) => opt(k.id, k.name, k.id === ui.form.target))),
          h('button', { class: 'go', onclick: () => act({ type: 'attack', charId: c.id, gearId: ui.form.weapon, target: ui.form.target }) }, 'Attack')) : null,
        h('div', { class: 'row' }, c.abilities.map(abilityOf).filter(Boolean).map((ab) => h('button', { title: ab.effect, onclick: () => act({ type: 'ability.use', charId: c.id, abilityId: ab.id }) }, ab.name)),
          h('button', { onclick: () => act({ type: 'brace', charId: c.id }) }, 'Brace'), h('button', { class: 'go', onclick: () => act({ type: 'fight.next' }) }, 'End my turn'))) : null,
      h('div', { class: 'card' }, h('h3', {}, 'The party'), partyList(true)),
      placeCard()));
}
async function sendSay() { const t = ui.say.trim(); if (!t) return; if (await act({ type: 'say', text: t })) { ui.say = ''; render(); } }
function sheetView(c) {
  const R = M.rules;
  return h('div', { class: 'view v-two' },
    h('div', { class: 'card scroll' }, h('h2', {}, c.name), h('small', {}, `${(M.handbook.origins.find((x) => x.id === c.origin) || {}).name} ${(M.handbook.callings.find((x) => x.id === c.calling) || {}).name} · ${T('level')} ${c.level} · ${c.xp} ${T('xp')}`),
      c.look ? h('small', { class: 'dim' }, c.look) : null, c.want ? h('small', {}, `Wants: ${c.want}`) : null,
      h('div', { class: 'stat-tiles' }, R.stats.map((s) => h('div', { class: 'tile', title: s.about }, h('div', { class: 'k' }, s.name), h('div', { class: 'v' }, SYS().id === 'step' ? `d${c.stats[s.id]}` : SYS().id === 'percentile' ? `${c.stats[s.id]}%` : (c.stats[s.id] ?? 0))))),
      h('div', {}, h('small', {}, `${T('health')} ${c.health} / ${c.healthMax}`), bar(c.health, c.healthMax)),
      h('div', {}, h('small', {}, `${T('strain')} ${c.strain} / ${R.strain.max}`), bar(c.strain, R.strain.max, 'strain')),
      c.conds.length ? h('div', { class: 'row' }, c.conds.map((x) => h('span', { class: 'pill no', title: ((R.conditions.find((y) => y.id === x) || {}).effect) }, condName(x)))) : null,
      h('h3', {}, `Skills (${SYS().name})`), R.skills.filter((s) => c.skills[s.id]).map((s) => h('div', { class: 'list-line' }, h('span', { class: 'grow' }, s.name, h('small', { class: 'faint' }, ` ${statName(s.stat)}`)), h('b', {}, SYS().id === 'step' ? `d${c.skills[s.id]}` : c.skills[s.id]), h('span', { class: 'pill' }, specFor(c, s.stat, s.id).label),
        h('button', { title: 'Roll it for yourself (not asked for)', onclick: () => act({ type: 'roll.free', charId: c.id, stat: s.stat, skill: s.id }) }, '🎲')))),
    h('div', { class: 'card scroll' }, h('h3', {}, 'Gear'), c.gear.map(gearOf).filter(Boolean).map((g) => h('div', { class: 'list-line' }, h('b', {}, g.name), h('small', { class: 'grow dim' }, `${g.weapon != null ? `weapon ${g.weapon} · ` : ''}${g.soak != null ? `soak ${g.soak} · ` : ''}${g.about || ''}`))),
      h('h3', {}, 'Abilities'), c.abilities.map(abilityOf).filter(Boolean).map((a) => h('div', { class: 'list-line' }, h('div', { class: 'grow' }, h('b', {}, a.name), h('div', { class: 'dim' }, `${a.cost ? `${a.cost}. ` : ''}${a.effect}`)), readBtn(`${a.name}. ${a.effect}`))),
      h('h3', {}, 'Notes'), h('textarea', { id: 'notes', value: ui.form.notes ?? c.notes, oninput: (e) => { ui.form.notes = e.target.value; } }),
      h('button', { onclick: () => act({ type: 'char.notes', charId: c.id, text: ui.form.notes ?? c.notes }) }, 'Save notes')));
}

// ---------------------------------------------------------------- the table screen
function tableView() {
  return h('div', { class: 'view v-table' },
    h('div', { class: 'card' }, storyView(true)),
    h('div', { class: 'side' }, placeCard(), fightStrip(), rollCard(S.rolls.at(-1)), h('div', { class: 'card' }, h('h3', {}, 'The party'), partyList()), clocksQuests(),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', checked: ui.readAloud, onchange: (e) => { ui.readAloud = e.target.checked; store.set('read', ui.readAloud); unlockAudio(); } }), 'Read the Director aloud on this screen')));
}

// ---------------------------------------------------------------- the host console
function hostPlay() {
  const here = Object.values(S.creatures).filter((k) => k.siteId === S.scene.siteId);
  const d = ui.director || (HELLO.lastDirector ? { last: HELLO.lastDirector } : null);
  const alive = Object.values(S.chars).filter((c) => !c.down);
  return h('div', { class: 'view v-play' },
    h('div', { class: 'card' }, storyView(),
      h('div', { class: 'say-box' }, h('input', { id: 'narrate', placeholder: 'Narrate as the Director (Enter to send)', value: ui.narrate, oninput: (e) => { ui.narrate = e.target.value; }, onkeydown: async (e) => { if (e.key === 'Enter' && ui.narrate.trim() && await act({ type: 'narrate', text: ui.narrate })) { ui.narrate = ''; render(); } } }),
        h('button', { onclick: async () => { if (ui.narrate.trim() && await act({ type: 'narrate', text: ui.narrate })) { ui.narrate = ''; render(); } } }, 'Narrate'))),
    h('div', { class: 'side' },
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'AI Director'), d && d.busy ? h('span', { class: 'pill acc' }, 'thinking…') : null),
        h('div', { class: 'row' }, h('select', { onchange: (e) => act({ type: 'director.mode', mode: e.target.value }) }, opt('off', 'Off: I run the table', S.director.mode === 'off'), opt('auto', 'On: answers every player', S.director.mode === 'auto'))),
        h('div', { class: 'row' }, h('input', { id: 'host-note', class: 'grow', placeholder: 'A word to the Director (optional)', value: ui.hostNote, oninput: (e) => { ui.hostNote = e.target.value; } }),
          h('button', { class: 'go', onclick: async () => { const r = await post('/api/director', { reason: 'The host asks you to continue.', hostNote: ui.hostNote }); if (!r.ok) toast(r.error); ui.hostNote = ''; } }, 'Director, go')),
        d && d.last ? h('div', { class: 'log' }, d.last.error ? `Error: ${d.last.error}` : [
          `${(d.last.calls || []).map((c) => `${c.name}${c.result && c.result.refused ? ' (refused)' : c.result && c.result.note ? ' (note)' : ''}`).join(', ') || 'narration only'}`,
          ...(d.last.flags || []).filter((f) => f.kind !== 'note').map((f) => `\n⚑ ${f.text}`),
          ...(d.last.calls || []).filter((c) => c.result && c.result.refused).map((c) => `\n✗ ${c.name}: ${c.result.refused}`)]) : null),
      S.requests.length ? h('div', { class: 'card roll-card' }, h('h3', {}, 'Rolls waiting'), S.requests.map((q) => h('div', { class: 'list-line' }, h('span', { class: 'grow' }, `${(S.chars[q.charId] || {}).name}: ${statName(q.stat)}${q.skill ? ` + ${skillName(q.skill)}` : ''} vs ${q.at} (${q.reason})`),
        h('button', { onclick: () => act({ type: 'roll.make', id: q.id }) }, 'Roll for them'), h('button', { onclick: () => act({ type: 'roll.cancel', id: q.id }) }, '✕')))) : null,
      rollCard(S.rolls.at(-1)),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Fight'),
        S.fight ? [h('button', { onclick: () => act({ type: 'fight.next' }) }, 'Next turn'), h('button', { onclick: () => act({ type: 'fight.end' }) }, 'End fight')] : h('button', { onclick: () => act({ type: 'fight.start' }) }, 'Start a fight')),
        S.fight ? h('div', { class: 'order' }, S.fight.order.map((o) => h('span', { class: `pill${o.key === curKey() ? ' cur' : ''}` }, `${nameOfKey(o.key)} ${o.init}`))) : null),
      h('div', { class: 'card' }, h('h3', {}, 'Creatures here'), here.length ? here.map((k) => {
        const b = M.bestiary.creatures.find((x) => x.id === k.base) || { attacks: [] };
        return h('div', { class: `list-line${k.down ? ' down' : ''}${curKey() === `creature:${k.id}` ? ' turn-now' : ''}` }, h('div', { class: 'grow' }, h('b', {}, k.name), h('small', {}, ` ${k.health}/${k.healthMax}${k.hidden ? ' · hidden' : ''}${k.conds.length ? ` · ${k.conds.join(', ')}` : ''}`), bar(k.health, k.healthMax)),
          !k.down && alive.length ? b.attacks.map((a) => h('button', { title: `rating ${a.rating ?? a.dice}, weapon ${a.weapon}`, onclick: () => act({ type: 'creature.act', creature: k.id, attack: a.name, target: (alive[Math.floor(Math.random() * alive.length)] || {}).id }) }, a.name)) : null,
          k.hidden ? h('button', { onclick: () => act({ type: 'creature.reveal', ids: [k.id] }) }, 'Reveal') : null,
          !k.down ? h('button', { onclick: () => act({ type: 'creature.flee', creature: k.id }) }, 'Flees') : null);
      }) : h('small', {}, 'None.')),
      h('div', { class: 'card' }, h('h3', {}, 'The party'), partyList())));
}
function hostWorld() {
  const adv = M.adventures.find((a) => a.id === S.adventureId) || M.adventures[0];
  const site = adv.sites.find((x) => x.id === S.scene.siteId) || {};
  const f = ui.form;
  const everyone = [...Object.values(S.chars), ...Object.values(S.creatures).filter((k) => k.siteId === S.scene.siteId && !k.down)];
  const std = (M.rules.ladder.find((x) => /^(standard|medium|regular|average|routine)$/i.test(x.name)) || M.rules.ladder[1] || M.rules.ladder[0]).at;
  f.ask = f.ask || { chars: [], stat: M.rules.stats[0].id, skill: '', at: std, reason: '', dmg: 0, cond: '' };
  return h('div', { class: 'view v-two' },
    h('div', { class: 'side' },
      h('div', { class: 'card' }, h('h3', {}, 'The place'), h('h2', {}, site.name), h('small', {}, site.read), site.notes ? h('small', { class: 'dim' }, `Notes: ${site.notes}`) : null,
        (site.hazards || []).map((z) => h('small', {}, `Hazard: ${z.name}: ${statName(z.stat)}${z.skill ? ` + ${skillName(z.skill)}` : ''} vs ${z.at}; ${z.fail || ''}`)),
        h('div', { class: 'row' }, h('small', {}, 'Go to:'), adv.sites.filter((x) => x.id !== site.id).map((x) => h('button', { class: (site.exits || []).includes(x.id) ? 'go' : '', onclick: () => act({ type: 'site.move', siteId: x.id }) }, x.name)))),
      clocksQuests(true),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('input', { id: 'q-new', class: 'grow', placeholder: 'A new quest', value: f.quest || '', oninput: (e) => { f.quest = e.target.value; } }), h('button', { onclick: async () => { if (await act({ type: 'quest.add', text: f.quest })) { f.quest = ''; render(); } } }, 'Add quest')),
        h('div', { class: 'row' }, h('button', { onclick: () => act({ type: 'rest', kind: 'short' }) }, 'Short rest'), h('button', { onclick: () => act({ type: 'rest', kind: 'long' }) }, 'Long rest'),
          h('input', { type: 'number', style: 'width:90px', value: f.xp || 5, oninput: (e) => { f.xp = e.target.value; } }), h('button', { onclick: () => act({ type: 'xp.award', amount: f.xp || 5, why: 'a milestone' }) }, `Give ${T('xp')}`)))),
    h('div', { class: 'side' },
      h('div', { class: 'card' }, h('h3', {}, 'Ask for a roll'),
        h('div', { class: 'row' }, Object.values(S.chars).map((c) => h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', checked: f.ask.chars.includes(c.id), onchange: (e) => { f.ask.chars = e.target.checked ? [...f.ask.chars, c.id] : f.ask.chars.filter((x) => x !== c.id); } }), c.name))),
        h('div', { class: 'grid3' }, h('select', { onchange: (e) => { f.ask.stat = e.target.value; } }, M.rules.stats.map((s) => opt(s.id, s.name, s.id === f.ask.stat))),
          h('select', { onchange: (e) => { f.ask.skill = e.target.value; } }, opt('', 'no skill', !f.ask.skill), M.rules.skills.map((s) => opt(s.id, s.name, s.id === f.ask.skill))),
          h('select', { onchange: (e) => { f.ask.at = Number(e.target.value); } }, M.rules.ladder.map((r) => opt(r.at, `${r.name} ${r.at}`, r.at === Number(f.ask.at))))),
        h('input', { id: 'ask-reason', placeholder: 'What for (the player sees this)', value: f.ask.reason, oninput: (e) => { f.ask.reason = e.target.value; } }),
        h('div', { class: 'grid2' }, h('label', { class: 'fld' }, h('span', {}, `On a failure: lose ${T('health')}`), h('input', { type: 'number', value: f.ask.dmg, oninput: (e) => { f.ask.dmg = e.target.value; } })),
          h('label', { class: 'fld' }, h('span', {}, 'On a failure: condition'), h('select', { onchange: (e) => { f.ask.cond = e.target.value; } }, opt('', 'none', !f.ask.cond), M.rules.conditions.map((c) => opt(c.id, c.name, c.id === f.ask.cond))))),
        h('button', { class: 'go', onclick: () => act({ type: 'roll.ask', charIds: f.ask.chars, stat: f.ask.stat, skill: f.ask.skill, at: f.ask.at, reason: f.ask.reason, fail: { damage: Number(f.ask.dmg) || 0, cond: f.ask.cond } }) }, 'Ask')),
      h('div', { class: 'card' }, h('h3', {}, 'Hurt, heal, conditions'),
        h('div', { class: 'grid3' }, h('select', { onchange: (e) => { f.who = e.target.value; } }, opt('', 'who?', !f.who), everyone.map((o) => opt(o.id, o.name, o.id === f.who))),
          h('input', { type: 'number', placeholder: 'amount', value: f.amt || '', oninput: (e) => { f.amt = e.target.value; } }),
          h('select', { onchange: (e) => { f.cond = e.target.value; } }, opt('', 'condition', !f.cond), M.rules.conditions.map((c) => opt(c.id, c.name, c.id === f.cond)))),
        h('div', { class: 'row' }, h('button', { onclick: () => act({ type: 'damage', target: f.who, amount: f.amt }) }, 'Damage'), h('button', { onclick: () => act({ type: 'heal', target: f.who, amount: f.amt }) }, 'Heal'),
          h('button', { onclick: () => act({ type: 'cond.add', target: f.who, cond: f.cond }) }, 'Add condition'), h('button', { onclick: () => act({ type: 'cond.remove', target: f.who, cond: f.cond }) }, 'Remove'),
          h('button', { onclick: () => act({ type: 'strain.mark', charId: f.who, n: Number(f.amt) || 1 }) }, `Mark ${T('strain')}`))),
      h('div', { class: 'card' }, h('h3', {}, 'Bring in a creature'),
        h('div', { class: 'grid3' }, h('select', { onchange: (e) => { f.beast = e.target.value; } }, M.bestiary.creatures.map((c) => opt(c.id, `${c.name} (tier ${c.tier})`, c.id === f.beast))),
          h('input', { type: 'number', value: f.count || 1, oninput: (e) => { f.count = e.target.value; } }),
          h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', checked: !!f.hidden, onchange: (e) => { f.hidden = e.target.checked; } }), 'hidden')),
        h('button', { onclick: () => act({ type: 'creature.add', base: f.beast || M.bestiary.creatures[0].id, count: f.count || 1, hidden: !!f.hidden }) }, 'Add'))));
}
function hostConverter() {
  const C = ui.convert;
  const f = ui.form.cv = ui.form.cv || { mode: 'invent', base: S.moduleId, name: '', ideas: '', source: '', notes: '', sections: [] };
  const SECTIONS = ['module', 'rules', 'handbook', 'bestiary', 'lore', 'adventure'];
  return h('div', { class: 'view v-play' },
    h('div', { class: 'card scroll', 'data-key': 'cv' }, h('h2', {}, 'Converter'),
      h('small', {}, 'Turn a rule book, a players\' handbook, a monster book, a campaign, or a few ideas into a module for this skeleton. It uses the AI chosen on the AI tab, writes one section at a time, checks each one and sends problems back to be fixed.'),
      h('div', { class: 'grid3' }, Object.entries(HELLO.modes).map(([k, v]) => h('button', { class: `choice${f.mode === k ? ' on' : ''}`, onclick: () => { f.mode = k; render(); } }, h('b', {}, k === 'convert' ? 'Convert' : k === 'invent' ? 'Invent' : 'Extend'), h('small', {}, v)))),
      f.mode === 'extend' ? h('label', { class: 'fld' }, h('span', {}, 'Module to extend'), h('select', { onchange: (e) => { f.base = e.target.value; } }, HELLO.modules.map((m) => opt(m.id, m.name, m.id === f.base)))) : h('label', { class: 'fld' }, h('span', {}, 'Name of the new game (optional)'), h('input', { id: 'cv-name', value: f.name, oninput: (e) => { f.name = e.target.value; } })),
      h('label', { class: 'fld' }, h('span', {}, 'Dice system'), h('select', { onchange: (e) => { f.dice = e.target.value; } },
        opt('', f.mode === 'convert' ? 'Keep the source\'s own dice (or the closest system)' : 'Let the converter choose (the d6 pool when unsure)', !f.dice),
        Object.entries(SYSTEMS).map(([id, x]) => opt(id, `${x.name}: ${x.for}`, f.dice === id)))),
      h('label', { class: 'fld' }, h('span', {}, 'Ideas: a few lines are enough ("sky whales, kite cities, smugglers, a storm that eats memories")'), h('textarea', { id: 'cv-ideas', rows: 4, value: f.ideas, oninput: (e) => { f.ideas = e.target.value; } })),
      h('label', { class: 'fld' }, h('span', {}, `Source material: paste text, or add .txt / .md / .json files (${f.source.length.toLocaleString()} characters; the first 90,000 are used)`), h('textarea', { id: 'cv-source', rows: 7, value: f.source, oninput: (e) => { f.source = e.target.value; } })),
      h('input', { type: 'file', multiple: true, accept: '.txt,.md,.json,.markdown,.csv', onchange: async (e) => { for (const file of e.target.files) f.source += `\n\n=== ${file.name} ===\n${await file.text()}`; render(); } }),
      h('label', { class: 'fld' }, h('span', {}, 'Notes for the converter (optional: "convert chapter 2", "keep it for children", "make magic dangerous")'), h('input', { id: 'cv-notes', value: f.notes, oninput: (e) => { f.notes = e.target.value; } })),
      h('div', { class: 'row' }, h('small', {}, 'Sections:'), SECTIONS.map((s) => h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', checked: f.sections.includes(s), onchange: (e) => { f.sections = e.target.checked ? [...f.sections, s] : f.sections.filter((x) => x !== s); } }), s)), h('small', { class: 'faint' }, '(none ticked: all, or creatures and an adventure when extending)')),
      h('div', { class: 'row' }, h('button', { class: 'go', disabled: C.running, onclick: async () => {
        C.running = true; C.log = []; C.result = null; render();
        const r = await post('/api/convert', { mode: f.mode, base: f.base, name: f.name, ideas: f.ideas, source: f.source, notes: f.notes, dice: f.dice || '', sections: f.sections.length ? SECTIONS.filter((s) => f.sections.includes(s)) : undefined });
        C.running = false; C.result = r; if (r.savedAs) HELLO = await (await fetch(`/api/hello?key=${encodeURIComponent(KEY)}`)).json(); render();
      } }, C.running ? 'Converting… (a minute or two a section)' : 'Convert'),
      h('a', { href: '/docs/CONVERTER-PROMPT.md', target: '_blank' }, 'The copy-paste prompt'), h('a', { href: '/docs/DESIGNER-PROMPT.md', target: '_blank' }, 'The designer prompt'), h('a', { href: '/docs/MODULE-FORMAT.md', target: '_blank' }, 'The format'))),
    h('div', { class: 'card scroll' }, h('h3', {}, 'Progress'),
      h('div', { class: 'log' }, C.log.map((p) => `${p.section}: ${p.stage}${p.errors && p.errors.length ? ` (${p.errors.length} problem${p.errors.length > 1 ? 's' : ''})` : ''}\n`)),
      C.result ? h('div', {}, C.result.error ? h('p', { class: 'result no' }, C.result.error) : [
        h('p', {}, C.result.ok ? h('b', { class: 'result ok' }, `Saved as "${C.result.savedAs}": valid.`) : h('b', { class: 'result no' }, `Saved as "${C.result.savedAs}" with ${C.result.errors.length} problem(s).`)),
        !C.result.ok ? h('div', { class: 'log' }, C.result.errors.map((e) => `• ${e}\n`)) : null,
        h('small', {}, `${(C.result.usage || {}).in || 0} tokens in, ${(C.result.usage || {}).out || 0} out. The files are in modules/${C.result.savedAs}/: edit them in any text editor, then press Check on the Game tab.`),
        C.result.ok ? h('button', { class: 'go', onclick: async () => { if (confirm(`Start a new game of "${C.result.savedAs}"? The current game is saved and can be undone.`)) { const r = await post('/api/new', { module: C.result.savedAs }); if (r.ok) location.reload(); else toast(r.error); } } }, 'Play it now') : null]) : null));
}
function hostAI() {
  const ai = HELLO.ai;
  const p = HELLO.providers.find((x) => x.id === ai.provider) || HELLO.providers[0];
  const f = ui.form.ai = ui.form.ai || { apiKey: '', baseUrl: ai.baseUrl || p.base, model: ai.model };
  const save = async (extra = {}) => { const r = await post('/api/settings', { op: 'ai', ...extra }); if (r.ok) { HELLO.ai = r.ai; render(); toast('Saved.', true); } else toast(r.error); };
  return h('div', { class: 'view v-two' }, h('div', { class: 'card scroll' }, h('h2', {}, 'The AI'),
    h('small', {}, 'The Director and the converter use this. Keys stay on this computer.'),
    h('label', { class: 'fld' }, h('span', {}, 'Provider'), h('select', { onchange: (e) => { ui.form.ai = null; ui.models = []; save({ provider: e.target.value }); } }, HELLO.providers.map((x) => opt(x.id, x.name, x.id === ai.provider)))),
    p.hint ? h('small', { class: 'dim' }, p.hint) : null,
    p.key !== 'none' ? h('label', { class: 'fld' }, h('span', {}, `API key ${ai.keySet ? '(set: type a new one to replace it)' : `(from ${p.keyFrom})`}`), h('input', { id: 'ai-key', type: 'password', value: f.apiKey, oninput: (e) => { f.apiKey = e.target.value; } })) : null,
    p.url ? h('label', { class: 'fld' }, h('span', {}, 'Address'), h('input', { id: 'ai-url', value: f.baseUrl, oninput: (e) => { f.baseUrl = e.target.value; } })) : null,
    h('div', { class: 'row' }, h('button', { onclick: async () => { await save({ apiKey: f.apiKey, baseUrl: f.baseUrl }); const r = await post('/api/models', {}); if (!r.ok) { toast(r.error); return; } ui.models = r.models; if (r.pick && !HELLO.ai.model) await save({ model: r.pick }); render(); } }, 'Save and list models')),
    h('label', { class: 'fld' }, h('span', {}, 'Model'), ui.models.length ? h('select', { onchange: (e) => save({ model: e.target.value }) }, opt('', 'choose…', !ai.model), ui.models.map((m) => opt(m.id, m.name, m.id === ai.model))) : h('input', { id: 'ai-model', value: f.model, placeholder: 'press "Save and list models", or type a model id', oninput: (e) => { f.model = e.target.value; }, onchange: () => save({ model: f.model }) })),
    p.group === 'local' ? h('label', { class: 'fld' }, h('span', {}, 'Thinking (local models)'), h('select', { onchange: (e) => save({ thinking: e.target.value }) }, ['default', 'off', 'low', 'medium'].map((x) => opt(x, x, x === ai.thinking)))) : null,
    h('div', { class: 'row' }, h('button', { class: 'go', onclick: async () => { const r = await post('/api/test', {}); toast(r.ok ? `${r.works ? 'It works' : 'It answered, but did not call the test tool: the Director needs a model that can'} (${r.ms} ms).` : r.error, r.ok && r.works); } }, 'Test the connection'))));
}
function hostVoice() {
  const v = HELLO.voiceCfg.out;
  const f = ui.form.voice = ui.form.voice || { url: v.url, model: v.model, voice: v.voice, key: '' };
  const save = async (extra = {}) => { const r = await post('/api/settings', { op: 'voice', out: { url: f.url, model: f.model, voice: f.voice, key: f.key, ...extra } }); if (r.ok) { HELLO.voiceCfg = r.voiceCfg; HELLO.voice = { ...HELLO.voice, out: r.voiceCfg.out.engine, screenVoice: r.voiceCfg.out.screenVoice }; render(); toast('Saved.', true); } };
  return h('div', { class: 'view v-two' }, h('div', { class: 'card scroll' }, h('h2', {}, 'Voice'),
    h('label', { class: 'fld' }, h('span', {}, 'Who speaks the narration'), h('select', { onchange: (e) => save({ engine: e.target.value }) }, opt('browser', 'Each screen\'s own voice (free, no set-up)', v.engine === 'browser'), opt('server', 'A speech server (Kokoro, Piper or a cloud service)', v.engine === 'server'))),
    h('label', { class: 'fld' }, h('span', {}, 'Screen voice'), h('select', { onchange: (e) => save({ screenVoice: e.target.value }) }, ['gb-male', 'gb-female', 'us-male', 'us-female', 'any'].map((x) => opt(x, x, x === v.screenVoice)))),
    v.engine === 'server' ? [h('label', { class: 'fld' }, h('span', {}, 'Speech server address (ends in /v1)'), h('input', { id: 'v-url', value: f.url, oninput: (e) => { f.url = e.target.value; } })),
      h('div', { class: 'grid2' }, h('label', { class: 'fld' }, h('span', {}, 'Model'), h('input', { id: 'v-model', value: f.model, oninput: (e) => { f.model = e.target.value; } })), h('label', { class: 'fld' }, h('span', {}, 'Voice'), h('input', { id: 'v-voice', value: f.voice, oninput: (e) => { f.voice = e.target.value; } }))),
      h('label', { class: 'fld' }, h('span', {}, `Key ${v.keySet ? '(set)' : '(none needed on this PC)'}`), h('input', { id: 'v-key', type: 'password', value: f.key, oninput: (e) => { f.key = e.target.value; } }))] : null,
    h('div', { class: 'row' }, h('button', { onclick: () => save() }, 'Save'), h('button', { class: 'go', onclick: () => { unlockAudio(); speak('The lamps gutter, and somewhere ahead something waits to be found.'); } }, 'Test')),
    h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', checked: store.get('host-read', false), onchange: (e) => { store.set('host-read', e.target.checked); ui.readAloud = e.target.checked; store.set('read', e.target.checked); } }), 'Also read aloud on this console')));
}
function hostGame() {
  const f = ui.form.game = ui.form.game || { module: S.moduleId, adventure: S.adventureId };
  return h('div', { class: 'view v-two' },
    h('div', { class: 'card scroll' }, h('h2', {}, 'Game'),
      h('small', {}, `Playing ${M.module.name}: ${(M.adventures.find((a) => a.id === S.adventureId) || {}).name}.`),
      h('div', { class: 'row' }, h('button', { onclick: async () => { const r = await post('/api/undo', {}); if (!r.ok) toast(r.error); } }, 'Undo the last change')),
      h('h3', {}, 'New game'),
      h('label', { class: 'fld' }, h('span', {}, 'Module'), h('select', { onchange: (e) => { f.module = e.target.value; render(); } }, HELLO.modules.map((m) => opt(m.id, `${m.name}: ${m.tagline}`, m.id === f.module)))),
      f.module === S.moduleId ? h('label', { class: 'fld' }, h('span', {}, 'Adventure'), h('select', { onchange: (e) => { f.adventure = e.target.value; } }, M.adventures.map((a) => opt(a.id, a.name, a.id === f.adventure)))) : h('small', {}, 'Its first adventure starts; choose another after.'),
      h('div', { class: 'row' }, h('button', { onclick: async () => { const r = await post('/api/check', { id: f.module }); ui.form.checked = r; render(); } }, 'Check the module'),
        h('button', { class: 'warn', onclick: async () => { if (!confirm('Start a new game? The current one can be brought back with Undo only until the host restarts.')) return; const r = await post('/api/new', { module: f.module, adventure: f.module === S.moduleId ? f.adventure : undefined }); if (r.ok) location.reload(); else toast(r.error); } }, 'Start a new game')),
      ui.form.checked ? h('div', { class: 'log' }, ui.form.checked.ok === false && ui.form.checked.error ? ui.form.checked.error : ui.form.checked.errors.length ? ui.form.checked.errors.map((e) => `• ${e}\n`) : 'Valid: every section checks out.') : null),
    h('div', { class: 'card scroll' }, h('h3', {}, 'Players'), Object.values(S.players).map((p) => h('div', { class: 'list-line' }, h('span', { class: 'grow' }, p.name), h('small', {}, p.charId && S.chars[p.charId] ? S.chars[p.charId].name : 'no character'))),
      h('h3', {}, 'Characters'), Object.values(S.chars).map((c) => h('div', { class: 'list-line' }, h('span', { class: 'grow' }, c.name), h('select', { onchange: (e) => act({ type: 'char.release', charId: c.id, playerId: e.target.value || null }) }, opt('', 'nobody', !c.playerId), Object.values(S.players).map((p) => opt(p.id, p.name, p.id === c.playerId))))),
      h('h3', {}, 'Where players join'), h('div', { class: 'log' }, `${location.protocol}//${(HELLO.addresses || [])[0] || location.hostname}:${HELLO.port}/play\n${location.protocol}//${location.host}/table`)));
}

// ---------------------------------------------------------------- tabs and rendering
const TABS = {
  host: [['play', 'Play'], ['world', 'World'], ['rules', 'Books'], ['convert', 'Converter'], ['ai', 'AI'], ['voice', 'Voice'], ['game', 'Game'], ['colours', 'Colours']],
  table: [['story', 'Story'], ['rules', 'Books'], ['colours', 'Colours']],
  player: [['story', 'Story'], ['sheet', 'Sheet'], ['rules', 'Books'], ['voice', 'Voice'], ['colours', 'Colours']],
};
function view() {
  const tab = ui.tab;
  if (tab === 'colours') return coloursView();
  if (ROLE === 'host') {
    if (tab === 'world') return hostWorld();
    if (tab === 'rules') return rulesView(true);
    if (tab === 'convert') return hostConverter();
    if (tab === 'ai') return hostAI();
    if (tab === 'voice') return hostVoice();
    if (tab === 'game') return hostGame();
    return hostPlay();
  }
  if (ROLE === 'table') return tab === 'rules' ? rulesView(false) : tableView();
  const gate = playerViews();
  if (gate) return gate;
  if (tab === 'sheet') return sheetView(me());
  if (tab === 'rules') return rulesView(false);
  if (tab === 'voice') return h('div', { class: 'view v-one' }, h('div', { class: 'card' }, h('h2', {}, 'Voice'), h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', checked: ui.readAloud, onchange: (e) => { ui.readAloud = e.target.checked; store.set('read', ui.readAloud); unlockAudio(); } }), 'Read the Director aloud on my phone'), h('button', { onclick: () => { unlockAudio(); speak('The lamps gutter, and somewhere ahead something waits to be found.'); } }, 'Test')));
  return playerStory();
}
function render() {
  if (!S || !M) return;
  const tabs = TABS[ROLE];
  if (!ui.tab || !tabs.some(([k]) => k === ui.tab)) ui.tab = tabs[0][0];
  document.getElementById('title').textContent = M.module.name;
  document.getElementById('tag').textContent = ROLE === 'host' ? `Host · ${M.module.tagline}` : M.module.tagline;
  document.title = `${M.module.name} · ${ROLE}`;
  const st = document.getElementById('status');
  st.textContent = S.fight ? `${nameOfKey(curKey())} is up` : (ROLE === 'player' && me() ? me().name : ROLE);
  // keep focus, caret and scroll positions through a re-render
  const act0 = document.activeElement;
  const focusId = act0 && act0.id; const sel = act0 && 'selectionStart' in act0 ? [act0.selectionStart, act0.selectionEnd] : null;
  const scrolls = {}; document.querySelectorAll('[data-key]').forEach((el) => { scrolls[el.dataset.key] = [el.scrollTop, el.scrollHeight - el.clientHeight - el.scrollTop < 30]; });
  document.getElementById('tabs').replaceChildren(...tabs.map(([k, label]) => h('button', { class: ui.tab === k ? 'on' : '', onclick: () => { ui.tab = k; store.set(`tab-${ROLE}`, k); render(); } }, label)));
  document.getElementById('main').replaceChildren(view());
  document.querySelectorAll('[data-key]').forEach((el) => { const s = scrolls[el.dataset.key]; if (el.dataset.key === 'story') { el.scrollTop = !s || s[1] ? el.scrollHeight : s[0]; } else if (s) el.scrollTop = s[0]; });
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs */ } } }
}

// ---------------------------------------------------------------- start
applyColours();
(async () => {
  HELLO = await (await fetch(`/api/hello${KEY ? `?key=${encodeURIComponent(KEY)}` : ''}`)).json();
  if (ROLE === 'host' && HELLO.role !== 'host') { document.getElementById('main').replaceChildren(h('div', { class: 'card' }, 'This host link needs its key: use the address the host computer printed when it started.')); return; }
  M = HELLO.module;
  const es = new EventSource(`/api/events?role=${ROLE}${KEY ? `&key=${encodeURIComponent(KEY)}` : ''}`);
  es.addEventListener('state', (e) => {
    const next = JSON.parse(e.data);
    const reload = S && next.moduleId !== S.moduleId;
    S = next;
    if (reload) { location.reload(); return; }
    render(); speakNew();
  });
  es.addEventListener('director', (e) => { ui.director = JSON.parse(e.data); if (ui.tab === 'play') render(); });
  es.addEventListener('convert', (e) => { ui.convert.log.push(JSON.parse(e.data)); if (ui.tab === 'convert') render(); });
  es.onerror = () => { document.getElementById('status').textContent = 'reconnecting…'; };
})();
