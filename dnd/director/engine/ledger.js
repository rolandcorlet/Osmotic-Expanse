// The Ledger: one shared record of a D&D 5e game. Every change comes through apply(), which checks
// the rules and refuses what they do not allow, so the host, the players and the AI Director can
// never put the table into a state the rules could not reach.
//
//   apply(state, action, ctx) -> new state      ctx = { role: 'host'|'player', pid, rng, now, adventure, srd, ai }
//   viewFor(state, role, pid) -> what that screen may see (players never see a monster's numbers or a DC)

import * as R from './rules.js';
import { d20, rollDice, die, average } from './dice.js';

export class RuleError extends Error {}
const no = (msg) => { throw new RuleError(msg); };

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
    loot: [], time: { day: 1, hour: 8 }, seeds: [], notes: '', nextId: 1, started: false,
  };
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
  if (!pc) no('There is no such character.');
  if (isHost(ctx)) return pc;
  const p = s.players[ctx.pid];
  if (!p || p.pcId !== pcId) no('That is not your character.');
  return pc;
}
const hostOnly = (ctx) => { if (!isHost(ctx)) no('Only the Dungeon Master can do that.'); };

// A target written "pc:id" or "foe:id", or just a name.
function target(s, ref) {
  const r = String(ref || '').trim();
  const [k, id] = r.split(':');
  if (k === 'pc' && s.pcs[id]) return { kind: 'pc', id, o: s.pcs[id] };
  if (k === 'foe' && s.foes[id]) return { kind: 'foe', id, o: s.foes[id] };
  const low = r.toLowerCase();
  const pc = Object.values(s.pcs).find((x) => x.id === r || x.name.toLowerCase() === low);
  if (pc) return { kind: 'pc', id: pc.id, o: pc };
  const foe = Object.values(s.foes).find((x) => x.id === r || x.name.toLowerCase() === low);
  if (foe) return { kind: 'foe', id: foe.id, o: foe };
  return null;
}

// ---- the fight ----------------------------------------------------------------------------
const keyOf = (kind, id) => `${kind}:${id}`;
function currentKey(s) { return s.fight && s.fight.phase === 'turns' ? (s.fight.order[s.fight.turn] || {}).key : null; }
function freshTurn() { return { action: false, bonus: false, reaction: false, attacks: 0, sneak: false }; }
function inTurnCheck(s, ctx, key, what) {
  if (!s.fight || s.fight.phase !== 'turns') return;
  if (isHost(ctx) && !ctx.ai) return; // the human DM may always step in
  if (currentKey(s) !== key) no(`It is not ${nameOf(s, key)}'s turn. Acting now: ${nameOf(s, currentKey(s)) || 'nobody'}.`);
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
  }
}
function advance(s, ctx) {
  const f = s.fight;
  const n = f.order.length;
  if (!n) return;
  for (let step = 0; step < n; step++) {
    f.turn += 1;
    if (f.turn >= n) { f.turn = 0; f.round += 1; }
    const k = f.order[f.turn].key;
    const [kind, id] = k.split(':');
    const alive = kind === 'pc' ? s.pcs[id] && !s.pcs[id].dead : s.foes[id] && !s.foes[id].dead;
    if (alive) break;
  }
  beginTurn(s, ctx);
}
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
  story(s, ctx, 'event', `Initiative: ${f.order.map((o) => nameOf(s, o.key)).join(', ')}.`, 'Engine');
  beginTurn(s, ctx);
  // Someone dead or gone at the top of the order is passed over at once.
  const [kind, id] = f.order[0].key.split(':');
  if ((kind === 'pc' && s.pcs[id].dead) || (kind === 'foe' && s.foes[id].dead)) advance(s, ctx);
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
  if (pc.dead) no(`${pc.name} is dead; healing cannot help.`);
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
  else if (kind === 'initiative') bonus = pc.mods.dex + (pc.cls === 'bard' && pc.level >= 2 ? Math.floor(pc.prof / 2) : 0);
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
  if (!pc) no('There is no such character.');
  for (const p of Object.values(s.players)) if (p.pcId === pc.id) p.pcId = null;
  delete s.pcs[pc.id];
  if (s.fight) { const cur = currentKey(s); s.fight.order = s.fight.order.filter((o) => o.key !== keyOf('pc', pc.id)); s.fight.turn = Math.max(0, s.fight.order.findIndex((o) => o.key === cur)); }
  s.requests = s.requests.filter((q) => q.pcId !== pc.id);
  log(s, ctx, `${pc.name} left the party.`);
};
H['pc.assign'] = (s, a, ctx) => {
  hostOnly(ctx);
  const pc = s.pcs[a.pcId];
  if (!pc) no('There is no such character.');
  for (const p of Object.values(s.players)) if (p.pcId === pc.id) p.pcId = null;
  pc.playerId = null;
  if (a.pid) { const p = s.players[a.pid]; if (!p) no('That player is not at the table.'); p.pcId = pc.id; pc.playerId = p.id; }
  log(s, ctx, a.pid ? `${pc.name} is now played by ${s.players[a.pid].name}.` : `${pc.name} has no player for now.`);
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
  const ids = (a.pcIds && a.pcIds.length ? a.pcIds : [a.pcId]).map((x) => (target(s, x) || {}).id).filter((x) => x && s.pcs[x]);
  if (!ids.length) no(`Name a character to roll. In the party: ${Object.values(s.pcs).map((p) => `${p.id} (${p.name})`).join(', ') || 'nobody yet'}.`);
  let ability = String(a.ability || '').toLowerCase().slice(0, 3);
  const skill = String(a.skill || '').toLowerCase().replace(/\s+/g, '-');
  if (skill) { const sk = R.index(ctx.srd).skill[skill]; if (!sk) no(`There is no skill called "${a.skill}". Skills: ${ctx.srd.skills.map((x) => x.id).join(', ')}.`); if (kind === 'save') no('A saving throw uses an ability, not a skill.'); ability = sk.ability; }
  if (!R.ABILITIES.includes(ability)) no('Say which ability the roll uses (str, dex, con, int, wis or cha), or a skill.');
  const dc = Math.trunc(Number(a.dc));
  if (!(dc >= 1 && dc <= 35)) no('Give a DC between 1 and 35 (5 very easy, 10 easy, 15 medium, 20 hard, 25 very hard).');
  for (const id of ids) {
    if (s.pcs[id].dead) continue;
    s.requests = s.requests.filter((q) => !(q.pcId === id && q.kind === kind && q.ability === ability && q.skill === skill));
    const effect = a.effect && typeof a.effect === 'object' ? {
      dmg: R.ABILITIES && a.effect.dmg ? String(a.effect.dmg).slice(0, 20) : '', type: str(a.effect.type, 20), half: !!a.effect.half, cond: str(a.effect.cond, 20).toLowerCase(),
    } : null;
    s.requests.push({ id: nextId(s, 'q'), pcId: id, kind, ability, skill, dc, adv: a.adv === 'adv' || a.adv === 'dis' ? a.adv : '', reason: str(a.reason, 200), by: ctx.ai ? 'ai' : 'host', t: ctx.now || 0, group: ids.length > 1 ? true : undefined, effect });
  }
};
H['roll.cancel'] = (s, a, ctx) => { hostOnly(ctx); s.requests = s.requests.filter((q) => q.id !== a.id); };

H['roll.make'] = (s, a, ctx) => {
  const q = s.requests.find((x) => x.id === a.id);
  if (!q) no('That roll is no longer asked for.');
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
  if (s.fight) no('A fight is already on.');
  const foes = Object.values(s.foes).filter((f) => f.siteId === s.scene.siteId && !f.dead && (a.foeIds ? a.foeIds.includes(f.id) : true));
  if (!foes.length) no('There is nothing here to fight. Add monsters first.');
  const pcs = Object.values(s.pcs).filter((p) => !p.dead);
  if (!pcs.length) no('Nobody in the party can fight.');
  s.fight = { phase: 'initiative', round: 0, turn: 0, order: [], used: freshTurn(), xp: 0, surprised: (a.surprised || []).slice(0, 20) };
  for (const f of foes) { f.hidden = false; joinFight(s, ctx, 'foe', f.id); }
  for (const p of pcs) {
    joinFight(s, ctx, 'pc', p.id, { roll: !!a.autoRoll || !p.playerId });
    if (!a.autoRoll && p.playerId) s.requests.push({ id: nextId(s, 'q'), pcId: p.id, kind: 'initiative', ability: 'dex', skill: '', dc: 0, adv: '', reason: 'Roll initiative!', by: 'engine', t: ctx.now || 0 });
  }
  story(s, ctx, 'event', `Battle! ${foes.map((f) => f.name).join(', ')}. Roll initiative.`, 'Engine');
  if (s.fight.order.every((o) => o.init != null)) startTurns(s, ctx);
};
// Start without waiting for slow initiative rolls: the Engine rolls for whoever has not.
H['fight.begin'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (!s.fight || s.fight.phase !== 'initiative') no('There is no initiative being rolled.');
  startTurns(s, ctx);
};
// The DM types in an initiative rolled at the table.
H['fight.init'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (!s.fight) no('There is no fight.');
  const o = s.fight.order.find((x) => x.key === a.key);
  if (!o) no('They are not in the fight.');
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
  if (!s.fight) no('There is no fight to join.');
  const t = target(s, a.target);
  if (!t) no('Name a character or monster to add.');
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
  if (!s.fight || s.fight.phase !== 'turns') no('No turns are being taken.');
  const cur = currentKey(s);
  if (!isHost(ctx)) {
    const p = s.players[ctx.pid];
    if (!p || keyOf('pc', p.pcId) !== cur) no('Only the one whose turn it is can end it.');
  }
  if (ctx.ai && a.expect && a.expect !== cur) no(`It is ${nameOf(s, cur)}'s turn, not ${nameOf(s, a.expect) || a.expect}'s.`);
  releaseHolds(s, ctx);
  endOfTurnSaves(s, ctx, cur);
  advance(s, ctx);
  const now = currentKey(s);
  log(s, ctx, `${nameOf(s, cur)} ends their turn. ${nameOf(s, now)} is up (round ${s.fight.round}).`);
};
H['fight.end'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (!s.fight) no('There is no fight to end.');
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
  const atk = (pc.attacks || []).find((x) => x.id === a.attack || x.name.toLowerCase() === String(a.attack || '').toLowerCase());
  if (!atk) no(`${pc.name} has no attack called "${a.attack}". Attacks: ${(pc.attacks || []).map((x) => x.name).join(', ')}.`);
  const t = target(s, a.target);
  if (!a.target) return freeAttack(s, a, ctx, pc, atk);
  if (!t || t.kind !== 'foe') no('Choose a monster to attack.');
  const foe = t.o;
  if (foe.dead) no(`${foe.name} is already down.`);
  if (foe.siteId !== s.scene.siteId) no(`${foe.name} is not here.`);
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
  const self = R.selfEffects(pc, 'attack');
  const tfx = R.targetEffects(foe.conds, { melee: atk.melee });
  const adv = a.adv === 'adv' || self.adv || tfx.adv;
  const dis = a.adv === 'dis' || self.dis || tfx.dis;
  const r = d20(ctx.rng, { adv, dis, own: Array.isArray(a.own) && a.own.length ? a.own : null });
  const total = r.kept + atk.hit;
  const hit = r.kept === 20 || (r.kept !== 1 && total >= foe.ac);
  // A hit on a paralyzed or unconscious creature from within 5 feet is a critical hit.
  const critHit = hit && (r.kept === 20 || tfx.autoCrit);
  let text = `${pc.name} attacks ${foe.name} with ${atk.name}${advWord(r)}`;
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
  addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'attack', label: `${atk.name} vs ${foe.name}`, dice: r.rolls, mod: atk.hit, total, at: foe.ac, success: hit, crit: critHit, mode: r.mode, why: [...self.why, ...tfx.why], dmg: dmgRow, hideAt: true });
  story(s, ctx, 'event', text, 'Engine', { roll: true });
};

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
  const sp = R.index(ctx.srd).spell[a.spell];
  if (!sp) no(`There is no spell called "${a.spell}".`);
  const c = pc.cast;
  if (!c) no(`${pc.name} does not cast spells.`);
  const can = sp.level === 0 ? [...c.cantrips, c.raceCantrip].includes(sp.id) : (c.kind === 'prepared' ? c.prepared : c.known).includes(sp.id);
  if (!can && !(c.spellbook && a.ritual && sp.ritual && c.known.includes(sp.id))) no(`${pc.name} does not have ${sp.name} ${c.kind === 'prepared' ? 'prepared' : 'known'}.`);
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
    if (!slot || !slot[0]) no(`${pc.name} has no ${R.ordinal(lvl)}-level spell slots.`);
    if (slot[1] >= slot[0]) no(`${pc.name} has no ${R.ordinal(lvl)}-level spell slots left.`);
    slot[1] += 1;
  }
  if (sp.conc) { if (pc.conc) dropConcentration(s, ctx, pc, `cast ${sp.name}`); pc.conc = { id: sp.id, name: sp.name, since: s.seq }; }
  const lines = [`${pc.name} casts ${sp.name}${lvl > sp.level ? ` at ${R.ordinal(lvl)} level` : ''}${ritual ? ' as a ritual' : ''}.`];
  const targets = (a.targets || (a.target ? [a.target] : [])).map((x) => target(s, x)).filter(Boolean).slice(0, 12);
  const dmgExpr = sp.dmgSlot ? sp.dmgSlot[lvl] || sp.dmgSlot[sp.level] : sp.dmgLevel ? sp.dmgLevel[Object.keys(sp.dmgLevel).map(Number).filter((n) => n <= pc.level).sort((x, y) => y - x)[0]] : '';
  const am = pc.mods[c.ability] || 0;
  // Magic Missile never misses: three darts, one more per slot level above 1st.
  if (sp.id === 'magic-missile' && targets.length) {
    const darts = 2 + lvl;
    const each = targets.map(() => 0);
    for (let n = 0; n < darts; n++) each[n % targets.length] += 1;
    targets.forEach((t, n) => {
      if (!each[n]) return;
      const d = rollDice(`${each[n]}d4+${each[n]}`, ctx.rng);
      if (t.kind === 'foe') { const r = damageFoe(s, ctx, t.o, d.total, 'force', { magical: true }); lines.push(`${each[n]} dart${each[n] > 1 ? 's' : ''} strike${each[n] > 1 ? '' : 's'} ${t.o.name} for ${r.taken} force damage${r.notes.length ? `, ${r.notes.join(', ')}` : ''}.`); }
      else { const r = damagePc(s, ctx, t.o, d.total, 'force'); lines.push(`${t.o.name} takes ${r.taken} force damage.`); }
    });
  } else if (sp.attack && dmgExpr && targets.length) {
    for (const t of targets.slice(0, 1)) {
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
        const res = t.kind === 'foe' ? damageFoe(s, ctx, t.o, d.total, sp.dmgType, { magical: true }) : damagePc(s, ctx, t.o, d.total, sp.dmgType);
        lines.push(`It ${r.kept === 20 ? 'strikes true, a critical hit,' : 'hits'} ${t.o.name} for ${res.taken} ${sp.dmgType} damage${res.notes.length ? `, ${res.notes.join(', ')}` : ''}.`);
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
          const res = amount ? damageFoe(s, ctx, t.o, amount, sp.dmgType, { magical: true }) : { taken: 0, notes: [] };
          lines.push(`${t.o.name} ${ok ? 'resists' : 'fails to resist'}${amount ? `: ${res.taken} ${sp.dmgType} damage${res.notes.length ? `, ${res.notes.join(', ')}` : ''}` : ''}.`);
        } else lines.push(`${t.o.name} ${ok ? 'resists the spell' : 'is caught by the spell'}.`);
      } else {
        s.requests.push({ id: nextId(s, 'q'), pcId: t.id, kind: 'save', ability: sp.save.ability, skill: '', dc: c.dc, adv: '', reason: `${sp.name} from ${pc.name}`, by: 'engine', t: ctx.now || 0, effect: d ? { dmg: String(d.total), type: sp.dmgType, half: sp.save.success === 'half', cond: '' } : null });
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
      lines.push(`Spell attack: ${r.kept + c.atk} to hit, ${r.kept === 20 ? 'a critical hit (roll the damage dice again), ' : ''}${d.total} ${sp.dmgType || ''} damage if it hits.`);
    } else {
      addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'dice', label: `${sp.name} damage`, dice: d.dice, mod: d.flat, total: d.total });
      lines.push(`${d.total} ${sp.dmgType || ''} damage${sp.save ? ` (a DC ${c.dc} ${R.ABILITY_NAMES[sp.save.ability]} save${sp.save.success === 'half' ? ' halves it' : ' avoids it'})` : ''}.`);
    }
  } else if (sp.heal && !targets.length) {
    const d = rollDice((sp.heal[lvl] || sp.heal[sp.level] || '').replace(/MOD/i, String(am)) + (pc.subclass === 'life' && lvl > 0 ? `+${2 + lvl}` : ''), ctx.rng);
    addRoll(s, ctx, { who: pc.name, pcId: pc.id, kind: 'heal', label: sp.name, dice: d.dice, mod: d.flat, total: d.total });
    lines.push(`It restores ${d.total} hit points.`);
  }
  story(s, ctx, 'event', lines.join(' '), 'Engine', { roll: true });
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
  if (!r) no(`${pc.name} has no ${a.id}.`);
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
    const t = target(s, a.target) || { kind: 'pc', o: pc };
    if (t.kind !== 'pc') no('Lay on Hands heals a character.');
    const got = healPc(s, ctx, t.o, n);
    story(s, ctx, 'event', `${pc.name} lays healing hands on ${t.o.name}: ${got} hit points restored.`, 'Engine');
    return;
  }
  if (r.id === 'breath') {
    const targets = (a.targets || []).map((x) => target(s, x)).filter((t) => t && t.kind === 'foe');
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
  const m = ix.monster[key] || ix.monster[key.replace(/\s+/g, '-')] || ctx.srd.monsters.find((x) => x.name.toLowerCase() === key);
  if (!m) no(`There is no monster called "${a.monster}" in the SRD. Try one of: ${ctx.srd.monsters.filter((x) => x.name.toLowerCase().includes(key.split(/\s+/)[0] || '')).slice(0, 8).map((x) => x.id).join(', ') || 'goblin, wolf, skeleton, zombie, orc'}.`);
  const count = Math.max(1, Math.min(12, Math.trunc(Number(a.count) || 1)));
  if (ctx.ai && Object.values(s.foes).filter((f) => !f.dead && f.siteId === s.scene.siteId).length + count > 12) no('That is too many monsters in one place.');
  const base = str(a.name, 30) || m.name;
  const same = Object.values(s.foes).filter((f) => f.base === base).length;
  const out = [];
  for (let n = 0; n < count; n++) {
    const id = nextId(s, 'f');
    const label = count > 1 || same ? `${base} ${same + n + 1}` : base;
    const hp = a.rollHp ? rollDice(m.hd, ctx.rng).total || m.hp : m.hp;
    s.foes[id] = { id, mid: m.id, base, name: label, siteId: a.siteId || s.scene.siteId, hp, maxHp: hp, ac: m.ac, dexMod: R.mod(m.ab[1]), xp: m.xp, cr: m.cr, conds: [], dead: false, hidden: !!a.hidden, spent: {}, note: str(a.note, 200), legendary: m.legendary ? 3 : null };
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
  if (!list.length) no('Nothing is hidden here.');
  for (const f of list) f.hidden = false;
  story(s, ctx, 'event', `${list.map((f) => f.name).join(', ')} ${list.length > 1 ? 'are' : 'is'} revealed.`, 'Engine');
};
H['foe.remove'] = (s, a, ctx) => {
  hostOnly(ctx);
  const f = s.foes[a.foeId];
  if (!f) no('There is no such monster.');
  delete s.foes[f.id];
  if (s.fight) { const cur = currentKey(s); s.fight.order = s.fight.order.filter((o) => o.key !== keyOf('foe', f.id)); s.fight.turn = Math.max(0, s.fight.order.findIndex((o) => o.key === cur)); if (!s.fight.order.length) s.fight = null; }
  log(s, ctx, `${f.name} was removed.`);
};
H['foe.flee'] = (s, a, ctx) => {
  hostOnly(ctx);
  const f = s.foes[a.foeId];
  if (!f || f.dead) no('There is no such monster standing.');
  f.dead = true; f.fled = true;
  if (s.fight) s.fight.xp = (s.fight.xp || 0) + (f.xp || 0);
  story(s, ctx, 'event', `${f.name} flees.`, 'Engine');
};

// A monster's action from its stat block, against a character.
H['foe.act'] = (s, a, ctx) => {
  hostOnly(ctx);
  const foe = s.foes[a.foeId] || (target(s, a.foeId) || {}).o;
  if (!foe || foe.dead) no('Name a monster that is still standing.');
  const m = monsterOf(ctx, foe);
  const pool = [...(m.actions || []), ...(m.reactions || []), ...(m.legendary || [])];
  // The actions every creature has (PHB/SRD "Actions in Combat"), whatever its stat block lists.
  // Bench, 20 Nov: a goblin was refused "Disengage".
  const STD = { dash: 'Dash', disengage: 'Disengage', dodge: 'Dodge', hide: 'Hide', help: 'Help', ready: 'Ready', search: 'Search', 'use an object': 'Use an Object' };
  const stdKey = String(a.action || '').toLowerCase().trim();
  if (STD[stdKey]) {
    if (R.incapacitated(foe.conds)) no(`${foe.name} cannot act right now.`);
    if (ctx.ai && s.fight && s.fight.phase === 'turns') inTurnCheck(s, ctx, keyOf('foe', foe.id), 'act');
    story(s, ctx, 'event', `${foe.name} takes the ${STD[stdKey]} action.`, 'Engine');
    return;
  }
  const act = pool.find((x) => x.n.toLowerCase() === String(a.action || '').toLowerCase()) || pool.find((x) => x.n.toLowerCase().startsWith(String(a.action || '').toLowerCase().slice(0, 5)) && a.action);
  // A spell from the stat block's Spellcasting trait (bench 21 Nov: Brother Aldane's hold person and
  // spiritual weapon were refused three runs out of three).
  if (!act) {
    const book = monsterSpells(m, ctx.srd);
    const sp = book && book.spells.find((x) => x.name.toLowerCase() === String(a.action || '').toLowerCase().replace(/^cast(?:s|ing)?\s+/, '').trim());
    if (sp) { castMonsterSpell(s, ctx, foe, book, sp, a); return; }
  }
  if (!act) {
    const book = monsterSpells(m, ctx.srd);
    no(`${foe.name} has no action called "${a.action}". Its actions: ${pool.map((x) => x.n).join(', ')}${book ? `. Spells it can cast: ${book.spells.map((x) => x.name).join(', ')}` : ''}.`);
  }
  if (R.incapacitated(foe.conds)) no(`${foe.name} cannot act right now.`);
  const legendary = (m.legendary || []).includes(act);
  if (ctx.ai && s.fight && s.fight.phase === 'turns' && !legendary && !(m.reactions || []).includes(act)) inTurnCheck(s, ctx, keyOf('foe', foe.id), 'act');
  if (act.use && /^Recharge/.test(act.use)) { if (foe.spent[act.n]) no(`${foe.name}'s ${act.n} has not recharged.`); foe.spent[act.n] = true; }
  if (/^\d+\/day/.test(act.use || '')) { const max = Number(act.use.split('/')[0]); foe.uses = foe.uses || {}; if ((foe.uses[act.n] || 0) >= max) no(`${foe.name} has used ${act.n} as often as it can today.`); foe.uses[act.n] = (foe.uses[act.n] || 0) + 1; }
  if (act.n === 'Multiattack') { story(s, ctx, 'event', `${foe.name} attacks several times.`, 'Engine'); return; }
  const targets = (a.targets || (a.target ? [a.target] : [])).map((x) => target(s, x)).filter((t) => t && t.kind === 'pc');
  if (act.hit != null) {
    const t = targets[0];
    if (!t) no(`Name the character ${foe.name} attacks: ${Object.values(s.pcs).filter((p) => !p.dead).map((p) => `${p.id} (${p.name})`).join(', ')}.`);
    const pc = t.o;
    if (pc.dead) no(`${pc.name} is dead.`);
    const melee = /Melee/.test(act.d);
    const self = R.selfEffects({ conds: foe.conds }, 'attack');
    const tfx = R.targetEffects(pc.conds, { melee });
    const r = d20(ctx.rng, { adv: a.adv === 'adv' || self.adv || tfx.adv, dis: a.adv === 'dis' || self.dis || tfx.dis });
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
        const res = damagePc(s, ctx, pc, d.total, type, { crit });
        sum += res.taken;
        parts.push(`${res.taken} ${type}${res.notes.length ? ` (${res.notes.join(', ')})` : ''}`);
      }
      dmgRow = { total: sum };
      text += `${crit ? ': a critical hit' : ': a hit'} for ${parts.join(' and ') || 'no'} damage.`;
      // A rider with a saving throw ("must succeed on a DC 11 Strength saving throw or be knocked prone").
      const rider = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw or be(?:come)? (?:knocked )?(\w+)/i.exec(act.d);
      if (rider && !pc.dead) {
        const ab = rider[2].slice(0, 3).toLowerCase();
        const cond = rider[3].toLowerCase();
        if (R.index(ctx.srd).cond[cond]) {
          s.requests.push({ id: nextId(s, 'q'), pcId: pc.id, kind: 'save', ability: ab, skill: '', dc: Number(rider[1]), adv: '', reason: `${foe.name}'s ${act.n}: resist being ${cond}.`, by: 'engine', t: ctx.now || 0, effect: { dmg: '', type: '', half: false, cond } });
          text += ` ${pc.name} must save or be ${cond}.`;
        }
      }
    } else text += r.kept === 1 ? ' and fumbles.' : ' and misses.';
    addRoll(s, ctx, { who: foe.name, foeId: foe.id, kind: 'attack', label: `${act.n} vs ${pc.name}`, dice: r.rolls, mod: act.hit, total, at: pc.ac, success: hit, crit, mode: r.mode, dmg: dmgRow, secret: true });
    story(s, ctx, 'event', text, 'Engine', { roll: true });
    return;
  }
  if (act.dc) {
    if (!targets.length) no(`Name who ${act.n} catches: ${Object.values(s.pcs).filter((p) => !p.dead).map((p) => `${p.id} (${p.name})`).join(', ')}.`);
    const [ab, dc, success] = act.dc;
    const d = act.dmg && act.dmg.length ? rollDice(act.dmg[0][0], ctx.rng) : null;
    const condM = /\b(?:be|become|is) (?:knocked )?(blinded|charmed|deafened|frightened|grappled|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious)\b/i.exec(act.d);
    for (const t of targets) {
      s.requests.push({ id: nextId(s, 'q'), pcId: t.id, kind: 'save', ability: ab, skill: '', dc, adv: '', reason: `${foe.name}'s ${act.n}`, by: 'engine', t: ctx.now || 0,
        effect: { dmg: d ? String(d.total) : '', type: d ? act.dmg[0][1] : '', half: success === 'half', cond: condM ? condM[1].toLowerCase() : '' } });
    }
    story(s, ctx, 'event', `${foe.name} uses ${act.n}! ${targets.map((t) => t.o.name).join(', ')} must make a ${R.ABILITY_NAMES[ab]} saving throw.`, 'Engine');
    return;
  }
  story(s, ctx, 'event', `${foe.name} uses ${act.n}.`, 'Engine');
};
// ---- monsters that cast spells (the Spellcasting trait of the SRD stat block) ----
const CONDS = ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
export function monsterSpells(m, srd) {
  const tr = (m.traits || []).find((t) => /^(Innate )?Spellcasting/i.test(t.n));
  if (!tr) return null;
  const dc = Number((/spell save DC (\d+)/i.exec(tr.d) || [])[1]) || 10;
  const hit = Number((/([+-]\d+) to hit with spell attacks/i.exec(tr.d) || [])[1]) || 0;
  const lvl = Number((/(\d+)(?:st|nd|rd|th)-level spellcaster/i.exec(tr.d) || [])[1]) || 1;
  const ix = R.index(srd).spell;
  const spells = [];
  const slots = {};
  for (const line of tr.d.split(/\n/)) {
    const head = /^-?\s*(Cantrips|(\d)(?:st|nd|rd|th) level)\s*(?:\((\d+) slots?\)|\(at will\))?\s*:\s*(.+)$/i.exec(line.trim());
    if (!head) continue;
    const level = /cantrip/i.test(head[1]) ? 0 : Number(head[2]);
    if (level && head[3]) slots[level] = Number(head[3]);
    for (const name of head[4].split(',').map((x) => x.replace(/\*/g, '').trim()).filter(Boolean)) {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const sp = ix[id];
      spells.push({ id, name: sp ? sp.name : name.replace(/\b\w/g, (c) => c.toUpperCase()), level: sp ? sp.level : level, data: sp || null });
    }
  }
  return spells.length ? { dc, hit, casterLevel: lvl, slots, spells, mod: hit - (m.pb || 2) } : null;
}
function castMonsterSpell(s, ctx, foe, book, sp, a) {
  if (R.incapacitated(foe.conds)) no(`${foe.name} cannot act right now.`);
  if (ctx.ai && s.fight && s.fight.phase === 'turns') inTurnCheck(s, ctx, keyOf('foe', foe.id), 'act');
  const d = sp.data || {};
  if (sp.level > 0) {
    foe.slotsUsed = foe.slotsUsed || {};
    const have = book.slots[sp.level] || 0;
    if ((foe.slotsUsed[sp.level] || 0) >= have) no(`${foe.name} has no ${R.ordinal(sp.level)}-level spell slots left. ${book.spells.filter((x) => x.level === 0).length ? `Its cantrips: ${book.spells.filter((x) => x.level === 0).map((x) => x.name).join(', ')}.` : ''}`);
    foe.slotsUsed[sp.level] = (foe.slotsUsed[sp.level] || 0) + 1;
  }
  const targets = (a.targets || (a.target ? [a.target] : [])).map((x) => target(s, x)).filter((t) => t && t.kind === 'pc' && !t.o.dead);
  const desc = String(d.desc || '');
  // Damage: the first "XdY type damage" the spell describes; a cantrip grows at caster levels 5, 11, 17.
  const dm = /(\d+)d(\d+)(?:\s*\+\s*your spellcasting ability modifier)?\s+(\w+) damage/i.exec(desc);
  let dmgExpr = '';
  let dtype = '';
  if (dm) {
    const n = Number(dm[1]) * (sp.level === 0 ? 1 + [5, 11, 17].filter((x) => book.casterLevel >= x).length : 1);
    dmgExpr = `${n}d${dm[2]}${/spellcasting ability modifier/i.test(dm[0]) ? `+${Math.max(0, book.mod)}` : ''}`;
    dtype = dm[3].toLowerCase();
  }
  if (d.attack) {
    const t = targets[0];
    if (!t) no(`Name the character ${foe.name}'s ${sp.name} is aimed at: ${Object.values(s.pcs).filter((p) => !p.dead).map((p) => `${p.id} (${p.name})`).join(', ')}.`);
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
    if (!targets.length) no(`Name who ${foe.name}'s ${sp.name} is aimed at: ${Object.values(s.pcs).filter((p) => !p.dead).map((p) => `${p.id} (${p.name})`).join(', ')}.`);
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
  if (!foe) no('There is no such monster.');
  const ab = String(a.ability || '').slice(0, 3).toLowerCase();
  if (!R.ABILITIES.includes(ab)) no('Choose an ability.');
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
  const t = target(s, a.target);
  if (!t) no('Name who takes the damage.');
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
  const t = target(s, a.target);
  if (!t) no('Name who is healed.');
  if (t.kind === 'foe') { hostOnly(ctx); const n = Math.max(0, Math.trunc(Number(a.amount) || 0)); t.o.hp = Math.min(t.o.maxHp, t.o.hp + n); if (t.o.hp > 0) t.o.dead = false; log(s, ctx, `${t.o.name} regains ${n} hit points.`, 'note-host'); return; }
  if (!isHost(ctx)) ownPc(s, ctx, t.id);
  let amount = Math.trunc(Number(a.amount));
  if (!(amount >= 0) && a.dice) amount = rollDice(a.dice, ctx.rng).total;
  if (!(amount >= 0)) no('Give the healing as a number or dice.');
  const got = healPc(s, ctx, t.o, amount);
  story(s, ctx, 'event', `${t.o.name} regains ${got} hit points${a.why ? ` (${str(a.why, 80)})` : ''}.`, 'Engine');
};
H['hp.temp'] = (s, a, ctx) => {
  const t = target(s, a.target);
  if (!t || t.kind !== 'pc') no('Temporary hit points go to a character.');
  if (!isHost(ctx)) ownPc(s, ctx, t.id);
  t.o.tempHp = Math.max(t.o.tempHp, Math.max(0, Math.trunc(Number(a.amount) || 0)));
};
H['hp.set'] = (s, a, ctx) => {
  const t = target(s, a.target);
  if (!t) no('Name who.');
  if (t.kind === 'foe' || !isHost(ctx)) { if (t.kind === 'foe') hostOnly(ctx); else ownPc(s, ctx, t.id); }
  const n = Math.max(0, Math.min(t.o.maxHp, Math.trunc(Number(a.hp))));
  if (t.kind === 'pc') { if (n > 0 && t.o.hp <= 0) healPc(s, ctx, t.o, n); else t.o.hp = n; }
  else { t.o.hp = n; t.o.dead = n <= 0; }
};
H['cond.add'] = (s, a, ctx) => {
  const t = target(s, a.target);
  if (!t) no('Name who.');
  if (t.kind === 'foe' || !isHost(ctx)) { if (t.kind === 'foe') hostOnly(ctx); else ownPc(s, ctx, t.id); }
  const c = String(a.cond || '').toLowerCase();
  if (c === 'exhaustion') {
    if (t.kind !== 'pc') no('Exhaustion is tracked for characters.');
    t.o.exhaustion = Math.min(6, (t.o.exhaustion || 0) + 1);
    if (t.o.exhaustion >= 6) t.o.dead = true;
    story(s, ctx, 'event', `${t.o.name} gains a level of exhaustion (${t.o.exhaustion}).${t.o.dead ? ' It is fatal.' : ''}`, 'Engine');
    return;
  }
  if (!R.index(ctx.srd).cond[c]) no(`There is no condition called "${a.cond}". Conditions: ${ctx.srd.conditions.map((x) => x.id).join(', ')}.`);
  if (t.kind === 'foe') { const m = monsterOf(ctx, t.o); if (m && (m.cimm || []).includes(c)) no(`${t.o.name} cannot be ${c}.`); }
  if (!t.o.conds.includes(c)) t.o.conds.push(c);
  if (t.kind === 'pc' && R.incapacitated(t.o.conds)) dropConcentration(s, ctx, t.o, c);
  story(s, ctx, 'event', `${t.o.name} is ${c}.`, 'Engine');
};
H['cond.remove'] = (s, a, ctx) => {
  const t = target(s, a.target);
  if (!t) no('Name who.');
  if (t.kind === 'foe' || !isHost(ctx)) { if (t.kind === 'foe') hostOnly(ctx); else ownPc(s, ctx, t.id); }
  const c = String(a.cond || '').toLowerCase();
  if (c === 'exhaustion') { t.o.exhaustion = Math.max(0, (t.o.exhaustion || 0) - 1); return; }
  if (c === 'unconscious' && t.kind === 'pc' && t.o.hp <= 0) no(`${t.o.name} is at 0 hit points: heal them to wake them.`);
  t.o.conds = t.o.conds.filter((x) => x !== c);
  story(s, ctx, 'event', `${t.o.name} is no longer ${c}.`, 'Engine');
};
H.stabilize = (s, a, ctx) => {
  const t = target(s, a.target);
  if (!t || t.kind !== 'pc') no('Name a dying character.');
  if (t.o.hp > 0 || t.o.dead) no(`${t.o.name} is not dying.`);
  if (!isHost(ctx)) { const p = s.players[ctx.pid]; if (!p || !p.pcId) no('Join with a character first.'); }
  t.o.stable = true; t.o.death = { s: 0, f: 0 };
  s.requests = s.requests.filter((q) => !(q.pcId === t.id && q.kind === 'death'));
  story(s, ctx, 'event', `${t.o.name} is stabilized.`, 'Engine');
};
H.inspiration = (s, a, ctx) => {
  const pc = s.pcs[a.pcId];
  if (!pc) no('There is no such character.');
  if (a.give !== false) hostOnly(ctx); else ownPc(s, ctx, pc.id);
  pc.inspiration = a.give !== false;
  story(s, ctx, 'event', a.give !== false ? `${pc.name} gains inspiration.` : `${pc.name} spends inspiration.`, 'Engine');
};

// ---- rests, time, treasure and the story's threads -------------------------------------------
H['rest.short'] = (s, a, ctx) => {
  const pc = ownPc(s, ctx, a.pcId);
  if (s.fight) no('You cannot rest during a fight.');
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
  if (s.fight) no('You cannot rest during a fight.');
  const who = a.pcId ? [ownPc(s, ctx, a.pcId)] : (hostOnly(ctx), Object.values(s.pcs));
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
  story(s, ctx, 'event', a.pcId ? `${who[0].name} finishes a long rest.` : 'The party takes a long rest and wakes refreshed.', 'Engine');
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
  const to = sites.find((x) => x.id === a.siteId) || sites.find((x) => x.name.toLowerCase() === String(a.siteId || '').toLowerCase());
  if (!to) no(`There is no place called "${a.siteId}". Places: ${sites.map((x) => x.id).join(', ')}.`);
  if (s.fight) no('Finish the fight before the party moves on (or end it if they flee).');
  const here = site(s, ctx);
  if (ctx.ai && to.id !== here.id && !(here.exits || []).some((e) => e.to === to.id)) no(`${to.name} cannot be reached from ${here.name}. Exits: ${(here.exits || []).map((e) => `${e.to} (${e.label})`).join(', ')}.`);
  if (!s.scene.visited.includes(here.id)) s.scene.visited.push(here.id);
  s.scene.siteId = to.id;
  const first = !s.scene.visited.includes(to.id);
  if (first) for (const enc of to.foes || []) H['foe.add'](s, { monster: enc.monster, count: enc.count, name: enc.name, hidden: true, note: enc.note, siteId: to.id }, { ...ctx, ai: false });
  if (to.travelHours) H['time.pass'](s, { hours: to.travelHours }, ctx);
  story(s, ctx, 'event', `The party arrives at ${to.name}.`, 'Engine', { move: true });
};

H['quest.add'] = (s, a, ctx) => { hostOnly(ctx); const text = str(a.text, 200); if (!text) no('Write the quest.'); s.quests.push({ id: nextId(s, 'q'), text, done: false }); story(s, ctx, 'event', `New quest: ${text}`, 'Engine'); };
H['quest.done'] = (s, a, ctx) => {
  hostOnly(ctx);
  const q = s.quests.find((x) => x.id === a.id) || s.quests.find((x) => x.text.toLowerCase().includes(String(a.id || '').toLowerCase()) && a.id);
  if (!q) no(`There is no such quest. Quests: ${s.quests.map((x) => `${x.id} (${x.text})`).join('; ')}.`);
  q.done = a.done !== false;
  if (q.done) story(s, ctx, 'event', `Quest complete: ${q.text}`, 'Engine');
};
H['xp.award'] = (s, a, ctx) => {
  hostOnly(ctx);
  const n = Math.max(0, Math.min(100000, Math.trunc(Number(a.amount) || 0)));
  if (!n) no('Give an amount of XP.');
  const who = (a.pcIds && a.pcIds.length ? a.pcIds.map((x) => s.pcs[x]).filter(Boolean) : Object.values(s.pcs)).filter((p) => !p.dead);
  if (!who.length) no('Nobody to award.');
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
  if (a.pcId && !pc) no('There is no such character.');
  const gold = Math.max(0, Math.min(1e6, Math.trunc(Number(a.gold) || 0)));
  const name = str(a.item, 60);
  if (!gold && !name) no('Give gold or an item.');
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

export const ACTIONS = Object.keys(H);

export function apply(state, action, ctx) {
  const h = H[action && action.type];
  if (!h) throw new RuleError(`Unknown action "${action && action.type}".`);
  const s = clone(state);
  s.seq += 1;
  s.t = ctx.now || 0;
  h(s, action, ctx);
  return s;
}

// ---- what each screen may see ------------------------------------------------------------------
export function viewFor(state, role, pid) {
  if (role === 'host') return state;
  const s = clone(state);
  delete s.notes;
  delete s.seeds;
  s.log = s.log.filter((l) => l.kind !== 'note-host');
  s.foes = Object.fromEntries(Object.values(s.foes).filter((f) => !f.hidden && f.siteId === s.scene.siteId).map((f) => [f.id, {
    id: f.id, name: f.name, mid: f.mid, conds: f.conds, dead: f.dead, fled: f.fled, health: R.healthWord(f.hp, f.maxHp), siteId: f.siteId,
  }]));
  s.rolls = s.rolls.map((r) => (r.secret ? { id: r.id, seq: r.seq, t: r.t, who: r.who, kind: r.kind, label: r.label, success: r.success, crit: r.crit, secret: true }
    : r.hideAt ? { ...r, at: null } : r));
  // A player sees their own requests with the reason, never the DC until it is resolved.
  s.requests = s.requests.filter((q) => { const p = s.players[pid]; return p && p.pcId === q.pcId; }).map((q) => ({ ...q, dc: q.kind === 'death' ? 10 : null, effect: q.effect ? { concentration: q.effect.concentration } : null }));
  s.rolls = s.rolls.map((r) => ({ ...r, at: r.kind === 'death' ? r.at : (r.at != null && r.kind !== 'attack' ? null : r.at) }));
  return s;
}

export { average };
