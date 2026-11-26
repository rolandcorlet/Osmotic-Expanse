// The Ledger: one shared record of a D&D 5e game. Every change comes through apply(), which checks
// the rules and refuses what they do not allow, so the host, the players and the AI Director can
// never put the table into a state the rules could not reach.
//
//   apply(state, action, ctx) -> new state      ctx = { role: 'host'|'player', pid, rng, now, adventure, srd, ai }
//   viewFor(state, role, pid) -> what that screen may see (players never see a monster's numbers or a DC)

import * as R from './rules.js';
import { d20, rollDice, die, average } from './dice.js';
import * as MAP from './map.js';
import * as NAMES from './names.js';
import * as TRIG from './triggers.js';
import * as SCALE from './scale.js';
import * as SEEDS from './seeds.js';

export class RuleError extends Error {}
// Every "no" the Engine could say is one of three kinds, sorted here once for every screen and every tool
// (attempt() below hands back which):
//   1. Nothing to change (kind "noop"): the table is already as asked (the fight is already on, nothing is
//      hidden, it is not their turn). Nothing happens, and the words say what is true instead.
//   2. Fixed: not a "no" at all. A near name, a missing DC, a weapon the stat block calls something else:
//      the Engine goes on with its best reading and says what it assumed (assume()).
//   3. A real no (kind "rule"): the rules do not allow it. Refused, with the valid choices (options), so
//      the next try can be right.
const no = (msg, kind = 'rule', more = {}) => { const e = new RuleError(msg); e.kind = kind; e.options = more.options || []; e.hint = more.hint || ''; throw e; };
const nop = (msg, more) => no(msg, 'noop', more);
const refuse = (msg, options, hint = '') => no(msg, 'rule', { options, hint });
function assume(ctx, text) {
  if (ctx && Array.isArray(ctx.assumed) && text && !ctx.assumed.includes(text)) ctx.assumed.push(text);
}

// The one doorway every screen and tool goes through: apply() with the "no" sorted into its kind.
//   attempt(state, action, ctx) -> { status: 'done'|'nochange'|'refused', state, assumed, message, options, hint, text }
export function attempt(state, action, ctx) {
  const assumed = [];
  try {
    const next = apply(state, action, { ...ctx, assumed });
    return { status: 'done', state: next, assumed, message: '', options: [], hint: '', text: assumed.length ? `Assumed: ${assumed.join(' ')}` : '' };
  } catch (e) {
    if (!(e instanceof RuleError) && !/\bdice\b|\bd20\b|not a dice/i.test(e.message || '')) throw e;
    const kind = e instanceof RuleError ? e.kind || 'rule' : 'rule';
    const out = { status: kind === 'noop' ? 'nochange' : 'refused', state, assumed: [], message: e.message, options: (e.options || []).slice(0, 30), hint: e.hint || '' };
    return { ...out, text: explain(out) };
  }
}
// The words for a "no" of either kind: what is true, what to do instead, and the valid choices.
export function explain({ status, message, options = [], hint = '' }) {
  const listed = options.length && !options.slice(0, 2).every((o) => String(message).includes(String(o)));
  const tail = `${hint ? ` ${hint}` : ''}${listed ? ` Choose from: ${options.join(', ')}.` : ''}`;
  return status === 'nochange' ? `Nothing changed: ${message}${tail}` : `${message}${tail}`;
}

export const VERSION = 1;
export function newGameId() {
  return `g${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function newSession(adventure) {
  const first = (adventure && adventure.sites && adventure.sites[0]) || { id: 'start', name: 'Somewhere' };
  return {
    v: VERSION, gameId: newGameId(), adventure: adventure ? adventure.id : '', seq: 0, t: 0,
    scene: { siteId: first.id, visited: [] },
    story: [], log: [], rolls: [], requests: [],
    players: {}, pcs: {}, foes: {}, fight: null,
    quests: (adventure && adventure.quests ? adventure.quests.map((q, n) => ({ id: `q${n + 1}`, text: q, done: false })) : []),
    loot: [], time: { day: 1, hour: 8 }, seeds: [], notes: '', nextId: 1, started: false, clocks: [],
    map: adventureMaps(MAP.newMap(), adventure),
  };
}
// An adventure can bring its own maps (a converted PDF's, from the Books tab): travelPicture, and a
// place's picture behind its zones. The DM changes or clears them on the Map tab like any other.
function adventureMaps(m, adventure) {
  const ok = (p) => p && /^\/maps\/[a-f0-9]{16,64}\.(?:png|jpg|gif|webp)$/.test(String(p.url || '')) && Number(p.w) > 0 && Number(p.h) > 0;
  const pic = (p) => ({ url: p.url, w: Math.trunc(p.w), h: Math.trunc(p.h) });
  if (!adventure) return m;
  if (ok(adventure.travelPicture)) m.travel = pic(adventure.travelPicture);
  for (const st of adventure.sites || []) if (ok(st.picture)) m.sites[st.id] = { ...pic(st.picture), cols: 0, rows: 0, walls: [], doors: [] };
  return m;
}

// The first place's own monsters (hidden) and clocks, placed as a new game opens.
export function openAdventure(state, adventure, ctx) {
  const first = ((adventure || {}).sites || [])[0];
  let out = state;
  const host = { ...ctx, role: 'host', pid: null, ai: false, adventure };
  for (const [n, enc] of ((first && first.foes) || []).entries()) out = apply(out, { type: 'foe.add', monster: enc.monster, count: enc.count, name: enc.name, hidden: true, note: enc.note, zone: enc.zone, group: `${first.id}#${n}` }, host);
  for (const c of (first && first.clocks) || []) out = apply(out, { type: 'clock.add', ...c, siteId: first.id, quiet: true }, host);
  return out;
}

// A new game with the same people at the table. Characters may come along (fresh hit points).
export function restart(old, adventure, { keepPlayers = true, keepCharacters = true } = {}) {
  const s = newSession(adventure);
  if (keepPlayers) for (const p of Object.values(old.players || {})) s.players[p.id] = { ...p, pcId: keepCharacters ? p.pcId : null };
  if (keepCharacters) for (const pc of Object.values(old.pcs || {})) {
    s.pcs[pc.id] = { ...pc, hp: pc.maxHp, tempHp: 0, conds: [], exhaustion: 0, death: { s: 0, f: 0 }, stable: false, dead: false, conc: null, raging: false, hitDiceUsed: 0,
      resources: (pc.resources || []).map((r) => ({ ...r, used: 0 })), cast: pc.cast ? { ...pc.cast, slots: pc.cast.slots.map(([m]) => [m, 0]) } : null };
  }
  s.seeds = (old.seeds || []).slice();
  s.nextId = Math.max(old.nextId || 1, 1);
  // The DM's maps come along: what is shown always, the pictures and zones when it is the same adventure.
  if (old.map) {
    s.map.show = { ...s.map.show, ...(old.map.show || {}) };
    if (adventure && old.adventure === adventure.id) for (const k of ['travel', 'pos', 'zones', 'sites', 'grids']) s.map[k] = clone(old.map[k] || s.map[k]);
  }
  return s;
}

const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const site = (s, ctx) => ((ctx.adventure || {}).sites || []).find((x) => x.id === s.scene.siteId) || { id: s.scene.siteId, name: s.scene.siteId, exits: [] };
const nextId = (s, p) => `${p}${s.nextId++}`;
const str = (v, n = 400) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const nameOf = (s, key) => {
  const [k, id] = String(key).split(':');
  return k === 'pc' ? (s.pcs[id] || {}).name : (s.foes[id] || {}).name;
};
const monsterOf = (ctx, f) => R.index(ctx.srd).monster[f.mid] || null;

function story(s, ctx, kind, text, who = '', extra = {}) {
  s.story.push({ id: nextId(s, 'e'), seq: s.seq, t: ctx.now || 0, kind, who, text: str(text, 4000), site: s.scene.siteId, ...extra });
  if (s.story.length > 400) s.story.splice(0, s.story.length - 400);
}
function log(s, ctx, text, kind = 'event') {
  s.log.push({ seq: s.seq, t: ctx.now || 0, kind, text: str(text, 600) });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}
function addRoll(s, ctx, r) {
  const row = { id: nextId(s, 'r'), seq: s.seq, t: ctx.now || 0, ...r };
  s.rolls.push(row);
  if (s.rolls.length > 200) s.rolls.splice(0, s.rolls.length - 200);
  return row;
}

// ---- who may do what ---------------------------------------------------------------------
const isHost = (ctx) => ctx.role === 'host';
function ownPc(s, ctx, pcId) {
  const pc = s.pcs[pcId];
  if (!pc) refuse('There is no such character.', Object.values(s.pcs).map((x) => x.name));
  if (isHost(ctx)) return pc;
  const p = s.players[ctx.pid];
  if (!p || p.pcId !== pcId) no('That is not your character.');
  return pc;
}
const hostOnly = (ctx) => { if (!isHost(ctx)) no('Only the Dungeon Master can do that.'); };

// A target written "pc:id" or "foe:id", or just a name. A near miss is taken (and said, with ctx).
function target(s, ref, ctx = null) {
  const r = String(ref || '').trim();
  const [k, id] = r.split(':');
  if (k === 'pc' && s.pcs[id]) return { kind: 'pc', id, o: s.pcs[id] };
  if (k === 'foe' && s.foes[id]) return { kind: 'foe', id, o: s.foes[id] };
  const low = r.toLowerCase();
  const pc = Object.values(s.pcs).find((x) => x.id === r || x.name.toLowerCase() === low);
  if (pc) return { kind: 'pc', id: pc.id, o: pc };
  const foe = Object.values(s.foes).find((x) => x.id === r || x.name.toLowerCase() === low);
  if (foe) return { kind: 'foe', id: foe.id, o: foe };
  // A near miss ("Grisk the bugbear", "Goblin scout1"): the party first, then the monsters here.
  const pc2 = NAMES.pick(Object.values(s.pcs), r, (x) => [x.id, x.name]);
  if (pc2) { assume(ctx, `"${r}" is ${pc2.name}.`); return { kind: 'pc', id: pc2.id, o: pc2 }; }
  const here = Object.values(s.foes).filter((x) => x.siteId === s.scene.siteId);
  const foe2 = NAMES.pick(here.filter((x) => !x.dead), r, (x) => [x.id, x.name]) || NAMES.pick(here, r, (x) => [x.id, x.name]);
  if (foe2) { assume(ctx, `"${r}" is ${foe2.name}.`); return { kind: 'foe', id: foe2.id, o: foe2 }; }
  return null;
}
// The valid choices, for a refusal.
const partyNames = (s) => Object.values(s.pcs).filter((p) => !p.dead).map((p) => p.name);
const foeNamesHere = (s) => Object.values(s.foes).filter((f) => f.siteId === s.scene.siteId && !f.dead).map((f) => f.name);

// ---- the fight ----------------------------------------------------------------------------
const keyOf = (kind, id) => `${kind}:${id}`;
function currentKey(s) { return s.fight && s.fight.phase === 'turns' ? (s.fight.order[s.fight.turn] || {}).key : null; }
function freshTurn() { return { action: false, bonus: false, reaction: false, attacks: 0, sneak: false, moved: 0, dash: false, disengaged: false }; }
function inTurnCheck(s, ctx, key, what) {
  if (!s.fight || s.fight.phase !== 'turns') return;
  if (isHost(ctx) && !ctx.ai) return; // the human DM may always step in
  if (currentKey(s) !== key) nop(`It is not ${nameOf(s, key)}'s turn. Acting now: ${nameOf(s, currentKey(s)) || 'nobody'}.`);
  void what;
}
function beginTurn(s, ctx) {
  const f = s.fight;
  const k = currentKey(s);
  f.used = freshTurn();
  if (!k) return;
  const [kind, id] = k.split(':');
  if (kind === 'pc') {
    const pc = s.pcs[id];
    if (pc.hp <= 0 && !pc.dead && !pc.stable && !s.requests.some((q) => q.pcId === id && q.kind === 'death')) {
      s.requests.push({ id: nextId(s, 'q'), pcId: id, kind: 'death', ability: '', skill: '', dc: 10, adv: '', reason: `${pc.name} is dying: make a death saving throw.`, by: 'engine', t: ctx.now || 0 });
    }
    if (pc.raging) pc.rageTurns = (pc.rageTurns || 0) + 1;
  } else {
    const foe = s.foes[id];
    const m = monsterOf(ctx, foe);
    for (const a of (m && m.actions) || []) {
      const rc = /^Recharge (\d)/.exec(a.use || '');
      if (rc && foe.spent && foe.spent[a.n]) {
        const r = die(6, ctx.rng);
        if (r >= Number(rc[1])) { delete foe.spent[a.n]; log(s, ctx, `${foe.name}'s ${a.n} recharges (rolled ${r}).`, 'note-host'); }
      }
    }
    if (foe.legendary != null && m && m.legendary) foe.legendary = 3;
    if (!foe.dead && !foe.calm) emit(ctx, { ev: 'turn', site: s.scene.siteId, foe: id });
  }
}
function advance(s, ctx) {
  const f = s.fight;
  const n = f.order.length;
  if (!n) return;
  for (let step = 0; step < n; step++) {
    f.turn += 1;
    if (f.turn >= n) { f.turn = 0; f.round += 1; emit(ctx, { ev: 'round', n: f.round, site: s.scene.siteId }); }
    const k = f.order[f.turn].key;
    const [kind, id] = k.split(':');
    const alive = kind === 'pc' ? s.pcs[id] && !s.pcs[id].dead : s.foes[id] && !s.foes[id].dead && !s.foes[id].calm;
    if (alive && !surprisedNow(f, k)) break;
  }
  beginTurn(s, ctx);
}
// Surprised creatures lose their turn in the first round.
const surprisedNow = (f, k) => f.round === 1 && (f.surprised || []).includes(k);
function sortOrder(s) {
  const f = s.fight;
  const dexOf = (k) => { const [kind, id] = k.split(':'); return kind === 'pc' ? (s.pcs[id] || {}).mods?.dex || 0 : (s.foes[id] || {}).dexMod || 0; };
  f.order.sort((a, b) => b.init - a.init || dexOf(b.key) - dexOf(a.key) || (a.key < b.key ? -1 : 1));
}
function startTurns(s, ctx) {
  const f = s.fight;
  for (const o of f.order) if (o.init == null) {
    const [kind, id] = o.key.split(':');
    const m = kind === 'pc' ? s.pcs[id].mods.dex : s.foes[id].dexMod;
    const r = d20(ctx.rng);
    o.init = r.kept + m;
    addRoll(s, ctx, { who: nameOf(s, o.key), kind: 'initiative', label: 'Initiative', dice: r.rolls, mod: m, total: o.init, at: null, success: null, secret: kind === 'foe' });
  }
  s.requests = s.requests.filter((q) => q.kind !== 'initiative');
  sortOrder(s);
  f.phase = 'turns';
  f.turn = 0;
  f.round = 1;
  emit(ctx, { ev: 'round', n: 1, site: s.scene.siteId });
  story(s, ctx, 'event', `Initiative: ${f.order.map((o) => nameOf(s, o.key)).join(', ')}.`, 'Engine');
  beginTurn(s, ctx);
  // Someone dead, gone or surprised at the top of the order is passed over at once.
  const [kind, id] = f.order[0].key.split(':');
  if ((kind === 'pc' && s.pcs[id].dead) || (kind === 'foe' && (s.foes[id].dead || s.foes[id].calm)) || surprisedNow(f, f.order[0].key)) advance(s, ctx);
}
function joinFight(s, ctx, kind, id, { roll = false } = {}) {
  const f = s.fight;
  if (!f || f.order.some((o) => o.key === keyOf(kind, id))) return;
  const entry = { key: keyOf(kind, id), init: null };
  if (kind === 'foe' || roll) {
    const m = kind === 'pc' ? s.pcs[id].mods.dex : s.foes[id].dexMod;
    const r = d20(ctx.rng);
    entry.init = r.kept + m;
    addRoll(s, ctx, { who: nameOf(s, entry.key), kind: 'initiative', label: 'Initiative', dice: r.rolls, mod: m, total: entry.init, secret: kind === 'foe' });
  }
  if (f.phase === 'turns') {
    if (entry.init == null) { const r = d20(ctx.rng); entry.init = r.kept + s.pcs[id].mods.dex; }
    const cur = currentKey(s);
    f.order.push(entry);
    sortOrder(s);
    f.turn = f.order.findIndex((o) => o.key === cur);
  } else f.order.push(entry);
}

// ---- damage and healing ---------------------------------------------------------------------
function damagePc(s, ctx, pc, amount, type, { crit = false, from = '' } = {}) {
  let n = Math.max(0, Math.trunc(amount));
  const notes = [];
  const res = [...(pc.res || [])];
  if (pc.raging && ['bludgeoning', 'piercing', 'slashing'].includes(type)) res.push(type);
  const adj = R.adjustDamage(n, type, { res });
  n = adj.amount;
  if (adj.note) notes.push(adj.note);
  if (pc.tempHp > 0) { const soak = Math.min(pc.tempHp, n); pc.tempHp -= soak; n -= soak; }
  if (pc.dead) return { taken: 0, notes };
  if (pc.hp <= 0 && n > 0) {
    // Damage while dying: a failed death save, two for a critical hit; damage of the full maximum kills.
    if (n >= pc.maxHp) { pc.dead = true; notes.push('killed outright'); }
    else { pc.death.f += crit ? 2 : 1; pc.stable = false; if (pc.death.f >= 3) { pc.dead = true; notes.push('dies'); } else notes.push(`death save failed (${pc.death.f} of 3)`); }
    return { taken: n, notes };
  }
  const before = pc.hp;
  pc.hp -= n;
  if (pc.hp <= 0) {
    const over = -pc.hp;
    pc.hp = 0;
    const rel = (pc.resources || []).find((r) => r.id === 'relentless');
    if (over < pc.maxHp && rel && rel.used < rel.max && before > 0) {
      rel.used += 1; pc.hp = 1; notes.push('Relentless Endurance holds them at 1 hit point');
    } else if (over >= pc.maxHp) { pc.dead = true; notes.push('killed outright by massive damage'); }
    else { if (!pc.conds.includes('unconscious')) pc.conds.push('unconscious'); if (!pc.conds.includes('prone')) pc.conds.push('prone'); pc.death = { s: 0, f: 0 }; pc.stable = false; pc.raging = false; notes.push('falls unconscious and is dying'); dropConcentration(s, ctx, pc, 'falls unconscious'); }
  }
  if (n > 0 && pc.conc && pc.hp > 0) {
    const dc = Math.max(10, Math.floor(n / 2));
    s.requests.push({ id: nextId(s, 'q'), pcId: pc.id, kind: 'save', ability: 'con', skill: '', dc, adv: '', reason: `Concentration: keep ${pc.conc.name} going after taking damage.`, by: 'engine', t: ctx.now || 0, effect: { concentration: true } });
    notes.push('must save to keep concentrating');
  }
  void from;
  return { taken: n, notes };
}
function damageFoe(s, ctx, foe, amount, type, { magical = false, crit = false } = {}) {
  const m = monsterOf(ctx, foe) || {};
  const adj = R.adjustDamage(Math.max(0, Math.trunc(amount)), type, { res: m.res || [], vuln: m.vuln || [], imm: m.imm || [] }, { magical });
  const n = adj.amount;
  const notes = adj.note ? [adj.note] : [];
  // Undead Fortitude (zombies): a Constitution save of DC 5 + the damage keeps it at 1 hit point,
  // unless the damage was radiant or a critical hit.
  if (foe.hp - n <= 0 && n > 0 && !crit && type !== 'radiant' && (m.traits || []).some((t) => t.n === 'Undead Fortitude')) {
    const r = d20(ctx.rng);
    const b = R.monsterSave(m, 'con');
    const ok = r.kept + b >= 5 + n;
    addRoll(s, ctx, { who: foe.name, foeId: foe.id, kind: 'save', label: 'Undead Fortitude', dice: r.rolls, mod: b, total: r.kept + b, at: 5 + n, success: ok, secret: true });
    if (ok) { foe.hp = 1; notes.push('refuses to fall'); return { taken: n, notes }; }
  }
  foe.hp = Math.max(0, foe.hp - n);
  if (foe.hp <= 0 && !foe.dead) {
    foe.dead = true;
    foe.conds = [];
    notes.push('falls');
    releaseHolds(s, ctx);
    if (s.fight) s.fight.xp = (s.fight.xp || 0) + (foe.xp || 0);
    else s.unspentXp = (s.unspentXp || 0) + (foe.xp || 0);
  }
  return { taken: n, notes };
}
function healPc(s, ctx, pc, amount) {
  if (pc.dead) nop(`${pc.name} is dead; healing cannot help.`);
  const n = Math.max(0, Math.trunc(amount));
  const was = pc.hp;
  pc.hp = Math.min(pc.maxHp, pc.hp + n);
  if (was <= 0 && pc.hp > 0) {
    pc.conds = pc.conds.filter((c) => c !== 'unconscious');
    pc.death = { s: 0, f: 0 };
    pc.stable = false;
    s.requests = s.requests.filter((q) => !(q.pcId === pc.id && q.kind === 'death'));
  }
  return pc.hp - was;
}
function dropConcentration(s, ctx, pc, why) {
  if (!pc.conc) return;
  story(s, ctx, 'event', `${pc.name} loses concentration on ${pc.conc.name}${why ? ` (${why})` : ''}.`, 'Engine');
  pc.conc = null;
}

// ---- a roll a character makes ------------------------------------------------------------------
function pcD20(s, ctx, pc, { kind, ability = '', skill = '', adv = '', own = null, label = '' }) {
  const fx = R.selfEffects(pc, kind, ability);
  const wantAdv = adv === 'adv' || fx.adv;
  const wantDis = adv === 'dis' || fx.dis;
  let bonus = 0;
  if (kind === 'check' && skill) { const sb = R.skillBonus(pc, skill, ctx.srd); if (!sb) no(`There is no skill called "${skill}".`); bonus = sb.bonus; ability = sb.ability; }
  else if (kind === 'check') bonus = pc.mods[ability] + (pc.cls === 'bard' && pc.level >= 2 ? Math.floor(pc.prof / 2) : 0);
  else if (kind === 'save') bonus = R.saveBonus(pc, ability);
  else if (kind === 'initiative') bonus = pc.mods.dex + (pc.initBonus || 0) + (pc.cls === 'bard' && pc.level >= 2 ? Math.floor(pc.prof / 2) : 0);
  const r = d20(ctx.rng, { adv: wantAdv, dis: wantDis, own });
  // Halflings reroll a natural 1 once (Lucky).
  let kept = r.kept;
  let lucky = false;
  if (kept === 1 && (pc.traits || []).some((t) => t.name === 'Lucky')) { kept = die(20, ctx.rng); lucky = true; }
  return { ...r, kept, lucky, bonus, total: kept + bonus, fx, ability, label };
}
const advWord = (r) => (r.mode === 'adv' ? ' with advantage' : r.mode === 'dis' ? ' with disadvantage' : '');

// ---- the actions --------------------------------------------------------------------------------
const H = {};

H.join = (s, a, ctx) => {
  if (isHost(ctx)) no('The host does not join as a player.');
  const name = str(a.name, 30);
  if (!name) no('Type your name first.');
  const p = s.players[ctx.pid] || { id: ctx.pid, pcId: null };
  p.name = name;
  p.seen = ctx.now || 0;
  s.players[ctx.pid] = p;
  log(s, ctx, `${name} sat down at the table.`);
};

H['pc.create'] = (s, a, ctx) => {
  const errs = R.validateInput(a.input, ctx.srd);
  if (errs.length) no(errs.join(' '));
  const pc = R.newCharacter(a.input, ctx.srd);
  pc.id = nextId(s, 'c');
  if (isHost(ctx) && a.forPid) {
    if (!s.players[a.forPid]) no('That player is not at the table.');
    s.players[a.forPid].pcId = pc.id; pc.playerId = a.forPid;
  } else if (!isHost(ctx)) {
    const p = s.players[ctx.pid];
    if (!p) no('Join the table first.');
    if (p.pcId && s.pcs[p.pcId] && !s.pcs[p.pcId].dead) no('You already have a living character. Ask the DM to retire it first.');
    p.pcId = pc.id; pc.playerId = ctx.pid;
  } else pc.playerId = null;
  pc.ownerId = pc.playerId;
  pc.open = !pc.playerId;
  pc.xp = Math.max(pc.xp || 0, ctx.srd.xpTable[pc.level - 1] || 0);
  s.pcs[pc.id] = pc;
  story(s, ctx, 'event', `${pc.name}, a level ${pc.level} ${pc.raceName} ${pc.clsName}, joins the party.`, 'Engine');
  if (s.fight) joinFight(s, ctx, 'pc', pc.id, { roll: true });
};

// A character the DM only tracks (a game on paper): a name and the numbers the DM needs at the table.
H['pc.quick'] = (s, a, ctx) => {
  hostOnly(ctx);
  const name = str(a.name, 40);
  if (!name) no('Give the character a name.');
  const n = (v, lo, hi, d) => { const x = Math.trunc(Number(v)); return x >= lo && x <= hi ? x : d; };
  const level = n(a.level, 1, 20, 1);
  const maxHp = n(a.hp, 1, 999, 10);
  const dex = n(a.init, -5, 15, 0);
  const pc = {
    id: nextId(s, 'c'), name, quick: true, race: '', raceName: str(a.race, 30), cls: '', clsName: str(a.cls, 30) || 'Adventurer', subclass: '', subclassName: '',
    level, prof: R.profFor(level), ab: { str: 10, dex: 10 + dex * 2, con: 10, int: 10, wis: 10, cha: 10 }, mods: { str: 0, dex, con: 0, int: 0, wis: 0, cha: 0 },
    saves: [], skills: [], expertise: [], maxHp, hp: maxHp, tempHp: 0, ac: n(a.ac, 1, 40, 10), acNote: '', speed: 30, size: 'Medium', hitDie: 8,
    attacks: [], cast: null, features: [], traits: [], res: [], resources: [], sneak: '', extraAttacks: 0, style: '', profs: [], langs: [],
    passive: n(a.passive, 1, 40, 10), inventory: [], gold: 0, background: '', alignment: '', input: null,
    hitDiceUsed: 0, xp: ctx.srd.xpTable[level - 1] || 0, conds: [], exhaustion: 0, death: { s: 0, f: 0 }, stable: false, dead: false, conc: null, inspiration: false, raging: false, notes: '', playerId: null,
  };
  s.pcs[pc.id] = pc;
  story(s, ctx, 'event', `${pc.name} joins the party.`, 'Engine');
  if (s.fight) joinFight(s, ctx, 'pc', pc.id, { roll: true });
};

// A change of choices: a level up, new spells prepared, equipment bought or lost.
H['pc.rebuild'] = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  if (pc.quick) no(`${pc.name} is tracked by numbers only: change them on the sheet.`);
  const input = { ...pc.input, ...(a.input || {}) };
  if (!isHost(ctx)) {
    if (input.level !== pc.level && input.level !== pc.level + 1) no('Level up one level at a time.');
    if (input.level > pc.level && (pc.xp || 0) < (ctx.srd.xpTable[input.level - 1] || 0)) no(`${pc.name} needs ${ctx.srd.xpTable[input.level - 1]} XP for level ${input.level}.`);
    for (const k of ['race', 'subrace', 'class', 'base', 'method']) if (JSON.stringify(input[k]) !== JSON.stringify(pc.input[k])) no('Only the DM can change race, class or ability scores after the game starts.');
    if (s.fight && s.fight.phase === 'turns') no('Wait until the fight is over to change your character.');
  }
  const errs = R.validateInput(input, ctx.srd);
  if (errs.length) no(errs.join(' '));
  const up = input.level > pc.level;
  const next = R.rebuild(pc, input, ctx.srd);
  if (up) next.hp = Math.min(next.maxHp, pc.hp + (next.maxHp - pc.maxHp));
  s.pcs[pc.id] = next;
  if (up) story(s, ctx, 'event', `${pc.name} reaches level ${next.level}!`, 'Engine');
  else log(s, ctx, `${pc.name}'s sheet was updated.`);
};

H['pc.retire'] = (s, a, ctx) => {
  hostOnly(ctx);
  const pc = s.pcs[a.pcId];
  if (!pc) refuse('There is no such character.', Object.values(s.pcs).map((x) => x.name));
  for (const p of Object.values(s.players)) if (p.pcId === pc.id) p.pcId = null;
  delete s.pcs[pc.id];
  if (s.fight) { const cur = currentKey(s); s.fight.order = s.fight.order.filter((o) => o.key !== keyOf('pc', pc.id)); s.fight.turn = Math.max(0, s.fight.order.findIndex((o) => o.key === cur)); }
  s.requests = s.requests.filter((q) => q.pcId !== pc.id);
  log(s, ctx, `${pc.name} left the party.`);
};
H['pc.assign'] = (s, a, ctx) => {
  hostOnly(ctx);
  const pc = s.pcs[a.pcId];
  if (!pc) refuse('There is no such character.', Object.values(s.pcs).map((x) => x.name));
  for (const p of Object.values(s.players)) if (p.pcId === pc.id) p.pcId = null;
  pc.playerId = null;
  if (a.pid) { const p = s.players[a.pid]; if (!p) no('That player is not at the table.'); p.pcId = pc.id; pc.playerId = p.id; }
  log(s, ctx, a.pid ? `${pc.name} is now played by ${s.players[a.pid].name}.` : `${pc.name} has no player for now.`);
  pc.open = !pc.playerId; pc.borrow = null;
  if (pc.playerId && !pc.ownerId) pc.ownerId = pc.playerId;
};

// Taking over a character: one with no player (a ready-made character the DM put in the party, or
// one whose player left), or one its player has offered. The owner is remembered, so it can go back.
const livingPcOf = (s, ctx) => { const p = s.players[ctx.pid]; return p && p.pcId && s.pcs[p.pcId] && !s.pcs[p.pcId].dead ? s.pcs[p.pcId] : null; };
H['pc.open'] = (s, a, ctx) => {
  const pc = s.pcs[a.pcId] || (!isHost(ctx) && livingPcOf(s, ctx));
  if (!pc) refuse('There is no such character.', Object.values(s.pcs).map((x) => x.name));
  if (!isHost(ctx) && pc.playerId !== ctx.pid) no('You can only offer your own character.');
  pc.open = a.open !== false;
  if (pc.open && a.leave) {
    const p = s.players[pc.playerId];
    if (p) p.pcId = null;
    pc.playerId = null;
    story(s, ctx, 'event', `${pc.name} steps back: anyone at the table can take ${pc.name} over, and the DM plays them until then.`, 'Engine');
  } else log(s, ctx, pc.open ? `${pc.name} can be taken over by another player.` : `${pc.name} is no longer offered.`);
};
H['pc.take'] = (s, a, ctx) => {
  if (isHost(ctx)) no('The host gives characters with Assign.');
  const me = s.players[ctx.pid];
  if (!me) no('Join the table first.');
  if (livingPcOf(s, ctx)) no('You already play a living character. Offer it or step back from it first.');
  const pc = s.pcs[a.pcId];
  if (!pc) refuse('There is no such character.', Object.values(s.pcs).map((x) => x.name));
  if (pc.dead) no(`${pc.name} is dead.`);
  if (pc.playerId === ctx.pid) no(`You already play ${pc.name}.`);
  if (pc.playerId && !pc.open) no(`${pc.name} is played by ${(s.players[pc.playerId] || {}).name || 'someone else'}, who has not offered them.`);
  const from = pc.playerId ? s.players[pc.playerId] : null;
  if (from) from.pcId = null;
  const owner = pc.ownerId && s.players[pc.ownerId] ? pc.ownerId : null;
  pc.borrow = owner && owner !== ctx.pid ? { from: owner, name: s.players[owner].name } : null;
  if (!pc.ownerId) pc.ownerId = ctx.pid;
  pc.playerId = ctx.pid; pc.open = false; me.pcId = pc.id;
  story(s, ctx, 'event', `${me.name} takes over ${pc.name}${from ? ` from ${from.name}` : ''}.`, 'Engine');
};
H['pc.return'] = (s, a, ctx) => {
  const pc = s.pcs[a.pcId] || (!isHost(ctx) && livingPcOf(s, ctx));
  if (!pc) refuse('There is no such character.', Object.values(s.pcs).map((x) => x.name));
  if (!isHost(ctx) && pc.playerId !== ctx.pid) no('You can only hand back the character you play.');
  const cur = s.players[pc.playerId];
  if (cur) cur.pcId = null;
  const owner = pc.borrow && s.players[pc.borrow.from];
  if (owner && !livingPcOf(s, { pid: owner.id })) { owner.pcId = pc.id; pc.playerId = owner.id; pc.open = false; story(s, ctx, 'event', `${pc.name} goes back to ${owner.name}.`, 'Engine'); }
  else { pc.playerId = null; pc.open = true; story(s, ctx, 'event', `${pc.name} is free for anyone to take over; the DM plays them until then.`, 'Engine'); }
  pc.borrow = null;
};

// Clocks: a danger or a plan that fills up (the burning bridge, the invasion of Brindol).
const findClock = (s, k, ctx = null) => {
  const list = s.clocks || [];
  const c = list.find((x) => x.id === k) || list.find((x) => x.name.toLowerCase() === String(k || '').toLowerCase()) || list.find((x) => k && x.name.toLowerCase().includes(String(k).toLowerCase()));
  if (c) return c;
  const near = NAMES.pick(list, k, (x) => [x.id, x.name]);
  if (near) { assume(ctx, `"${k}" is the clock ${near.name}.`); return near; }
  refuse(`There is no clock called "${k}". Clocks: ${list.map((x) => `${x.id} (${x.name})`).join(', ') || 'none'}.`, list.map((x) => x.name));
};
// A clock this place (or the adventure) sets out but that is not running yet: started when first ticked.
function declaredClock(s, ctx, k) {
  const sites = (ctx.adventure || {}).sites || [];
  const here = sites.find((x) => x.id === s.scene.siteId) || {};
  const all = [...(here.clocks || []).map((c) => ({ ...c, siteId: here.id })), ...sites.flatMap((x) => (x.clocks || []).filter((c) => c.global).map((c) => ({ ...c, siteId: x.id })))];
  return all.find((c) => c.name.toLowerCase() === String(k || '').toLowerCase()) || NAMES.pick(all, k, (c) => [c.name]);
}
H['clock.add'] = (s, a, ctx) => {
  hostOnly(ctx);
  const name = str(a.name, 60);
  if (!name) no('Name the clock.');
  s.clocks = s.clocks || [];
  if (s.clocks.some((c) => c.name.toLowerCase() === name.toLowerCase() && !c.done)) nop(`There is already a clock called "${name}".`);
  const size = Math.max(2, Math.min(12, Math.trunc(Number(a.size) || 4)));
  const c = { id: nextId(s, 'k'), name, size, filled: Math.max(0, Math.min(size, Math.trunc(Number(a.filled) || 0))), note: str(a.note, 300), hidden: !!a.hidden, done: false, siteId: a.global ? '' : str(a.siteId, 40) };
  s.clocks.push(c);
  if (!a.quiet) story(s, ctx, 'event', `A clock starts: ${name} (${c.filled} of ${size}).`, 'Engine');
  return c;
};
H['clock.tick'] = (s, a, ctx) => {
  hostOnly(ctx);
  const k = a.id || a.name;
  const running = (s.clocks || []).some((x) => x.id === k || x.name.toLowerCase() === String(k || '').toLowerCase());
  const plan = !running && declaredClock(s, ctx, k);
  if (plan && !(s.clocks || []).some((x) => x.name === plan.name)) {
    H['clock.add'](s, { ...plan, quiet: true }, ctx);
    assume(ctx, `The clock "${plan.name}" was not running yet, so it started (${plan.size} segments).`);
  }
  // A clock that is running nowhere and that nothing here sets out: nothing to tick.
  const list = s.clocks || [];
  if (!plan && !list.some((x) => x.id === k || x.name.toLowerCase() === String(k || '').toLowerCase() || (k && x.name.toLowerCase().includes(String(k).toLowerCase()))) && !NAMES.pick(list, k, (x) => [x.id, x.name])) {
    const here = list.filter((x) => !x.done && (!x.siteId || x.siteId === s.scene.siteId)).map((x) => x.name);
    nop(`No clock called "${k}" is running here. Running: ${here.join(', ') || 'none'}.`, { options: here, hint: 'Start it first (the clock tool\'s start), or tick one that is running.' });
  }
  const c = findClock(s, plan ? plan.name : k, ctx);
  if (c.done && (Number(a.by) || 1) > 0) nop(`${c.name} is already full.`);
  const by = Math.trunc(Number(a.by ?? 1)) || 1;
  c.filled = Math.max(0, Math.min(c.size, c.filled + by));
  if (c.filled >= c.size) { c.done = true; story(s, ctx, 'event', `${c.name}: the clock is full. ${c.note}`, 'Engine'); }
  else { c.done = false; story(s, ctx, 'event', `${c.name}: ${c.filled} of ${c.size}.`, 'Engine'); }
  return c;
};
H['clock.remove'] = (s, a, ctx) => {
  hostOnly(ctx);
  const c = findClock(s, a.id || a.name, ctx);
  s.clocks = s.clocks.filter((x) => x !== c);
  log(s, ctx, `Clock removed: ${c.name}.`);
};

H.say = (s, a, ctx) => {
  const text = str(a.text, 1000);
  if (!text) no('Say something first.');
  if (isHost(ctx) && !ctx.ai) { story(s, ctx, 'say', text, str(a.as, 40) || 'DM', { by: 'host' }); return; }
  const p = s.players[ctx.pid];
  if (!p) no('Join the table first.');
  const pc = p.pcId && s.pcs[p.pcId];
  story(s, ctx, 'say', text, pc ? pc.name : p.name, { by: ctx.pid, pcId: pc ? pc.id : null });
};
H.narrate = (s, a, ctx) => {
  hostOnly(ctx);
  const text = str(a.text, 4000);
  if (!text) no('There is nothing to narrate.');
  story(s, ctx, 'narration', text, 'DM', { by: ctx.ai ? 'ai' : 'host' });
  s.started = true;
};
H['note.host'] = (s, a, ctx) => { hostOnly(ctx); s.notes = String(a.text || '').slice(0, 20000); };

// ---- asking for and making rolls -----------------------------------------------------------------
H['roll.ask'] = (s, a, ctx) => {
  hostOnly(ctx);
  const kind = a.kind === 'save' ? 'save' : 'check';
  const ids = (a.pcIds && a.pcIds.length ? a.pcIds : [a.pcId]).map((x) => (target(s, x, ctx) || {}).id).filter((x) => x && s.pcs[x]);
  if (!ids.length) refuse(`Name a character to roll. In the party: ${Object.values(s.pcs).map((p) => `${p.id} (${p.name})`).join(', ') || 'nobody yet'}.`, partyNames(s));
  let ability = String(a.ability || '').toLowerCase().slice(0, 3);
  let skill = a.skill ? (NAMES.skill(a.skill, ctx.srd.skills) || String(a.skill).toLowerCase().replace(/\s+/g, '-')) : '';
  if (skill && R.index(ctx.srd).skill[skill] && String(a.skill).toLowerCase().replace(/\s+/g, '-') !== skill) assume(ctx, `"${a.skill}" is the ${R.index(ctx.srd).skill[skill].name} skill.`);
  if (skill && !R.index(ctx.srd).skill[skill]) {
    // An ability named as the skill ("strength"): a plain ability check.
    const ab = R.ABILITIES.find((x) => skill.startsWith(x));
    if (!ab) refuse(`There is no skill called "${a.skill}". Skills: ${ctx.srd.skills.map((x) => x.id).join(', ')}.`, ctx.srd.skills.map((x) => x.id));
    assume(ctx, `"${a.skill}" is not a skill: a plain ${R.ABILITY_NAMES[ab]} ${kind === 'save' ? 'save' : 'check'}.`);
    ability = ab; skill = '';
  }
  if (skill) {
    const sk = R.index(ctx.srd).skill[skill];
    ability = sk.ability;
    // A save names an ability, not a skill: the skill's own ability ("an Acrobatics save" is a Dexterity save).
    if (kind === 'save') { assume(ctx, `A save uses an ability, not a skill: a ${R.ABILITY_NAMES[ability]} save (${sk.name} uses ${R.ABILITY_NAMES[ability]}).`); skill = ''; }
  }
  if (!R.ABILITIES.includes(ability)) refuse('Say which ability the roll uses (str, dex, con, int, wis or cha), or a skill.', R.ABILITIES);
  let dc = Math.trunc(Number(a.dc));
  if (!Number.isFinite(dc) || dc <= 0) { dc = 13; assume(ctx, 'No DC was given: DC 13 (medium).'); }
  if (dc > 35) { dc = 35; assume(ctx, 'A DC is at most 35: DC 35.'); }
  // A batch: the rolls asked together, so the adventure's rules can read the group's result.
  const batch = nextId(s, 'b');
  for (const id of ids) {
    if (s.pcs[id].dead) continue;
    s.requests = s.requests.filter((q) => !(q.pcId === id && q.kind === kind && q.ability === ability && q.skill === skill));
    const effect = a.effect && typeof a.effect === 'object' ? {
      dmg: R.ABILITIES && a.effect.dmg ? String(a.effect.dmg).slice(0, 20) : '', type: str(a.effect.type, 20), half: !!a.effect.half, cond: str(a.effect.cond, 20).toLowerCase(),
    } : null;
    // A save against a monster's own spell asked for by hand (bench 21 Nov: the Director re-cast hold person
    // through ask_for_roll, so the hold was not tracked and outlived Brother Aldane): link it to the caster.
    if (effect && effect.cond && kind === 'save') {
      const why = String(a.reason || '').toLowerCase();
      for (const f of Object.values(s.foes)) {
        if (f.dead || f.siteId !== s.scene.siteId || effect.repeat) continue;
        const m = monsterOf(ctx, f);
        const book = m && monsterSpells(m, ctx.srd);
        const sp = book && book.spells.find((x) => why.includes(x.name.toLowerCase()));
        if (sp && /at the end of each of its turns/i.test(String((sp.data || {}).desc || ''))) effect.repeat = { foeId: f.id, spell: sp.name };
      }
    }
    s.requests.push({ id: nextId(s, 'q'), pcId: id, kind, ability, skill, dc, adv: a.adv === 'adv' || a.adv === 'dis' ? a.adv : '', reason: str(a.reason, 200), by: ctx.ai ? 'ai' : 'host', t: ctx.now || 0, group: ids.length > 1 ? true : undefined, effect, batch, site: s.scene.siteId });
  }
};
H['roll.cancel'] = (s, a, ctx) => { hostOnly(ctx); s.requests = s.requests.filter((q) => q.id !== a.id); };

H['roll.make'] = (s, a, ctx) => {
  const q = s.requests.find((x) => x.id === a.id);
  if (!q) nop('That roll is no longer asked for.');
  const pc = ownPc(s, ctx, q.pcId);
  if (pc.dead) no(`${pc.name} is dead.`);
  const own = Array.isArray(a.own) && a.own.length ? a.own : null;
  s.requests = s.requests.filter((x) => x.id !== q.id);
  if (q.kind === 'initiative') {
    const r = pcD20(s, ctx, pc, { kind: 'initiative', adv: a.adv || q.adv, own });
    const o = s.fight && s.fight.order.find((x) => x.key === keyOf('pc', pc.id));
    if (o) o.init = r.total;
    addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'initiative', label: 'Initiative', dice: r.rolls, mod: r.bonus, total: r.total, at: null, success: null });
    if (s.fight && s.fight.phase === 'initiative' && s.fight.order.every((x) => x.init != null)) startTurns(s, ctx);
    return;
  }
  if (q.kind === 'death') {
    const r = d20(ctx.rng, { own });
    const v = r.kept;
    let text;
    if (v === 20) { pc.hp = 1; pc.conds = pc.conds.filter((c) => c !== 'unconscious'); pc.death = { s: 0, f: 0 }; text = `${pc.name} rolls a natural 20 on a death save and comes back with 1 hit point!`; }
    else if (v === 1) { pc.death.f += 2; text = `${pc.name} rolls a 1 on a death save: two failures.`; }
    else if (v >= 10) { pc.death.s += 1; text = `${pc.name} succeeds on a death save (${pc.death.s} of 3).`; }
    else { pc.death.f += 1; text = `${pc.name} fails a death save (${pc.death.f} of 3).`; }
    if (pc.death.f >= 3) { pc.dead = true; text += ` ${pc.name} dies.`; }
    else if (pc.death.s >= 3 && pc.hp <= 0) { pc.stable = true; pc.death = { s: 0, f: 0 }; text += ` ${pc.name} is stable.`; }
    addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'death', label: 'Death save', dice: r.rolls, mod: 0, total: v, at: 10, success: v >= 10 });
    story(s, ctx, 'event', text, 'Engine');
    return;
  }
  const r = pcD20(s, ctx, pc, { kind: q.kind, ability: q.ability, skill: q.skill, adv: a.adv === 'adv' || a.adv === 'dis' ? a.adv : q.adv, own });
  const success = q.kind === 'save' && r.fx.fail ? false : r.total >= q.dc;
  const what = q.kind === 'save' ? `${R.ABILITY_NAMES[q.ability]} saving throw` : q.skill ? `${R.index(ctx.srd).skill[q.skill].name} check` : `${R.ABILITY_NAMES[q.ability]} check`;
  addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: q.kind, label: what, dice: r.rolls, mod: r.bonus, total: r.total, at: q.dc, success, mode: r.mode, why: r.fx.why, lucky: r.lucky, reason: q.reason });
  // The group's result, once every roll of the batch is in (half or more succeed, as a group check):
  // the adventure's rules read it ("on a failed Perception check, the goblins get surprise").
  if (q.batch) {
    const b = (s.batches = s.batches || {});
    const row = b[q.batch] || (b[q.batch] = { site: q.site || s.scene.siteId, kind: q.kind, skill: q.skill, ability: q.ability, ok: 0, n: 0 });
    row.n += 1; if (success) row.ok += 1;
    if (!s.requests.some((x) => x.batch === q.batch)) {
      s.outcomes = s.outcomes || [];
      s.outcomes.push({ seq: s.seq, site: row.site, kind: row.kind, skill: row.skill, ability: row.ability, ok: row.ok * 2 >= row.n });
      if (s.outcomes.length > 200) s.outcomes.splice(0, s.outcomes.length - 200);
      if (row.kind === 'check') emit(ctx, { ev: row.ok * 2 >= row.n ? 'succeed' : 'fail', skill: row.skill || String(R.ABILITY_NAMES[row.ability] || row.ability).toLowerCase(), site: row.site });
      delete b[q.batch];
    }
  }
  let text = `${pc.name} ${success ? 'succeeds on' : 'fails'} a ${what}${advWord(r)}${r.fx.fail ? ' (automatically)' : ''}.`;
  if (q.effect && q.effect.concentration) {
    if (!success) dropConcentration(s, ctx, pc, 'failed the concentration save');
    else text = `${pc.name} keeps concentrating on ${pc.conc ? pc.conc.name : 'the spell'}.`;
  } else if (q.effect) {
    if (q.effect.dmg) {
      const full = rollDice(q.effect.dmg, ctx.rng);
      const amount = success ? (q.effect.half ? Math.floor(full.total / 2) : 0) : full.total;
      if (amount > 0) { const d = damagePc(s, ctx, pc, amount, q.effect.type); text += ` ${pc.name} takes ${d.taken} ${q.effect.type} damage${d.notes.length ? ` (${d.notes.join(', ')})` : ''}.`; }
    }
    if (q.effect.cond && !success && !pc.conds.includes(q.effect.cond)) {
      pc.conds.push(q.effect.cond); text += ` ${pc.name} is ${q.effect.cond}.`;
      // A spell like hold person: the target saves again at the end of each of its turns (see releaseHolds).
      if (q.effect.repeat) pc.held = [...(pc.held || []).filter((h) => h.cond !== q.effect.cond), { cond: q.effect.cond, ability: q.ability, dc: q.dc, foeId: q.effect.repeat.foeId, spell: q.effect.repeat.spell }];
    }
  }
  story(s, ctx, 'event', text, 'Engine', { roll: true });
};

// A roll nobody asked for: the player's own check, save or plain dice. Shown, never compared.
H['roll.free'] = (s, a, ctx) => {
  if (a.dice) {
    const r = rollDice(String(a.dice).slice(0, 30), ctx.rng);
    let who = 'DM';
    if (!isHost(ctx)) { const p = s.players[ctx.pid]; if (!p) no('Join the table first.'); who = (p.pcId && s.pcs[p.pcId] ? s.pcs[p.pcId].name : p.name); }
    addRoll(s, ctx, { who, kind: 'dice', label: str(a.label, 40) || String(a.dice), dice: r.dice, mod: r.flat, total: r.total, at: null, success: null, secret: isHost(ctx) && !!a.secret });
    return;
  }
  const pc = ownPc(s, ctx, a.pcId);
  const kind = a.kind === 'save' ? 'save' : 'check';
  const r = pcD20(s, ctx, pc, { kind, ability: String(a.ability || '').slice(0, 3), skill: a.skill || '', adv: a.adv });
  const label = kind === 'save' ? `${R.ABILITY_NAMES[r.ability] || ''} saving throw` : a.skill ? `${R.index(ctx.srd).skill[a.skill].name} check` : `${R.ABILITY_NAMES[r.ability] || ''} check`;
  if (!r.ability || !R.ABILITIES.includes(r.ability)) no('Choose an ability or a skill.');
  addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind, label, dice: r.rolls, mod: r.bonus, total: r.total, at: null, success: null, mode: r.mode, why: r.fx.why });
};

// ---- combat ----------------------------------------------------------------------------------
H['fight.start'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (s.fight) nop('A fight is already on.');
  fitFoes(s, ctx, s.scene.siteId);
  const foes = Object.values(s.foes).filter((f) => f.siteId === s.scene.siteId && !f.dead && (a.foeIds ? a.foeIds.includes(f.id) : true));
  if (!foes.length) refuse('There is nothing here to fight.', [], 'Add monsters first (add_monsters), or narrate the danger without a fight.');
  const pcs = Object.values(s.pcs).filter((p) => !p.dead);
  if (!pcs.length) no('Nobody in the party can fight.');
  s.fight = { phase: 'initiative', round: 0, turn: 0, order: [], used: freshTurn(), xp: 0, surprised: [] };
  s.fight.surprised = surprisedKeys(s, ctx, [].concat(a.surprised || [], a.surprise ? [a.surprise] : []), foes, pcs);
  for (const f of foes) { f.hidden = false; delete f.calm; joinFight(s, ctx, 'foe', f.id); }
  for (const p of pcs) {
    joinFight(s, ctx, 'pc', p.id, { roll: !!a.autoRoll || !p.playerId });
    if (!a.autoRoll && p.playerId) s.requests.push({ id: nextId(s, 'q'), pcId: p.id, kind: 'initiative', ability: 'dex', skill: '', dc: 0, adv: '', reason: 'Roll initiative!', by: 'engine', t: ctx.now || 0 });
  }
  story(s, ctx, 'event', `Battle! ${foes.map((f) => f.name).join(', ')}. Roll initiative.`, 'Engine');
  emit(ctx, { ev: 'fight', site: s.scene.siteId });
  if (s.fight.surprised.length) story(s, ctx, 'event', `Surprised: ${s.fight.surprised.map((k) => nameOf(s, k)).join(', ')} (no turn in the first round).`, 'Engine');
  if (s.fight.order.every((o) => o.init != null)) startTurns(s, ctx);
};
// Who is surprised: names, or "party" / "foes" for a whole side.
function surprisedKeys(s, ctx, list, foes, pcs) {
  const out = [];
  for (const x of list.slice(0, 20)) {
    const w = String(x || '').toLowerCase().trim();
    if (!w) continue;
    if (/^(the )?(party|heroes|characters|players|pcs)$/.test(w)) out.push(...pcs.map((p) => keyOf('pc', p.id)));
    else if (/^(the )?(foes|monsters|enemies|them|enemy)$/.test(w)) out.push(...foes.map((f) => keyOf('foe', f.id)));
    else { const t = target(s, x, ctx); if (t) out.push(keyOf(t.kind, t.id)); }
  }
  return [...new Set(out)];
}
// Start without waiting for slow initiative rolls: the Engine rolls for whoever has not.
H['fight.begin'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (!s.fight || s.fight.phase !== 'initiative') nop('There is no initiative being rolled.');
  startTurns(s, ctx);
};
// The DM types in an initiative rolled at the table.
H['fight.init'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (!s.fight) nop('There is no fight.');
  const o = s.fight.order.find((x) => x.key === a.key);
  if (!o) refuse('They are not in the fight.', s.fight.order.map((x) => nameOf(s, x.key)));
  const n = Math.trunc(Number(a.init));
  if (!(n >= -5 && n <= 40)) no('Initiative is a number such as 14.');
  const cur = currentKey(s);
  o.init = n;
  s.requests = s.requests.filter((q) => !(q.kind === 'initiative' && keyOf('pc', q.pcId) === a.key));
  if (s.fight.phase === 'initiative') { if (s.fight.order.every((x) => x.init != null)) startTurns(s, ctx); }
  else { sortOrder(s); s.fight.turn = Math.max(0, s.fight.order.findIndex((x) => x.key === cur)); }
};
H['fight.add'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (!s.fight) nop('There is no fight to join.');
  const t = target(s, a.target, ctx);
  if (!t) refuse(`Nobody called "${a.target}" is here to add.`, [...partyNames(s), ...foeNamesHere(s)]);
  if (t.kind === 'foe') t.o.hidden = false;
  joinFight(s, ctx, t.kind, t.id, { roll: true });
};
// Holds a monster's spell keeps on a character (hold person): they end when the caster falls or
// flees, and the held character saves again at the end of each of their turns (bench 21 Nov: Bryn
// was paralyzed by Brother Aldane for the rest of the fight, and the bench crashed on his turn).
function releaseHolds(s, ctx, { all = false } = {}) {
  for (const pc of Object.values(s.pcs)) {
    for (const h of [...(pc.held || [])]) {
      const caster = s.foes[h.foeId];
      if (!all && caster && !caster.dead) continue;
      pc.held = pc.held.filter((x) => x !== h);
      if (pc.conds.includes(h.cond)) { pc.conds = pc.conds.filter((c) => c !== h.cond); story(s, ctx, 'event', `${h.spell} ends: ${pc.name} is no longer ${h.cond}.`, 'Engine'); }
    }
  }
}
function endOfTurnSaves(s, ctx, key) {
  const [kind, id] = String(key || '').split(':');
  const pc = kind === 'pc' ? s.pcs[id] : null;
  if (!pc || pc.dead || !(pc.held || []).length) return;
  for (const h of [...pc.held]) {
    const r = pcD20(s, ctx, pc, { kind: 'save', ability: h.ability, skill: '', adv: '' });
    const ok = !r.fx.fail && r.total >= h.dc;
    addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'save', label: `${R.ABILITY_NAMES[h.ability]} saving throw`, dice: r.rolls, mod: r.bonus, total: r.total, at: h.dc, success: ok, mode: r.mode, reason: `end of turn: ${h.spell}` });
    if (ok) { pc.held = pc.held.filter((x) => x !== h); pc.conds = pc.conds.filter((c) => c !== h.cond); }
    story(s, ctx, 'event', ok ? `${pc.name} breaks free of ${h.spell} and is no longer ${h.cond}.` : `${pc.name} strains against ${h.spell} and stays ${h.cond}.`, 'Engine', { roll: true });
  }
}

H['fight.next'] = (s, a, ctx) => {
  if (!s.fight || s.fight.phase !== 'turns') nop('No turns are being taken.');
  const cur = currentKey(s);
  if (!isHost(ctx)) {
    const p = s.players[ctx.pid];
    if (!p || keyOf('pc', p.pcId) !== cur) no('Only the one whose turn it is can end it.');
  }
  if (ctx.ai && a.expect && a.expect !== cur) nop(`It is ${nameOf(s, cur)}'s turn, not ${nameOf(s, a.expect) || a.expect}'s.`);
  releaseHolds(s, ctx);
  endOfTurnSaves(s, ctx, cur);
  advance(s, ctx);
  const now = currentKey(s);
  log(s, ctx, `${nameOf(s, cur)} ends their turn. ${nameOf(s, now)} is up (round ${s.fight.round}).`);
};
H['fight.end'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (!s.fight) nop('There is no fight to end.');
  // The AI Director ends a fight it has won while the Engine still has a foe standing (bench 26 Nov: the
  // last skeleton "comes apart" in the narration after a hit that did not drop it). The record follows
  // the story: those foes are beaten (out of the fight, their XP earned), so the place's rules ("when
  // no foe is left standing") still happen. A party that flees (award false) leaves them standing.
  if (ctx.ai && a.award !== false) {
    const still = s.fight.order.filter((o) => o.key.startsWith('foe:')).map((o) => s.foes[o.key.slice(4)]).filter((f) => f && !f.dead && !f.calm);
    if (still.length && Object.values(s.pcs).some((p) => !p.dead && p.hp > 0)) {
      for (const f of still) { f.dead = true; f.fled = true; f.beaten = true; s.fight.xp = (s.fight.xp || 0) + (f.xp || 0); }
      assume(ctx, `${still.map((f) => f.name).join(', ')} ${still.length > 1 ? 'were' : 'was'} still standing in the record: the fight is over, so ${still.length > 1 ? 'they count' : 'it counts'} as beaten.`);
      log(s, ctx, `${still.map((f) => f.name).join(', ')}: beaten as the fight ends.`, 'note-host');
    }
  }
  const xp = (s.fight.xp || 0) + (s.unspentXp || 0);
  s.unspentXp = 0;
  const alive = Object.values(s.pcs).filter((p) => !p.dead);
  s.fight = null;
  releaseHolds(s, ctx, { all: true });
  s.requests = s.requests.filter((q) => q.kind !== 'initiative' && q.kind !== 'death');
  for (const p of Object.values(s.pcs)) { p.raging = false; p.rageTurns = 0; }
  // A character still dying when the fight ends is not safe: someone has to stabilize or heal them.
  const dying = Object.values(s.pcs).filter((p) => p.hp <= 0 && !p.dead && !p.stable);
  if (dying.length) story(s, ctx, 'event', `${dying.map((p) => p.name).join(' and ')} ${dying.length > 1 ? 'are' : 'is'} still dying: stabilize them (a Medicine check, DC 10) or heal them.`, 'Engine');
  if (xp && alive.length && a.award !== false) {
    const each = Math.floor(xp / alive.length);
    for (const p of alive) p.xp = (p.xp || 0) + each;
    story(s, ctx, 'event', `The fight is over. Each of you earns ${each} XP.`, 'Engine');
    levelReady(s, ctx);
  } else story(s, ctx, 'event', 'The fight is over.', 'Engine');
  // A camp attacked in the night (a seed): the rest goes on once the fight is over.
  if (s.restAfter) { delete s.restAfter; if (alive.some((p) => p.hp > 0)) H['rest.long'](s, { after: true }, { ...ctx, role: 'host', pid: null }); }
};
function levelReady(s, ctx) {
  for (const p of Object.values(s.pcs)) {
    const want = R.levelForXp(p.xp || 0, ctx.srd.xpTable);
    if (want > p.level && !p.levelNoted) { p.levelNoted = true; story(s, ctx, 'event', `${p.name} has enough experience to reach level ${p.level + 1}.`, 'Engine'); }
    if (want <= p.level) p.levelNoted = false;
  }
}

// A character's attack with a weapon or an attack cantrip.
H.attack = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  if (pc.dead || pc.hp <= 0) no(`${pc.name} cannot attack while down.`);
  if (R.incapacitated(pc.conds)) no(`${pc.name} is ${pc.conds.find((c) => ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(c))} and cannot act.`);
  const atk = pickAttack(pc, a.attack, ctx);
  const t = target(s, a.target, ctx);
  if (!a.target) return freeAttack(s, a, ctx, pc, atk);
  if (!t || t.kind !== 'foe') refuse(`Choose a monster to attack${t ? `: ${t.o.name} is one of the party` : ''}.`, foeNamesHere(s));
  const foe = t.o;
  if (foe.dead) nop(`${foe.name} is already down.`, { options: foeNamesHere(s) });
  if (foe.siteId !== s.scene.siteId) refuse(`${foe.name} is not here.`, foeNamesHere(s));
  inTurnCheck(s, ctx, keyOf('pc', pc.id), 'attack');
  const f = s.fight;
  const bonusAction = !!a.bonus;
  if (f && f.phase === 'turns' && currentKey(s) === keyOf('pc', pc.id)) {
    if (bonusAction) { if (f.used.bonus) no(`${pc.name} has already used a bonus action this turn.`); f.used.bonus = true; }
    else {
      const allowed = atk.spell ? 1 : 1 + (pc.extraAttacks || 0);
      if (atk.spell ? f.used.action : (f.used.attacks >= allowed || (f.used.action && f.used.attacks === 0))) no(`${pc.name} has used their action this turn.`);
      if (atk.spell) f.used.action = true; else { f.used.attacks += 1; f.used.action = true; }
    }
  }
  // On the map: a melee attack steps up to the target; a ranged one may be spoilt by distance or a close enemy.
  let mfx = { dis: false, why: [], far: '' };
  const thrownAt = atk.melee && atk.thrown && mapOn(s) && s.map.show.reach && s.map.at[keyOf('pc', pc.id)] && s.map.at[keyOf('foe', foe.id)]
    && !MAP.inReach(s.map.at[keyOf('pc', pc.id)], s.map.at[keyOf('foe', foe.id)], /reach 10/.test(atk.range || '') ? 10 : 5);
  if (atk.melee && !thrownAt) stepUp(s, ctx, keyOf('pc', pc.id), keyOf('foe', foe.id), /reach 10/.test(atk.range || '') ? 10 : 5);
  else mfx = rangedFx(s, ctx, keyOf('pc', pc.id), keyOf('foe', foe.id), thrownAt ? atk.thrown : atk.range);
  if (mfx.far && !(isHost(ctx) && !ctx.ai)) no(`${mfx.far} Move closer first.`);
  const self = R.selfEffects(pc, 'attack');
  const tfx = R.targetEffects(foe.conds, { melee: atk.melee && !thrownAt });
  const adv = a.adv === 'adv' || self.adv || tfx.adv;
  const dis = a.adv === 'dis' || self.dis || tfx.dis || mfx.dis;
  const r = d20(ctx.rng, { adv, dis, own: Array.isArray(a.own) && a.own.length ? a.own : null });
  const total = r.kept + atk.hit;
  const hit = r.kept === 20 || (r.kept !== 1 && total >= foe.ac);
  // A hit on a paralyzed or unconscious creature from within 5 feet is a critical hit.
  const critHit = hit && (r.kept === 20 || (tfx.autoCrit && !thrownAt));
  let text = `${pc.name} ${thrownAt ? 'throws' : 'attacks'} ${foe.name} with ${atk.name}${advWord(r)}`;
  let dmgRow = null;
  if (hit) {
    let expr = a.twoHanded && atk.versatile ? atk.versatile : atk.dmg;
    let extra = 0;
    if (pc.raging && atk.melee && atk.ability === 'str') extra += ((pc.resources || []).find((x) => x.id === 'rage') || {}).bonus || 2;
    // An off-hand attack adds no ability modifier unless it is negative (Two-Weapon Fighting adds it back).
    if (a.offhand && pc.style !== 'two-weapon') expr = expr.replace(/\+\d+$/, '');
    const d = rollDice(expr, ctx.rng, { crit: critHit, extraMod: extra });
    let amount = d.total;
    const dice = [...d.dice];
    let smite = 0;
    if (a.sneak && pc.sneak) {
      if (f && f.used.sneak) no('Sneak Attack is once per turn.');
      if (!(atk.props.includes('finesse') || !atk.melee) || atk.spell) no('Sneak Attack needs a finesse or ranged weapon.');
      const sn = rollDice(pc.sneak, ctx.rng, { crit: critHit });
      amount += sn.total; dice.push(...sn.dice);
      if (f) f.used.sneak = true;
    }
    if (a.smite) {
      const lvl = Math.trunc(Number(a.smite));
      const slot = pc.cast && pc.cast.slots[lvl - 1];
      if (pc.cls !== 'paladin' || pc.level < 2) no('Only a paladin of 2nd level or higher can smite.');
      if (!atk.melee || atk.spell) no('Divine Smite needs a melee weapon hit.');
      if (!slot || slot[1] >= slot[0]) no(`${pc.name} has no ${R.ordinal(lvl)}-level spell slot left.`);
      slot[1] += 1;
      const m = monsterOf(ctx, foe) || {};
      const sm = rollDice(`${Math.min(5, 1 + lvl) + (['undead', 'fiend'].includes(m.type) ? 1 : 0)}d8`, ctx.rng, { crit: critHit });
      smite = damageFoe(s, ctx, foe, sm.total, 'radiant', { magical: true }).taken;
      dice.push(...sm.dice);
    }
    const res = foe.dead ? { taken: 0, notes: [] } : damageFoe(s, ctx, foe, amount, atk.type, { magical: !!atk.spell || !!a.magical, crit: critHit });
    text += critHit ? ': a critical hit' : ': a hit';
    text += ` for ${res.taken + smite} damage${smite ? ' (with a divine smite)' : ''}${res.notes.length ? `, ${res.notes.join(', ')}` : ''}${foe.dead && !res.notes.includes('falls') ? ', and it falls' : ''}.`;
    dmgRow = { dice, total: amount + smite };
  } else text += r.kept === 1 ? ': a natural 1, a miss.' : ': a miss.';
  addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'attack', label: `${atk.name} vs ${foe.name}`, dice: r.rolls, mod: atk.hit, total, at: foe.ac, success: hit, crit: critHit, mode: r.mode, why: [...self.why, ...tfx.why, ...mfx.why], dmg: dmgRow, hideAt: true });
  story(s, ctx, 'event', text, 'Engine', { roll: true });
  // An attack with no fight on starts one: the attacker struck first.
  if (!f) hostileAct(s, ctx, keyOf('pc', pc.id));
};
// The attack a character means: its id or name, a near name, or their only (or first) weapon when none is named.
function pickAttack(pc, ref, ctx) {
  const list = pc.attacks || [];
  const k = String(ref || '').toLowerCase().trim();
  const exact = list.find((x) => x.id === ref || x.name.toLowerCase() === k);
  if (exact) return exact;
  const near = k && NAMES.pick(list, ref, (x) => [x.id, x.name, x.id.replace(/^w:/, '')]);
  if (near) { assume(ctx, `"${ref}" is ${pc.name}'s ${near.name}.`); return near; }
  if (!k && list.length) { assume(ctx, `No attack was named: ${pc.name} uses their ${list[0].name}.`); return list[0]; }
  refuse(`${pc.name} has no attack called "${ref}". Attacks: ${list.map((x) => x.name).join(', ') || 'none'}.`, list.map((x) => x.name));
}

// An attack with no monster on the table (a game run on paper, or the Assistant): the Engine rolls
// to hit and the damage, and the DM says whether it lands.
function freeAttack(s, a, ctx, pc, atk) {
  const self = R.selfEffects(pc, 'attack');
  const r = d20(ctx.rng, { adv: a.adv === 'adv' || self.adv, dis: a.adv === 'dis' || self.dis, own: Array.isArray(a.own) && a.own.length ? a.own : null });
  const crit = r.kept === 20;
  let expr = a.twoHanded && atk.versatile ? atk.versatile : atk.dmg;
  let extra = 0;
  if (pc.raging && atk.melee && atk.ability === 'str') extra += ((pc.resources || []).find((x) => x.id === 'rage') || {}).bonus || 2;
  if (a.offhand && pc.style !== 'two-weapon') expr = expr.replace(/\+\d+$/, '');
  const d = rollDice(expr, ctx.rng, { crit, extraMod: extra });
  const dice = [...d.dice];
  let amount = d.total;
  if (a.sneak && pc.sneak) { const sn = rollDice(pc.sneak, ctx.rng, { crit }); amount += sn.total; dice.push(...sn.dice); }
  const total = r.kept + atk.hit;
  addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'attack', label: atk.name, dice: r.rolls, mod: atk.hit, total, at: null, success: r.kept === 1 ? false : null, crit, mode: r.mode, why: self.why, dmg: { dice, total: amount, type: atk.type } });
  story(s, ctx, 'event', `${pc.name} attacks with ${atk.name}${advWord(r)}: ${r.kept === 20 ? 'a natural 20, a critical hit' : r.kept === 1 ? 'a natural 1, a miss' : `${total} to hit`}${r.kept === 1 ? '' : `, ${amount} ${atk.type} damage if it hits`}.`, 'Engine', { roll: true });
}

// Casting a spell: spends the slot, keeps track of concentration, and rolls what the page prices.
H['spell.cast'] = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  if (pc.dead || pc.hp <= 0) no(`${pc.name} cannot cast while down.`);
  if (R.incapacitated(pc.conds)) no(`${pc.name} cannot act right now.`);
  if (pc.raging) no('A raging barbarian cannot cast spells.');
  const c = pc.cast;
  if (!c) refuse(`${pc.name} does not cast spells.`, (pc.attacks || []).map((x) => x.name), 'Attack instead, or act another way.');
  const ix = R.index(ctx.srd);
  const own = [...new Set([...c.cantrips, c.raceCantrip, ...(c.kind === 'prepared' ? c.prepared : c.known)].filter(Boolean))].map((id) => ix.spell[id]).filter(Boolean);
  let sp = ix.spell[a.spell] || ctx.srd.spells.find((x) => x.name.toLowerCase() === String(a.spell || '').toLowerCase().trim());
  // A near name: their own spells first ("cure wound", "guiding bolt"), then any spell.
  if (!sp) { sp = NAMES.pick(own, a.spell, (x) => [x.id, x.name]) || NAMES.pick(ctx.srd.spells, a.spell, (x) => [x.id, x.name]); if (sp) assume(ctx, `"${a.spell}" is ${sp.name}.`); }
  if (!sp) refuse(`There is no spell called "${a.spell}".`, own.map((x) => x.name));
  R.spellDamage(sp); // its numbers, read from its words if the book compiler has not (a library spell added later)
  const can = sp.level === 0 ? [...c.cantrips, c.raceCantrip].includes(sp.id) : (c.kind === 'prepared' ? c.prepared : c.known).includes(sp.id);
  if (!can && !(c.spellbook && a.ritual && sp.ritual && c.known.includes(sp.id))) refuse(`${pc.name} does not have ${sp.name} ${c.kind === 'prepared' ? 'prepared' : 'known'}.`, own.map((x) => x.name));
  const ritual = !!a.ritual && sp.ritual;
  const lvl = sp.level === 0 ? 0 : Math.max(sp.level, Math.trunc(Number(a.level) || sp.level));
  inTurnCheck(s, ctx, keyOf('pc', pc.id), 'cast');
  const f = s.fight;
  if (f && f.phase === 'turns' && currentKey(s) === keyOf('pc', pc.id) && !ritual) {
    const bonus = /bonus action/i.test(sp.time);
    const react = /reaction/i.test(sp.time);
    if (bonus) { if (f.used.bonus) no(`${pc.name} has used their bonus action.`); f.used.bonus = true; }
    else if (!react) { if (f.used.action) no(`${pc.name} has used their action this turn.`); f.used.action = true; }
  }
  if (lvl > 0 && !ritual) {
    const slot = c.slots[lvl - 1];
    const left = c.slots.map(([m, u], n) => (m > u && n + 1 >= sp.level ? `${R.ordinal(n + 1)} level (${m - u} left)` : '')).filter(Boolean);
    if (!slot || !slot[0]) refuse(`${pc.name} has no ${R.ordinal(lvl)}-level spell slots.`, left, left.length ? 'Cast it with a slot they still have.' : 'They have no slot for it: a cantrip or an attack instead.');
    if (slot[1] >= slot[0]) refuse(`${pc.name} has no ${R.ordinal(lvl)}-level spell slots left.`, left, left.length ? 'Cast it with a higher slot they still have.' : 'They have no slot for it: a cantrip or an attack instead.');
    slot[1] += 1;
  }
  if (sp.conc) { if (pc.conc) dropConcentration(s, ctx, pc, `cast ${sp.name}`); pc.conc = { id: sp.id, name: sp.name, since: s.seq }; }
  const lines = [`${pc.name} casts ${sp.name}${lvl > sp.level ? ` at ${R.ordinal(lvl)} level` : ''}${ritual ? ' as a ritual' : ''}.`];
  const targets = (a.targets || (a.target ? [a.target] : [])).map((x) => target(s, x, ctx)).filter(Boolean).slice(0, 12);
  const am = pc.mods[c.ability] || 0;
  // The book's numbers (book.js): dice per hit by slot or character level, how many darts, rays or
  // beams, and how the harm lands. Only an attack, a save or a sure hit is dealt here; damage that
  // comes later, by choice or by mishap is the Director's.
  const atLevel = (tab) => tab[Object.keys(tab).map(Number).filter((n) => n <= pc.level).sort((x, y) => y - x)[0]];
  const harms = !sp.how || ['attack', 'save', 'auto'].includes(sp.how);
  const dmgExpr = !harms ? '' : String((sp.dmgSlot ? sp.dmgSlot[lvl] || sp.dmgSlot[sp.level] : sp.dmgLevel ? atLevel(sp.dmgLevel) : '') || '').replace(/\+MOD$/, `+${Math.max(0, am)}`);
  // "Damage of the type you choose" (Chromatic Orb): the one the call names, else the first the spell lists.
  const dtype = sp.dmgType === 'chosen' ? ((sp.dmgTypes || []).find((t) => t === String(a.damageType || '').toLowerCase()) || (sp.dmgTypes || [])[0] || 'force') : sp.dmgType;
  const hits = sp.count ? sp.count[lvl] || sp.count[sp.level] || 1 : sp.countLevel ? atLevel(sp.countLevel) || 1 : 1;
  // A sure hit (Magic Missile): every dart strikes, shared out over the targets named.
  if (sp.how === 'auto' && dmgExpr && targets.length) {
    const darts = hits;
    const each = targets.map(() => 0);
    for (let n = 0; n < darts; n++) each[n % targets.length] += 1;
    targets.forEach((t, n) => {
      if (!each[n]) return;
      const one = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(dmgExpr);
      const d = rollDice(one ? `${Number(one[1]) * each[n]}d${one[2]}${one[3] ? `+${Number(one[3]) * each[n]}` : ''}` : dmgExpr, ctx.rng);
      if (t.kind === 'foe') { const r = damageFoe(s, ctx, t.o, d.total, dtype, { magical: true }); lines.push(`${each[n]} dart${each[n] > 1 ? 's' : ''} strike${each[n] > 1 ? '' : 's'} ${t.o.name} for ${r.taken} ${dtype} damage${r.notes.length ? `, ${r.notes.join(', ')}` : ''}.`); }
      else { const r = damagePc(s, ctx, t.o, d.total, dtype); lines.push(`${t.o.name} takes ${r.taken} ${dtype} damage.`); }
    });
  } else if (sp.attack && dmgExpr && targets.length) {
    // One attack roll per ray or beam (Scorching Ray, Eldritch Blast), shared out over the targets named.
    const shots = Array.from({ length: hits }, (_, n) => targets[n % targets.length]);
    for (const t of shots) {
      if (t.kind === 'foe' && t.o.dead) continue;
      const ac = t.kind === 'foe' ? t.o.ac : t.o.ac;
      const tfx = R.targetEffects(t.o.conds || [], { melee: sp.attack === 'melee' });
      const self = R.selfEffects(pc, 'attack');
      const r = d20(ctx.rng, { adv: a.adv === 'adv' || tfx.adv || self.adv, dis: a.adv === 'dis' || tfx.dis || self.dis });
      const total = r.kept + c.atk;
      const hit = r.kept === 20 || (r.kept !== 1 && total >= ac);
      let dmg = null;
      if (hit) {
        const d = rollDice(dmgExpr, ctx.rng, { crit: r.kept === 20 || (tfx.autoCrit && sp.attack === 'melee') });
        dmg = { dice: d.dice, total: d.total };
        const res = t.kind === 'foe' ? damageFoe(s, ctx, t.o, d.total, dtype, { magical: true }) : damagePc(s, ctx, t.o, d.total, dtype);
        lines.push(`It ${r.kept === 20 ? 'strikes true, a critical hit,' : 'hits'} ${t.o.name} for ${res.taken} ${dtype} damage${res.notes.length ? `, ${res.notes.join(', ')}` : ''}.`);
        // Life drained (Vampiric Touch): the caster regains half the damage dealt.
        if (sp.drain === 'half' && res.taken > 0 && pc.hp > 0) { const back = Math.min(Math.floor(res.taken / 2), pc.maxHp - pc.hp); if (back > 0) { pc.hp += back; lines.push(`${pc.name} regains ${back} hit points.`); } }
      } else lines.push(`It misses ${t.o.name}.`);
      addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'attack', label: `${sp.name} vs ${t.o.name}`, dice: r.rolls, mod: c.atk, total, at: ac, success: hit, crit: hit && r.kept === 20, mode: r.mode, dmg, hideAt: true });
    }
  } else if (sp.save && targets.length) {
    const d = dmgExpr ? rollDice(dmgExpr, ctx.rng) : null;
    for (const t of targets) {
      if (t.kind === 'foe') {
        const m = monsterOf(ctx, t.o) || {};
        const sb = R.monsterSave(m, sp.save.ability);
        const fx = R.selfEffects({ conds: t.o.conds || [] }, 'save', sp.save.ability);
        const r = d20(ctx.rng, { dis: fx.dis });
        const ok = !fx.fail && r.kept + sb >= c.dc;
        addRoll(s, ctx, { who: t.o.name, foeId: t.o.id, kind: 'save', label: `${R.ABILITY_NAMES[sp.save.ability]} save vs ${sp.name}`, dice: r.rolls, mod: sb, total: r.kept + sb, at: c.dc, success: ok, secret: true });
        if (d) {
          const amount = ok ? (sp.save.success === 'half' ? Math.floor(d.total / 2) : 0) : d.total;
          const res = amount ? damageFoe(s, ctx, t.o, amount, dtype, { magical: true }) : { taken: 0, notes: [] };
          lines.push(`${t.o.name} ${ok ? 'resists' : 'fails to resist'}${amount ? `: ${res.taken} ${dtype} damage${res.notes.length ? `, ${res.notes.join(', ')}` : ''}` : ''}.`);
        } else lines.push(`${t.o.name} ${ok ? 'resists the spell' : 'is caught by the spell'}.`);
      } else {
        s.requests.push({ id: nextId(s, 'q'), pcId: t.id, kind: 'save', ability: sp.save.ability, skill: '', dc: c.dc, adv: '', reason: `${sp.name} from ${pc.name}`, by: 'engine', t: ctx.now || 0, effect: d ? { dmg: String(d.total), type: dtype, half: sp.save.success === 'half', cond: '' } : null });
        lines.push(`${t.o.name} must make a ${R.ABILITY_NAMES[sp.save.ability]} saving throw.`);
      }
    }
  } else if (sp.heal && targets.length) {
    const expr = (sp.heal[lvl] || sp.heal[sp.level] || '').replace(/MOD/i, String(am));
    for (const t of targets.slice(0, sp.id === 'mass-cure-wounds' || sp.id === 'mass-healing-word' ? 6 : 1)) {
      if (t.kind !== 'pc') continue;
      let e = expr;
      if (pc.subclass === 'life' && lvl > 0) e = `${e}+${2 + lvl}`; // Disciple of Life
      const d = rollDice(e, ctx.rng);
      const got = healPc(s, ctx, t.o, d.total);
      lines.push(`${t.o.name} regains ${got} hit points.`);
      addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'heal', label: `${sp.name} on ${t.o.name}`, dice: d.dice, mod: d.flat, total: d.total, at: null, success: null });
    }
  } else if (dmgExpr && !targets.length) {
    // No targets named (a game on paper): roll what the spell prices and leave the rest to the DM.
    const d = rollDice(dmgExpr, ctx.rng);
    if (sp.attack) {
      const r = d20(ctx.rng, { adv: a.adv === 'adv', dis: a.adv === 'dis' });
      addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'attack', label: sp.name, dice: r.rolls, mod: c.atk, total: r.kept + c.atk, at: null, success: r.kept === 1 ? false : null, crit: r.kept === 20, mode: r.mode, dmg: { dice: d.dice, total: d.total } });
      lines.push(`Spell attack: ${r.kept + c.atk} to hit, ${r.kept === 20 ? 'a critical hit (roll the damage dice again), ' : ''}${d.total} ${dtype || ''} damage if it hits.`);
    } else {
      addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'dice', label: `${sp.name} damage`, dice: d.dice, mod: d.flat, total: d.total });
      lines.push(`${d.total} ${dtype || ''} damage${sp.save ? ` (a DC ${c.dc} ${R.ABILITY_NAMES[sp.save.ability]} save${sp.save.success === 'half' ? ' halves it' : ' avoids it'})` : ''}.`);
    }
  } else if (sp.heal && !targets.length) {
    const d = rollDice((sp.heal[lvl] || sp.heal[sp.level] || '').replace(/MOD/i, String(am)) + (pc.subclass === 'life' && lvl > 0 ? `+${2 + lvl}` : ''), ctx.rng);
    addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'heal', label: sp.name, dice: d.dice, mod: d.flat, total: d.total });
    lines.push(`It restores ${d.total} hit points.`);
  }
  story(s, ctx, 'event', lines.join(' '), 'Engine', { roll: true });
  // A harmful spell at a monster with no fight on starts one: the caster struck first.
  if (!s.fight && targets.some((t) => t.kind === 'foe') && (sp.attack || sp.save || dmgExpr)) hostileAct(s, ctx, keyOf('pc', pc.id));
};

H['slot.set'] = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  const slot = pc.cast && pc.cast.slots[Math.trunc(Number(a.level)) - 1];
  if (!slot) no('There is no such spell slot.');
  slot[1] = Math.max(0, Math.min(slot[0], Math.trunc(Number(a.used))));
};
H['conc.end'] = (s, a, ctx) => { const pc = ownPc(s, ctx, a.pcId); dropConcentration(s, ctx, pc, 'ended it'); };

// Class resources: rage, second wind, ki, lay on hands and the rest.
H['resource.use'] = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  const r = (pc.resources || []).find((x) => x.id === a.id);
  if (!r) refuse(`${pc.name} has no ${a.id}.`, (pc.resources || []).map((x) => x.name));
  const n = Math.max(1, Math.trunc(Number(a.amount) || 1));
  if (r.used + n > r.max) no(`${pc.name} has no ${r.name} left${r.pool ? ` (${r.max - r.used} points)` : ''}.`);
  if (r.id === 'rage') {
    if (pc.raging) { pc.raging = false; story(s, ctx, 'event', `${pc.name}'s rage ends.`, 'Engine'); return; }
    if (s.fight && s.fight.phase === 'turns' && currentKey(s) === keyOf('pc', pc.id)) { if (s.fight.used.bonus) no('Raging takes a bonus action, and it is used.'); s.fight.used.bonus = true; }
    pc.raging = true; pc.rageTurns = 0; dropConcentration(s, ctx, pc, 'rage');
    r.used += 1;
    story(s, ctx, 'event', `${pc.name} flies into a rage!`, 'Engine');
    return;
  }
  r.used += n;
  if (r.id === 'secondwind') {
    const d = rollDice(r.heal, ctx.rng);
    const got = healPc(s, ctx, pc, d.total);
    addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'heal', label: 'Second Wind', dice: d.dice, mod: d.flat, total: d.total });
    story(s, ctx, 'event', `${pc.name} catches a second wind and regains ${got} hit points.`, 'Engine');
    return;
  }
  if (r.id === 'layonhands') {
    const t = target(s, a.target, ctx) || { kind: 'pc', o: pc };
    if (t.kind !== 'pc') no('Lay on Hands heals a character.');
    const got = healPc(s, ctx, t.o, n);
    story(s, ctx, 'event', `${pc.name} lays healing hands on ${t.o.name}: ${got} hit points restored.`, 'Engine');
    return;
  }
  if (r.id === 'breath') {
    const targets = (a.targets || []).map((x) => target(s, x, ctx)).filter((t) => t && t.kind === 'foe');
    const d = rollDice(r.dmg, ctx.rng);
    const lines = [`${pc.name} breathes ${r.type}!`];
    for (const t of targets) {
      const m = monsterOf(ctx, t.o) || {};
      const save = ['fire', 'acid', 'lightning'].includes(r.type) ? 'dex' : 'con';
      const rr = d20(ctx.rng);
      const ok = rr.kept + R.monsterSave(m, save) >= r.dc;
      const res = damageFoe(s, ctx, t.o, ok ? Math.floor(d.total / 2) : d.total, r.type, { magical: true });
      lines.push(`${t.o.name} takes ${res.taken}${res.notes.length ? ` (${res.notes.join(', ')})` : ''}.`);
    }
    story(s, ctx, 'event', lines.join(' '), 'Engine');
    return;
  }
  if (r.id === 'recovery') {
    const lvl = Math.trunc(Number(a.slot) || 1);
    const slot = pc.cast && pc.cast.slots[lvl - 1];
    if (!slot || slot[1] <= 0 || lvl > 5 || lvl > r.slots) { r.used -= n; no('Choose a spent slot of a level Arcane Recovery can restore.'); }
    slot[1] -= 1;
  }
  story(s, ctx, 'event', `${pc.name} uses ${r.name}${r.pool ? ` (${n})` : ''}.`, 'Engine');
};
H['resource.set'] = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  const r = (pc.resources || []).find((x) => x.id === a.id);
  if (!r) no('There is no such resource.');
  r.used = Math.max(0, Math.min(r.max, Math.trunc(Number(a.used) || 0)));
};

// ---- monsters ------------------------------------------------------------------------------------
H['foe.add'] = (s, a, ctx) => {
  hostOnly(ctx);
  const ix = R.index(ctx.srd);
  const key = String(a.monster || '').toLowerCase().trim();
  let m = ix.monster[key] || ix.monster[key.replace(/\s+/g, '-')] || ctx.srd.monsters.find((x) => x.name.toLowerCase() === key);
  // A near name ("goblins", "giant rats", "Skeleton warrior"): one monster it can only mean.
  if (!m && key) {
    const sing = key.replace(/(?<=[a-z])(?:es|s)$/, '');
    m = ix.monster[sing] || ix.monster[sing.replace(/\s+/g, '-')] || NAMES.pick(ctx.srd.monsters, key, (x) => [x.id, x.name]) || NAMES.pick(ctx.srd.monsters, sing, (x) => [x.id, x.name]);
    if (m) assume(ctx, `"${a.monster}" is the ${m.name}.`);
  }
  const like = ctx.srd.monsters.filter((x) => x.name.toLowerCase().includes(key.split(/\s+/)[0] || '')).slice(0, 8).map((x) => x.id);
  if (!m) refuse(`There is no monster called "${a.monster}" in the SRD. Try one of: ${like.join(', ') || 'goblin, wolf, skeleton, zombie, orc'}.`, like);
  let count = Math.max(1, Math.min(12, Math.trunc(Number(a.count) || 1)));
  const standing = Object.values(s.foes).filter((f) => !f.dead && f.siteId === (a.siteId || s.scene.siteId)).length;
  if (ctx.ai && standing + count > 12) {
    if (standing >= 12) refuse('That is too many monsters in one place: twelve are already standing here.', foeNamesHere(s));
    assume(ctx, `Only ${12 - standing} more could be placed (twelve monsters at most in one place).`);
    count = 12 - standing;
  }
  const base = str(a.name, 30) || m.name;
  const same = Object.values(s.foes).filter((f) => f.base === base).length;
  const out = [];
  for (let n = 0; n < count; n++) {
    const id = nextId(s, 'f');
    const label = count > 1 || same ? `${base} ${same + n + 1}` : base;
    const hp = a.rollHp ? rollDice(m.hd, ctx.rng).total || m.hp : m.hp;
    s.foes[id] = { id, mid: m.id, base, name: label, siteId: a.siteId || s.scene.siteId, hp, maxHp: hp, ac: m.ac, dexMod: R.mod(m.ab[1]), xp: m.xp, cr: m.cr, conds: [], dead: false, hidden: !!a.hidden, spent: {}, note: str(a.note, 200), legendary: m.legendary ? 3 : null };
    if (a.zone) s.foes[id].zone0 = str(a.zone, 40); // where on the map it starts (the adventure's zone for it)
    if (a.group != null) s.foes[id].group = String(a.group); // which of the place's foe groups (for fitting fights)
    out.push(s.foes[id]);
    if (s.fight && !a.hidden && (a.siteId || s.scene.siteId) === s.scene.siteId) joinFight(s, ctx, 'foe', id);
  }
  if (!a.hidden) story(s, ctx, 'event', `${out.map((f) => f.name).join(', ')} ${out.length > 1 ? 'appear' : 'appears'}.`, 'Engine');
  else log(s, ctx, `Placed out of sight: ${out.map((f) => f.name).join(', ')}.`, 'note-host');
  return out;
};
H['foe.reveal'] = (s, a, ctx) => {
  hostOnly(ctx);
  const list = Object.values(s.foes).filter((f) => f.hidden && f.siteId === s.scene.siteId && (!a.foeIds || a.foeIds.includes(f.id)));
  if (!list.length) nop('Nothing is hidden here.');
  for (const f of list) f.hidden = false;
  story(s, ctx, 'event', `${list.map((f) => f.name).join(', ')} ${list.length > 1 ? 'are' : 'is'} revealed.`, 'Engine');
};
H['foe.remove'] = (s, a, ctx) => {
  hostOnly(ctx);
  const f = s.foes[a.foeId] || (target(s, a.foeId, ctx) || {}).o;
  if (!f || !s.foes[f.id]) refuse('There is no such monster.', foeNamesHere(s));
  delete s.foes[f.id];
  if (s.fight) { const cur = currentKey(s); s.fight.order = s.fight.order.filter((o) => o.key !== keyOf('foe', f.id)); s.fight.turn = Math.max(0, s.fight.order.findIndex((o) => o.key === cur)); if (!s.fight.order.length) s.fight = null; }
  log(s, ctx, `${f.name} was removed.`);
};
H['foe.flee'] = (s, a, ctx) => {
  hostOnly(ctx);
  const t = s.foes[a.foeId] ? { o: s.foes[a.foeId] } : target(s, a.foeId, ctx);
  const f = t && s.foes[t.o.id] ? t.o : null;
  if (f && f.dead) nop(`${f.name} is already ${f.fled ? 'gone' : 'down'}.`, { options: foeNamesHere(s) });
  if (!f) refuse('There is no such monster standing.', foeNamesHere(s));
  f.dead = true; f.fled = true;
  if (s.fight) s.fight.xp = (s.fight.xp || 0) + (f.xp || 0);
  story(s, ctx, 'event', `${f.name} flees.`, 'Engine');
};

// A monster's action from its stat block, against a character. One that strikes or catches a character
// with no fight on starts one (the monster struck first).
H['foe.act'] = (s, a, ctx) => {
  const actor = s.foes[a.foeId] || (target(s, a.foeId, ctx) || {}).o;
  if (actor && actor.calm && s.foes[actor.id]) delete actor.calm; // one that stood down and acts again is fighting
  const calm = !s.fight;
  const rolls = s.rolls.length; const asks = s.requests.length;
  foeAct(s, a, ctx);
  const struck = s.rolls.slice(rolls).some((r) => r.kind === 'attack') || s.requests.slice(asks).some((q) => q.kind === 'save');
  if (calm && !s.fight && struck) { const f = s.foes[a.foeId] || (target(s, a.foeId) || {}).o; hostileAct(s, ctx, f ? keyOf('foe', f.id) : ''); }
};
// Multiattack, as the book compiler read it (book.js: act.multi, its choices, the first the usual one).
// The Engine makes each attack in turn at the named target, or spread over several named; a call can
// pick another choice by naming one of its attacks ("Multiattack: longbow"). Uses of abilities in the
// list (Frightful Presence) are left to the Director, and so is pressing on once a target falls.
function multiattack(s, a, ctx, foe, m, act) {
  const choices = act.multi || [];
  if (!choices.length) { story(s, ctx, 'event', `${foe.name} attacks several times.`, 'Engine'); assume(ctx, `${foe.name}'s Multiattack: ${act.d} Call monster_action for each attack.`); return; }
  const want = String(a.action || '').replace(/^Multiattack\s*[:(-]?\s*/i, '').replace(/\)\s*$/, '').trim().toLowerCase();
  const choice = (want && choices.find((c) => Object.keys(c).some((k) => k.toLowerCase().includes(want)))) || choices[0];
  const pool = [...(m.actions || []), ...(m.traits || [])];
  let targets = (a.targets || (a.target ? [a.target] : [])).map((x) => target(s, x, ctx)).filter((t) => t && t.kind === 'pc' && !t.o.dead);
  const living = Object.values(s.pcs).filter((p) => !p.dead && p.hp > 0);
  if (!targets.length && living.length === 1) { targets = [{ kind: 'pc', id: living[0].id, o: living[0] }]; assume(ctx, `No target was named: ${foe.name} goes for ${living[0].name}, the only one it can.`); }
  if (!targets.length) refuse(`Name the character ${foe.name} attacks: ${Object.values(s.pcs).filter((p) => !p.dead).map((p) => `${p.id} (${p.name})`).join(', ')}.`, partyNames(s));
  const plan = Object.entries(choice).map(([k, v]) => `${typeof v === 'number' && v > 1 ? `${v} × ` : ''}${k}`).join(', ');
  story(s, ctx, 'event', `${foe.name} makes its attacks (${plan}).`, 'Engine');
  const others = [];
  let n = 0;
  let left = 0;
  for (const [name, count] of Object.entries(choice)) {
    const sub = pool.find((x) => x.n === name);
    if (!sub || sub.hit == null) { others.push(name); continue; }
    const times = typeof count === 'number' ? count : /\dd\d/.test(count) ? rollDice(count, ctx.rng).total : 1;
    for (let i = 0; i < times; i++) {
      const up = targets.filter((t) => !t.o.dead && t.o.hp > 0);
      if (!up.length || foe.dead || R.incapacitated(foe.conds)) { left += times - i; break; }
      const t = up[n++ % up.length];
      const before = s.rolls.length;
      try { foeAct(s, { ...a, action: name, target: t.id, targets: undefined, _sub: true }, ctx); } catch (e) { if (e instanceof RuleError) { left += times - i; break; } throw e; }
      if (s.rolls.length === before) return; // it had to close in first (a Dash), or could not strike
    }
  }
  if (left) assume(ctx, `${foe.name} has ${left} attack${left > 1 ? 's' : ''} left after its target fell: call monster_action for another target if it presses on.`);
  if (others.length) assume(ctx, `${foe.name}'s Multiattack also lets it use ${others.join(' and ')}: call monster_action for ${others.length > 1 ? 'them' : 'it'} if it does.`);
}
function foeAct(s, a, ctx) {
  hostOnly(ctx);
  const foe = s.foes[a.foeId] || (target(s, a.foeId, ctx) || {}).o;
  if (foe && foe.dead) nop(`${foe.name} has already fallen and cannot act.`, { options: foeNamesHere(s), hint: 'Act for a monster still standing, or end its turn.' });
  if (!foe || !s.foes[foe.id]) refuse(`No monster called "${a.foeId}" is here.`, foeNamesHere(s));
  const m = monsterOf(ctx, foe);
  const pool = [...(m.actions || []), ...(m.reactions || []), ...(m.legendary || [])];
  // The actions every creature has (PHB/SRD "Actions in Combat"), whatever its stat block lists.
  // Bench, 20 Nov: a goblin was refused "Disengage".
  const STD = { dash: 'Dash', disengage: 'Disengage', dodge: 'Dodge', hide: 'Hide', help: 'Help', ready: 'Ready', search: 'Search', 'use an object': 'Use an Object' };
  const stdKey = String(a.action || '').toLowerCase().trim();
  if (STD[stdKey]) {
    if (R.incapacitated(foe.conds)) nop(`${foe.name} cannot act right now.`);
    if (ctx.ai && s.fight && s.fight.phase === 'turns') inTurnCheck(s, ctx, keyOf('foe', foe.id), 'act');
    story(s, ctx, 'event', `${foe.name} takes the ${STD[stdKey]} action.`, 'Engine');
    return;
  }
  let act = pool.find((x) => x.n.toLowerCase() === String(a.action || '').toLowerCase()) || pool.find((x) => x.n.toLowerCase().startsWith(String(a.action || '').toLowerCase().slice(0, 5)) && a.action);
  // A spell from the stat block's Spellcasting trait (bench 21 Nov: Brother Aldane's hold person and
  // spiritual weapon were refused three runs out of three).
  const book = monsterSpells(m, ctx.srd);
  const spellWord = String(a.action || '').toLowerCase().replace(/^cast(?:s|ing)?\s+/, '').trim();
  if (!act) {
    const sp = book && book.spells.find((x) => x.name.toLowerCase() === spellWord);
    if (sp) { castMonsterSpell(s, ctx, foe, book, sp, a); return; }
  }
  // A near name ("Morning star", "bite attack"), then a near spell name.
  if (!act && a.action) { act = NAMES.pick(pool, a.action, (x) => [x.n]); if (act) assume(ctx, `"${a.action}" is ${foe.name}'s ${act.n}.`); }
  if (!act && book) {
    const sp = NAMES.pick(book.spells, spellWord, (x) => [x.name]);
    if (sp) { assume(ctx, `"${a.action}" is ${sp.name}.`); castMonsterSpell(s, ctx, foe, book, sp, a); return; }
  }
  // A weapon the stat block calls something else (bench part 3, 24 Nov: "Scimitar" on a skeleton with a
  // Shortsword): it attacks with the weapon it has, the ranged one for a shot.
  const isSpell = ctx.srd.spells.some((x) => x.name.toLowerCase() === spellWord);
  if (!act && !isSpell && ATTACK_WORDS.test(String(a.action || ''))) {
    const attacks = pool.filter((x) => x.hit != null);
    const ranged = /bow|sling|javelin|dart|shoot|fire|throw|ranged|crossbow/i.test(a.action);
    act = attacks.find((x) => ranged === !/Melee/.test(x.d)) || attacks[0] || null;
    if (act) assume(ctx, `${foe.name} has no ${a.action}: it attacks with its ${act.n}.`);
  }
  if (!act) {
    nop(`${foe.name} has no action called "${a.action}". Its actions: ${pool.map((x) => x.n).join(', ')}${book ? `. Spells it can cast: ${book.spells.map((x) => x.name).join(', ')}` : ''}.`,
      { options: [...pool.map((x) => x.n), ...(book ? book.spells.map((x) => x.name) : [])], hint: 'Use one of those.' });
  }
  if (R.incapacitated(foe.conds)) nop(`${foe.name} cannot act right now.`);
  const legendary = (m.legendary || []).includes(act);
  if (ctx.ai && s.fight && s.fight.phase === 'turns' && !legendary && !(m.reactions || []).includes(act)) inTurnCheck(s, ctx, keyOf('foe', foe.id), 'act');
  const others = () => pool.filter((x) => x !== act && !(x.use && foe.spent[x.n])).map((x) => x.n);
  if (act.use && /^Recharge/.test(act.use)) { if (foe.spent[act.n]) refuse(`${foe.name}'s ${act.n} has not recharged.`, others(), 'Use another action.'); foe.spent[act.n] = true; }
  if (/^\d+\/day/.test(act.use || '')) { const max = Number(act.use.split('/')[0]); foe.uses = foe.uses || {}; if ((foe.uses[act.n] || 0) >= max) refuse(`${foe.name} has used ${act.n} as often as it can today.`, others(), 'Use another action.'); foe.uses[act.n] = (foe.uses[act.n] || 0) + 1; }
  // Its turn's attacks are spent once its Multiattack is made: a further attack this turn would be twice.
  const myTurn = s.fight && s.fight.phase === 'turns' && currentKey(s) === keyOf('foe', foe.id) && !legendary && !(m.reactions || []).includes(act);
  if (myTurn && s.fight.used.multi && !a._sub && (act.hit != null || /^Multiattack/.test(act.n))) nop(`${foe.name} has made all its attacks this turn (its Multiattack).`, { hint: 'End its turn, or use an ability it has not used.' });
  if (/^Multiattack/.test(act.n)) { if (myTurn) s.fight.used.multi = true; multiattack(s, a, ctx, foe, m, act); return; }
  let targets = (a.targets || (a.target ? [a.target] : [])).map((x) => target(s, x, ctx)).filter((t) => t && t.kind === 'pc');
  // No one named, and only one character it could mean: them.
  const living = Object.values(s.pcs).filter((p) => !p.dead && p.hp > 0);
  if (!targets.length && (act.hit != null || act.dc) && living.length === 1) { targets = [{ kind: 'pc', id: living[0].id, o: living[0] }]; assume(ctx, `No target was named: ${foe.name} goes for ${living[0].name}, the only one it can.`); }
  if (act.hit != null) {
    const t = targets[0];
    if (!t) refuse(`Name the character ${foe.name} attacks: ${Object.values(s.pcs).filter((p) => !p.dead).map((p) => `${p.id} (${p.name})`).join(', ')}.`, partyNames(s));
    const pc = t.o;
    if (pc.dead) nop(`${pc.name} is dead.`, { options: partyNames(s), hint: 'Name a living target, or end the monster\'s turn.' });
    // What the stat block says a grapple allows: "can't bite another target" while it holds one, and an
    // attack on "one target not grappled by" it.
    const held = Object.values(s.pcs).filter((p) => p.grappledBy && p.grappledBy.foeId === foe.id && !p.dead);
    if ((act.onHit || []).includes('grappled') && held.length && !held.some((p) => p.id === pc.id)) {
      nop(`${foe.name} is holding ${held.map((p) => p.name).join(' and ')} and cannot use ${act.n} on anyone else.`, { options: held.map((p) => p.name), hint: `Use ${act.n} on ${held[0].name}, or another attack.` });
    }
    if (/not grappled by/i.test(act.d || '') && pc.grappledBy && pc.grappledBy.foeId === foe.id) {
      nop(`${act.n} cannot target ${pc.name}, whom ${foe.name} is holding.`, { options: Object.values(s.pcs).filter((p) => !p.dead && p.id !== pc.id).map((p) => p.name), hint: 'Pick another target.' });
    }
    const melee = act.kind ? act.kind !== 'ranged' : /Melee/.test(act.d);
    // On the map: a melee attack steps up to its target; a ranged one may be spoilt by distance or a close enemy.
    let mfx = { dis: false, why: [], far: '' };
    if (act.kind ? act.kind === 'melee' : /^Melee (?:Weapon|Spell) Attack/i.test(act.d)) {
      try { stepUp(s, ctx, keyOf('foe', foe.id), keyOf('pc', pc.id), act.reach || Number((/reach (\d+) ft/i.exec(act.d) || [0, 5])[1])); } catch (e) {
        // Too far to strike this turn (the map's reach rules): it closes in instead, as a Dash.
        if (!(e instanceof RuleError) || !ctx.ai || !/too far/.test(e.message)) throw e;
        let moved = true;
        try { H['map.move'](s, { who: keyOf('foe', foe.id), engage: keyOf('pc', pc.id) }, ctx); } catch (e2) { moved = false; }
        assume(ctx, `${foe.name} was too far from ${pc.name} to attack this turn, so ${moved ? 'it closed in as far as it could instead (a Dash)' : 'it could not get closer'}. Narrate it, then end_turn.`);
        return;
      }
    } else if (!melee) mfx = rangedFx(s, ctx, keyOf('foe', foe.id), keyOf('pc', pc.id), act.range || (/range (\d+\/\d+) ft/i.exec(act.d) || [0, ''])[1]);
    if (mfx.far && ctx.ai) nop(mfx.far, { hint: `Move ${foe.name} closer with move_creature first, or pick a nearer target.` });
    const self = R.selfEffects({ conds: foe.conds }, 'attack');
    const tfx = R.targetEffects(pc.conds, { melee });
    const r = d20(ctx.rng, { adv: a.adv === 'adv' || self.adv || tfx.adv, dis: a.adv === 'dis' || self.dis || tfx.dis || mfx.dis });
    const total = r.kept + act.hit;
    const hit = r.kept === 20 || (r.kept !== 1 && total >= pc.ac);
    const crit = hit && (r.kept === 20 || tfx.autoCrit);
    let text = `${foe.name} attacks ${pc.name} with ${act.n}`;
    let dmgRow = null;
    if (hit) {
      const parts = [];
      let sum = 0;
      for (const [expr, type] of act.dmg || []) {
        const d = rollDice(expr, ctx.rng, { crit });
        const res = damagePc(s, ctx, pc, scaledDmg(foe, d.total), type, { crit });
        sum += res.taken;
        parts.push(`${res.taken} ${type}${res.notes.length ? ` (${res.notes.join(', ')})` : ''}`);
      }
      dmgRow = { total: sum };
      text += `${crit ? ': a critical hit' : ': a hit'} for ${parts.join(' and ') || 'no'} damage.`;
      // What the hit does besides damage (book.js): conditions with no save ("the target is grappled
      // (escape DC 13)"), and a save after the hit ("DC 11 Strength saving throw or be knocked prone",
      // "DC 11 Constitution saving throw, taking 10 (3d6) poison damage on a failed save, or half as much").
      const conds = R.index(ctx.srd).cond;
      if (!pc.dead) {
        for (const c of act.onHit || []) {
          if (conds[c] && !pc.conds.includes(c)) { pc.conds.push(c); text += ` ${pc.name} is ${c}${c === 'grappled' && act.escape ? ` (escape DC ${act.escape})` : ''}.`; }
        }
        // Who holds whom: the grapple (and the restraint it brings) ends when the holder falls, flees or
        // the character breaks free (pc.escape). Before this a grapple never ended (simulation, 26 Nov).
        if ((act.onHit || []).includes('grappled') && pc.conds.includes('grappled')) {
          pc.grappledBy = { foeId: foe.id, dc: act.escape || 10, conds: (act.onHit || []).filter((c) => conds[c]) };
        }
      }
      const rd = act.rider;
      if (rd && !pc.dead) {
        const cond = rd.cond && conds[rd.cond] ? rd.cond : '';
        const d = rd.dmg && rd.dmg.length ? scaledRoll(foe, rollDice(rd.dmg[0][0], ctx.rng)) : null;
        if (cond || d || rd.fail) {
          const what = cond ? `resist being ${cond}` : d ? `take less ${rd.dmg[0][1]} damage` : rd.fail;
          s.requests.push({ id: nextId(s, 'q'), pcId: pc.id, kind: 'save', ability: rd.ability, skill: '', dc: rd.dc, adv: '', reason: `${foe.name}'s ${act.n}: ${what}.`, by: 'engine', t: ctx.now || 0,
            effect: cond || d ? { dmg: d ? String(d.total) : '', type: d ? rd.dmg[0][1] : '', half: !!rd.half, cond } : null });
          text += cond ? ` ${pc.name} must save or be ${cond}.` : d ? ` ${pc.name} must make a ${R.ABILITY_NAMES[rd.ability]} saving throw against the ${rd.dmg[0][1]}.` : ` ${pc.name} must make a DC ${rd.dc} ${R.ABILITY_NAMES[rd.ability]} saving throw: on a failure, ${rd.fail}.`;
        }
      }
    } else text += r.kept === 1 ? ' and fumbles.' : ' and misses.';
    addRoll(s, ctx, { who: foe.name, foeId: foe.id, kind: 'attack', label: `${act.n} vs ${pc.name}`, dice: r.rolls, mod: act.hit, total, at: pc.ac, success: hit, crit, mode: r.mode, dmg: dmgRow, secret: true, why: mfx.why.length ? mfx.why : undefined });
    story(s, ctx, 'event', text, 'Engine', { roll: true });
    return;
  }
  if (act.dc) {
    if (!targets.length) refuse(`Name who ${act.n} catches: ${Object.values(s.pcs).filter((p) => !p.dead).map((p) => `${p.id} (${p.name})`).join(', ')}.`, partyNames(s));
    const [ab, dc, success] = act.dc;
    const d = act.dmg && act.dmg.length ? scaledRoll(foe, rollDice(act.dmg[0][0], ctx.rng)) : null;
    const cond = act.cond || '';
    for (const t of targets) {
      s.requests.push({ id: nextId(s, 'q'), pcId: t.id, kind: 'save', ability: ab, skill: '', dc, adv: '', reason: `${foe.name}'s ${act.n}`, by: 'engine', t: ctx.now || 0,
        effect: { dmg: d ? String(d.total) : '', type: d ? act.dmg[0][1] : '', half: success === 'half', cond } });
    }
    story(s, ctx, 'event', `${foe.name} uses ${act.n}! ${targets.map((t) => t.o.name).join(', ')} must make a ${R.ABILITY_NAMES[ab]} saving throw.`, 'Engine');
    return;
  }
  story(s, ctx, 'event', `${foe.name} uses ${act.n}.`, 'Engine');
}
// A foe fitted to a smaller party (fitFoes: foe.dmgScale) hits for less, never under 1.
function scaledDmg(foe, n) { return foe && foe.dmgScale && foe.dmgScale !== 1 && n > 0 ? Math.max(1, Math.round(n * foe.dmgScale)) : n; }
function scaledRoll(foe, d) { return foe && foe.dmgScale && foe.dmgScale !== 1 ? { ...d, total: scaledDmg(foe, d.total) } : d; }
const ATTACK_WORDS = /sword|scimitar|axe|bow|dagger|spear|mace|club|hammer|bite|claw|slam|fist|hook|talon|tail|whip|flail|pick|rapier|glaive|halberd|javelin|sling|crossbow|blade|strike|smash|stab|attack|hit|swing|lunge|shoot|fire|thrust|slash|punch|gore|horn|tusk|sting|morning ?star|star|weapon|melee|ranged/i;
// ---- monsters that cast spells (the Spellcasting trait of the SRD stat block) ----
const CONDS = ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
export function monsterSpells(m, srd) {
  const tr = (m.traits || []).find((t) => /^(Innate )?Spellcasting/i.test(t.n));
  if (!tr) return null;
  const ix = R.index(srd).spell; // reads the book first, so tr.spells is there (book.js)
  const book = tr.spells;
  if (!book || !book.list.length) return null;
  const spells = book.list.map((x) => {
    const sp = ix[x.id];
    return { id: x.id, name: sp ? sp.name : x.name.replace(/\b\w/g, (c) => c.toUpperCase()), level: sp ? sp.level : x.level || 0, use: x.use, data: sp || null };
  });
  const hit = book.hit || 0;
  return { dc: book.dc || 10, hit, casterLevel: book.level || 1, slots: book.slots || {}, spells, mod: hit ? hit - (m.pb || 2) : 0 };
}
function castMonsterSpell(s, ctx, foe, book, sp, a) {
  if (R.incapacitated(foe.conds)) nop(`${foe.name} cannot act right now.`);
  if (ctx.ai && s.fight && s.fight.phase === 'turns') inTurnCheck(s, ctx, keyOf('foe', foe.id), 'act');
  const d = sp.data || {};
  const perDay = /^(\d+)\/day/.exec(sp.use || '');
  if (perDay) {
    foe.uses = foe.uses || {};
    if ((foe.uses[sp.name] || 0) >= Number(perDay[1])) nop(`${foe.name} has cast ${sp.name} as often as it can today.`, { options: book.spells.filter((x) => x !== sp).map((x) => x.name), hint: 'Use another spell or action.' });
    foe.uses[sp.name] = (foe.uses[sp.name] || 0) + 1;
  } else if (sp.level > 0 && sp.use !== 'at will') {
    foe.slotsUsed = foe.slotsUsed || {};
    const have = book.slots[sp.level] || 0;
    if ((foe.slotsUsed[sp.level] || 0) >= have) {
      const cantrips = book.spells.filter((x) => x.level === 0).map((x) => x.name);
      const left = book.spells.filter((x) => x.level > 0 && (foe.slotsUsed[x.level] || 0) < (book.slots[x.level] || 0)).map((x) => x.name);
      nop(`${foe.name} has no ${R.ordinal(sp.level)}-level spell slots left.`, { options: [...cantrips, ...left, ...((monsterOf(ctx, foe) || {}).actions || []).filter((x) => x.hit != null).map((x) => x.n)], hint: 'Use a cantrip or another action.' });
    }
    foe.slotsUsed[sp.level] = (foe.slotsUsed[sp.level] || 0) + 1;
  }
  let targets = (a.targets || (a.target ? [a.target] : [])).map((x) => target(s, x, ctx)).filter((t) => t && t.kind === 'pc' && !t.o.dead);
  const living = Object.values(s.pcs).filter((p) => !p.dead && p.hp > 0);
  if (!targets.length && living.length === 1 && !/\bself\b/i.test(String(d.range || ''))) { targets = [{ kind: 'pc', id: living[0].id, o: living[0] }]; assume(ctx, `No target was named: ${foe.name}'s ${sp.name} is aimed at ${living[0].name}, the only one it can be.`); }
  const desc = String(d.desc || '');
  // Damage from the book's numbers (book.js): a cantrip by caster level, a slot spell by its level.
  R.spellDamage(d);
  const harms = !d.how || ['attack', 'save', 'auto'].includes(d.how);
  const lv = Math.max(1, book.casterLevel || 1);
  const byLevel = (tab) => tab[Object.keys(tab).map(Number).filter((n) => n <= lv).sort((x, y) => y - x)[0]];
  const dmgExpr = !harms ? '' : String((d.dmgLevel ? byLevel(d.dmgLevel) : d.dmgSlot ? d.dmgSlot[sp.level] || d.dmgSlot[d.level] : '') || '').replace(/\+MOD$/, `+${Math.max(0, book.mod)}`);
  const dtype = d.dmgType === 'chosen' ? ((d.dmgTypes || [])[0] || 'force') : d.dmgType || '';
  if (d.attack) {
    const t = targets[0];
    if (!t) refuse(`Name the character ${foe.name}'s ${sp.name} is aimed at: ${Object.values(s.pcs).filter((p) => !p.dead).map((p) => `${p.id} (${p.name})`).join(', ')}.`, partyNames(s));
    const pc = t.o;
    const r = d20(ctx.rng, { adv: a.adv === 'adv', dis: a.adv === 'dis' });
    const total = r.kept + book.hit;
    const hit = r.kept === 20 || (r.kept !== 1 && total >= pc.ac);
    let text = `${foe.name} casts ${sp.name} at ${pc.name}`;
    let dmgRow = null;
    if (hit && dmgExpr) { const roll = rollDice(dmgExpr, ctx.rng, { crit: r.kept === 20 }); const res = damagePc(s, ctx, pc, roll.total, dtype, { crit: r.kept === 20 }); dmgRow = { total: res.taken }; text += `: a hit for ${res.taken} ${dtype} damage.`; }
    else text += hit ? ': it lands.' : ' and misses.';
    addRoll(s, ctx, { who: foe.name, foeId: foe.id, kind: 'attack', label: `${sp.name} vs ${pc.name}`, dice: r.rolls, mod: book.hit, total, at: pc.ac, success: hit, crit: r.kept === 20, mode: r.mode, dmg: dmgRow, secret: true });
    story(s, ctx, 'event', text, 'Engine', { roll: true });
    return;
  }
  if (d.save) {
    if (!targets.length) refuse(`Name who ${foe.name}'s ${sp.name} is aimed at: ${Object.values(s.pcs).filter((p) => !p.dead).map((p) => `${p.id} (${p.name})`).join(', ')}.`, partyNames(s));
    const cond = (CONDS.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(desc)) || '');
    const amount = dmgExpr ? String(rollDice(dmgExpr, ctx.rng).total) : '';
    for (const t of targets) {
      const repeat = cond && /at the end of each of its turns/i.test(desc) ? { foeId: foe.id, spell: sp.name } : undefined;
      s.requests.push({ id: nextId(s, 'q'), pcId: t.id, kind: 'save', ability: d.save.ability, skill: '', dc: book.dc, adv: '', reason: `${foe.name}'s ${sp.name}`, by: 'engine', t: ctx.now || 0,
        effect: { dmg: amount, type: dtype, half: d.save.success === 'half', cond, repeat } });
    }
    story(s, ctx, 'event', `${foe.name} casts ${sp.name}! ${targets.map((t) => t.o.name).join(', ')} must make a ${R.ABILITY_NAMES[d.save.ability]} saving throw.`, 'Engine');
    return;
  }
  story(s, ctx, 'event', `${foe.name} casts ${sp.name}${targets.length ? ` on ${targets.map((t) => t.o.name).join(', ')}` : ''}.`, 'Engine');
}

H['foe.save'] = (s, a, ctx) => {
  hostOnly(ctx);
  const foe = s.foes[a.foeId];
  if (!foe) refuse('There is no such monster.', foeNamesHere(s));
  const ab = String(a.ability || '').slice(0, 3).toLowerCase();
  if (!R.ABILITIES.includes(ab)) refuse('Choose an ability for the save.', R.ABILITIES);
  const m = monsterOf(ctx, foe);
  const fx = R.selfEffects({ conds: foe.conds }, 'save', ab);
  const r = d20(ctx.rng, { adv: a.adv === 'adv', dis: a.adv === 'dis' || fx.dis });
  const b = R.monsterSave(m, ab);
  const dc = Math.trunc(Number(a.dc) || 0);
  const ok = !fx.fail && (dc ? r.kept + b >= dc : null);
  addRoll(s, ctx, { who: foe.name, foeId: foe.id, kind: 'save', label: `${R.ABILITY_NAMES[ab]} save`, dice: r.rolls, mod: b, total: r.kept + b, at: dc || null, success: ok, secret: true });
  if (dc) story(s, ctx, 'event', `${foe.name} ${ok ? 'succeeds on' : 'fails'} a ${R.ABILITY_NAMES[ab]} saving throw.`, 'Engine');
};

// ---- hit points and conditions for anyone ------------------------------------------------------
H.damage = (s, a, ctx) => {
  const t = target(s, a.target, ctx);
  if (!t) refuse(`Nobody called "${a.target}" is here to take the damage.`, [...partyNames(s), ...foeNamesHere(s)]);
  if (t.kind === 'pc' && !isHost(ctx)) ownPc(s, ctx, t.id);
  if (t.kind === 'foe') hostOnly(ctx);
  let amount = Math.trunc(Number(a.amount));
  if (!(amount >= 0) && a.dice) amount = rollDice(a.dice, ctx.rng).total;
  if (!(amount >= 0)) no('Give the damage as a number or dice.');
  const type = str(a.damageType, 20).toLowerCase(); // "type" names the action itself
  const r = t.kind === 'pc' ? damagePc(s, ctx, t.o, amount, type, { crit: !!a.crit }) : damageFoe(s, ctx, t.o, amount, type, { magical: !!a.magical });
  story(s, ctx, 'event', `${t.o.name} takes ${r.taken}${type ? ` ${type}` : ''} damage${a.why ? ` from ${str(a.why, 80)}` : ''}${r.notes.length ? ` (${r.notes.join(', ')})` : ''}.`, 'Engine');
};
H.heal = (s, a, ctx) => {
  const t = target(s, a.target, ctx);
  if (!t) refuse(`Nobody called "${a.target}" is here to heal.`, [...partyNames(s), ...foeNamesHere(s)]);
  if (t.kind === 'foe') { hostOnly(ctx); const n = Math.max(0, Math.trunc(Number(a.amount) || 0)); t.o.hp = Math.min(t.o.maxHp, t.o.hp + n); if (t.o.hp > 0) t.o.dead = false; log(s, ctx, `${t.o.name} regains ${n} hit points.`, 'note-host'); return; }
  if (!isHost(ctx)) ownPc(s, ctx, t.id);
  let amount = Math.trunc(Number(a.amount));
  if (!(amount >= 0) && a.dice) amount = rollDice(a.dice, ctx.rng).total;
  if (!(amount >= 0)) no('Give the healing as a number or dice.');
  const got = healPc(s, ctx, t.o, amount);
  story(s, ctx, 'event', `${t.o.name} regains ${got} hit points${a.why ? ` (${str(a.why, 80)})` : ''}.`, 'Engine');
};
H['hp.temp'] = (s, a, ctx) => {
  const t = target(s, a.target, ctx);
  if (!t || t.kind !== 'pc') refuse('Temporary hit points go to a character.', partyNames(s));
  if (!isHost(ctx)) ownPc(s, ctx, t.id);
  t.o.tempHp = Math.max(t.o.tempHp, Math.max(0, Math.trunc(Number(a.amount) || 0)));
};
H['hp.set'] = (s, a, ctx) => {
  const t = target(s, a.target, ctx);
  if (!t) refuse(`Nobody called "${a.target}" is here.`, [...partyNames(s), ...foeNamesHere(s)]);
  if (t.kind === 'foe' || !isHost(ctx)) { if (t.kind === 'foe') hostOnly(ctx); else ownPc(s, ctx, t.id); }
  const n = Math.max(0, Math.min(t.o.maxHp, Math.trunc(Number(a.hp))));
  if (t.kind === 'pc') { if (n > 0 && t.o.hp <= 0) healPc(s, ctx, t.o, n); else t.o.hp = n; }
  else { t.o.hp = n; t.o.dead = n <= 0; }
};
const condOf = (ctx, word) => {
  const c = NAMES.condition(word, [...ctx.srd.conditions.map((x) => x.id), 'exhaustion']);
  if (c && c !== String(word || '').toLowerCase().trim()) assume(ctx, `"${word}" is the condition ${c}.`);
  return c || String(word || '').toLowerCase();
};
H['cond.add'] = (s, a, ctx) => {
  const t = target(s, a.target, ctx);
  if (!t) refuse(`Nobody called "${a.target}" is here.`, [...partyNames(s), ...foeNamesHere(s)]);
  if (t.kind === 'foe' || !isHost(ctx)) { if (t.kind === 'foe') hostOnly(ctx); else ownPc(s, ctx, t.id); }
  const c = condOf(ctx, a.cond);
  if (c === 'exhaustion') {
    if (t.kind !== 'pc') no('Exhaustion is tracked for characters.');
    t.o.exhaustion = Math.min(6, (t.o.exhaustion || 0) + 1);
    if (t.o.exhaustion >= 6) t.o.dead = true;
    story(s, ctx, 'event', `${t.o.name} gains a level of exhaustion (${t.o.exhaustion}).${t.o.dead ? ' It is fatal.' : ''}`, 'Engine');
    return;
  }
  if (!R.index(ctx.srd).cond[c]) refuse(`There is no condition called "${a.cond}". Conditions: ${ctx.srd.conditions.map((x) => x.id).join(', ')}.`, ctx.srd.conditions.map((x) => x.id));
  if (t.kind === 'foe') { const m = monsterOf(ctx, t.o); if (m && (m.cimm || []).includes(c)) nop(`${t.o.name} cannot be ${c}.`); }
  if (!t.o.conds.includes(c)) t.o.conds.push(c);
  if (t.kind === 'pc' && R.incapacitated(t.o.conds)) dropConcentration(s, ctx, t.o, c);
  story(s, ctx, 'event', `${t.o.name} is ${c}.`, 'Engine');
};
// A character tries to break a grapple: Athletics or Acrobatics, whichever is better, against the escape DC.
H['pc.escape'] = (s, a, ctx) => {
  const t = target(s, a.pcId || a.target, ctx);
  if (!t || t.kind !== 'pc') refuse('Name the character who tries to break free.', partyNames(s));
  if (!isHost(ctx)) ownPc(s, ctx, t.id);
  const pc = t.o;
  if (!pc.conds.includes('grappled')) nop(`${pc.name} is not grappled.`);
  const g = pc.grappledBy || { dc: 10, conds: ['grappled'] };
  const ath = R.skillBonus(pc, 'athletics', ctx.srd); const acr = R.skillBonus(pc, 'acrobatics', ctx.srd);
  const skill = ath && acr && acr.bonus > ath.bonus ? 'acrobatics' : 'athletics';
  const r = pcD20(s, ctx, pc, { kind: 'check', skill });
  const ok = r.total >= g.dc;
  addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'check', label: `Escape the grapple (${skill === 'acrobatics' ? 'Acrobatics' : 'Athletics'})`, dice: r.rolls, mod: r.bonus, total: r.total, at: g.dc, success: ok, mode: r.mode });
  if (ok) freeFrom(pc, g);
  story(s, ctx, 'event', ok ? `${pc.name} breaks free of the grapple (${r.total} against DC ${g.dc}).` : `${pc.name} struggles but cannot break free (${r.total} against DC ${g.dc}).`, 'Engine');
};
function freeFrom(pc, g) {
  pc.conds = pc.conds.filter((c) => !(g.conds || ['grappled']).includes(c));
  delete pc.grappledBy;
}
// A grapple ends when the one holding it is dead, gone or no longer there.
function releaseGrapples(s, ctx) {
  for (const pc of Object.values(s.pcs)) {
    const g = pc.grappledBy;
    if (!g) continue;
    if (!pc.conds.includes('grappled')) { delete pc.grappledBy; continue; }
    const f = s.foes[g.foeId];
    const far = !!(f && mapOn(s) && s.map.at[keyOf('pc', pc.id)] && s.map.at[keyOf('foe', f.id)] && !MAP.inReach(s.map.at[keyOf('foe', f.id)], s.map.at[keyOf('pc', pc.id)], 10));
    if (!f || f.dead || f.fled || far || (R.incapacitated(f.conds || []))) {
      freeFrom(pc, g);
      story(s, ctx, 'event', `${pc.name} is no longer held${f ? ` by ${f.name}` : ''}.`, 'Engine');
    }
  }
}
H['cond.remove'] = (s, a, ctx) => {
  const t = target(s, a.target, ctx);
  if (!t) refuse(`Nobody called "${a.target}" is here.`, [...partyNames(s), ...foeNamesHere(s)]);
  if (t.kind === 'foe' || !isHost(ctx)) { if (t.kind === 'foe') hostOnly(ctx); else ownPc(s, ctx, t.id); }
  const c = condOf(ctx, a.cond);
  if (c === 'exhaustion') { t.o.exhaustion = Math.max(0, (t.o.exhaustion || 0) - 1); return; }
  if (c === 'unconscious' && t.kind === 'pc' && t.o.hp <= 0) nop(`${t.o.name} is at 0 hit points: heal them to wake them.`);
  t.o.conds = t.o.conds.filter((x) => x !== c);
  if (c === 'grappled' && t.o.grappledBy) delete t.o.grappledBy;
  story(s, ctx, 'event', `${t.o.name} is no longer ${c}.`, 'Engine');
};
H.stabilize = (s, a, ctx) => {
  const t = target(s, a.target, ctx);
  if (!t || t.kind !== 'pc') refuse('Name a dying character.', Object.values(s.pcs).filter((p) => p.hp <= 0 && !p.dead && !p.stable).map((p) => p.name));
  if (t.o.hp > 0 || t.o.dead) nop(`${t.o.name} is not dying.`);
  if (!isHost(ctx)) { const p = s.players[ctx.pid]; if (!p || !p.pcId) no('Join with a character first.'); }
  t.o.stable = true; t.o.death = { s: 0, f: 0 };
  s.requests = s.requests.filter((q) => !(q.pcId === t.id && q.kind === 'death'));
  story(s, ctx, 'event', `${t.o.name} is stabilized.`, 'Engine');
};
H.inspiration = (s, a, ctx) => {
  const pc = s.pcs[a.pcId];
  if (!pc) refuse('There is no such character.', Object.values(s.pcs).map((x) => x.name));
  if (a.give !== false) hostOnly(ctx); else ownPc(s, ctx, pc.id);
  pc.inspiration = a.give !== false;
  story(s, ctx, 'event', a.give !== false ? `${pc.name} gains inspiration.` : `${pc.name} spends inspiration.`, 'Engine');
};

// ---- rests, time, treasure and the story's threads -------------------------------------------
H['rest.short'] = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  if (s.fight) refuse('You cannot rest during a fight.', [], 'End the fight first (end_combat) when it is over.');
  if (pc.dead) no(`${pc.name} is dead.`);
  const n = Math.max(0, Math.min(pc.level - (pc.hitDiceUsed || 0), Math.trunc(Number(a.dice) || 0)));
  if (Number(a.dice) > 0 && n === 0) no(`${pc.name} has no hit dice left to spend.`);
  let got = 0;
  for (let k = 0; k < n; k++) got += Math.max(0, die(pc.hitDie, ctx.rng) + pc.mods.con);
  pc.hitDiceUsed = (pc.hitDiceUsed || 0) + n;
  const healed = n ? healPc(s, ctx, pc, got) : 0;
  for (const r of pc.resources || []) if (r.reset === 'short') r.used = 0;
  if (pc.cast && pc.cast.kind === 'pact') pc.cast.slots.forEach((x) => { x[1] = 0; });
  story(s, ctx, 'event', `${pc.name} takes a short rest${n ? `, spends ${n} hit ${n > 1 ? 'dice' : 'die'} and regains ${healed} hit points` : ''}.`, 'Engine');
};
H['rest.long'] = (s, a, ctx) => {
  if (s.fight) refuse('You cannot rest during a fight.', [], 'End the fight first (end_combat) when it is over.');
  const who = a.pcId ? [ownPc(s, ctx, a.pcId)] : (hostOnly(ctx), Object.values(s.pcs));
  // A night in the open: a camp seed may come up (engine/seeds.js). Its foes attack, and once the fight is
  // over the party finishes its rest (the DM's choice: the rest is not lost).
  if (!a.pcId && !a.after && !SEEDS.safePlace(site(s, ctx))) {
    const came = seedMoment(s, ctx, 'camp', { fight: true });
    if (came && came.length && s.fight) { s.restAfter = true; story(s, ctx, 'event', 'The night is broken: the camp is attacked. The party will finish its rest once the fight is over.', 'Engine'); return; }
  }
  for (const pc of who) {
    if (pc.dead) continue;
    pc.hp = pc.maxHp; pc.tempHp = 0;
    pc.conds = pc.conds.filter((c) => !['unconscious', 'prone'].includes(c));
    pc.death = { s: 0, f: 0 }; pc.stable = false;
    pc.hitDiceUsed = Math.max(0, (pc.hitDiceUsed || 0) - Math.max(1, Math.floor(pc.level / 2)));
    pc.exhaustion = Math.max(0, (pc.exhaustion || 0) - 1);
    for (const r of pc.resources || []) r.used = 0;
    if (pc.cast) pc.cast.slots.forEach((x) => { x[1] = 0; });
    pc.conc = null; pc.raging = false;
  }
  if (!a.pcId) { s.time.hour += 8; while (s.time.hour >= 24) { s.time.hour -= 24; s.time.day += 1; } }
  story(s, ctx, 'event', a.pcId ? `${who[0].name} finishes a long rest.` : a.after ? 'The party finishes its rest and wakes refreshed.' : 'The party takes a long rest and wakes refreshed.', 'Engine');
};
H['time.pass'] = (s, a, ctx) => {
  hostOnly(ctx);
  const h = Math.max(0, Math.min(240, Number(a.hours) || 0));
  s.time.hour += h;
  while (s.time.hour >= 24) { s.time.hour -= 24; s.time.day += 1; }
  s.time.hour = Math.round(s.time.hour * 10) / 10;
};

H['site.move'] = (s, a, ctx) => {
  hostOnly(ctx);
  const sites = (ctx.adventure || {}).sites || [];
  const here = site(s, ctx);
  const exits = (here.exits || []).filter((e) => sites.some((x) => x.id === e.to));
  const exitList = exits.map((e) => `${e.to} (${e.label})`);
  let to = sites.find((x) => x.id === a.siteId) || sites.find((x) => x.name.toLowerCase() === String(a.siteId || '').toLowerCase());
  if (!to) { to = NAMES.pick(sites, a.siteId, (x) => [x.id, x.name]); if (to) assume(ctx, `"${a.siteId}" is ${to.name}.`); }
  // Not a way out of here, or no such place: the one exit whose words name it ("the watchtower" from the
  // Mill Road is the switchback path up to the Tumbledown Gate).
  if (ctx.ai && (!to || (to.id !== here.id && !exits.some((e) => e.to === to.id)))) {
    const words = String(a.siteId || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w.length > 3 && !['the', 'with', 'into', 'back', 'road', 'path', 'place'].includes(w));
    const hits = exits.filter((e) => words.length && words.every((w) => `${e.label} ${(sites.find((x) => x.id === e.to) || {}).name}`.toLowerCase().includes(w)));
    if (hits.length === 1) { const via = sites.find((x) => x.id === hits[0].to); assume(ctx, `The way to "${a.siteId}" from here is ${hits[0].label}: the party goes to ${via.name}.`); to = via; }
  }
  if (!to) refuse(`There is no place called "${a.siteId}". Places: ${sites.map((x) => x.id).join(', ')}.`, ctx.ai ? exits.map((e) => e.to) : sites.map((x) => x.id), ctx.ai ? `Exits from here: ${exitList.join('; ') || 'none'}.` : '');
  if (s.fight) nop('The party cannot travel during a fight.', { hint: 'If they flee, end the fight first (end_combat with award_xp false), then move the party.' });
  if (ctx.ai && to.id !== here.id && !exits.some((e) => e.to === to.id)) refuse(`${to.name} cannot be reached from ${here.name}. Exits: ${exitList.join(', ')}.`, exits.map((e) => e.to));
  if (!s.scene.visited.includes(here.id)) s.scene.visited.push(here.id);
  s.scene.siteId = to.id;
  if (to.id !== here.id) s.scene.from = here.id;
  // The party arrives together on the map, by the way they came in (placed after this action).
  const m = mapUp(s);
  if (to.id !== here.id) { m.cameFrom = here.id; for (const k of Object.keys(m.at)) if (k.startsWith('pc:')) delete m.at[k]; }
  const first = !s.scene.visited.includes(to.id);
  if (first) for (const [n, enc] of (to.foes || []).entries()) H['foe.add'](s, { monster: enc.monster, count: enc.count, name: enc.name, hidden: true, note: enc.note, siteId: to.id, zone: enc.zone, group: `${to.id}#${n}` }, { ...ctx, ai: false });
  if (first) for (const c of to.clocks || []) if (!(s.clocks || []).some((x) => x.name === c.name)) H['clock.add'](s, { ...c, siteId: to.id, quiet: true }, { ...ctx, ai: false });
  if (to.travelHours) H['time.pass'](s, { hours: to.travelHours }, ctx);
  story(s, ctx, 'event', `The party arrives at ${to.name}.`, 'Engine', { move: true });
  if (to.id !== here.id) emit(ctx, { ev: 'enter', site: to.id, from: here.id });
};

H['quest.add'] = (s, a, ctx) => { hostOnly(ctx); const text = str(a.text, 200); if (!text) no('Write the quest.'); s.quests.push({ id: nextId(s, 'q'), text, done: false }); story(s, ctx, 'event', `New quest: ${text}`, 'Engine'); };
H['quest.done'] = (s, a, ctx) => {
  hostOnly(ctx);
  let q = s.quests.find((x) => x.id === a.id) || s.quests.find((x) => x.text.toLowerCase().includes(String(a.id || '').toLowerCase()) && a.id);
  if (!q && a.id) {
    // A few of its words, not in order ("the vanished villagers"): the one quest that has them all.
    const words = String(a.id).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 3);
    const hits = s.quests.filter((x) => words.length && words.filter((w) => x.text.toLowerCase().includes(w.replace(/s$/, ''))).length >= Math.max(1, Math.ceil(words.length / 2)));
    if (hits.length === 1) { q = hits[0]; assume(ctx, `"${a.id}" is the quest "${q.text}".`); }
  }
  if (!q) refuse(`There is no such quest. Quests: ${s.quests.map((x) => `${x.id} (${x.text})`).join('; ')}.`, s.quests.filter((x) => !x.done).map((x) => x.id));
  if (q.done && a.done !== false) nop(`"${q.text}" is already complete.`);
  q.done = a.done !== false;
  if (q.done) { q.doneAt = s.scene.siteId; q.doneSeq = s.seq; story(s, ctx, 'event', `Quest complete: ${q.text}`, 'Engine'); }
};
H['xp.award'] = (s, a, ctx) => {
  hostOnly(ctx);
  const n = Math.max(0, Math.min(100000, Math.trunc(Number(a.amount) || 0)));
  if (!n) nop('No XP was given.', { hint: 'Give an amount of XP.' });
  const who = (a.pcIds && a.pcIds.length ? a.pcIds.map((x) => s.pcs[x]).filter(Boolean) : Object.values(s.pcs)).filter((p) => !p.dead);
  if (!who.length) nop('Nobody to award.');
  const each = a.each ? n : Math.floor(n / who.length);
  for (const p of who) p.xp = (p.xp || 0) + each;
  if (a.site) (s.xpPaid = s.xpPaid || []).push(`${s.scene.siteId}:${n}`); // the AI Director pays a milestone once
  story(s, ctx, 'event', `${who.length > 1 ? 'Each of you earns' : `${who[0].name} earns`} ${each} XP${a.why ? ` for ${str(a.why, 80)}` : ''}.`, 'Engine');
  levelReady(s, ctx);
};
// A player keeping their own sheet (the Players' Assistant) adds the XP the DM announced.
H['xp.add'] = (s, a, ctx) => {
  if (!ctx.selfXp && !isHost(ctx)) no('The DM awards experience.');
  const pc = ownPc(s, ctx, a.pcId);
  const n = Math.trunc(Number(a.amount));
  if (!(n > 0 && n <= 100000)) no('Type the XP as a number.');
  pc.xp = (pc.xp || 0) + n;
  story(s, ctx, 'event', `${pc.name} earns ${n} XP.`, 'Engine');
  levelReady(s, ctx);
};
H['loot.give'] = (s, a, ctx) => {
  hostOnly(ctx);
  const pc = a.pcId ? s.pcs[a.pcId] : null;
  if (a.pcId && !pc) assume(ctx, `"${a.pcId}" is not in the party: it goes to the party.`);
  const gold = Math.max(0, Math.min(1e6, Math.trunc(Number(a.gold) || 0)));
  const name = str(a.item, 60);
  if (!gold && !name) nop('Nothing was given.', { hint: 'Name gold or an item to give.' });
  const it = name ? (R.item(ctx.srd, name.toLowerCase().replace(/\s+/g, '-')) || ctx.srd.magicItems.find((x) => x.name.toLowerCase() === name.toLowerCase()) || null) : null;
  const qty = Math.max(1, Math.min(999, Math.trunc(Number(a.qty) || 1)));
  if (pc) {
    if (gold) pc.gold = (pc.gold || 0) + gold;
    if (name) { const have = pc.inventory.find((x) => x.name.toLowerCase() === (it ? it.name : name).toLowerCase()); if (have) have.qty += qty; else pc.inventory.push({ id: it ? it.id : '', name: it ? it.name : name, qty, magic: it && it.rarity ? true : undefined }); }
  } else {
    if (gold) { const alive = Object.values(s.pcs).filter((p) => !p.dead); const each = alive.length ? Math.floor(gold / alive.length) : 0; for (const p of alive) p.gold = (p.gold || 0) + each; }
    if (name) s.loot.push({ id: it ? it.id : '', name: it ? it.name : name, qty });
  }
  story(s, ctx, 'event', `${pc ? `${pc.name} receives` : 'The party finds'} ${[gold ? `${gold} gp` : '', name ? `${qty > 1 ? `${qty} × ` : ''}${it ? it.name : name}` : ''].filter(Boolean).join(' and ')}.`, 'Engine');
};
// A character uses something here: opens the chest, pulls the lever, reads the book. The place's rules on
// "use <object>" happen (engine/triggers.js); otherwise the Director says what it does. `how` is the verb
// ("opens"), `object` what is used, as the place's `objects` name it when it lists them.
H['object.use'] = (s, a, ctx) => {
  const t = target(s, a.who || a.pcId, ctx);
  if (!t || t.kind !== 'pc') refuse(`Say who uses it: ${partyNames(s).join(', ') || 'nobody is in the party yet'}.`, partyNames(s));
  const pc = ownPc(s, ctx, t.id);
  if (pc.dead || pc.hp <= 0) nop(`${pc.name} cannot: they are ${pc.dead ? 'dead' : 'down'}.`);
  const what = str(a.object, 80).replace(/[.\s]+$/, '');
  if (!what) refuse('Say what is used.', objectsHere(s, ctx));
  let how = str(a.how, 24).toLowerCase().replace(/[^a-z\s-]/g, '').trim() || 'uses';
  if (!/s$/.test(how.split(' ')[0])) how = how.replace(/^(\S+)/, (v) => (/(?:sh|ch|x|z)$/.test(v) ? `${v}es` : `${v}s`));
  story(s, ctx, 'event', `${pc.name} ${how} ${/^(?:the|a|an|his|her|their)\s/i.test(what) ? what : `the ${what}`}.`, 'Engine');
  emit(ctx, { ev: 'use', site: s.scene.siteId, object: what, pc: pc.id });
};
const objectsHere = (s, ctx) => ((((ctx.adventure || {}).sites || []).find((x) => x.id === s.scene.siteId) || {}).objects || []).map((o) => (typeof o === 'string' ? o : o.name)).filter(Boolean);
H['loot.take'] = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  const k = s.loot.findIndex((x, n) => String(n) === String(a.index) || x.name === a.name);
  if (k < 0) no('That is not in the party loot.');
  const [it] = s.loot.splice(k, 1);
  const have = pc.inventory.find((x) => x.name === it.name);
  if (have) have.qty += it.qty; else pc.inventory.push({ ...it });
  log(s, ctx, `${pc.name} takes ${it.name}.`);
};
H['item.edit'] = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  const name = str(a.name, 60);
  if (!name) no('Name the item.');
  const have = pc.inventory.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const qty = Math.trunc(Number(a.qty));
  if (have) { have.qty = Math.max(0, qty); if (!have.qty) pc.inventory = pc.inventory.filter((x) => x !== have); }
  else if (qty > 0) { const it = R.item(ctx.srd, name.toLowerCase().replace(/\s+/g, '-')); pc.inventory.push({ id: it ? it.id : '', name: it ? it.name : name, qty }); }
  if (a.gold != null) pc.gold = Math.max(0, Math.trunc(Number(a.gold) || 0));
};
H['pc.notes'] = (s, a, ctx) => { const pc = ownPc(s, ctx, a.pcId); pc.notes = String(a.text || '').slice(0, 5000); };

// ---- the DM's own stories (seeds) -----------------------------------------------------------------
H['seed.save'] = (s, a, ctx) => {
  hostOnly(ctx);
  const text = String(a.text || '').slice(0, 8000).trim();
  if (!text) no('The story is empty.');
  const title = (text.match(/^#\s*(?:Seed:\s*)?(.+)$/m) || [])[1] || text.split('\n')[0].slice(0, 60);
  const old = s.seeds.find((x) => x.id === a.id);
  if (old) { old.text = text; old.title = str(title, 60); return; }
  s.seeds.push({ id: nextId(s, 'sd'), title: str(title, 60), text, on: true });
};
H['seed.toggle'] = (s, a, ctx) => { hostOnly(ctx); const x = s.seeds.find((y) => y.id === a.id); if (!x) no('No such story.'); x.on = !x.on; };
H['seed.remove'] = (s, a, ctx) => { hostOnly(ctx); s.seeds = s.seeds.filter((y) => y.id !== a.id); };

// Seeds in play (engine/seeds.js): the Engine brings one in at its moment (lost, a camp somewhere unsafe,
// trouble picked with someone who is not a foe) and rolls its chance; the Director may bring one in on
// its own judgement (use_seed). Either way it is logged (s.seedLog, on the Seeds tab), whoever chose it.
function findSeed(s, key) {
  const k = String(key || '').trim().toLowerCase();
  return s.seeds.find((x) => x.id === key) || s.seeds.find((x) => x.title.toLowerCase() === k) || NAMES.pick(s.seeds, key, (x) => [x.id, x.title]);
}
function seedLogRow(s, ctx, seed, row) {
  s.seedLog = (s.seedLog || []).concat({ id: seed.id, title: seed.title, day: s.time.day, hour: s.time.hour, site: s.scene.siteId, seq: s.seq, t: ctx.now || 0, ...row }).slice(-60);
}
// The seed happens: its foes arrive (sized so it stays a minor meeting), and the Director is told to play it.
function fireSeed(s, ctx, seed, { by, why = '', roll = null, chance = 100, fight = false }) {
  const p = SEEDS.seedPlan(seed.text);
  const host = { ...ctx, role: 'host', pid: null, ai: false, assumed: null };
  const levels = Object.values(s.pcs).filter((x) => !x.dead).map((x) => x.level || 1);
  const ix = R.index(ctx.srd);
  const wanted = p.choose ? SEEDS.wildFoes(site(s, ctx), levels, ctx.srd, ctx.rng) : p.monsters.filter((m) => ix.monster[m.id]);
  const { groups, hp } = SEEDS.sizeFoes(wanted, levels, ctx.srd, p.kind === 'provoke' ? 'medium' : 'easy');
  const before = new Set(Object.keys(s.foes));
  for (const g of groups) {
    try { H['foe.add'](s, { monster: g.id, count: g.count, name: g.name, hidden: false, note: `from the story "${seed.title}"` }, host); } catch (e) { /* a monster the book lacks */ }
  }
  const added = Object.values(s.foes).filter((f) => !before.has(f.id));
  if (hp !== 1) for (const f of added) { f.maxHp = Math.max(1, Math.round(f.maxHp * hp)); f.hp = f.maxHp; }
  const names = added.map((f) => f.name);
  seedLogRow(s, ctx, seed, { fired: true, by, why: str(why, 200), roll, chance, foes: names });
  s.seedNow = { id: seed.id, title: seed.title, kind: p.kind, by, why: str(why, 200), foes: names, seq: s.seq };
  log(s, ctx, `Story seed "${seed.title}" comes into play (${by === 'engine' ? (roll != null ? `rolled ${roll} against ${chance}%` : 'its moment came') : `the Director's choice${why ? `: ${why}` : ''}`})${names.length ? `: ${names.join(', ')}` : ''}.`, 'note-host');
  if (fight && added.length && !s.fight) H['fight.start'](s, { foeIds: added.map((f) => f.id) }, host);
  return added;
}
// The Engine's own moments: roll each free seed for this moment; the first to come up happens.
function seedMoment(s, ctx, kind, { text = '', fight = false } = {}) {
  const free = s.seeds.filter((x) => SEEDS.seedFree(x, s, s.scene.siteId)).map((x) => ({ seed: x, p: SEEDS.seedPlan(x.text) })).filter((x) => x.p.kind === kind);
  const fit = kind === 'provoke' ? free.filter((x) => !x.p.who || String(text).toLowerCase().includes(x.p.who.toLowerCase().split(/\s+/).filter((w) => w.length > 2).pop() || '\u0000') || !text) : free;
  for (const { seed, p } of fit) {
    const roll = p.chance < 100 ? 1 + Math.floor(ctx.rng() * 100) : null;
    if (roll != null && roll > p.chance) { seedLogRow(s, ctx, seed, { fired: false, by: 'engine', roll, chance: p.chance, why: kind }); log(s, ctx, `Story seed "${seed.title}": rolled ${roll} against ${p.chance}%, not this time.`, 'note-host'); continue; }
    return fireSeed(s, ctx, seed, { by: 'engine', why: kind === 'lost' ? `the party had been getting nowhere for ${p.turns} turns` : kind === 'camp' ? 'the party camped somewhere unsafe' : 'the party picked a fight', roll, chance: p.chance, fight });
  }
  return null;
}
// The Director brings a seed in (on its judgement, or for trouble the Engine cannot see: a shopkeeper harassed).
H['seed.fire'] = (s, a, ctx) => {
  hostOnly(ctx);
  const seed = findSeed(s, a.seed);
  if (!seed) refuse(`There is no story seed "${a.seed}".`, s.seeds.filter((x) => x.on).map((x) => x.title));
  if (!seed.on) nop(`"${seed.title}" is switched off on the Seeds tab.`);
  if (!SEEDS.seedFree(seed, s, s.scene.siteId)) nop(`"${seed.title}" cannot happen here now (used up, or written for another place).`);
  const p = SEEDS.seedPlan(seed.text);
  fireSeed(s, ctx, seed, { by: ctx.ai ? 'director' : 'host', why: a.why || '', fight: !!a.fight && p.kind !== 'lost' });
};
// Before each Director turn: is the party getting anywhere? A turn in which nothing moves on (no new place,
// quest, foe beaten, treasure or experience) adds one; a lost seed's turns, and its chance is rolled.
H['seed.check'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (a.event === 'provoke') { if (!s.fight) seedMoment(s, ctx, 'provoke', { text: a.text || '' }); return; }
  const key = [(s.scene.visited || []).length, s.scene.siteId, s.quests.filter((q) => q.done).length, Object.values(s.foes).filter((f) => f.dead).length,
    s.loot.length, Object.values(s.pcs).reduce((n, p) => n + (p.xp || 0) + (p.inventory || []).length, 0), s.fight ? 1 : 0].join('|');
  if (key !== s.driftKey) { s.driftKey = key; s.drift = 0; return; }
  s.drift = (s.drift || 0) + 1;
  const due = s.seeds.filter((x) => SEEDS.seedFree(x, s, s.scene.siteId)).map((x) => SEEDS.seedPlan(x.text)).filter((p) => p.kind === 'lost' && s.drift >= p.turns);
  if (!due.length || s.fight) return;
  seedMoment(s, ctx, 'lost');
  s.drift = 0; // rolled, whether it came up or not: the next roll after as many turns again
};


// ---- the map ----------------------------------------------------------------------------------------
// Zones of about 30 feet at each place, a 5-foot battle grid inside each zone, and the travel map
// (engine/map.js). The Engine keeps everyone at the party's place on a square; players move their own
// character (within their movement on their turn in a fight), the DM and the AI Director move anyone.
function mapUp(s) {
  const blank = MAP.newMap();
  if (!s.map) s.map = blank;
  for (const k of Object.keys(blank)) if (s.map[k] == null) s.map[k] = blank[k];
  s.map.show = { ...blank.show, ...s.map.show };
  return s.map;
}
function siteZones(s, ctx, siteId) {
  const m = mapUp(s);
  if (!m.zones[siteId]) {
    const st = ((ctx.adventure || {}).sites || []).find((x) => x.id === siteId);
    m.zones[siteId] = st && Array.isArray(st.zones) && st.zones.length ? MAP.normZones(st.zones) : MAP.autoZones();
  }
  return m.zones[siteId];
}
const whoOf = (s, k) => { const [kind, id] = String(k).split(':'); return kind === 'pc' ? s.pcs[id] : s.foes[id]; };
const standing = (s, k) => { const o = whoOf(s, k); return !!o && !o.dead; };
// A monster's longest melee reach in feet (most have 5).
function reachOf(s, ctx, k) {
  const [kind, id] = String(k).split(':');
  if (kind !== 'foe') return 5;
  const m = monsterOf(ctx, s.foes[id]);
  let ft = 5;
  for (const a of (m && m.actions) || []) { const r = /reach (\d+) ft/i.exec(a.d || ''); if (r) ft = Math.max(ft, Number(r[1])); }
  return ft;
}
function speedOfKey(s, ctx, k) {
  const [kind, id] = String(k).split(':');
  return kind === 'pc' ? MAP.speedOf(s.pcs[id]) : MAP.speedOf(s.foes[id], monsterOf(ctx, s.foes[id]));
}
// Squares held by the living, in one zone of the party's place (leaving out one creature).
function heldIn(s, zoneId, cols, { except = '', only = null } = {}) {
  const out = new Set();
  for (const [k, p] of Object.entries(s.map.at)) {
    if (k === except || p.site !== s.scene.siteId || p.zone !== zoneId || !standing(s, k)) continue;
    if (only && !only(k)) continue;
    out.add(p.y * cols + p.x);
  }
  return out;
}
const hostileTo = (s, k) => (o) => { const mover = k.split(':')[0]; const other = o.split(':')[0]; return mover !== other && !(other === 'foe' && s.foes[o.slice(4)] && s.foes[o.slice(4)].hidden); };

// Everyone at the party's place gets a square: characters by the way the party came in, monsters in
// their own zone (the adventure's, or the far side), each on the nearest free square.
function placeEveryone(s, ctx) {
  const m = mapUp(s);
  const siteId = s.scene.siteId;
  const zones = siteZones(s, ctx, siteId);
  for (const k of Object.keys(m.at)) if (!whoOf(s, k)) delete m.at[k];
  const grids = {};
  const gridFor = (z) => grids[z.id] || (grids[z.id] = MAP.gridOf(m, siteId, z));
  const taken = {};
  const occ = (zid) => taken[zid] || (taken[zid] = new Set());
  const valid = (p) => { if (!p || p.site !== siteId) return false; const z = MAP.zoneOf(zones, p.zone); if (!z) return false; const g = gridFor(z); return p.x >= 0 && p.y >= 0 && p.x < g.cols && p.y < g.rows; };
  const here = [...Object.values(s.pcs).map((p) => `pc:${p.id}`), ...Object.values(s.foes).filter((f) => f.siteId === siteId && !f.fled).map((f) => `foe:${f.id}`)];
  const need = [];
  for (const k of here) {
    const p = m.at[k];
    if (!valid(p)) { need.push(k); continue; }
    const g = gridFor(MAP.zoneOf(zones, p.zone));
    const cell = p.y * g.cols + p.x;
    if (!standing(s, k)) continue;
    if (occ(p.zone).has(cell)) need.push(k); else occ(p.zone).add(cell);
  }
  if (!need.length) return;
  const put = (k, z, ax, ay) => {
    const g = gridFor(z);
    const c = MAP.freeNear(g, occ(z.id), ax, ay) || [0, 0];
    m.at[k] = { site: siteId, zone: z.id, x: c[0], y: c[1] };
    if (standing(s, k)) occ(z.id).add(c[1] * g.cols + c[0]);
  };
  // The party: next to anyone already placed, or in by the zone that leads from where they came.
  const placedPc = Object.keys(m.at).find((k) => k.startsWith('pc:') && valid(m.at[k]) && !need.includes(k));
  const entry = zones.find((z) => (z.from || []).includes(m.cameFrom)) || MAP.entryZone(zones);
  const others = zones.filter((z) => z !== entry);
  const awaySide = () => {
    if (!others.length) return 'bottom';
    const cx = others.reduce((t, z) => t + z.x + z.w / 2, 0) / others.length;
    const cy = others.reduce((t, z) => t + z.y + z.h / 2, 0) / others.length;
    return MAP.OPPOSITE[MAP.sideToward(entry, { x: cx, y: cy, w: 0, h: 0 })];
  };
  for (const k of need.filter((x) => x.startsWith('pc:'))) {
    if (placedPc) { const p = m.at[placedPc]; put(k, MAP.zoneOf(zones, p.zone), p.x + 0.5, p.y + 0.5); continue; }
    const g = gridFor(entry);
    put(k, entry, ...MAP.anchor(g, awaySide()));
  }
  // Monsters: their own zone, facing the party; otherwise the zone furthest from the party.
  const party = Object.keys(m.at).find((k) => k.startsWith('pc:') && m.at[k].site === siteId);
  const partyZone = party ? MAP.zoneOf(zones, m.at[party].zone) : entry;
  const far = () => {
    let best = zones[zones.length - 1]; let bd = -1;
    for (const z of zones) { const p = MAP.zonePath(zones, partyZone.id, z.id); const d = p ? p.length : 0; if (d > bd) { bd = d; best = z; } }
    return best;
  };
  for (const k of need.filter((x) => x.startsWith('foe:'))) {
    const f = s.foes[k.slice(4)];
    const z = (f.zone0 && MAP.findZone(zones, f.zone0)) || far();
    const g = gridFor(z);
    put(k, z, ...MAP.anchor(g, z.id === partyZone.id ? MAP.OPPOSITE[awaySide()] : MAP.sideToward(z, partyZone)));
  }
}

// How far apart two creatures stand, in feet (through the zones between them).
function distFt(s, ctx, a, b) {
  if (a.zone === b.zone) return MAP.cheb(a, b) * MAP.CELL_FT;
  const st = MAP.stepsBetween(s.map, s.scene.siteId, siteZones(s, ctx, s.scene.siteId), a, b);
  return st == null ? 999 : st * MAP.CELL_FT;
}
const mapOn = (s) => !!(s.map && s.map.show && (s.map.show.zones || s.map.show.grid));
// A melee attack steps up to its target first. With the reach rules on, only within the attacker's
// movement this turn; otherwise the map simply follows the story.
function stepUp(s, ctx, mk, tk, reachFt = 5) {
  if (!mapOn(s)) return;
  const m = s.map;
  const a = m.at[mk]; const b = m.at[tk];
  if (!a || !b || a.site !== s.scene.siteId || b.site !== s.scene.siteId || MAP.inReach(a, b, reachFt)) return;
  const strict = !!m.show.reach && !(isHost(ctx) && !ctx.ai);
  if (strict && ctx.ai) {
    const steps = MAP.stepsBetween(m, s.scene.siteId, siteZones(s, ctx, s.scene.siteId), a, b);
    if (steps == null || (steps - 1) * MAP.CELL_FT > speedOfKey(s, ctx, mk)) no(`${whoOf(s, mk).name} is too far from ${whoOf(s, tk).name} to attack this turn (${steps == null ? 'no way through' : `about ${steps * MAP.CELL_FT} feet`}): move it closer with move_creature, or use a ranged action.`);
  }
  try { H['map.move'](s, { who: mk, engage: tk, auto: true }, { ...ctx, freeMove: !strict }); } catch (e) { if (strict) no(`${whoOf(s, tk).name} is out of reach. ${e.message}`); }
}
// A ranged attack on the map, with the reach rules on: an enemy within 5 feet spoils the shot, a long
// shot is harder, and beyond long range there is none.
function rangedFx(s, ctx, fk, tk, range) {
  const out = { dis: false, why: [], far: '' };
  if (!mapOn(s) || !s.map.show.reach) return out;
  const a = s.map.at[fk]; const b = s.map.at[tk];
  if (!a || !b || a.site !== s.scene.siteId || b.site !== s.scene.siteId) return out;
  const dist = distFt(s, ctx, a, b);
  const two = /(\d+)\s*\/\s*(\d+)/.exec(range || '');
  const one = /(\d+)\s*(?:feet|ft)/i.exec(range || '');
  const normal = two ? Number(two[1]) : one ? Number(one[1]) : null;
  const long = two ? Number(two[2]) : normal;
  if (long != null && dist > long) out.far = `${whoOf(s, tk).name} is about ${dist} feet away, out of range (${long} feet).`;
  else if (two && dist > normal) { out.dis = true; out.why.push('long range'); }
  for (const [k, p] of Object.entries(s.map.at)) {
    if (p.site !== s.scene.siteId || !hostileTo(s, fk)(k) || !standing(s, k) || !MAP.canReact(whoOf(s, k))) continue;
    if (MAP.inReach(a, p, 5)) { out.dis = true; out.why.push('an enemy within 5 feet'); break; }
  }
  return out;
}

// Move a character or monster: to another zone, to a square, or up to someone to fight them.
H['map.move'] = (s, a, ctx) => {
  const m = mapUp(s);
  const t = target(s, a.who, ctx);
  if (!t) refuse(`Name who moves. Here: ${[...Object.values(s.pcs).map((p) => p.name), ...Object.values(s.foes).filter((f) => f.siteId === s.scene.siteId && !f.dead).map((f) => f.name)].join(', ')}.`, [...partyNames(s), ...foeNamesHere(s)]);
  if (t.kind === 'foe') { hostOnly(ctx); if (t.o.siteId !== s.scene.siteId) no(`${t.o.name} is not at this place.`); } else ownPc(s, ctx, t.id);
  if (t.o.dead) nop(`${t.o.name} cannot move: ${t.kind === 'pc' ? 'they are dead' : 'it is down'}.`);
  placeEveryone(s, ctx);
  const key = keyOf(t.kind, t.id);
  const siteId = s.scene.siteId;
  const zones = siteZones(s, ctx, siteId);
  const from = { ...m.at[key] };
  let zone = a.zone ? MAP.findZone(zones, a.zone) : MAP.zoneOf(zones, from.zone);
  if (a.zone && !zone) { zone = NAMES.pick(zones, a.zone, (z) => [z.id, z.name]); if (zone) assume(ctx, `"${a.zone}" is the zone ${zone.name}.`); }
  if (a.zone && !zone) refuse(`There is no zone called "${a.zone}" here. Zones: ${zones.map((z) => z.name).join(', ')}.`, zones.map((z) => z.name));
  let engage = null;
  if (a.engage) {
    engage = target(s, a.engage, ctx);
    if (!engage || (engage.kind === 'foe' && engage.o.siteId !== siteId)) refuse(`There is nobody called "${a.engage}" here to move up to.`, [...partyNames(s), ...foeNamesHere(s)]);
    if (engage.kind === t.kind && engage.id === t.id) no('They cannot move up to themselves.');
    zone = MAP.zoneOf(zones, m.at[keyOf(engage.kind, engage.id)].zone);
  }
  const notes = [];
  const g = MAP.gridOf(m, siteId, zone);
  const held = heldIn(s, zone.id, g.cols, { except: key });
  let cell = null;
  if (a.x != null && a.y != null && a.x !== '' && a.y !== '') {
    const x = Math.trunc(Number(a.x)); const y = Math.trunc(Number(a.y));
    if (!(x >= 0 && y >= 0 && x < g.cols && y < g.rows)) no('That square is off the map.');
    cell = [x, y];
    if (held.has(y * g.cols + x)) {
      // A monster hiding there steps aside rather than give itself away; anyone else is in the way.
      const who = Object.keys(m.at).find((k) => k !== key && m.at[k].zone === zone.id && m.at[k].site === siteId && m.at[k].x === x && m.at[k].y === y && standing(s, k));
      const hid = who && who.startsWith('foe:') && s.foes[who.slice(4)].hidden && t.kind === 'pc';
      if (hid) { const c = MAP.freeNear(g, new Set([...held, y * g.cols + x]), x + 0.5, y + 0.5); if (c) m.at[who] = { ...m.at[who], x: c[0], y: c[1] }; }
      else if (ctx.ai || isHost(ctx)) cell = MAP.freeNear(g, held, x + 0.5, y + 0.5);
      else no('Someone is already standing there.');
    }
  } else if (engage) {
    const tp = m.at[keyOf(engage.kind, engage.id)];
    const reachSq = Math.max(1, Math.round(reachOf(s, ctx, key) / 5));
    let best = null; let bd = Infinity;
    for (let y = Math.max(0, tp.y - reachSq); y <= Math.min(g.rows - 1, tp.y + reachSq); y++) {
      for (let x = Math.max(0, tp.x - reachSq); x <= Math.min(g.cols - 1, tp.x + reachSq); x++) {
        if ((x === tp.x && y === tp.y) || held.has(y * g.cols + x)) continue;
        if (x === from.x && y === from.y && from.zone === zone.id) { best = [x, y]; bd = -1; continue; }
        const d = from.zone === zone.id ? Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) : (x + 0.5 - MAP.anchor(g, MAP.sideToward(zone, MAP.zoneOf(zones, from.zone)))[0]) ** 2 + (y + 0.5 - MAP.anchor(g, MAP.sideToward(zone, MAP.zoneOf(zones, from.zone)))[1]) ** 2;
        if (d < bd) { bd = d; best = [x, y]; }
      }
    }
    if (!best) { best = MAP.freeNear(g, held, tp.x + 0.5, tp.y + 0.5); notes.push(`There is no room right beside ${engage.o.name}.`); }
    cell = best;
  } else if (zone.id !== from.zone) {
    const path = MAP.zonePath(zones, from.zone, zone.id);
    if (!path) no(`${zone.name} cannot be reached from ${MAP.zoneOf(zones, from.zone).name}: there is no way through.`);
    cell = MAP.freeNear(g, held, ...MAP.anchor(g, MAP.sideToward(zone, MAP.zoneOf(zones, path[path.length - 2]))));
  } else no('Say where to move: a zone, a square, or someone to move up to.');
  if (!cell) no(`There is no room left in ${zone.name}.`);
  let to = { site: siteId, zone: zone.id, x: cell[0], y: cell[1] };
  const fight = s.fight && s.fight.phase === 'turns' ? s.fight : null;
  const mine = fight && currentKey(s) === key;
  if (!(from.zone === to.zone && from.x === to.x && from.y === to.y)) {
    const blockedIn = (zid) => { const zg = MAP.gridOf(m, siteId, MAP.zoneOf(zones, zid)); return heldIn(s, zid, zg.cols, { except: key, only: hostileTo(s, key) }); };
    const steps = MAP.stepsBetween(m, siteId, zones, from, to, { blockedIn });
    const who = t.o;
    const fromZ = MAP.zoneOf(zones, from.zone);
    const b = MAP.budget(who, { speed: speedOfKey(s, ctx, key), used: mine ? fight.used : null, zoneTags: [...(fromZ.tags || []), ...(zone.tags || [])] });
    if (!isHost(ctx) && !ctx.freeMove) {
      // A player: a way there, and in a fight only on their own turn and within their movement.
      if (steps == null) no('You cannot get there from here: something is in the way.');
      if (fight) {
        inTurnCheck(s, ctx, key, 'move');
        const cost = steps * b.per;
        if (cost > b.left) no(`That is ${cost} feet of movement, and ${who.name} has ${b.left} left${!fight.used.dash && !fight.used.action ? ' (Dash doubles it)' : ''}.`);
        fight.used.moved = (fight.used.moved || 0) + cost;
      }
    } else if (ctx.ai && fight && t.kind === 'foe') {
      // A monster the AI Director moves goes no further than it could Dash this turn.
      const most = b.speed * 2;
      if (b.speed === 0) no(`${who.name} cannot move (${(who.conds || []).join(', ') || 'held'}).`);
      if (steps != null && steps * b.per > most) {
        const path = MAP.zonePath(zones, from.zone, zone.id) || [from.zone];
        const hops = Math.max(1, Math.floor(most / 30));
        const stop = MAP.zoneOf(zones, path[Math.min(path.length - 1, hops)]);
        if (stop.id !== zone.id) {
          const sg2 = MAP.gridOf(m, siteId, stop);
          const c = MAP.freeNear(sg2, heldIn(s, stop.id, sg2.cols, { except: key }), ...MAP.anchor(sg2, MAP.sideToward(stop, fromZ)));
          if (c) { to = { site: siteId, zone: stop.id, x: c[0], y: c[1] }; zone = stop; engage = null; notes.push(`${who.name} can only get as far as ${stop.name} this turn.`); }
        }
      }
      if (mine) fight.used.moved = (fight.used.moved || 0) + (steps == null ? 0 : steps * b.per);
    } else if (mine && steps != null) fight.used.moved = (fight.used.moved || 0) + steps * b.per;
  }
  // Leaving an enemy's reach on your own turn invites an opportunity attack (unless you Disengaged).
  if (mine && !fight.used.disengaged && (!a.auto || m.show.reach)) {
    const left = [];
    for (const [k, p] of Object.entries(m.at)) {
      if (p.site !== siteId || !hostileTo(s, key)(k)) continue;
      const o = whoOf(s, k);
      if (!o || !MAP.canReact(o) || !standing(s, k)) continue;
      const rf = reachOf(s, ctx, k);
      if (MAP.inReach(from, p, rf) && !MAP.inReach(to, p, rf)) left.push(o.name);
    }
    if (left.length) story(s, ctx, 'event', `${t.o.name} moves out of ${left.join(' and ')}'s reach: ${left.length > 1 ? 'they' : left[0]} may make an opportunity attack.`, 'Engine');
  }
  m.at[key] = to;
  if (t.kind === 'pc' && to.zone !== from.zone) emit(ctx, { ev: 'enter', site: siteId, zone: zone.id, zoneName: zone.name, pc: t.id });
  const quiet = t.kind === 'foe' && t.o.hidden;
  if (to.zone !== from.zone || engage) {
    const line = engage ? `${t.o.name} ${to.zone !== from.zone ? `moves to ${zone.name} and ` : ''}closes in on ${engage.o.name}.` : `${t.o.name} moves to ${zone.name}.`;
    if (quiet) log(s, ctx, line, 'note-host'); else story(s, ctx, 'event', line, 'Engine');
  } else log(s, ctx, `${t.o.name} moves.`, quiet ? 'note-host' : 'event');
  for (const n of notes) log(s, ctx, n, 'note-host');
  s.map.lastNote = notes.join(' ');
};
// Dash (double movement) or Disengage (no opportunity attacks), each taking the action.
H['map.dash'] = (s, a, ctx) => {
  const t = target(s, a.who, ctx);
  if (!t) refuse(`Nobody called "${a.who}" is here to dash.`, [...partyNames(s), ...foeNamesHere(s)]);
  if (t.kind === 'foe') hostOnly(ctx); else ownPc(s, ctx, t.id);
  const f = s.fight;
  if (!f || f.phase !== 'turns') nop('Dash and Disengage are for fights: outside one, move freely.', { hint: 'Use move_creature to move them.' });
  const key = keyOf(t.kind, t.id);
  if (currentKey(s) !== key) nop(`It is not ${t.o.name}'s turn.`);
  if (f.used.action && !(isHost(ctx) && !ctx.ai)) no(`${t.o.name} has already used their action this turn.`);
  f.used.action = true;
  if (a.kind === 'disengage') { f.used.disengaged = true; story(s, ctx, 'event', `${t.o.name} disengages.`, 'Engine'); } else { f.used.dash = true; story(s, ctx, 'event', `${t.o.name} dashes.`, 'Engine'); }
};

// What the maps show, for everyone (the DM's switches).
H['map.show'] = (s, a, ctx) => {
  hostOnly(ctx);
  const m = mapUp(s);
  for (const k of ['travel', 'zones', 'grid', 'reach']) if (a[k] != null) m.show[k] = !!a[k];
};
const IMG = /^\/maps\/[a-f0-9]{16,64}\.(?:png|jpg|gif|webp)$/;
const DATA_IMG = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
function picture(a) {
  const url = String(a.url || '');
  if (!IMG.test(url) && !(DATA_IMG.test(url) && url.length < 3e6)) no('That picture could not be used. Import it again.');
  const w = Math.trunc(Number(a.w)); const h = Math.trunc(Number(a.h));
  if (!(w > 0 && w <= 30000 && h > 0 && h <= 30000)) no('The picture\'s size is missing.');
  return { url, w, h };
}
const siteRef = (s, ctx, id) => {
  const sites = (ctx.adventure || {}).sites || [];
  const st = id ? sites.find((x) => x.id === id) : sites.find((x) => x.id === s.scene.siteId);
  if (id && !st && id !== s.scene.siteId) no('There is no such place.');
  return st ? st.id : s.scene.siteId;
};
// The zones of a place, as the DM edits them (or back to the adventure's own with reset).
H['map.zones'] = (s, a, ctx) => {
  hostOnly(ctx);
  const m = mapUp(s);
  const id = siteRef(s, ctx, a.siteId);
  if (a.reset) { delete m.zones[id]; siteZones(s, ctx, id); return; }
  const list = MAP.normZones(a.zones);
  if (!list.length) no('A place needs at least one zone.');
  m.zones[id] = list;
};
// A battle map for a whole place: a picture with its squares counted (and walls, from a Universal VTT
// file). split cuts it into zones of about 30 feet. Without squares it is only a picture behind the zones.
H['map.site'] = (s, a, ctx) => {
  hostOnly(ctx);
  const m = mapUp(s);
  const id = siteRef(s, ctx, a.siteId);
  if (a.clear) { delete m.sites[id]; return; }
  const pic = picture(a);
  const cols = Math.trunc(Number(a.cols) || 0); const rows = Math.trunc(Number(a.rows) || 0);
  if ((cols || rows) && !(cols >= 1 && cols <= 200 && rows >= 1 && rows <= 200)) no('Count the squares across and down (1 to 200).');
  m.sites[id] = { ...pic, cols, rows, walls: MAP.cleanSegs(a.walls, MAP.MAX_WALLS, cols, rows), doors: MAP.cleanSegs(a.doors, 400, cols, rows) };
  if (a.split && cols && rows) m.zones[id] = MAP.zonesFromSiteMap(cols, rows);
  if (cols && rows) for (const k of Object.keys(m.at)) if (m.at[k].site === id) delete m.at[k]; // everyone re-placed on the new squares
};
// A battle map for one zone (when the place has no map of its own).
H['map.grid'] = (s, a, ctx) => {
  hostOnly(ctx);
  const m = mapUp(s);
  const id = siteRef(s, ctx, a.siteId);
  const z = MAP.zoneOf(siteZones(s, ctx, id), a.zoneId);
  if (!z) refuse('There is no such zone here.', siteZones(s, ctx, s.scene.siteId).map((x) => x.name));
  const k = `${id}/${z.id}`;
  if (a.clear) { delete m.grids[k]; return; }
  const cols = Math.trunc(Number(a.cols) || 6); const rows = Math.trunc(Number(a.rows) || 6);
  if (!(cols >= 2 && cols <= MAP.MAX_CELLS && rows >= 2 && rows <= MAP.MAX_CELLS)) no(`A zone's battle map has 2 to ${MAP.MAX_CELLS} squares a side.`);
  const pic = a.url ? picture(a) : {};
  m.grids[k] = { ...pic, cols, rows, walls: MAP.cleanSegs(a.walls, MAP.MAX_WALLS, cols, rows), doors: MAP.cleanSegs(a.doors, 400, cols, rows) };
};
// The travel map's picture, and where a place sits on it.
H['map.travel'] = (s, a, ctx) => {
  hostOnly(ctx);
  const m = mapUp(s);
  if (a.clear) { m.travel = null; return; }
  m.travel = picture(a);
};
H['map.pos'] = (s, a, ctx) => {
  hostOnly(ctx);
  const m = mapUp(s);
  const id = siteRef(s, ctx, a.siteId);
  if (a.clear) { delete m.pos[id]; return; }
  const x = Number(a.x); const y = Number(a.y);
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) no('Place it on the map.');
  m.pos[id] = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
};
// Everyone here back to their starting squares.
H['map.reset'] = (s, a, ctx) => {
  hostOnly(ctx);
  const m = mapUp(s);
  for (const k of Object.keys(m.at)) if (m.at[k].site === s.scene.siteId) delete m.at[k];
};


// ---- the adventure's own rules, and the Engine's defaults ----------------------------------------
// An adventure can write "when X happens here, Y happens" as data (engine/triggers.js says how). The
// Engine carries those rules out by itself after every change, so the Director only narrates them: a
// fight starts, a foe flees, a clock ticks, a quest is done, a milestone is paid. Two defaults hold for
// every adventure: an attack with no fight on starts one, and a fight ends when no foe in it is left
// standing. Every rule is a default, not a rail: the Director or the DM can switch one off before it
// fires, or undo it after, with a reason (rule.override). The DM can turn them all off (auto.set).
const emit = (ctx, ev) => { if (ctx && Array.isArray(ctx.events)) ctx.events.push(ev); };
const rulesOf = (s) => (s.rules = s.rules || { fired: {}, off: {}, entered: {}, n: 0 });
const autoOf = (s) => ({ rules: true, scale: 'auto', ...(s.auto || {}) });
// Someone struck first with no fight on.
function hostileAct(s, ctx, by) { emit(ctx, { ev: 'attack', site: s.scene.siteId, by }); }

// The foes a rule means: by name, by group ("Goblin scout" for Goblin scout 1 to 3, also "Goblin scouts"),
// or by monster ("goblin"). At one place, or anywhere for the adventure's own rules.
function foesNamed(s, siteId, who) {
  const w = String(who || '').toLowerCase().trim();
  const all = Object.values(s.foes).filter((f) => !siteId || f.siteId === siteId);
  if (!w) return all;
  const sing = w.replace(/(?<=[a-z])(?:es|s)$/, '');
  const hit = (f) => [f.name, f.base, f.mid].filter(Boolean).map((x) => String(x).toLowerCase());
  const exact = all.filter((f) => hit(f).some((x) => x === w || x === sing || x.replace(/-/g, ' ') === w || x.replace(/-/g, ' ') === sing));
  return exact.length ? exact : all.filter((f) => hit(f).some((x) => x.startsWith(w) || x.startsWith(sing)));
}
const standingFoe = (f) => !f.dead && f.hp > 0;
const questByWords = (s, w) => {
  const k = String(w || '').toLowerCase().trim();
  if (!k) return null;
  return s.quests.find((q) => q.id === k) || s.quests.find((q) => q.text.toLowerCase().includes(k))
    || s.quests.find((q) => { const ws = k.split(/\s+/).filter((x) => x.length > 3); return ws.length && ws.every((x) => q.text.toLowerCase().includes(x)); }) || null;
};

// Does one "if" hold now? `ev`: the moment that set the rule off (who entered, who used), if any.
const itemsOf = (p) => (p && p.inventory) || [];
const named = (k) => (x) => String(x.name || '').toLowerCase().includes(k) && (x.qty == null || x.qty > 0);
function holders(s, ev, c) {
  const k = c.arg.toLowerCase();
  const who = ev && ev.pc && s.pcs[ev.pc] ? [s.pcs[ev.pc]] : Object.values(s.pcs).filter((p) => !p.dead);
  return (c.k === 'carries' ? who : Object.values(s.pcs).filter((p) => !p.dead)).filter((p) => itemsOf(p).some(named(k)));
}
function holds(s, ctx, rule, c, ev = null) {
  const site = rule.site || s.scene.siteId;
  let v = false;
  switch (c.k) {
    case 'from': v = s.scene.from === c.arg; break;
    case 'visited': v = s.scene.siteId === c.arg || (s.scene.visited || []).includes(c.arg); break;
    case 'down': { const l = foesNamed(s, rule.site, c.arg); v = l.length > 0 && l.every((f) => !standingFoe(f)); break; }
    case 'standing': v = foesNamed(s, rule.site, c.arg).some(standingFoe); break;
    case 'hurt': v = foesNamed(s, rule.site, c.arg).some((f) => standingFoe(f) && f.hp < f.maxHp / 2); break;
    case 'quest': { const q = questByWords(s, c.arg); v = !!(q && q.done); break; }
    case 'has': { const k = c.arg.toLowerCase(); v = [...(s.loot || []), ...Object.values(s.pcs).flatMap(itemsOf)].some(named(k)); break; }
    case 'carries': v = holders(s, ev, c).length > 0; break;
    case 'passed': case 'failed': {
      const last = [...(s.outcomes || [])].reverse().find((o) => o.site === site && (o.skill || String(R.ABILITY_NAMES[o.ability] || '').toLowerCase()) === c.arg);
      v = !!last && (c.k === 'passed' ? last.ok : !last.ok); break;
    }
    case 'fight': v = !!s.fight; break;
    default: v = false;
  }
  return c.not ? !v : v;
}

// "When two of the three scouts are down", for a group the fight fitting made bigger or smaller: in proportion.
function fittedCount(ctx, list, count) {
  const g = list[0] && list[0].group;
  if (!g || !list.every((f) => f.group === g)) return count;
  const [siteId, n] = g.split('#');
  const place = ((ctx.adventure || {}).sites || []).find((x) => x.id === siteId);
  const written = Number((((place && place.foes) || [])[Number(n)] || {}).count) || 1;
  return written === list.length ? count : Math.max(1, Math.min(list.length, Math.round((count * list.length) / written)));
}
// Is a rule's moment here? `ev` is the event of this change (edge rules) or null (state rules).
function setOff(s, ctx, rule, ev) {
  const w = rule.when;
  if (ev) {
    if (w.ev !== ev.ev) return false;
    if (rule.site && ev.site && ev.site !== rule.site) return false;
    if (w.ev === 'fail' || w.ev === 'succeed') return ev.skill === w.arg;
    if (w.ev === 'round') return w.arg ? ev.n === w.arg : ev.n > 1;
    // "enter" alone is the party arriving; "enter <zone>" a character stepping into that zone.
    if (w.ev === 'enter') { if (!w.arg) return !ev.zone; const z = String(w.arg).toLowerCase(); return !!ev.zone && (ev.zone === z || String(ev.zoneName || '').toLowerCase() === z); }
    if (w.ev === 'use') { const norm = (t) => String(t || '').toLowerCase().replace(/[-_]+/g, ' ').replace(/^(?:the|a|an)\s+/, '').replace(/\s+/g, ' ').trim(); const a = norm(w.arg); const o = norm(ev.object); return !!a && !!o && (o.includes(a) || a.includes(o)); }
    if (w.ev === 'turn') return !w.arg || foesNamed(s, rule.site, w.arg).some((f) => f.id === ev.foe);
    return true;
  }
  switch (w.ev) {
    case 'down': { const l = foesNamed(s, rule.site, rule.who); const down = l.filter((f) => !standingFoe(f)).length; return l.length > 0 && (rule.count ? down >= fittedCount(ctx, l, rule.count) : down === l.length); }
    case 'hurt': return foesNamed(s, rule.site, rule.who).some((f) => standingFoe(f) && f.hp < (rule.hp || f.maxHp / 2));
    case 'cleared': { const l = Object.values(s.foes).filter((f) => f.siteId === (rule.site || s.scene.siteId)); return l.length > 0 && !l.some(standingFoe); }
    case 'full': return (s.clocks || []).some((c) => c.done && c.name.toLowerCase() === String(w.arg).toLowerCase());
    case 'quest': { const q = questByWords(s, w.arg); return !!(q && q.done); }
    default: return false;
  }
}

// What a rule does. Returns the words for what happened ('' if nothing could) and how to undo it.
function carryOut(s, ctx, rule, ev) {
  const host = { ...ctx, role: 'host', pid: null, ai: false, assumed: null };
  const where = rule.site || s.scene.siteId;
  const said = [];
  const undo = {};
  switch (rule.do) {
    case 'fight': {
      if (s.fight || where !== s.scene.siteId) break;
      fitFoes(s, host, where);
      const foes = Object.values(s.foes).filter((f) => f.siteId === where && standingFoe(f));
      if (!foes.length || !Object.values(s.pcs).some((p) => !p.dead)) break;
      H['fight.start'](s, { surprise: rule.surprise }, host);
      undo.fight = true;
      said.push(`A fight starts here${rule.surprise === 'party' ? ', and the party is surprised' : rule.surprise === 'foes' ? ', and the foes are surprised' : ''}${ev && ev.by ? ` (${nameOf(s, ev.by) || 'someone'} struck first)` : ''}.`);
      break;
    }
    case 'flee': {
      const who = foesNamed(s, rule.site, rule.target).filter(standingFoe);
      const to = rule.to && ((ctx.adventure || {}).sites || []).find((x) => x.id === rule.to);
      undo.fled = []; undo.moved = []; undo.fightXp = 0;
      for (const f of who) {
        const xpBefore = s.fight ? s.fight.xp || 0 : 0;
        H['foe.flee'](s, { foeId: f.id }, host);
        undo.fled.push(f.id); undo.fightXp += (s.fight ? s.fight.xp || 0 : 0) - xpBefore;
        if (to) {
          // It turns up again at the place it ran to, as it was (out of sight until found).
          const id = nextId(s, 'f');
          s.foes[id] = { ...clone(f), id, siteId: to.id, dead: false, fled: false, hidden: true, conds: [], note: str(`fled here from ${site(s, ctx).name}${f.note ? `; ${f.note}` : ''}`, 200) };
          delete s.foes[id].zone0;
          undo.moved.push(id);
        }
      }
      if (who.length) said.push(`${who.map((f) => f.name).join(', ')} ${who.length > 1 ? 'flee' : 'flees'}${to ? ` toward ${to.name}` : ''}.`);
      break;
    }
    case 'tick': {
      const before = ((s.clocks || []).find((c) => c.name.toLowerCase() === rule.clock.toLowerCase()) || {}).filled || 0;
      H['clock.tick'](s, { name: rule.clock, by: rule.by }, host);
      const c = (s.clocks || []).find((x) => x.name.toLowerCase() === rule.clock.toLowerCase());
      if (c) { undo.clock = c.name; undo.by = c.filled - before; said.push(`The clock "${c.name}" fills to ${c.filled} of ${c.size}${c.done ? `: FULL. ${c.note || ''}` : '.'}`); }
      break;
    }
    case 'quest': {
      const q = questByWords(s, rule.quest);
      if (!q || q.done) break;
      H['quest.done'](s, { id: q.id }, host);
      undo.quest = q.id;
      said.push(`Quest complete: ${q.text}`);
      break;
    }
    case 'reveal': {
      const l = foesNamed(s, where, rule.target).filter((f) => standingFoe(f) && f.hidden);
      if (!l.length) break;
      H['foe.reveal'](s, { foeIds: l.map((f) => f.id) }, host);
      undo.revealed = l.map((f) => f.id);
      said.push(`${l.map((f) => f.name).join(', ')} ${l.length > 1 ? 'are' : 'is'} revealed.`);
      break;
    }
    // What was in the chest: to whoever opened it (or stepped in), else to the party's loot.
    case 'give': {
      const pc = ev && ev.pc && s.pcs[ev.pc] && !s.pcs[ev.pc].dead ? s.pcs[ev.pc] : null;
      const before = Object.fromEntries(Object.values(s.pcs).map((p) => [p.id, { gold: p.gold || 0, inv: Object.fromEntries(itemsOf(p).map((x) => [x.name, x.qty])) }]));
      const lootAt = s.loot.length;
      H['loot.give'](s, { pcId: pc ? pc.id : undefined, item: rule.item, qty: rule.qty, gold: rule.gold }, host);
      undo.given = { loot: s.loot.slice(lootAt).map((x) => x.name), pcs: {} };
      for (const p of Object.values(s.pcs)) {
        const b = before[p.id] || { gold: 0, inv: {} };
        const items = itemsOf(p).filter((x) => x.qty > (b.inv[x.name] || 0)).map((x) => [x.name, x.qty - (b.inv[x.name] || 0)]);
        const gold = (p.gold || 0) - b.gold;
        if (items.length || gold) undo.given.pcs[p.id] = { items, gold };
      }
      const what = [rule.item ? `${rule.qty > 1 ? `${rule.qty} × ` : ''}${rule.item}` : '', rule.gold ? `${rule.gold} gp` : ''].filter(Boolean).join(' and ');
      said.push(pc ? `${pc.name} gets ${what}.` : `The party finds ${what}.`);
      break;
    }
    // They stand down: out of the fight (no turns, not beaten, no XP). The fight ends when nobody in it is
    // still fighting; attacking them starts a new one.
    case 'calm': {
      const l = foesNamed(s, where, rule.target).filter((f) => standingFoe(f) && !f.calm);
      if (!l.length) break;
      for (const f of l) f.calm = true;
      undo.calmed = l.map((f) => f.id);
      const seen = l.filter((f) => !f.hidden);
      if (seen.length) story(s, ctx, 'event', `${seen.map((f) => f.name).join(', ')} ${seen.length > 1 ? 'stand' : 'stands'} down.`, 'Engine');
      said.push(`${l.map((f) => f.name).join(', ')} ${l.length > 1 ? 'stand' : 'stands'} down: no fight with ${l.length > 1 ? 'them' : 'it'} unless the party attacks.`);
      if (s.fight && s.fight.phase === 'turns') { const k = currentKey(s); if (k && k.startsWith('foe:') && s.foes[k.slice(4)] && s.foes[k.slice(4)].calm) advance(s, host); }
      break;
    }
    default: break;
  }
  // A milestone: so much XP each, or what each still needs to reach a level. Paid once per place.
  if (rule.xp || rule.level) {
    const key = rule.level ? `${where}:L${rule.level}` : `${where}:${rule.xp}`;
    const who = Object.values(s.pcs).filter((p) => !p.dead);
    if (who.length && !(s.xpPaid || []).includes(key)) {
      const need = (p) => (rule.level ? Math.max(0, (ctx.srd.xpTable[rule.level - 1] || 0) - (p.xp || 0)) : rule.xp);
      const paid = {};
      for (const p of who) { const n = need(p); if (n > 0) { p.xp = (p.xp || 0) + n; paid[p.id] = n; } }
      (s.xpPaid = s.xpPaid || []).push(key);
      if (Object.keys(paid).length) {
        undo.xp = paid; undo.xpKey = key;
        const words = rule.level ? `every character has the XP for level ${rule.level}` : `each character earns ${rule.xp} XP`;
        story(s, ctx, 'event', `A milestone: ${words}.`, 'Engine');
        levelReady(s, ctx);
        said.push(`A milestone: ${words}.`);
      }
    }
  }
  // Who has the item the rule asked about, for the Director to name.
  if (said.length || rule.do === 'say' || rule.do === 'xp') {
    for (const c of rule.if.filter((x) => (x.k === 'has' || x.k === 'carries') && !x.not)) {
      const h = holders(s, ev, c);
      if (h.length) said.push(`(${h.map((p) => p.name).join(' and ')} ${h.length > 1 ? 'carry' : 'carries'} ${c.arg}.)`);
    }
  }
  if (rule.say && (said.length || rule.do === 'say' || rule.do === 'xp')) said.push(rule.say);
  return { text: said.join(' '), undo };
}

function fireRule(s, ctx, rule, ev) {
  const RS = rulesOf(s);
  const { text, undo } = carryOut(s, ctx, rule, ev);
  if (!text) return false;
  RS.fired[rule.key] = { seq: s.seq, text, undo };
  log(s, ctx, `${text} [rule ${rule.key}]`, 'rule');
  return true;
}

// The Engine's own defaults, as rules (they can be overridden like any other).
const ATTACK_RULE = { key: '*/attack', id: 'attack', site: '', when: { ev: 'attack', arg: '' }, who: '', if: [], do: 'fight', surprise: '', once: false, xp: 0, say: '' };

function runRules(s, ctx, action) {
  const auto = autoOf(s);
  if (!auto.rules || !ctx.adventure) { ctx.events.length = 0; return; }
  const RS = rulesOf(s);
  const party = Object.values(s.pcs).filter((p) => !p.dead);
  // The first place is "entered" when the game starts (its first narration, or the Director's first turn).
  if (!RS.entered[s.scene.siteId] && party.length && (s.started || ctx.starting) && !ctx.events.some((e) => e.ev === 'enter' && !e.zone)) ctx.events.unshift({ ev: 'enter', site: s.scene.siteId, from: s.scene.from || '' });
  try {
    if (party.length && (s.started || ctx.starting)) fitFoes(s, ctx, s.scene.siteId);
  } catch (e) { log(s, ctx, `Could not fit the fight here to the party: ${e.message}`, 'note-host'); }
  for (let pass = 0; pass < 6; pass++) {
    const events = ctx.events.splice(0);
    let fired = false;
    const rules = TRIG.rulesAt(ctx.adventure, s.scene.siteId).filter((r) => r.when.ev && !RS.off[r.key]);
    const ready = (r, ev) => r.if.every((c) => holds(s, ctx, r, c, ev)) && (!r.once || !RS.fired[r.key]);
    for (const ev of events) {
      if (ev.ev === 'enter' && !ev.zone) RS.entered[ev.site] = s.seq;
      if (ev.site && ev.site !== s.scene.siteId) continue;
      let fight = false;
      for (const r of rules) {
        if (!setOff(s, ctx, r, ev) || !ready(r, ev)) continue;
        try { if (fireRule(s, ctx, r, ev)) { fired = true; if (r.do === 'fight') fight = true; } } catch (e) { log(s, ctx, `The rule ${r.key} could not be carried out: ${e.message}`, 'note-host'); }
      }
      // The default: an attack with no fight on starts one, unless the place's own rules already did.
      if (ev.ev === 'attack' && !fight && !s.fight && !RS.off[ATTACK_RULE.key]) {
        try { if (fireRule(s, ctx, ATTACK_RULE, ev)) fired = true; } catch (e) { log(s, ctx, `Could not start the fight: ${e.message}`, 'note-host'); }
      }
    }
    for (const r of rules) {
      if (!TRIG.STATES.includes(r.when.ev) || RS.fired[r.key]) continue;
      if (!setOff(s, ctx, r, null) || !r.if.every((c) => holds(s, ctx, r, c))) continue;
      try { if (fireRule(s, ctx, { ...r, once: true }, null)) fired = true; else RS.fired[r.key] = { seq: s.seq, text: '', undo: {} }; } catch (e) { log(s, ctx, `The rule ${r.key} could not be carried out: ${e.message}`, 'note-host'); }
    }
    // The default: a fight ends when nobody on the monsters' side is left standing.
    if (s.fight && s.fight.order.length && !RS.off['*/fight-ends']) {
      const foes = s.fight.order.filter((o) => o.key.startsWith('foe:')).map((o) => s.foes[o.key.slice(4)]).filter(Boolean);
      if (foes.length && !foes.some((f) => standingFoe(f) && !f.calm)) {
        const why = foes.some(standingFoe) ? 'No foe is still fighting' : 'No foe is left standing';
        H['fight.end'](s, {}, { ...ctx, role: 'host', pid: null, ai: false, assumed: null });
        RS.fired['*/fight-ends'] = { seq: s.seq, text: `${why}: the fight is over.`, undo: {} };
        log(s, ctx, `${why}: the fight is over. [rule */fight-ends]`, 'rule');
        fired = true;
      }
    }
    if (!fired && !ctx.events.length) break;
  }
  void action;
}

// Fit the fights a place was written for to the party at the table (engine/scale.js): the number of foes
// in each group first, then their hit points. Once per place, before anyone is hurt.
function fitFoes(s, ctx, siteId) {
  const mode = autoOf(s).scale;
  s.fits = s.fits || {};
  if (mode === 'off' || s.fits[siteId]) return;
  const place = ((ctx.adventure || {}).sites || []).find((x) => x.id === siteId);
  if (!place || !(place.foes || []).length) return;
  const levels = Object.values(s.pcs).filter((p) => !p.dead).map((p) => p.level || 1);
  if (!levels.length) return;
  const placed = Object.values(s.foes).filter((f) => f.siteId === siteId && f.group && f.group.startsWith(`${siteId}#`));
  if (!placed.length) return;
  // Only a place nobody has fought at yet.
  if (placed.some((f) => f.dead || f.hp < f.maxHp)) { s.fits[siteId] = { text: '' }; return; }
  const ix = R.index(ctx.srd);
  const groups = place.foes.map((g, n) => {
    const mine = placed.filter((f) => f.group === `${siteId}#${n}`);
    const m = mine[0] ? monsterOf(ctx, mine[0]) : ix.monster[g.monster];
    return { key: `${siteId}#${n}`, name: g.name || (m && m.name) || g.monster, xp: SCALE.fightXp(m), count: mine.length, scalable: mine.length > 1 && g.scale !== false, fixed: g.scale === false };
  }).filter((g) => g.count > 0);
  const designed = SCALE.designedParty(ctx.adventure, siteId);
  const plan = SCALE.planFight({ groups, designed, actual: levels, srd: ctx.srd, mode });
  if (!plan) { s.fits[siteId] = { text: '' }; return; }
  const host = { ...ctx, role: 'host', pid: null, ai: false, assumed: null };
  const lines = [];
  for (const g of groups) {
    const want = plan.counts[g.key];
    const mine = placed.filter((f) => f.group === g.key).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    if (want < mine.length) for (const f of mine.slice(want)) delete s.foes[f.id];
    if (want > mine.length) {
      const one = mine[0];
      const spec = place.foes[Number(g.key.split('#')[1])] || {};
      const prev = s.fight; s.fight = null; // placed quietly, never straight into a fight
      try { H['foe.add'](s, { monster: one.mid, count: want - mine.length, name: one.base, hidden: one.hidden, note: one.note, siteId, zone: spec.zone, group: g.key }, host); } finally { s.fight = prev; }
    }
    if (want !== mine.length) lines.push(`${g.name}: ${want} (written ${mine.length})`);
  }
  if (plan.hp !== 1) {
    for (const f of Object.values(s.foes).filter((x) => x.siteId === siteId && x.group && x.group.startsWith(`${siteId}#`))) { f.maxHp = Math.max(1, Math.round(f.maxHp * plan.hp)); f.hp = f.maxHp; }
    lines.push(`hit points ×${plan.hp}`);
  }
  if (plan.dmg && plan.dmg !== 1) {
    for (const f of Object.values(s.foes).filter((x) => x.siteId === siteId && x.group && x.group.startsWith(`${siteId}#`))) f.dmgScale = plan.dmg;
    lines.push(`damage ×${plan.dmg}`);
  }
  const text = `Fitted to this party: written for ${SCALE.partyWords(designed)}, the party here is ${SCALE.tableWords(levels)}. ${lines.join('; ')}. (${plan.ratingBefore} as written for them; ${plan.rating} now.)`;
  s.fits[siteId] = { text, plan };
  log(s, ctx, `${text} [fit ${siteId}]`, 'rule');
}

// The rules at the party's place, for the screens and the Director: words, and whether each is waiting,
// done or switched off.
export function rulesHere(state, adventure) {
  const RS = state.rules || { fired: {}, off: {} };
  const out = TRIG.rulesAt(adventure, state.scene.siteId).map((r) => ({
    key: r.key, id: r.id, words: TRIG.ruleWords(r, adventure), ev: r.when.ev, zone: r.when.ev === 'enter' && !!r.when.arg,
    status: RS.off[r.key] ? 'off' : RS.fired[r.key] && (r.once || TRIG.STATES.includes(r.when.ev)) ? (RS.fired[r.key].text ? 'done' : 'passed') : 'waiting',
    did: (RS.fired[r.key] || {}).text || '', why: RS.off[r.key] || '',
  }));
  return out;
}

// Switch a rule off before it fires, or undo it after, with a reason. Also the Engine's own defaults:
// "*/attack" (the fight an attack started) and "*/fight-ends".
H['rule.override'] = (s, a, ctx) => {
  hostOnly(ctx);
  const RS = rulesOf(s);
  const reason = str(a.reason, 200);
  const here = [...TRIG.rulesAt(ctx.adventure || {}, s.scene.siteId), ATTACK_RULE, { key: '*/fight-ends', id: 'fight-ends', site: '' }];
  const ref = String(a.id || a.rule || '').trim();
  let r = here.find((x) => x.key === ref || x.id === ref || `${x.site}/${x.id}` === ref);
  if (!r && ref) {
    const w = (x) => (x.when ? TRIG.ruleWords(x, ctx.adventure) : 'the fight ends when no foe is left standing');
    r = NAMES.pick(here, ref, (x) => [x.key, x.id]) || here.find((x) => w(x).toLowerCase().includes(ref.toLowerCase()));
    if (r) assume(ctx, `"${ref}" is the rule ${r.key}.`);
  }
  if (!r) refuse(`There is no rule "${ref}" here.`, here.map((x) => x.key), 'Name one of the rules listed for this place.');
  const done = RS.fired[r.key];
  if (!done || !done.text) {
    if (RS.off[r.key]) nop(`The rule ${r.key} is already switched off.`);
    RS.off[r.key] = reason || 'switched off';
    log(s, ctx, `Rule ${r.key} switched off${reason ? `: ${reason.replace(/[.\s]+$/, '')}` : ''}. It will not happen.`, 'rule');
    return;
  }
  const u = done.undo || {};
  const host = { ...ctx, role: 'host', pid: null, ai: false, assumed: null };
  const said = [];
  if (u.fight && s.fight) { H['fight.end'](s, { award: false }, host); said.push('the fight is called off'); }
  for (const id of u.fled || []) { const f = s.foes[id]; if (f && f.fled) { f.dead = false; f.fled = false; if (s.fight) joinFight(s, host, 'foe', id, { roll: true }); said.push(`${f.name} stays`); } }
  if (u.fightXp && s.fight) s.fight.xp = Math.max(0, (s.fight.xp || 0) - u.fightXp);
  for (const id of u.moved || []) delete s.foes[id];
  if (u.clock && u.by) { const c = (s.clocks || []).find((x) => x.name === u.clock); if (c) { c.filled = Math.max(0, c.filled - u.by); c.done = c.filled >= c.size; said.push(`the clock "${c.name}" goes back to ${c.filled}`); } }
  if (u.quest) { const q = s.quests.find((x) => x.id === u.quest); if (q) { q.done = false; said.push(`the quest "${q.text}" is open again`); } }
  if (u.revealed) for (const id of u.revealed) if (s.foes[id]) s.foes[id].hidden = true;
  if (u.given) {
    for (const name of u.given.loot || []) { const k = s.loot.findIndex((x) => x.name === name); if (k >= 0) s.loot.splice(k, 1); }
    for (const [id, g] of Object.entries(u.given.pcs || {})) {
      const p = s.pcs[id];
      if (!p) continue;
      p.gold = Math.max(0, (p.gold || 0) - (g.gold || 0));
      for (const [name, n] of g.items || []) { const it = itemsOf(p).find((x) => x.name === name); if (it) { it.qty -= n; if (it.qty <= 0) p.inventory = p.inventory.filter((x) => x !== it); } }
    }
    said.push('what it gave is taken back');
  }
  if (u.calmed) { const back = u.calmed.map((id) => s.foes[id]).filter((f) => f && f.calm); for (const f of back) delete f.calm; if (back.length) said.push(`${back.map((f) => f.name).join(', ')} ${back.length > 1 ? 'are' : 'is'} hostile again`); }
  if (u.xp) { for (const [id, n] of Object.entries(u.xp)) if (s.pcs[id]) s.pcs[id].xp = Math.max(0, (s.pcs[id].xp || 0) - n); s.xpPaid = (s.xpPaid || []).filter((k) => k !== u.xpKey); said.push('the milestone XP is taken back'); }
  delete RS.fired[r.key];
  if (r.key !== ATTACK_RULE.key) RS.off[r.key] = reason || 'undone';
  log(s, ctx, `Rule ${r.key} undone${reason ? ` (${reason.replace(/[.\s]+$/, '')})` : ''}: ${said.join(', ') || 'nothing left to take back'}.`, 'rule');
  if (said.length) story(s, ctx, 'event', `${cap1(said.join(', '))}.`, 'Engine');
};
H['rule.on'] = (s, a, ctx) => {
  hostOnly(ctx);
  const RS = rulesOf(s);
  const k = String(a.id || '');
  if (!RS.off[k]) nop(`The rule ${k} is not switched off.`);
  delete RS.off[k];
  log(s, ctx, `Rule ${k} switched back on.`, 'rule');
};
// Let the Engine look at the rules now (the Director's first turn starts the game's first place).
H['rules.run'] = (s, a, ctx) => { hostOnly(ctx); if (a.starting && ctx.events) ctx.starting = true; };
// Something happened that only words showed (a player said they attack): the rules hear it.
H['rule.event'] = (s, a, ctx) => {
  hostOnly(ctx);
  const ev = String(a.event || '');
  if (ev !== 'attack') refuse(`The Engine cannot be told "${ev}".`, ['attack']);
  if (s.fight) nop('A fight is already on.');
  if (!Object.values(s.foes).some((f) => f.siteId === s.scene.siteId && standingFoe(f))) nop('Nobody here to fight.');
  const t = a.by ? target(s, a.by) : null;
  hostileAct(s, ctx, t ? keyOf(t.kind, t.id) : '');
};
// The DM's switches: the adventure's rules on or off; fights fitted to the party both ways, only made easier, or as written.
H['auto.set'] = (s, a, ctx) => {
  hostOnly(ctx);
  s.auto = autoOf(s);
  if (a.rules != null) s.auto.rules = !!a.rules;
  if (a.scale != null) { if (!['auto', 'down', 'off'].includes(a.scale)) refuse('Fit fights "auto", "down" or "off".', ['auto', 'down', 'off']); s.auto.scale = a.scale; }
  log(s, ctx, `The Engine ${s.auto.rules ? 'runs' : 'does not run'} the adventure's rules; fights are ${s.auto.scale === 'auto' ? 'fitted to the party' : s.auto.scale === 'down' ? 'only ever made easier for the party' : 'as written'}.`, 'note-host');
};
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export const ACTIONS = Object.keys(H);

export function apply(state, action, ctx) {
  const h = H[action && action.type];
  if (!h) throw new RuleError(`Unknown action "${action && action.type}".`);
  const s = clone(state);
  s.seq += 1;
  s.t = ctx.now || 0;
  const c = { ...ctx, events: [] };
  h(s, action, c);
  try { releaseGrapples(s, c); } catch (e) { /* never stops the game */ }
  // The adventure's own rules and the Engine's defaults (a fight starts, a foe flees, a clock ticks, a
  // quest is done), after every change. They must never stop the game.
  runRules(s, c, action);
  // Everyone at the party's place has a square on the map. The map must never stop the game.
  try { placeEveryone(s, ctx); } catch (e) { /* a broken map is redrawn next time */ }
  return s;
}

// ---- what each screen may see ------------------------------------------------------------------
export function viewFor(state, role, pid) {
  if (role === 'host') return state;
  const s = clone(state);
  delete s.notes;
  delete s.seeds; delete s.seedLog; delete s.seedNow; delete s.drift; delete s.driftKey; delete s.restAfter;
  s.clocks = (s.clocks || []).filter((c) => !c.hidden && (!c.siteId || c.siteId === s.scene.siteId)).map((c) => ({ ...c, note: c.done ? c.note : '' }));
  s.log = s.log.filter((l) => l.kind !== 'note-host');
  s.foes = Object.fromEntries(Object.values(s.foes).filter((f) => !f.hidden && f.siteId === s.scene.siteId).map((f) => [f.id, {
    id: f.id, name: f.name, mid: f.mid, conds: f.conds, dead: f.dead, fled: f.fled, health: R.healthWord(f.hp, f.maxHp), siteId: f.siteId,
  }]));
  s.rolls = s.rolls.map((r) => (r.secret ? { id: r.id, seq: r.seq, t: r.t, who: r.who, kind: r.kind, label: r.label, success: r.success, crit: r.crit, secret: true }
    : r.hideAt ? { ...r, at: null } : r));
  // A player sees their own requests with the reason, never the DC until it is resolved.
  s.requests = s.requests.filter((q) => { const p = s.players[pid]; return p && p.pcId === q.pcId; }).map((q) => ({ ...q, dc: q.kind === 'death' ? 10 : null, effect: q.effect ? { concentration: q.effect.concentration } : null }));
  s.rolls = s.rolls.map((r) => ({ ...r, at: r.kind === 'death' ? r.at : (r.at != null && r.kind !== 'attack' ? null : r.at) }));
  // The map: only the characters and the monsters this screen can see, and no DM notes on zones.
  if (s.map) {
    const seen = new Set([...Object.keys(s.pcs).map((id) => `pc:${id}`), ...Object.keys(s.foes).map((id) => `foe:${id}`)]);
    s.map.at = Object.fromEntries(Object.entries(s.map.at || {}).filter(([k]) => seen.has(k)));
    s.map.zones = Object.fromEntries(Object.entries(s.map.zones || {}).map(([id, list]) => [id, list.map((z) => ({ ...z, note: '' }))]));
    delete s.map.cameFrom;
    delete s.map.lastNote;
  }
  return s;
}

export { average };
