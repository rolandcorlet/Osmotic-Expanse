// The Ledger: the one shared game state, and every change that can be made to it.
// apply(state, action, ctx) returns a new state or throws a RuleError the screens show as is.
// The Engine does all arithmetic; the Director (a person or the AI) only asks for things.
//
// ctx: { role: 'host' | 'player', pid, ai, rng, now, mod }   (mod: the prepared module, engine/module.js)

import { damageFromRoll, strainPenalty, snagRow, maxHealth, statBonus, getSystem, makeSource } from './core.js';
import { difficulty, ladderName, term } from './module.js';
import * as TRIG from './triggers.js';
import * as SEEDS from './seeds.js';
import * as SCALE from './scale.js';
import * as MAP from './map.js';
import { artFor } from './pictures.js';

export class RuleError extends Error {}
const no = (msg) => { throw new RuleError(msg); };
const str = (x, n = 2000) => String(x == null ? '' : x).trim().slice(0, n);
const nextId = (s, p) => `${p}${s.nextId++}`;
const isHost = (ctx) => ctx.role === 'host';
const hostOnly = (ctx) => { if (!isHost(ctx)) no('Only the Director can do that.'); };

// ------------------------------------------------------------------ a new game
export function newSession(mod, adventureId) {
  const adv = mod.ix.adventure[adventureId] || mod.adventures[0];
  if (!adv) no('This module has no adventure to play.');
  const s = {
    v: 1, gameId: `g${Date.now().toString(36)}`, moduleId: mod.module.id, adventureId: adv.id, seq: 0, nextId: 1,
    players: {}, chars: {}, creatures: {},
    scene: { siteId: adv.start, visited: [] },
    quests: (adv.quests || []).map((q) => ({ id: q.id, text: q.text, done: false })),
    clocks: (adv.clocks || []).map((c) => ({ id: c.id, name: c.name, size: c.size, filled: 0 })),
    fight: null, requests: [], rolls: [], story: [], hostNotes: '', seeds: [], seedLog: [], restCount: 0,
    words: [], // the module's own words the table has met (engine/words.js)
    director: { mode: 'off' },
    map: MAP.newMap(), // zones and squares (engine/map.js); everyone at the party's place is placed after each change
  };
  placeSite(s, { mod, now: 0 }, adv.start);
  story(s, { now: 0 }, 'event', `${adv.name}. ${adv.intro}`, 'Engine');
  return s;
}

const adventureOf = (s, mod) => mod.ix.adventure[s.adventureId] || mod.adventures[0];
const siteOf = (s, mod, id = s.scene.siteId) => (adventureOf(s, mod).sites || []).find((x) => x.id === id);

export function apply(state, action, ctx) {
  const h = H[action && action.type];
  if (!h) no(`Unknown action "${action && action.type}".`);
  const s = structuredClone(state);
  const c = { ...ctx, events: [] };
  const asked = new Set((state.requests || []).map((q) => q.id));
  h(s, action, c);
  endSpentTurn(state, s, c);
  // The adventure's own rules (engine/triggers.js), after every change. They never stop the game.
  try { runRules(s, c); } catch (e) { if (!(e instanceof RuleError)) throw e; }
  try { announceRolls(s, c, asked); } catch (e) { /* never stops the game */ }
  // Everyone at the party's place has a square on the map. The map must never stop the game.
  try { placeEveryone(s, c); } catch (e) { /* a broken map is redrawn next time */ }
  s.seq += 1;
  return s;
}

// A player character who has used every action this turn has nothing left to do in it (Gull Rock bench, 27 Nov:
// with one action a turn, the Director tried to end the turn or strike back eighteen times while the turn sat
// open waiting for the player's button). The Engine ends it, unless a roll for them is still waiting.
function endSpentTurn(before, s, ctx) {
  const key = before.fight && currentKey(before);
  if (!s.fight || !key || !key.startsWith('char:') || currentKey(s) !== key) return;
  const max = Number(((ctx.mod.rules || {}).combat || {}).actionsPerTurn) || 1;
  const used = s.fight.used || 0;
  const waiting = (st) => (st.requests || []).some((q) => keyOf('char', q.charId) === key);
  if (used < max || waiting(s)) return;
  // Only when this change spent the last action, or rolled the last roll that was holding the turn open.
  if (used <= (before.fight.used || 0) && !waiting(before)) return;
  const round = s.fight.round;
  advance(s, ctx);
  if (s.fight.round > round && ctx.events) ctx.events.push({ ev: 'round', site: s.scene.siteId });
  story(s, ctx, 'event', `${nameOf(s, key)} has used every action this turn. ${nameOf(s, currentKey(s))} is up (round ${s.fight.round}).`, 'Engine', { quiet: true });
}

// Every roll asked of a player is said in the story, with what it is for, whoever asked it (the Director, the
// host or the Engine), so the table hears it too (Roly, 27 Nov).
function announceRolls(s, ctx, before) {
  const { mod } = ctx;
  const groups = new Map();
  for (const q of (s.requests || []).filter((x) => !before.has(x.id))) { const k = `${q.stat}|${q.skill}|${q.at}|${q.reason || ''}`; groups.set(k, [...(groups.get(k) || []), q]); }
  for (const list of groups.values()) {
    const q = list[0];
    const names = list.map((x) => (s.chars[x.charId] || {}).name).filter(Boolean);
    if (!names.length) continue;
    const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const label = `${(mod.ix.stat[q.stat] || {}).name || q.stat}${q.skill ? ` + ${(mod.ix.skill[q.skill] || {}).name || q.skill}` : ''}`;
    const why = String(q.reason || '').trim().replace(/\.$/, '');
    story(s, ctx, 'event', `Roll asked: ${who}, ${label} (${ladderName(mod, q.at).replace(/\s*\([^)]*\)$/, '')})${why ? `, for this: ${why}` : ''}.`, 'Engine', { roll: true, ask: list.map((x) => x.id) });
  }
}

// ------------------------------------------------------------------ the adventure's own rules
const lowerName = (x) => String(x || '').toLowerCase().replace(/\s+\d+$/, '');
function creaturesNamed(s, ctx, siteId, who) {
  const w = String(who || '').toLowerCase();
  return Object.values(s.creatures).filter((k) => (!siteId || k.siteId === siteId) && (k.base === w || lowerName(k.name) === w || lowerName(k.name).includes(w)));
}
// What a character carries: their gear (ids and names from the module) and the things rules gave them.
function carries(s, ctx, ch, what) {
  const w = String(what || '').toLowerCase().trim();
  if (!ch || !w) return false;
  const names = [...(ch.gear || []).flatMap((g) => [g, ((ctx.mod.ix.gear || {})[g] || {}).name]), ...(ch.items || [])].filter(Boolean).map((x) => String(x).toLowerCase());
  return names.some((n) => n === w || n.includes(w));
}
function holds(s, ctx, rule, c, ev = null) {
  const site = rule.site || s.scene.siteId;
  let v = false;
  switch (c.k) {
    // The character who used the object; for other moments, anyone in the party.
    case 'carries': v = ev && ev.char ? carries(s, ctx, s.chars[ev.char], c.arg) : Object.values(s.chars).some((ch) => carries(s, ctx, ch, c.arg)); break;
    case 'from': v = s.scene.from === c.arg; break;
    case 'visited': v = s.scene.visited.includes(c.arg); break;
    case 'down': { const l = creaturesNamed(s, ctx, rule.site, c.arg); v = l.length > 0 && l.every((k) => k.down); break; }
    case 'standing': v = creaturesNamed(s, ctx, rule.site, c.arg).some((k) => !k.down); break;
    case 'quest': v = s.quests.some((q) => q.id === c.arg && q.done); break;
    case 'passed': case 'failed': { const o = [...(s.outcomes || [])].reverse().find((x) => x.site === site && (x.stat === c.arg || x.skill === c.arg)); v = !!o && (c.k === 'passed' ? o.ok : !o.ok); break; }
    case 'fight': v = !!s.fight; break;
    case 'no fight': v = !s.fight; break;
    default: v = false;
  }
  return c.not ? !v : v;
}
function stateHolds(s, ctx, r) {
  const ev = r.when;
  if (ev.ev === 'down') { const l = creaturesNamed(s, ctx, r.site, r.who); const n = l.filter((k) => k.down).length; return l.length > 0 && n >= (r.count || l.length); }
  if (ev.ev === 'cleared') { const l = Object.values(s.creatures).filter((k) => k.siteId === (r.site || s.scene.siteId) && !k.hidden); return l.length > 0 && l.every((k) => k.down); }
  if (ev.ev === 'full') { const c = s.clocks.find((x) => x.id === ev.arg); return !!c && c.filled >= c.size; }
  if (ev.ev === 'quest') return s.quests.some((q) => q.id === ev.arg && q.done);
  return false;
}
function fireRule(s, ctx, r, ev = null) {
  const host = { ...ctx, role: 'host', pid: null, ai: false };
  const tryH = (type, a) => { try { H[type](s, a, host); return true; } catch (e) { if (e instanceof RuleError) return false; throw e; } };
  const target = r.target || r.who;
  switch (r.do) {
    case 'fight': if (!s.fight) tryH('fight.start', {}); break;
    case 'flee': for (const k of creaturesNamed(s, ctx, r.site, target).filter((x) => !x.down)) tryH('creature.flee', { creature: k.id }); break;
    // It stops fighting, still there (the Tidewarden once the bell is rung): out of the fight, not beaten, no reward.
    case 'calm': for (const k of creaturesNamed(s, ctx, r.site, target).filter((x) => !x.down)) { k.down = true; k.calm = true; } break;
    case 'reveal': tryH('creature.reveal', { ids: target ? creaturesNamed(s, ctx, r.site, target).map((k) => k.id) : [] }); break;
    case 'tick': tryH('clock.tick', { id: r.clock, n: r.by || 1 }); break;
    case 'quest': tryH('quest.done', { id: r.quest }); break;
    case 'xp': tryH('xp.award', { amount: r.xp, why: r.say || 'what happened here' }); break;
    case 'add': tryH('creature.add', { base: r.creature, count: r.count || 1, siteId: r.site || s.scene.siteId, hidden: !!r.hidden }); break;
    // To whoever used the object (else the first standing): a gear id from the module goes in their gear,
    // anything else ("Brass key") in their items.
    case 'give': {
      const ch = (ev && ev.char && s.chars[ev.char]) || Object.values(s.chars).find((c) => !c.down);
      const item = str(r.item, 60);
      if (!ch || !item) break;
      const g = (ctx.mod.ix.gear || {})[item] || Object.values(ctx.mod.ix.gear || {}).find((x) => String(x.name || '').toLowerCase() === item.toLowerCase());
      if (g) ch.gear.push(g.id); else (ch.items = ch.items || []).push(item);
      story(s, ctx, 'event', `${ch.name} gets ${g ? g.name : item}.`, 'Engine');
      break;
    }
    default: break;
  }
  if (r.do !== 'xp' && r.xp) tryH('xp.award', { amount: r.xp, why: r.say || 'what happened here' });
  story(s, ctx, 'event', `${r.say || TRIG.ruleWords(r)} [rule ${r.key}]`, 'Engine', { rule: r.key });
}
function runRules(s, ctx) {
  const adv = adventureOf(s, ctx.mod);
  if (!adv) return;
  s.fired = s.fired || {};
  // The first place's "enter": when the game begins (the first change made).
  if (!s.fired['@start']) { s.fired['@start'] = s.seq + 1; ctx.events.unshift({ ev: 'enter', site: adv.start }); }
  for (let pass = 0; pass < 6; pass++) {
    const events = ctx.events.splice(0);
    let fired = false;
    for (const r of TRIG.rulesAt(adv, s.scene.siteId)) {
      if (r.once && s.fired[r.key]) continue;
      let set = false;
      let ev = null;
      if (TRIG.STATES.includes(r.when.ev)) set = stateHolds(s, ctx, r);
      else {
        // "use chest" is set off by using the Sea chest: the object this place's rule names, matched loosely.
        // A plain "enter" is the party arriving at the place, never a character stepping into a zone of it;
        // "enter pier end" is someone entering that zone (its id or its name).
        const argOk = (e) => (!r.when.arg ? !(r.when.ev === 'enter' && e.zone) : (e.args || []).includes(r.when.arg) || (r.when.ev === 'use' && (e.args || []).some((x) => x.includes(r.when.arg) || r.when.arg.includes(x))));
        ev = events.find((e) => e.ev === r.when.ev && argOk(e) && (!e.site || !r.site || e.site === r.site)) || null;
        set = !!ev;
      }
      if (!set || !r.conds.every((c) => holds(s, ctx, r, c, ev))) continue;
      s.fired[r.key] = s.seq + 1;
      fireRule(s, ctx, r, ev);
      fired = true;
    }
    if (!fired && !ctx.events.length) break;
  }
}

// ------------------------------------------------------------------ helpers
function story(s, ctx, kind, text, who = '', extra = {}) {
  s.story.push({ id: nextId(s, 'e'), seq: s.seq, t: ctx.now || 0, kind, who, text: str(text, 6000), ...extra });
  if (s.story.length > 400) s.story = s.story.slice(-400);
}
function addRoll(s, ctx, r) {
  s.rolls.push({ id: nextId(s, 'r'), seq: s.seq, t: ctx.now || 0, ...r });
  if (s.rolls.length > 200) s.rolls = s.rolls.slice(-200);
  return s.rolls[s.rolls.length - 1];
}
// A character or creature from an id ("c1", "k3", "char:c1"), or a name.
export function target(s, ref) {
  let r = str(ref).replace(/^(char|pc|creature|foe):/, '');
  // An id with its name after it, as the briefing writes them: "k72 Drowned choir", "c2 (Moll Tarrow)".
  const lead = /^([ck]\d+)\b[\s(:,-]/.exec(r);
  if (lead && (s.chars[lead[1]] || s.creatures[lead[1]])) r = lead[1];
  if (s.chars[r]) return { kind: 'char', id: r, o: s.chars[r] };
  if (s.creatures[r]) return { kind: 'creature', id: r, o: s.creatures[r] };
  const low = r.toLowerCase();
  const c = Object.values(s.chars).find((x) => x.name.toLowerCase() === low);
  if (c) return { kind: 'char', id: c.id, o: c };
  const k = Object.values(s.creatures).find((x) => x.name.toLowerCase() === low && !x.down)
    || Object.values(s.creatures).find((x) => x.name.toLowerCase().startsWith(low) && low && !x.down && x.siteId === s.scene.siteId);
  if (k) return { kind: 'creature', id: k.id, o: k };
  return null;
}
const ownChar = (s, ctx, id) => {
  const c = s.chars[id];
  if (!c) no('There is no such character.');
  if (!isHost(ctx) && c.playerId !== ctx.pid) no('That is not your character.');
  return c;
};
const nameOf = (s, key) => { if (!key) return ''; const [k, id] = key.split(':'); return k === 'char' ? (s.chars[id] || {}).name : (s.creatures[id] || {}).name; };
const condMods = (mod, conds) => conds.map((c) => mod.ix.cond[c]).filter((c) => c && (c.dice ?? c.mod)).map((c) => ({ label: c.name, dice: c.dice ?? c.mod }));
const armourOf = (mod, ch) => ch.gear.map((g) => mod.ix.gear[g]).filter((g) => g && g.kind === 'armour');
export function charDefence(mod, ch) {
  const d = mod.rules.defence;
  return d.base + (d.stat ? statBonus(mod.rules, ch.stats[d.stat]) : 0) + armourOf(mod, ch).reduce((a, g) => a + (g.defence || 0), 0) + (ch.braced ? 2 : 0);
}
export const charSoak = (mod, ch) => armourOf(mod, ch).reduce((a, g) => a + (g.soak || 0), 0);

// What a character rolls for stat + skill, with conditions and strain, in the module's dice system.
export function poolFor(mod, ch, stat, skill, extra = []) {
  if (!mod.ix.stat[stat]) no(`There is no stat "${stat}". Stats: ${mod.rules.stats.map((x) => x.id).join(', ')}.`);
  if (skill && !mod.ix.skill[skill]) no(`There is no skill "${skill}". Skills: ${mod.rules.skills.map((x) => x.id).join(', ')}.`);
  const mods = [...condMods(mod, ch.conds), ...extra];
  const sp = strainPenalty(mod.rules, ch.strain);
  if (sp) mods.push({ label: `${term(mod, 'strain')} ${ch.strain}`, dice: sp });
  const S = getSystem(mod.rules);
  return S.sys.spec(S.o, { stat: ch.stats[stat] ?? 0, skill: skill ? (ch.skills[skill] || 0) : 0, mods });
}
// A creature's attack (or anything rated by a single number), in the module's dice system.
export function poolForRating(mod, rating, conds = []) {
  const S = getSystem(mod.rules);
  return S.sys.spec(S.o, { rating, mods: condMods(mod, conds) });
}
// Roll a spec against a difficulty. own: the player's own dice, typed in.
export function rollSpec(mod, ctx, spec, at, own) {
  const S = getSystem(mod.rules);
  try { return { ...S.sys.roll(S.o, spec, at, makeSource(ctx.rng, own)), at, pool: spec.label, system: S.id }; } catch (e) { no(e.message); }
}
// The ladder's standard rung (its second, or the one named Standard): the default difficulty.
export function standardAt(mod) {
  const L = mod.rules.ladder || [];
  const named = L.find((x) => /^(standard|medium|regular|average|routine)$/i.test(x.name));
  return (named || L[1] || L[0] || { at: 12 }).at;
}
const verdict = (r) => (r.success ? (r.partial ? 'a partial success' : 'success') : 'failure');

// Each snag marks 1 strain; at the maximum, the module's breakdown.
function markStrain(s, ctx, ch, n) {
  const { mod } = ctx;
  const max = mod.rules.strain.max;
  ch.strain = Math.max(0, ch.strain + n);
  if (ch.strain >= max) {
    const shaken = mod.rules.conditions.find((c) => /shaken|stress|fright|fear|panic/i.test(`${c.id} ${c.name}`));
    ch.strain = Math.max(0, Math.ceil(max / 2));
    if (shaken && !ch.conds.includes(shaken.id)) ch.conds.push(shaken.id);
    story(s, ctx, 'event', `${ch.name} reaches the limit of ${term(mod, 'strain')}. ${mod.rules.strain.atMax || ''}`, 'Engine');
  }
}

function hurtChar(s, ctx, ch, n) {
  const amt = Math.max(0, Math.round(n));
  ch.health = Math.max(0, ch.health - amt);
  const notes = [];
  if (ch.health === 0 && !ch.down) { ch.down = true; notes.push(`${ch.name} is down`); }
  return { taken: amt, notes };
}
function hurtCreature(s, ctx, k, n) {
  const amt = Math.max(0, Math.round(n));
  k.health = Math.max(0, k.health - amt);
  const notes = [];
  if (k.health === 0 && !k.down) {
    k.down = true; k.conds = []; notes.push(`${k.name} falls`);
    if (s.fight) s.fight.xp = (s.fight.xp || 0) + (k.xp || 0);
  }
  return { taken: amt, notes };
}

function placeSite(s, ctx, siteId) {
  const site = siteOf(s, ctx.mod, siteId);
  if (!site || s.scene.visited.includes(siteId)) return;
  s.scene.visited.push(siteId);
  autoArt(s, ctx, [['site', siteId]]); // the first time here: the place's own picture, if the book had one
  // A creature the adventure puts in one zone ("zone": "pier-end") starts there on the map.
  (site.creatures || []).forEach((c, n) => { for (const k of addCreatures(s, ctx, c.id, c.count || 1, siteId, !!c.hidden)) { k.group = `${siteId}#${n}`; if (c.zone) k.zone0 = String(c.zone); } });
}
// Fit a place's fight to the party at the table (engine/scale.js), once, before anyone is hurt: fewer creatures,
// then their health, then their blows. The adventure's `party` says who it is written for (three to five of its
// first level when it does not); `fit: false` on the adventure, or s.fitOff, keeps every fight as written.
function fitCreatures(s, ctx, siteId) {
  s.fits = s.fits || {};
  const adv = adventureOf(s, ctx.mod);
  if (s.fitOff || adv.fit === false || s.fits[siteId]) return;
  const site = siteOf(s, ctx.mod, siteId);
  const placed = Object.values(s.creatures).filter((k) => k.siteId === siteId && k.group);
  const levels = Object.values(s.chars).filter((c) => !c.down).map((c) => c.level || 1);
  if (!site || !placed.length || !levels.length) return;
  if (placed.some((k) => k.down || k.health < k.healthMax)) { s.fits[siteId] = { text: '' }; return; }
  const groups = (site.creatures || []).map((c, n) => ({ key: `${siteId}#${n}`, id: c.id, count: placed.filter((k) => k.group === `${siteId}#${n}`).length, scalable: c.scale !== false })).filter((g) => g.count > 0);
  const plan = SCALE.planFight({ groups, designed: SCALE.designedParty(adv), levels, ix: ctx.mod.ix.creature });
  if (!plan) { s.fits[siteId] = { text: '' }; return; }
  const lines = [];
  for (const g of groups) {
    const mine = placed.filter((k) => k.group === g.key).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    const want = plan.counts[g.key];
    if (want < mine.length) for (const k of mine.slice(want)) delete s.creatures[k.id];
    if (want > mine.length) for (const k of addCreatures(s, ctx, g.id, want - mine.length, siteId, mine[0].hidden)) k.group = g.key;
    if (want !== mine.length) lines.push(`${ctx.mod.ix.creature[g.id].name}: ${want} (written ${mine.length})`);
  }
  const mineNow = Object.values(s.creatures).filter((k) => k.siteId === siteId && k.group);
  if (plan.health !== 1) { for (const k of mineNow) { k.healthMax = Math.max(1, Math.round(k.healthMax * plan.health)); k.health = k.healthMax; } lines.push(`${term(ctx.mod, 'health')} x${plan.health}`); }
  if (plan.blows !== 1) { for (const k of mineNow) k.blows = plan.blows; lines.push(`their blows x${plan.blows}`); }
  const d = SCALE.designedParty(adv);
  const text = `Fitted to this party: written for ${d.size[0] === d.size[1] ? d.size[0] : `${d.size[0]} to ${d.size[1]}`} at level ${d.level}, the party here is ${levels.length} at level ${levels.join(', ')}. ${lines.join('; ')}. (${plan.ratingBefore} as written for them; ${plan.rating} now.)`;
  s.fits[siteId] = { text, plan };
  story(s, ctx, 'host', text, 'Engine');
}
function addCreatures(s, ctx, base, count, siteId, hidden) {
  const b = ctx.mod.ix.creature[base];
  if (!b) no(`There is no creature "${base}" in the bestiary. It has: ${ctx.mod.bestiary.creatures.map((c) => c.id).join(', ')}.`);
  const same = Object.values(s.creatures).filter((k) => k.base === base).length;
  // Never two with one name (the D&D bench, 27 Nov: two "Drowned villager 1" after a fit removed some): the
  // first number nobody has.
  const taken = new Set(Object.values(s.creatures).map((k) => k.name));
  const out = [];
  for (let i = 0; i < Math.min(12, Math.max(1, count)); i++) {
    const id = nextId(s, 'k');
    let name = count > 1 || same ? `${b.name} ${same + i + 1}` : b.name;
    for (let k = 1; taken.has(name); k++) name = `${b.name} ${k}`;
    taken.add(name);
    s.creatures[id] = { id, base, name, siteId, health: b.health, healthMax: b.health, soak: b.soak || 0, defence: b.defence, xp: b.xp || 0, conds: [], down: false, hidden };
    out.push(s.creatures[id]);
  }
  return out;
}

// ------------------------------------------------------------------ the fight
const keyOf = (kind, id) => `${kind}:${id}`;
export function currentKey(s) { return s.fight && s.fight.order.length ? s.fight.order[s.fight.turn].key : null; }
function inTurn(s, ctx, key) {
  if (!s.fight) return;
  if (isHost(ctx) && !ctx.ai) return; // a human Director may always step in
  if (currentKey(s) !== key) no(`It is not ${nameOf(s, key)}'s turn. Acting now: ${nameOf(s, currentKey(s)) || 'nobody'}.`);
}
function spendAction(s, ctx, key) {
  if (!s.fight || (isHost(ctx) && !ctx.ai)) return;
  const max = ctx.mod.rules.combat.actionsPerTurn;
  s.fight.used = (s.fight.used || 0) + 1;
  if (s.fight.used > max) no(`${nameOf(s, key)} has used all ${max} actions this turn. End the turn.`);
}
function startOfTurn(s, ctx) {
  const k = currentKey(s);
  s.fight.used = 0;
  s.fight.moved = 0; // squares moved this turn (the map)
  if (!k) return;
  const [kind, id] = k.split(':');
  const o = kind === 'char' ? s.chars[id] : s.creatures[id];
  if (o) o.braced = false;
  // A condition that hurts at the start of a turn (the module says so in words: "lose 1 ... at the start").
  for (const c of (o && o.conds) || []) {
    const def = ctx.mod.ix.cond[c];
    const m = def && /lose (\d+) [^.]*at the start of (?:each of )?(?:your|its|their) turn/i.exec(def.effect);
    if (m) {
      const r = kind === 'char' ? hurtChar(s, ctx, o, Number(m[1])) : hurtCreature(s, ctx, o, Number(m[1]));
      story(s, ctx, 'event', `${o.name} is ${def.name}: ${r.taken} lost${r.notes.length ? `, ${r.notes.join(', ')}` : ''}.`, 'Engine');
    }
  }
}
function live(s, key) {
  const [kind, id] = key.split(':');
  const o = kind === 'char' ? s.chars[id] : s.creatures[id];
  return o && !o.down && !o.gone && !o.hidden;
}
function advance(s, ctx) {
  const f = s.fight;
  for (let i = 0; i < f.order.length; i++) {
    f.turn += 1;
    if (f.turn >= f.order.length) { f.turn = 0; f.round += 1; }
    if (live(s, f.order[f.turn].key)) break;
  }
  startOfTurn(s, ctx);
}

// ------------------------------------------------------------------ handlers
const H = {};

H.join = (s, a, ctx) => {
  if (!ctx.pid) no('No player id.');
  const name = str(a.name, 40) || 'Player';
  s.players[ctx.pid] = { ...(s.players[ctx.pid] || { charId: null }), id: ctx.pid, name };
};

function makeChar(s, ctx, pid, input, { pregen = false } = {}) {
  const { mod } = ctx;
  const R = mod.rules;
  const o = mod.ix.origin[input.origin];
  const c = mod.ix.calling[input.calling];
  if (!o) no(`Choose an origin: ${mod.handbook.origins.map((x) => x.name).join(', ')}.`);
  if (!c) no(`Choose a calling: ${mod.handbook.callings.map((x) => x.name).join(', ')}.`);
  const name = str(input.name, 40);
  if (!name) no('Give your character a name.');
  const stats = {};
  for (const st of R.stats) stats[st.id] = Math.trunc(Number((input.stats || {})[st.id])) || R.statPoints.start;
  const skills = {};
  for (const sk of R.skills) { const v = Math.trunc(Number((input.skills || {})[sk.id])) || 0; if (v) skills[sk.id] = v; }
  if (!pregen) {
    const spent = Object.values(stats).reduce((x, v) => x + v - R.statPoints.start, 0);
    for (const st of R.stats) if (stats[st.id] < R.statPoints.start || stats[st.id] > R.statPoints.max) no(`${st.name} must be from ${R.statPoints.start} to ${R.statPoints.max} before your origin's bonus.`);
    if (spent !== R.statPoints.spend) no(`Spend exactly ${R.statPoints.spend} stat points (you have spent ${spent}).`);
    // A calling's skills start at the first rank: 1 (or the step: 5% in percentile; a d4 in step dice).
    const first = R.skillPoints.first ?? (getSystem(R).id === 'step' ? 4 : (R.skillPoints.step || 1));
    for (const k of c.skills || []) if (!skills[k]) skills[k] = first;
    const ranks = Object.values(skills).reduce((x, v) => x + v, 0);
    for (const [k, v] of Object.entries(skills)) if (v < 0 || v > R.skillPoints.max) no(`${mod.ix.skill[k].name} can be at most ${R.skillPoints.max} at the start.`);
    if (ranks > R.skillPoints.spend) no(`Spend at most ${R.skillPoints.spend} skill ranks, counting your calling's (you have ${ranks}).`);
    for (const [k, v] of Object.entries(o.stats || {})) stats[k] = (stats[k] || 0) + v;
  }
  const id = nextId(s, 'c');
  const ch = {
    id, playerId: pid, name, origin: o.id, calling: c.id, level: 1, xp: 0, stats, skills,
    health: 0, healthMax: 0, strain: 0, conds: [], gear: [...(c.gear || [])], abilities: [...(c.abilities || [])],
    look: str(input.look, 300), want: str(input.want, 300), notes: '', down: false,
  };
  ch.healthMax = maxHealth(R, stats, 1);
  ch.health = ch.healthMax;
  s.chars[id] = ch;
  if (pid && s.players[pid]) s.players[pid].charId = id;
  story(s, ctx, 'event', `${name} joins: ${o.name} ${c.name}.`, 'Engine');
  return ch;
}

H['char.create'] = (s, a, ctx) => {
  const pid = isHost(ctx) ? (a.playerId || null) : ctx.pid;
  if (!isHost(ctx) && !s.players[pid]) no('Join the table first.');
  if (pid && s.players[pid] && s.players[pid].charId && s.chars[s.players[pid].charId]) no('You already have a character.');
  makeChar(s, ctx, pid, a.input || {});
};
H['char.pregen'] = (s, a, ctx) => {
  const pid = isHost(ctx) ? (a.playerId || null) : ctx.pid;
  if (!isHost(ctx) && !s.players[pid]) no('Join the table first.');
  if (pid && s.players[pid] && s.players[pid].charId && s.chars[s.players[pid].charId]) no('You already have a character.');
  const p = (ctx.mod.handbook.pregens || [])[Number(a.index)];
  if (!p) no('There is no such ready-made character.');
  if (Object.values(s.chars).some((c) => c.name === p.name)) no(`${p.name} is already taken.`);
  makeChar(s, ctx, pid, p, { pregen: true });
};
H['char.release'] = (s, a, ctx) => {
  hostOnly(ctx);
  const ch = s.chars[a.charId];
  if (!ch) no('There is no such character.');
  if (ch.playerId && s.players[ch.playerId]) s.players[ch.playerId].charId = null;
  ch.playerId = a.playerId || null;
  if (ch.playerId && s.players[ch.playerId]) s.players[ch.playerId].charId = ch.id;
};
H['char.notes'] = (s, a, ctx) => { const ch = ownChar(s, ctx, a.charId); ch.notes = str(a.text, 2000); };

H.say = (s, a, ctx) => {
  const text = str(a.text, 1000);
  if (!text) no('Say something.');
  if (isHost(ctx)) { story(s, ctx, 'say', text, a.as || 'Director'); return; }
  const p = s.players[ctx.pid];
  if (!p) no('Join the table first.');
  const ch = s.chars[p.charId];
  story(s, ctx, 'say', text, ch ? ch.name : p.name, { pid: ctx.pid, charId: ch ? ch.id : null });
};
H.narrate = (s, a, ctx) => {
  hostOnly(ctx);
  const t = str(a.text, 6000);
  if (t) story(s, ctx, 'narration', t, 'Director', { ai: !!ctx.ai });
  // The module's own words this narration used: the table has met them now (engine/words.js).
  if (t && Array.isArray(a.words) && a.words.length) {
    const have = new Set((s.words || []).map((w) => w.toLowerCase()));
    s.words = [...(s.words || []), ...a.words.map((w) => str(w, 40)).filter((w) => w && !have.has(w.toLowerCase()))].slice(0, 300);
  }
};
H['note.host'] = (s, a, ctx) => { hostOnly(ctx); s.hostNotes = str(a.text, 8000); };

// ---- rolls
H['roll.ask'] = (s, a, ctx) => {
  hostOnly(ctx);
  const { mod } = ctx;
  const ids = [].concat(a.charIds || a.charId || []).map((x) => (target(s, x) || {})).filter((t) => t.kind === 'char').map((t) => t.id);
  if (!ids.length) no(`Name a character to roll. The party: ${Object.values(s.chars).map((c) => `${c.id} (${c.name})`).join(', ') || 'nobody yet'}.`);
  const stat = str(a.stat, 30).toLowerCase();
  const skill = str(a.skill, 30).toLowerCase();
  if (!mod.ix.stat[stat]) no(`Say which stat: ${mod.rules.stats.map((x) => x.id).join(', ')}.`);
  if (skill && !mod.ix.skill[skill]) no(`There is no skill "${skill}". Skills: ${mod.rules.skills.map((x) => x.id).join(', ')}.`);
  const at = difficulty(mod, a.at);
  const RA = getSystem(mod.rules).ranges.at;
  if (at == null || at < RA[0] || at > RA[1]) no(`Give a ${term(mod, 'difficulty').toLowerCase()}: ${mod.rules.ladder.map((r) => `${r.name} ${r.at}`).join(', ')}.`);
  const fail = a.fail && typeof a.fail === 'object' ? { damage: Math.max(0, Math.trunc(Number(a.fail.damage)) || 0), cond: mod.ix.cond[str(a.fail.cond, 30).toLowerCase()] ? str(a.fail.cond, 30).toLowerCase() : '' } : null;
  for (const id of ids) {
    if (s.chars[id].down) continue;
    s.requests = s.requests.filter((q) => q.charId !== id);
    s.requests.push({ id: nextId(s, 'q'), charId: id, stat, skill, at, reason: str(a.reason, 200), by: ctx.ai ? 'ai' : 'host', t: ctx.now || 0, fail });
  }
};
H['roll.cancel'] = (s, a, ctx) => {
  hostOnly(ctx);
  s.requests = s.requests.filter((q) => q.id !== a.id);
  // Its announcement goes with it, if nobody else is still asked in it.
  for (const e of s.story) if (Array.isArray(e.ask) && e.ask.includes(a.id)) e.ask = e.ask.filter((x) => x !== a.id);
  s.story = s.story.filter((e) => !(Array.isArray(e.ask) && !e.ask.length));
};

H['roll.make'] = (s, a, ctx) => {
  const { mod } = ctx;
  const q = s.requests.find((x) => x.id === a.id);
  if (!q) no('That roll is no longer asked for.');
  const ch = ownChar(s, ctx, q.charId);
  const pool = poolFor(mod, ch, q.stat, q.skill, a.help ? [{ label: 'Help', dice: Math.min(2, Math.max(0, Number(a.help) || 0)) }] : []);
  const r = rollSpec(mod, ctx, pool, q.at, a.dice);
  s.requests = s.requests.filter((x) => x.id !== q.id);
  const label = `${mod.ix.stat[q.stat].name}${q.skill ? ` + ${mod.ix.skill[q.skill].name}` : ''}`;
  // What the roll was for, in the result too (Roly, 27 Nov).
  const forWhat = String(q.reason || '').trim().replace(/\.$/, '');
  let text = `${ch.name} rolls ${label} (${pool.label}) against ${ladderName(mod, q.at)}: ${r.shown}, ${verdict(r)}${forWhat ? `, for this: ${forWhat}` : ''}.`;
  if (r.partial) text += ' They do it, at a cost.';
  if (r.surge) text += ` ${term(mod, 'surge')}! ${mod.rules.surge.effect}`;
  if (r.snags) text += ` ${r.snags} ${term(mod, 'snag')}${r.snags > 1 ? 's' : ''}: +${r.snags} ${term(mod, 'strain')}.`;
  const row = !r.success && snagRow(mod.rules, r.snags);
  if (row) text += ` ${row.name}: ${row.effect}`;
  if (!r.success && q.fail) {
    if (q.fail.damage) { const d = hurtChar(s, ctx, ch, q.fail.damage); text += ` ${ch.name} loses ${d.taken} ${term(mod, 'health')}${d.notes.length ? `; ${d.notes.join(', ')}` : ''}.`; }
    if (q.fail.cond && !ch.conds.includes(q.fail.cond)) { ch.conds.push(q.fail.cond); text += ` ${ch.name} is ${mod.ix.cond[q.fail.cond].name}.`; }
  }
  addRoll(s, ctx, { who: ch.name, charId: ch.id, kind: 'check', label, reason: q.reason, ...r, snagRow: row ? row.name : '' });
  s.outcomes = [...(s.outcomes || []), { site: s.scene.siteId, stat: q.stat, skill: q.skill || '', ok: !!r.success }].slice(-40);
  if (ctx.events) ctx.events.push({ ev: r.success ? 'succeed' : 'fail', args: [q.stat, q.skill].filter(Boolean), site: s.scene.siteId });
  if (r.snags) markStrain(s, ctx, ch, r.snags);
  story(s, ctx, 'event', text, 'Engine', { roll: true });
};

// A roll nobody asked for: shown at the table, compared to nothing, costs nothing.
H['roll.free'] = (s, a, ctx) => {
  const { mod } = ctx;
  const ch = ownChar(s, ctx, a.charId);
  const pool = poolFor(mod, ch, str(a.stat).toLowerCase(), str(a.skill).toLowerCase());
  const r = rollSpec(mod, ctx, pool, standardAt(mod), a.dice);
  addRoll(s, ctx, { who: ch.name, charId: ch.id, kind: 'free', label: `${mod.ix.stat[str(a.stat).toLowerCase()].name}${a.skill ? ` + ${mod.ix.skill[str(a.skill).toLowerCase()].name}` : ''}`, ...r, success: null });
};

// ---- a character attacks
H.attack = (s, a, ctx) => {
  const { mod } = ctx;
  const ch = ownChar(s, ctx, a.charId);
  if (ch.down) no(`${ch.name} is down.`);
  inTurn(s, ctx, keyOf('char', ch.id));
  const g = mod.ix.gear[a.gearId] || ch.gear.map((x) => mod.ix.gear[x]).find((x) => x && x.kind === 'weapon');
  if (!g || g.kind !== 'weapon') no(`${ch.name} has no weapon to attack with.`);
  if (!ch.gear.includes(g.id)) no(`${ch.name} does not carry a ${g.name}.`);
  const t = target(s, a.target);
  if (!t || t.kind !== 'creature' || t.o.down) no('Name a creature that is still standing.');
  if (t.o.hidden) no(`${ch.name} cannot see that.`);
  onTheMap(s, ctx, keyOf('char', ch.id), keyOf('creature', t.id), isRanged(g) ? (g.range || MAP.mapRules(mod).range) : 0);
  spendAction(s, ctx, keyOf('char', ch.id));
  const pool = poolFor(mod, ch, g.stat, g.skill || '', a.bonus ? [{ label: 'Bonus', dice: Math.max(-5, Math.min(5, Number(a.bonus) || 0)) }] : []);
  const r = rollSpec(mod, ctx, pool, t.o.defence, a.dice);
  let text = `${ch.name} attacks ${t.o.name} with the ${g.name}: ${r.shown}, ${r.success ? (r.partial ? 'a hit, at a cost' : 'a hit') : 'a miss'}.`;
  let dmg = null;
  if (r.success) {
    const n = damageFromRoll(mod.rules, r, g.weapon, t.o.soak, ctx.rng);
    const d = hurtCreature(s, ctx, t.o, n);
    dmg = d.taken;
    text += ` ${d.taken} damage${r.surge ? ` (${term(mod, 'surge')}: the weapon counts twice)` : ''}${d.notes.length ? `; ${d.notes.join(', ')}` : ''}.`;
  }
  if (r.snags) text += ` ${r.snags} ${term(mod, 'snag')}${r.snags > 1 ? 's' : ''}: +${r.snags} ${term(mod, 'strain')}.`;
  const row = !r.success && snagRow(mod.rules, r.snags);
  if (row) text += ` ${row.name}: ${row.effect}`;
  addRoll(s, ctx, { who: ch.name, charId: ch.id, kind: 'attack', label: `${g.name} vs ${t.o.name}`, ...r, dmg });
  if (r.snags) markStrain(s, ctx, ch, r.snags);
  story(s, ctx, 'event', text, 'Engine', { roll: true });
};

// ---- an ability: pays its cost ("1 Strain"), rolls if it has a roll
H['ability.use'] = (s, a, ctx) => {
  const { mod } = ctx;
  const ch = ownChar(s, ctx, a.charId);
  const ab = mod.ix.ability[a.abilityId];
  if (!ab || !ch.abilities.includes(ab.id)) no(`${ch.name} does not have that ability.`);
  if (ch.down) no(`${ch.name} is down.`);
  inTurn(s, ctx, keyOf('char', ch.id));
  spendAction(s, ctx, keyOf('char', ch.id));
  const cost = /(\d+)\s+(\w+)/.exec(ab.cost || '');
  if (cost && new RegExp(term(mod, 'strain'), 'i').test(cost[2])) markStrain(s, ctx, ch, Number(cost[1]));
  let text = `${ch.name} uses ${ab.name}${ab.cost ? ` (${ab.cost})` : ''}. ${ab.effect}`;
  if (ab.roll) {
    const at = difficulty(mod, a.at) ?? standardAt(mod);
    const pool = poolFor(mod, ch, ab.roll.stat, ab.roll.skill || '');
    const r = rollSpec(mod, ctx, pool, at, a.dice);
    text += ` Roll (${pool.label}): ${r.shown} against ${ladderName(mod, at)}, ${verdict(r)}${r.surge ? `, ${term(mod, 'surge')}!` : ''}.`;
    addRoll(s, ctx, { who: ch.name, charId: ch.id, kind: 'ability', label: ab.name, ...r });
    if (r.snags) { text += ` +${r.snags} ${term(mod, 'strain')}.`; markStrain(s, ctx, ch, r.snags); }
  }
  story(s, ctx, 'event', text, 'Engine', { roll: !!ab.roll });
};

// ---- creatures
H['creature.add'] = (s, a, ctx) => {
  hostOnly(ctx);
  const out = addCreatures(s, ctx, str(a.base, 60), Math.trunc(Number(a.count)) || 1, a.siteId || s.scene.siteId, !!a.hidden);
  if (s.fight && !a.hidden) for (const k of out) s.fight.order.push({ key: keyOf('creature', k.id), init: 0 });
};
H['creature.reveal'] = (s, a, ctx) => {
  hostOnly(ctx);
  const ids = a.ids && a.ids.length ? a.ids : Object.values(s.creatures).filter((k) => k.siteId === s.scene.siteId && k.hidden).map((k) => k.id);
  const shown = [];
  for (const id of ids) { const k = s.creatures[id]; if (k && k.hidden) { k.hidden = false; shown.push(k); if (s.fight) s.fight.order.push({ key: keyOf('creature', k.id), init: 0 }); } }
  if (shown.length) story(s, ctx, 'event', `Revealed: ${shown.map((k) => k.name).join(', ')}.`, 'Engine');
};
H['creature.act'] = (s, a, ctx) => {
  hostOnly(ctx);
  const { mod } = ctx;
  const t0 = target(s, a.creature);
  const k = t0 && t0.kind === 'creature' ? t0.o : null;
  if (!k || k.down) no('Name a creature that is still standing.');
  inTurn(s, ctx, keyOf('creature', k.id));
  const b = mod.ix.creature[k.base];
  const atk = (b.attacks || []).find((x) => x.name.toLowerCase() === str(a.attack).toLowerCase()) || (!a.attack && b.attacks[0]);
  if (!atk) no(`${k.name} has no attack called "${a.attack}". Its attacks: ${b.attacks.map((x) => x.name).join(', ')}.`);
  const t = target(s, a.target);
  if (!t || t.kind !== 'char' || t.o.down) no(`Name a character that is still standing: ${Object.values(s.chars).filter((c) => !c.down).map((c) => `${c.id} (${c.name})`).join(', ')}.`);
  onTheMap(s, ctx, keyOf('creature', k.id), keyOf('char', t.id), isRanged(atk) ? (atk.range || MAP.mapRules(mod).range) : 0);
  spendAction(s, ctx, keyOf('creature', k.id));
  const pool = poolForRating(mod, atk.rating ?? atk.dice, k.conds);
  const at = charDefence(mod, t.o);
  const r = rollSpec(mod, ctx, pool, at);
  let text = `${k.name} uses ${atk.name} on ${t.o.name}: ${r.success ? (r.partial ? 'a glancing hit' : 'a hit') : 'a miss'}.`;
  let dmg = null;
  if (r.success) {
    const raw = damageFromRoll(mod.rules, r, atk.weapon || 0, charSoak(mod, t.o), ctx.rng);
    const d = hurtChar(s, ctx, t.o, k.blows && k.blows !== 1 && raw > 0 ? Math.max(1, Math.round(raw * k.blows)) : raw); // fitted to a small party
    dmg = d.taken;
    text += ` ${t.o.name} loses ${d.taken} ${term(mod, 'health')}${d.notes.length ? `; ${d.notes.join(', ')}` : ''}.`;
    if (r.surge && atk.effect) text += ` ${term(mod, 'surge')}: ${atk.effect}`;
  }
  addRoll(s, ctx, { who: k.name, creatureId: k.id, kind: 'attack', label: `${atk.name} vs ${t.o.name}`, ...r, dmg, secret: true });
  story(s, ctx, 'event', text, 'Engine', { roll: true });
};
H['creature.flee'] = (s, a, ctx) => {
  hostOnly(ctx);
  const t = target(s, a.creature);
  if (!t || t.kind !== 'creature' || t.o.down) no('Name a creature that is still standing.');
  t.o.gone = true; t.o.down = true;
  if (s.fight) s.fight.xp = (s.fight.xp || 0) + (t.o.xp || 0);
  story(s, ctx, 'event', `${t.o.name} flees.`, 'Engine');
};
H['creature.remove'] = (s, a, ctx) => { hostOnly(ctx); const k = s.creatures[a.id]; if (!k) no('No such creature.'); delete s.creatures[a.id]; if (s.fight) { const cur = currentKey(s); s.fight.order = s.fight.order.filter((o) => o.key !== keyOf('creature', a.id)); s.fight.turn = Math.max(0, s.fight.order.findIndex((o) => o.key === cur)); } };

// ---- hurt, heal, conditions, strain
H.damage = (s, a, ctx) => {
  hostOnly(ctx);
  const t = target(s, a.target);
  if (!t) no('Name who takes the damage.');
  const n = Math.trunc(Number(a.amount));
  if (!(n > 0)) no('Give an amount above 0.');
  const d = t.kind === 'char' ? hurtChar(s, ctx, t.o, n) : hurtCreature(s, ctx, t.o, n);
  story(s, ctx, 'event', `${t.o.name} takes ${d.taken} damage${a.why ? ` (${str(a.why, 100)})` : ''}${d.notes.length ? `; ${d.notes.join(', ')}` : ''}.`, 'Engine');
};
H.heal = (s, a, ctx) => {
  hostOnly(ctx);
  const t = target(s, a.target);
  if (!t) no('Name who is healed.');
  const n = Math.trunc(Number(a.amount));
  if (!(n > 0)) no('Give an amount above 0.');
  const before = t.o.health;
  t.o.health = Math.min(t.o.healthMax, t.o.health + n);
  if (t.o.health > 0) t.o.down = false;
  story(s, ctx, 'event', `${t.o.name} recovers ${t.o.health - before} ${term(ctx.mod, 'health')}.`, 'Engine');
};
H['cond.add'] = (s, a, ctx) => {
  hostOnly(ctx);
  const t = target(s, a.target);
  const c = ctx.mod.ix.cond[str(a.cond).toLowerCase()];
  if (!t) no('Name who.');
  if (!c) no(`There is no condition "${a.cond}". Conditions: ${ctx.mod.rules.conditions.map((x) => x.id).join(', ')}.`);
  if (!t.o.conds.includes(c.id)) t.o.conds.push(c.id);
  story(s, ctx, 'event', `${t.o.name} is ${c.name}: ${c.effect}`, 'Engine');
};
H['cond.remove'] = (s, a, ctx) => {
  hostOnly(ctx);
  const t = target(s, a.target);
  if (!t) no('Name who.');
  const id = str(a.cond).toLowerCase();
  if (!t.o.conds.includes(id)) no(`${t.o.name} is not ${id}.`);
  t.o.conds = t.o.conds.filter((c) => c !== id);
  story(s, ctx, 'event', `${t.o.name} is no longer ${(ctx.mod.ix.cond[id] || {}).name || id}.`, 'Engine');
};
H['strain.mark'] = (s, a, ctx) => {
  hostOnly(ctx);
  const t = target(s, a.charId);
  if (!t || t.kind !== 'char') no('Name a character.');
  const n = Math.trunc(Number(a.n)) || 0;
  if (!n) no('Give an amount (negative to clear).');
  markStrain(s, ctx, t.o, n);
  story(s, ctx, 'event', `${t.o.name} ${n > 0 ? 'marks' : 'clears'} ${Math.abs(n)} ${term(ctx.mod, 'strain')} (now ${t.o.strain}).`, 'Engine');
};
H.rest = (s, a, ctx) => {
  hostOnly(ctx);
  if (s.fight) no('Not during a fight.');
  const long = a.kind === 'long';
  // A night in the open: a camp seed may come up. Its creatures attack, and the rest finishes after the fight.
  if (long && !a.after && !SEEDS.safePlace(siteOf(s, ctx.mod))) {
    const came = seedMoment(s, ctx, 'camp', { fight: true });
    if (came && came.length && s.fight) { s.restAfter = true; story(s, ctx, 'event', 'The night is broken: the camp is attacked. The rest will finish once the fight is over.', 'Engine'); return; }
  }
  if (long) s.restCount = (s.restCount || 0) + 1;
  for (const ch of Object.values(s.chars)) {
    if (long) { ch.health = ch.healthMax; ch.strain = 0; ch.conds = []; } else { ch.health = Math.min(ch.healthMax, ch.health + Math.ceil(ch.healthMax / 2)); ch.strain = Math.max(0, ch.strain - 2); }
    if (ch.health > 0) ch.down = false;
  }
  story(s, ctx, 'event', `A ${long ? 'long' : 'short'} rest. ${long ? ctx.mod.rules.rest.long : ctx.mod.rules.rest.short}`, 'Engine');
};

// ---- the world: places, clocks, quests, rewards
H['site.move'] = (s, a, ctx) => {
  hostOnly(ctx);
  const adv = adventureOf(s, ctx.mod);
  const to = (adv.sites || []).find((x) => x.id === a.siteId || x.name.toLowerCase() === str(a.siteId).toLowerCase());
  if (!to) no(`There is no place "${a.siteId}". Places: ${adv.sites.map((x) => x.id).join(', ')}.`);
  if (to.id === s.scene.siteId) no('The party is already there.');
  if (s.fight) no('Not during a fight: end it first.');
  const here = siteOf(s, ctx.mod);
  if (ctx.ai && here && !(here.exits || []).includes(to.id)) no(`From ${here.name} the way leads to: ${(here.exits || []).map((x) => x).join(', ') || 'nowhere'}.`);
  s.scene.from = s.scene.siteId;
  s.scene.siteId = to.id;
  // The party arrives together on the map, by the way they came in (placed after this change).
  const m = mapUp(s);
  m.cameFrom = s.scene.from;
  for (const k of Object.keys(m.at)) if (k.startsWith('char:')) delete m.at[k];
  placeSite(s, ctx, to.id);
  if (ctx.events) ctx.events.push({ ev: 'enter', site: to.id });
  story(s, ctx, 'event', `The party reaches ${to.name}.`, 'Engine', { site: to.id });
};
// A character uses one of the place's objects: opens the chest, pulls the lever, reads the log. The rules
// here that wait for it ("use sea chest") then fire (engine/triggers.js); the Director narrates.
H['object.use'] = (s, a, ctx) => {
  const t = target(s, a.who || a.charId);
  if (!t || t.kind !== 'char') no(`Say who uses it: ${Object.values(s.chars).map((c) => c.name).join(', ') || 'nobody is in the party yet'}.`);
  const ch = ownChar(s, ctx, t.id);
  if (ch.down) no(`${ch.name} cannot: they are down.`);
  const site = (adventureOf(s, ctx.mod).sites || []).find((x) => x.id === s.scene.siteId);
  const names = TRIG.objectsOf(site);
  const what = TRIG.objectNamed(names, a.object) || str(a.object, 80).replace(/[.\s]+$/, '');
  if (!what) no(`Say what is used${names.length ? `: ${names.join(', ')}` : ''}.`);
  let how = str(a.how, 24).toLowerCase().replace(/[^a-z\s-]/g, '').trim() || 'uses';
  if (!/s$/.test(how.split(' ')[0])) how = how.replace(/^(\S+)/, (v) => (/[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ies` : /(?:sh|ch|x|z|s)$/.test(v) ? `${v}es` : `${v}s`));
  story(s, ctx, 'event', `${ch.name} ${how} ${/^(?:the|a|an|his|her|their)\s/i.test(what) ? what : `the ${what}`}.`, 'Engine');
  if (ctx.events) ctx.events.push({ ev: 'use', site: s.scene.siteId, args: [what.toLowerCase()], char: ch.id });
};
H['clock.tick'] = (s, a, ctx) => {
  hostOnly(ctx);
  const c = s.clocks.find((x) => x.id === a.id || x.name.toLowerCase() === str(a.id).toLowerCase());
  if (!c) no(`There is no clock "${a.id}". Clocks: ${s.clocks.map((x) => x.id).join(', ') || 'none'}.`);
  const n = Math.trunc(Number(a.n)) || 1;
  c.filled = Math.max(0, Math.min(c.size, c.filled + n));
  const def = (adventureOf(s, ctx.mod).clocks || []).find((x) => x.id === c.id);
  story(s, ctx, 'event', `${c.name}: ${c.filled} of ${c.size}.${c.filled >= c.size ? ` It is full. ${def ? def.fills : ''}` : ''}`, 'Engine');
};
H['clock.add'] = (s, a, ctx) => { hostOnly(ctx); const name = str(a.name, 60); if (!name) no('Name the clock.'); s.clocks.push({ id: nextId(s, 't'), name, size: Math.max(2, Math.min(12, Math.trunc(Number(a.size)) || 4)), filled: 0 }); };
H['quest.add'] = (s, a, ctx) => { hostOnly(ctx); const text = str(a.text, 200); if (!text) no('Write the quest.'); s.quests.push({ id: nextId(s, 'q'), text, done: false }); story(s, ctx, 'event', `New quest: ${text}`, 'Engine'); };
H['quest.done'] = (s, a, ctx) => {
  hostOnly(ctx);
  const ref = str(a.id).toLowerCase();
  const q = s.quests.find((x) => x.id === ref) || s.quests.find((x) => ref && x.text.toLowerCase().includes(ref));
  if (!q) no(`There is no such quest. Quests: ${s.quests.map((x) => `${x.id} (${x.text})`).join('; ')}.`);
  if (q.done) no('That quest is already done.');
  const def = (adventureOf(s, ctx.mod).quests || []).find((x) => x.id === q.id);
  if (ctx.ai && def && def.doneAt && def.doneAt.length && !def.doneAt.includes(s.scene.siteId)) no(`Not yet: "${q.text}" is done only at ${def.doneAt.join(' or ')}.`);
  q.done = true;
  story(s, ctx, 'event', `Quest complete: ${q.text}`, 'Engine');
};
H['xp.award'] = (s, a, ctx) => {
  hostOnly(ctx);
  const n = Math.trunc(Number(a.amount));
  if (!(n > 0 && n <= 1000)) no('Give an amount from 1 to 1000.');
  const R = ctx.mod.rules;
  const who = Object.values(s.chars).filter((c) => !a.charIds || a.charIds.includes(c.id));
  for (const ch of who) {
    ch.xp += n;
    const lv = Math.min(R.advancement.maxLevel, 1 + Math.floor(ch.xp / R.advancement.xpPerLevel));
    if (lv > ch.level) {
      ch.level = lv;
      const mx = maxHealth(R, ch.stats, lv);
      ch.health += mx - ch.healthMax; ch.healthMax = mx;
      story(s, ctx, 'event', `${ch.name} reaches ${term(ctx.mod, 'level')} ${lv}. ${R.advancement.perLevel || ''}`, 'Engine');
    }
  }
  story(s, ctx, 'event', `${n} ${term(ctx.mod, 'xp')} each${a.why ? ` for ${str(a.why, 100)}` : ''}.`, 'Engine');
};

// ---- the fight
H['fight.start'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (s.fight) no('A fight is already on.');
  const { mod } = ctx;
  const only = Array.isArray(a.ids) && a.ids.length ? new Set(a.ids) : null; // a seed's own creatures (a camp attacked)
  if (!only) fitCreatures(s, ctx, s.scene.siteId);
  for (const k of Object.values(s.creatures)) if (k.siteId === s.scene.siteId && k.hidden && !k.down && (!only || only.has(k.id))) k.hidden = false;
  const ini = mod.rules.initiative;
  const order = [];
  for (const ch of Object.values(s.chars)) {
    if (ch.down) continue;
    const r = rollSpec(mod, ctx, poolFor(mod, ch, ini.stat, ini.skill || ''), 0);
    order.push({ key: keyOf('char', ch.id), init: r.margin, side: 0 });
  }
  for (const k of Object.values(s.creatures)) {
    if (k.down || k.siteId !== s.scene.siteId || k.hidden || (only && !only.has(k.id))) continue;
    const b = mod.ix.creature[k.base];
    // The d6 pool rolls tier + 2 dice; other systems roll the creature's first attack's rating.
    const rating = getSystem(mod.rules).id === 'd6-pool' ? (b.tier || 1) + 2 : ((b.attacks || [])[0] || {}).rating ?? ((b.attacks || [])[0] || {}).dice ?? 0;
    const r = rollSpec(mod, ctx, poolForRating(mod, rating), 0);
    order.push({ key: keyOf('creature', k.id), init: r.margin, side: 1 });
  }
  if (!order.some((o) => o.side === 1)) no('There is nothing here to fight. Add or reveal a creature first.');
  order.sort((x, y) => (y.init - x.init) || (x.side - y.side));
  s.fight = { round: 1, turn: 0, order: order.map(({ key, init }) => ({ key, init })), used: 0, xp: 0 };
  autoArt(s, ctx, order.filter((o) => o.side === 1).map((o) => ['creature', s.creatures[o.key.slice(9)].base]));
  startOfTurn(s, ctx);
  story(s, ctx, 'event', `A fight! Order: ${s.fight.order.map((o) => `${nameOf(s, o.key)} (${o.init})`).join(', ')}. ${nameOf(s, currentKey(s))} goes first.`, 'Engine');
};
H['fight.next'] = (s, a, ctx) => {
  if (!s.fight) no('No fight is on.');
  const cur = currentKey(s);
  if (!isHost(ctx)) { const p = s.players[ctx.pid]; if (!p || keyOf('char', p.charId) !== cur) no('Only the one whose turn it is can end it.'); }
  const round = s.fight.round;
  advance(s, ctx);
  if (s.fight && s.fight.round > round && ctx.events) ctx.events.push({ ev: 'round', site: s.scene.siteId });
  story(s, ctx, 'event', `${nameOf(s, cur)} ends their turn. ${nameOf(s, currentKey(s))} is up (round ${s.fight.round}).`, 'Engine', { quiet: true });
};
H['fight.end'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (!s.fight) no('No fight is on.');
  // The AI Director ends a fight it has won while a creature in it still stands in the record (Gull Rock
  // bench, 28 Nov: the keeper "folds sideways" in the narration at 7 health, then rose again to bar the stair).
  // The record follows the story, as in the D&D Director: those creatures are beaten. A party that flees
  // (award false) leaves them standing.
  if (ctx.ai && a.award !== false && Object.values(s.chars).some((c) => !c.down)) {
    const still = s.fight.order.filter((o) => o.key.startsWith('creature:')).map((o) => s.creatures[o.key.slice(9)]).filter((k) => k && !k.down && !k.fled);
    for (const k of still) { k.health = 0; k.down = true; k.beaten = true; k.conds = []; s.fight.xp = (s.fight.xp || 0) + (k.xp || 0); }
    if (still.length) story(s, ctx, 'event', `${still.map((k) => k.name).join(', ')}: beaten as the fight ends.`, 'Engine');
  }
  const xp = s.fight.xp || 0;
  s.fight = null;
  for (const o of [...Object.values(s.chars), ...Object.values(s.creatures)]) o.braced = false;
  story(s, ctx, 'event', 'The fight is over.', 'Engine');
  if (xp && a.award !== false) H['xp.award'](s, { amount: xp, why: 'the fight' }, ctx);
  // A camp attacked in the night (a seed): the rest goes on once the fight is over.
  if (s.restAfter) { delete s.restAfter; if (Object.values(s.chars).some((c) => !c.down)) H.rest(s, { kind: 'long', after: true }, { ...ctx, role: 'host', pid: null }); }
};
H.brace = (s, a, ctx) => {
  const ch = ownChar(s, ctx, a.charId);
  inTurn(s, ctx, keyOf('char', ch.id));
  spendAction(s, ctx, keyOf('char', ch.id));
  ch.braced = true;
  story(s, ctx, 'event', `${ch.name} braces: +2 defence until their next turn.`, 'Engine');
};

// ---- the host's story seeds (engine/seeds.js): the Engine brings one in at its moment (a party getting nowhere,
// a camp somewhere unsafe) and rolls its chance; the Director may bring one in on its judgement (use_seed), as it
// must for trouble only it can see (someone harassed). Everything is logged (s.seedLog) for the Seeds tab.
H['seed.save'] = (s, a, ctx) => {
  hostOnly(ctx);
  s.seeds = s.seeds || [];
  const text = str(a.text, 8000);
  if (!text) no('The seed is empty.');
  const title = SEEDS.seedPlan(text).title || 'A seed';
  const old = s.seeds.find((x) => x.id === a.id);
  if (old) { old.text = text; old.title = title; return; }
  s.seeds.push({ id: nextId(s, 'sd'), title, text, on: true });
};
H['seed.toggle'] = (s, a, ctx) => { hostOnly(ctx); const x = (s.seeds || []).find((y) => y.id === a.id); if (!x) no('No such seed.'); x.on = !x.on; };
H['seed.remove'] = (s, a, ctx) => { hostOnly(ctx); s.seeds = (s.seeds || []).filter((y) => y.id !== a.id); };
function seedLogRow(s, ctx, seed, row) {
  s.seedLog = (s.seedLog || []).concat({ id: seed.id, title: seed.title, rest: s.restCount || 0, site: s.scene.siteId, seq: s.seq, t: ctx.now || 0, ...row }).slice(-60);
}
function fireSeed(s, ctx, seed, { by, why = '', roll = null, chance = 100, fight = false }) {
  const p = SEEDS.seedPlan(seed.text);
  const levels = Object.values(s.chars).filter((c) => !c.down).map((c) => c.level || 1);
  const ix = ctx.mod.ix.creature;
  const wanted = p.choose ? SEEDS.anyCreatures(ctx.mod, adventureOf(s, ctx.mod), levels, ctx.rng) : p.creatures.filter((c) => ix[c.id]);
  const { groups, health } = SEEDS.sizeGroups(wanted, levels, ix, p.kind === 'provoke' ? 'medium' : 'easy');
  const added = [];
  for (const g of groups) added.push(...addCreatures(s, ctx, g.id, g.count, s.scene.siteId, false));
  if (health !== 1) for (const k of added) { k.healthMax = Math.max(1, Math.round(k.healthMax * health)); k.health = k.healthMax; }
  if (s.fight) for (const k of added) s.fight.order.push({ key: keyOf('creature', k.id), init: 0 });
  const names = added.map((k) => k.name);
  seedLogRow(s, ctx, seed, { fired: true, by, why: str(why, 200), roll, chance, foes: names });
  s.seedNow = { id: seed.id, title: seed.title, kind: p.kind, by, why: str(why, 200), foes: names, seq: s.seq };
  story(s, ctx, 'host', `Story seed "${seed.title}" comes into play (${by === 'engine' ? (roll != null ? `rolled ${roll} against ${chance}%` : 'its moment came') : `the Director's choice${why ? `: ${why}` : ''}`})${names.length ? `: ${names.join(', ')}` : ''}.`, 'Engine');
  if (fight && added.length && !s.fight) H['fight.start'](s, { ids: added.map((k) => k.id) }, { ...ctx, role: 'host', pid: null });
  return added;
}
function seedMoment(s, ctx, kind, { text = '', fight = false } = {}) {
  const free = (s.seeds || []).filter((x) => SEEDS.seedFree(x, s, s.scene.siteId)).map((x) => ({ seed: x, p: SEEDS.seedPlan(x.text) })).filter((x) => x.p.kind === kind);
  const fit = kind === 'provoke' && text ? free.filter((x) => !x.p.who || String(text).toLowerCase().includes((x.p.who.toLowerCase().split(/\s+/).filter((w) => w.length > 2).pop() || '\u0000'))) : free;
  for (const { seed, p } of fit) {
    const roll = p.chance < 100 ? 1 + Math.floor(ctx.rng() * 100) : null;
    if (roll != null && roll > p.chance) { seedLogRow(s, ctx, seed, { fired: false, by: 'engine', roll, chance: p.chance, why: kind }); continue; }
    return fireSeed(s, ctx, seed, { by: 'engine', why: kind === 'lost' ? `the party had been getting nowhere for ${p.turns} turns` : kind === 'camp' ? 'the party camped somewhere unsafe' : 'the party picked a fight', roll, chance: p.chance, fight });
  }
  return null;
}
H['seed.fire'] = (s, a, ctx) => {
  hostOnly(ctx);
  const k = str(a.seed).toLowerCase();
  let seed = (s.seeds || []).find((x) => x.id === a.seed || x.title.toLowerCase() === k) || (s.seeds || []).find((x) => k && x.title.toLowerCase().includes(k));
  // A name of its own for the seed ("the traveller" for the tinker): when only one could come in here now
  // (not counting a camp's, which comes with a rest), that is the one it means.
  if (!seed) { const could = (s.seeds || []).filter((x) => SEEDS.seedFree(x, s, s.scene.siteId) && SEEDS.seedPlan(x.text).kind !== 'camp'); if (could.length === 1) seed = could[0]; }
  if (!seed) no(`There is no story seed "${a.seed}". Seeds: ${(s.seeds || []).filter((x) => x.on).map((x) => `${x.id} ${x.title}`).join(', ') || 'none'}.`);
  if (!SEEDS.seedFree(seed, s, s.scene.siteId)) no(`"${seed.title}" cannot happen here now (switched off, used up, or written for another place).`);
  const p = SEEDS.seedPlan(seed.text);
  const camp = p.kind === 'camp' && !s.fight;
  const came = fireSeed(s, ctx, seed, { by: ctx.ai ? 'director' : 'host', why: a.why || '', fight: camp || (!!a.fight && p.kind !== 'lost') });
  if (camp && came.length && s.fight) { s.restAfter = true; story(s, ctx, 'event', 'The night is broken: the camp is attacked. The rest will finish once the fight is over.', 'Engine'); }
};
// Before each Director turn: is the party getting anywhere? (no new place, quest, creature down or experience)
H['seed.check'] = (s, a, ctx) => {
  hostOnly(ctx);
  if (a.event === 'provoke') { if (!s.fight) seedMoment(s, ctx, 'provoke', { text: a.text || '' }); return; }
  const key = [s.scene.visited.length, s.scene.siteId, s.quests.filter((q) => q.done).length, Object.values(s.creatures).filter((k) => k.down).length,
    Object.values(s.chars).reduce((n, c) => n + (c.xp || 0), 0), s.fight ? 1 : 0].join('|');
  if (key !== s.driftKey) { s.driftKey = key; s.drift = 0; return; }
  s.drift = (s.drift || 0) + 1;
  const due = (s.seeds || []).filter((x) => SEEDS.seedFree(x, s, s.scene.siteId)).map((x) => SEEDS.seedPlan(x.text)).filter((p) => p.kind === 'lost' && s.drift >= p.turns);
  if (!due.length || s.fight) return;
  seedMoment(s, ctx, 'lost');
  s.drift = 0;
};

H['director.mode'] = (s, a, ctx) => { hostOnly(ctx); if (!['off', 'auto', 'approve'].includes(a.mode)) no('Mode is off, auto or approve.'); s.director.mode = a.mode; };

// ------------------------------------------------------------------ views
// The host sees everything. Players and the table never see hidden creatures, the Director's
// secret rolls, or the host's notes.
// ------------------------------------------------------------------ the map (engine/map.js)
// From the D&D Director's Ledger, 27 Nov 2026: each place split into zones, a grid of squares inside each,
// everyone at the party's place on a square. Distances are squares; how far a character moves, reaches and
// shoots is the game's own (rules.json "map", MAP.mapRules). Keys: char:<id>, creature:<id>.
function mapUp(s) {
  const blank = MAP.newMap();
  if (!s.map) s.map = blank;
  for (const k of Object.keys(blank)) if (s.map[k] == null) s.map[k] = blank[k];
  s.map.show = { ...blank.show, ...s.map.show };
  return s.map;
}
const advSites = (s, ctx) => (adventureOf(s, ctx.mod).sites || []);
function siteZones(s, ctx, siteId) {
  const m = mapUp(s);
  if (!m.zones[siteId]) {
    const st = advSites(s, ctx).find((x) => x.id === siteId);
    m.zones[siteId] = st && Array.isArray(st.zones) && st.zones.length ? MAP.normZones(st.zones) : MAP.autoZones();
  }
  return m.zones[siteId];
}
const whoOf = (s, k) => { const [kind, id] = String(k).split(':'); return kind === 'char' ? s.chars[id] : s.creatures[id]; };
const standing = (s, k) => { const o = whoOf(s, k); return !!o && !o.down && !o.dead; };
// Squares held by those standing, in one zone of the party's place (leaving out one creature).
function heldIn(s, zoneId, cols, { except = '', only = null } = {}) {
  const out = new Set();
  for (const [k, p] of Object.entries(s.map.at)) {
    if (k === except || p.site !== s.scene.siteId || p.zone !== zoneId || !standing(s, k)) continue;
    if (only && !only(k)) continue;
    out.add(p.y * cols + p.x);
  }
  return out;
}
const hostileTo = (s, k) => (o) => { const mover = k.split(':')[0]; const other = o.split(':')[0]; return mover !== other && !(other === 'creature' && s.creatures[o.slice(9)] && s.creatures[o.slice(9)].hidden); };

// Everyone at the party's place gets a square: characters by the way the party came in, creatures in their
// own zone (the adventure's, or the far side), each on the nearest free square.
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
  const here = [...Object.keys(s.chars).map((id) => `char:${id}`), ...Object.values(s.creatures).filter((k) => k.siteId === siteId && !k.fled).map((k) => `creature:${k.id}`)];
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
  const placedChar = Object.keys(m.at).find((k) => k.startsWith('char:') && valid(m.at[k]) && !need.includes(k));
  const entry = zones.find((z) => (z.from || []).includes(m.cameFrom)) || MAP.entryZone(zones);
  const others = zones.filter((z) => z !== entry);
  const awaySide = () => {
    if (!others.length) return 'bottom';
    const cx = others.reduce((t, z) => t + z.x + z.w / 2, 0) / others.length;
    const cy = others.reduce((t, z) => t + z.y + z.h / 2, 0) / others.length;
    return MAP.OPPOSITE[MAP.sideToward(entry, { x: cx, y: cy, w: 0, h: 0 })];
  };
  for (const k of need.filter((x) => x.startsWith('char:'))) {
    if (placedChar) { const p = m.at[placedChar]; put(k, MAP.zoneOf(zones, p.zone), p.x + 0.5, p.y + 0.5); continue; }
    put(k, entry, ...MAP.anchor(gridFor(entry), awaySide()));
  }
  const party = Object.keys(m.at).find((k) => k.startsWith('char:') && m.at[k].site === siteId);
  const partyZone = party ? MAP.zoneOf(zones, m.at[party].zone) : entry;
  const far = () => {
    let best = zones[zones.length - 1]; let bd = -1;
    for (const z of zones) { const p = MAP.zonePath(zones, partyZone.id, z.id); const d = p ? p.length : 0; if (d > bd) { bd = d; best = z; } }
    return best;
  };
  for (const k of need.filter((x) => x.startsWith('creature:'))) {
    const c = s.creatures[k.slice(9)];
    const z = (c.zone0 && MAP.findZone(zones, c.zone0)) || far();
    put(k, z, ...MAP.anchor(gridFor(z), z.id === partyZone.id ? MAP.OPPOSITE[awaySide()] : MAP.sideToward(z, partyZone)));
  }
}
const mapOn = (s) => !!(s.map && s.map.show && (s.map.show.zones || s.map.show.grid));
// A weapon or a creature's attack that strikes from afar: it says so (kind "ranged", a range), or it is a
// gun, a bow, a sling, a harpoon gun...
const isRanged = (w) => !!w && (w.kind === 'ranged' || w.ranged === true || Number(w.range) > 0 || /\b(gun|pistol|revolver|rifle|shotgun|musket|bow|crossbow|sling|harpoon gun|blaster|spit|throw)/i.test(`${w.name || ''} ${w.about || ''}`));
// An attack on the map. In melee the attacker steps up to its target (the map follows the story); a ranged
// attack stays put. With "distance decides" on (map.show.reach), the Director's creature can only step as far
// as twice its move, and a shot past the range is refused. The host's own moves are never stopped.
function onTheMap(s, ctx, ak, tk, range) {
  if (!mapOn(s)) return;
  try { placeEveryone(s, ctx); } catch (e) { return; }
  const m = s.map;
  const a = m.at[ak]; const b = m.at[tk];
  if (!a || !b || a.site !== s.scene.siteId || b.site !== s.scene.siteId) return;
  const strict = !!m.show.reach && !(isHost(ctx) && !ctx.ai);
  const zones = siteZones(s, ctx, s.scene.siteId);
  if (range) {
    if (!strict) return;
    const steps = a.zone === b.zone ? MAP.cheb(a, b) : MAP.stepsBetween(m, s.scene.siteId, zones, a, b);
    if (steps == null || steps > range) no(`${whoOf(s, tk).name} is out of range (${steps == null ? 'no line to them' : `${steps} squares; the range is ${range}`}).`);
    return;
  }
  const R = MAP.mapRules(ctx.mod);
  if (MAP.inReach(a, b, R.reach)) return;
  if (strict && ctx.ai) {
    const steps = MAP.stepsBetween(m, s.scene.siteId, zones, a, b);
    const most = MAP.speedOf(whoOf(s, ak), R) * 2;
    if (steps == null || steps - 1 > most) no(`${whoOf(s, ak).name} is too far from ${whoOf(s, tk).name} to strike this turn (${steps == null ? 'no way through' : `${steps} squares`}): move closer, or use a ranged attack.`);
  }
  try { H['map.move'](s, { who: ak, engage: tk }, { ...ctx, freeMove: !strict }); } catch (e) { if (strict) no(`${whoOf(s, tk).name} is out of reach. ${e.message}`); }
}

// Move a character or a creature: to another zone, to a square, or up to someone to fight them.
H['map.move'] = (s, a, ctx) => {
  const m = mapUp(s);
  const t = target(s, a.who);
  const hereNames = () => [...Object.values(s.chars).map((c) => c.name), ...Object.values(s.creatures).filter((k) => k.siteId === s.scene.siteId && !k.down).map((k) => k.name)].join(', ');
  if (!t) no(`Name who moves. Here: ${hereNames()}.`);
  if (t.kind === 'creature') { hostOnly(ctx); if (t.o.siteId !== s.scene.siteId) no(`${t.o.name} is not at this place.`); } else ownChar(s, ctx, t.id);
  if (t.o.down) no(`${t.o.name} cannot move: they are down.`);
  placeEveryone(s, ctx);
  const key = keyOf(t.kind, t.id);
  const siteId = s.scene.siteId;
  const zones = siteZones(s, ctx, siteId);
  const R = MAP.mapRules(ctx.mod);
  const from = { ...m.at[key] };
  let zone = a.zone ? MAP.findZone(zones, a.zone) : MAP.zoneOf(zones, from.zone);
  if (a.zone && !zone) no(`There is no zone called "${a.zone}" here. Zones: ${zones.map((z) => z.name).join(', ')}.`);
  let engage = null;
  if (a.engage) {
    engage = target(s, a.engage);
    if (!engage || (engage.kind === 'creature' && engage.o.siteId !== siteId)) no(`There is nobody called "${a.engage}" here to move up to. Here: ${hereNames()}.`);
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
      const who = Object.keys(m.at).find((k) => k !== key && m.at[k].zone === zone.id && m.at[k].site === siteId && m.at[k].x === x && m.at[k].y === y && standing(s, k));
      const hid = who && who.startsWith('creature:') && s.creatures[who.slice(9)].hidden && t.kind === 'char';
      if (hid) { const c = MAP.freeNear(g, new Set([...held, y * g.cols + x]), x + 0.5, y + 0.5); if (c) m.at[who] = { ...m.at[who], x: c[0], y: c[1] }; }
      else if (ctx.ai || isHost(ctx)) cell = MAP.freeNear(g, held, x + 0.5, y + 0.5);
      else no('Someone is already standing there.');
    }
  } else if (engage) {
    const tp = m.at[keyOf(engage.kind, engage.id)];
    const reachSq = R.reach;
    let best = null; let bd = Infinity;
    const fromZ = MAP.zoneOf(zones, from.zone);
    for (let y = Math.max(0, tp.y - reachSq); y <= Math.min(g.rows - 1, tp.y + reachSq); y++) {
      for (let x = Math.max(0, tp.x - reachSq); x <= Math.min(g.cols - 1, tp.x + reachSq); x++) {
        if ((x === tp.x && y === tp.y) || held.has(y * g.cols + x)) continue;
        if (x === from.x && y === from.y && from.zone === zone.id) { best = [x, y]; bd = -1; continue; }
        const an = MAP.anchor(g, MAP.sideToward(zone, fromZ));
        const d = from.zone === zone.id ? Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) : (x + 0.5 - an[0]) ** 2 + (y + 0.5 - an[1]) ** 2;
        if (d < bd) { bd = d; best = [x, y]; }
      }
    }
    if (!best) { best = MAP.freeNear(g, held, tp.x + 0.5, tp.y + 0.5); notes.push(`There is no room right beside ${engage.o.name}.`); }
    cell = best;
  } else if (zone.id !== from.zone) {
    const path = MAP.zonePath(zones, from.zone, zone.id);
    if (!path) no(`${zone.name} cannot be reached from ${MAP.zoneOf(zones, from.zone).name}: there is no way through.`);
    cell = MAP.freeNear(g, held, ...MAP.anchor(g, MAP.sideToward(zone, MAP.zoneOf(zones, path[path.length - 2]))));
  } else if (a.zone) {
    // Already there (Far North bench, 28 Nov: "to Far side" for a monster standing in Far side): nothing to do.
    s.map.lastNote = `${t.o.name} is already in ${zone.name}.`;
    return;
  } else no('Say where to move: a zone, a square, or someone to move up to.');
  if (!cell) no(`There is no room left in ${zone.name}.`);
  let to = { site: siteId, zone: zone.id, x: cell[0], y: cell[1] };
  const fight = s.fight;
  const mine = !!fight && currentKey(s) === key;
  if (!(from.zone === to.zone && from.x === to.x && from.y === to.y)) {
    const blockedIn = (zid) => { const zg = MAP.gridOf(m, siteId, MAP.zoneOf(zones, zid)); return heldIn(s, zid, zg.cols, { except: key, only: hostileTo(s, key) }); };
    const steps = MAP.stepsBetween(m, siteId, zones, from, to, { blockedIn });
    const fromZ = MAP.zoneOf(zones, from.zone);
    const b = MAP.budget(t.o, { speed: MAP.speedOf(t.o, R), used: mine ? { moved: fight.moved || 0 } : null, zoneTags: [...(fromZ.tags || []), ...(zone.tags || [])], stuck: R.stuck });
    if (!isHost(ctx) && !ctx.freeMove) {
      // A player: a way there, and in a fight only on their own turn and within their movement.
      if (steps == null) no('You cannot get there from here: something is in the way.');
      if (b.speed === 0) no(`${t.o.name} cannot move (${(t.o.conds || []).join(', ') || 'held'}).`);
      if (fight) {
        if (!mine) no(`It is not ${t.o.name}'s turn.`);
        const cost = steps * b.per;
        if (cost > b.left) no(`That is ${cost} square${cost === 1 ? '' : 's'} of movement, and ${t.o.name} has ${b.left} left this turn.`);
        fight.moved = (fight.moved || 0) + cost;
      }
    } else if (ctx.ai && fight && t.kind === 'creature') {
      // A creature the AI Director moves goes no further than twice its move this turn.
      const most = b.speed * 2;
      if (b.speed === 0) no(`${t.o.name} cannot move (${(t.o.conds || []).join(', ') || 'held'}).`);
      if (steps != null && steps * b.per > most) {
        const path = MAP.zonePath(zones, from.zone, zone.id) || [from.zone];
        const hops = Math.max(1, Math.floor(most / MAP.ZONE_CELLS));
        const stop = MAP.zoneOf(zones, path[Math.min(path.length - 1, hops)]);
        if (stop.id !== zone.id) {
          const sg2 = MAP.gridOf(m, siteId, stop);
          const c = MAP.freeNear(sg2, heldIn(s, stop.id, sg2.cols, { except: key }), ...MAP.anchor(sg2, MAP.sideToward(stop, fromZ)));
          if (c) { to = { site: siteId, zone: stop.id, x: c[0], y: c[1] }; zone = stop; engage = null; notes.push(`${t.o.name} can only get as far as ${stop.name} this turn.`); }
        }
      }
      if (mine) fight.moved = (fight.moved || 0) + (steps == null ? 0 : steps * b.per);
    } else if (mine && steps != null) fight.moved = (fight.moved || 0) + steps * b.per;
  }
  m.at[key] = to;
  if (t.kind === 'char' && to.zone !== from.zone && ctx.events) ctx.events.push({ ev: 'enter', site: siteId, zone: zone.id, args: [zone.id, String(zone.name || '').toLowerCase()], char: t.id });
  const quiet = t.kind === 'creature' && t.o.hidden;
  if (!quiet && (to.zone !== from.zone || engage)) {
    story(s, ctx, 'event', engage ? `${t.o.name} ${to.zone !== from.zone ? `moves to ${zone.name} and ` : ''}closes in on ${engage.o.name}.` : `${t.o.name} moves to ${zone.name}.`, 'Engine');
  }
  s.map.lastNote = notes.join(' ');
};
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
  const sites = advSites(s, ctx);
  const st = id ? sites.find((x) => x.id === id) : sites.find((x) => x.id === s.scene.siteId);
  if (id && !st && id !== s.scene.siteId) no('There is no such place.');
  return st ? st.id : s.scene.siteId;
};
// The zones of a place, as the host edits them (or back to the adventure's own with reset).
H['map.zones'] = (s, a, ctx) => {
  hostOnly(ctx);
  const m = mapUp(s);
  const id = siteRef(s, ctx, a.siteId);
  if (a.reset) { delete m.zones[id]; siteZones(s, ctx, id); return; }
  const list = MAP.normZones(a.zones);
  if (!list.length) no('A place needs at least one zone.');
  m.zones[id] = list;
};
// A battle map for a whole place: a picture with its squares counted (and walls, from a Universal VTT file).
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
  if (cols && rows) for (const k of Object.keys(m.at)) if (m.at[k].site === id) delete m.at[k];
};
// A battle map for one zone (when the place has no map of its own).
H['map.grid'] = (s, a, ctx) => {
  hostOnly(ctx);
  const m = mapUp(s);
  const id = siteRef(s, ctx, a.siteId);
  const z = MAP.zoneOf(siteZones(s, ctx, id), a.zoneId);
  if (!z) no(`There is no such zone here. Zones: ${siteZones(s, ctx, id).map((x) => x.name).join(', ')}.`);
  const k = `${id}/${z.id}`;
  if (a.clear) { delete m.grids[k]; return; }
  const cols = Math.trunc(Number(a.cols) || 6); const rows = Math.trunc(Number(a.rows) || 6);
  if (!(cols >= 2 && cols <= MAP.MAX_CELLS && rows >= 2 && rows <= MAP.MAX_CELLS)) no(`A zone's battle map has 2 to ${MAP.MAX_CELLS} squares a side.`);
  const pic = a.url ? picture(a) : {};
  m.grids[k] = { ...pic, cols, rows, walls: MAP.cleanSegs(a.walls, MAP.MAX_WALLS, cols, rows), doors: MAP.cleanSegs(a.doors, 400, cols, rows) };
};
H['map.travel'] = (s, a, ctx) => { hostOnly(ctx); const m = mapUp(s); if (a.clear) { m.travel = null; return; } m.travel = picture(a); };
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
H['map.reset'] = (s, a, ctx) => { hostOnly(ctx); const m = mapUp(s); for (const k of Object.keys(m.at)) if (m.at[k].site === s.scene.siteId) delete m.at[k]; };

// ------------------------------------------------------------------ the cast (from v3, 28 Nov 2026)
// The table's memory of who and what it has met: people, factions, places and threads (a debt, a grudge, a
// promise), one card each with a few short facts, so the Director keeps them the same all game and can bring
// them back. The Director writes them (remember); the host reads and clears them on the Chronicle tab.
const CAST_KINDS = ['person', 'faction', 'place', 'thread'];
const MAX_CAST = 400;
const MAX_FACTS = 16;
export const castKey = (name) => `k-${String(name).toLowerCase().replace(/^(the|a|an) /, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`;
const isParty = (s, name) => Object.values(s.chars).some((c) => castKey(c.name) === castKey(name) || castKey(String(c.name).split(/\s+/)[0]) === castKey(name));
// From the page when the adventure names it; else it came up at the table (or the Director made it up).
function castOrigin(s, ctx, name, asked) {
  const n = String(name).toLowerCase().replace(/^(the|a|an) /, '');
  const adv = adventureOf(s, ctx.mod);
  if (n.length >= 3 && JSON.stringify(adv || {}).toLowerCase().includes(n)) return 'page';
  return ['page', 'table', 'improvised'].includes(asked) ? asked : 'table';
}
H['cast.remember'] = (s, a, ctx) => {
  hostOnly(ctx);
  s.cast = s.cast || {};
  let any = false; let skipped = 0;
  for (const e of (Array.isArray(a.entries) ? a.entries : [a]).slice(0, 20)) {
    const name = str(e.name, 60);
    if (!name) continue;
    if (isParty(s, name)) { skipped += 1; continue; } // their sheet already keeps them
    const key = castKey(name);
    let c = s.cast[key];
    if (!c) {
      if (Object.keys(s.cast).length >= MAX_CAST) no(`The table's memory holds ${MAX_CAST} cards. Ask the host to clear some first.`);
      c = s.cast[key] = { id: key, name, kind: CAST_KINDS.includes(e.kind) ? e.kind : 'person', siteId: s.scene.siteId, origin: castOrigin(s, ctx, name, e.origin), firstSeq: s.seq, lastSeq: s.seq, facts: [] };
    }
    c.lastSeq = s.seq;
    if (CAST_KINDS.includes(e.kind)) c.kind = e.kind;
    const fact = str(e.fact, 240);
    if (fact && !c.facts.some((f) => f.text.toLowerCase() === fact.toLowerCase())) {
      c.facts.push({ text: fact, seen: e.seen !== false, seq: s.seq, siteId: s.scene.siteId });
      if (c.facts.length > MAX_FACTS) c.facts = c.facts.slice(-MAX_FACTS);
    }
    any = true;
  }
  if (!any && skipped) no('That is one of the party: their sheet already keeps them. Remember the people and threads around them instead.');
  if (!any) no('Give a name to remember.');
};
H['cast.forget'] = (s, a, ctx) => {
  hostOnly(ctx);
  const c = (s.cast || {})[a.id];
  if (!c) no('That card is not in the table\'s memory.');
  if (a.fact != null) c.facts = c.facts.filter((f, i) => i !== Number(a.fact));
  else delete s.cast[a.id];
};

// ------------------------------------------------------------------ pictures in play (engine/pictures.js)
// state.art: { now: { url, w, h, about, n } | null, shown: [url], n }. A linked picture shows by itself once,
// the first time the party reaches its place or fights its creature; the host shows any, or takes it down.
const artUp = (s) => (s.art = s.art || { now: null, shown: [], n: 0 });
function showArt(s, p) {
  const A = artUp(s);
  A.n += 1;
  A.now = { url: p.url, w: Math.trunc(p.w) || 0, h: Math.trunc(p.h) || 0, about: str(p.about, 200), n: A.n };
  if (!A.shown.includes(p.url)) A.shown.push(p.url);
}
function autoArt(s, ctx, keys) {
  const adv = adventureOf(s, ctx.mod);
  if (!adv || !(adv.pictures || []).length) return;
  const A = artUp(s);
  for (const [kind, id] of keys) {
    const p = artFor(adv, kind, id).find((x) => !A.shown.includes(x.url));
    if (p) { showArt(s, p); return; }
  }
}
H['art.show'] = (s, a, ctx) => {
  hostOnly(ctx);
  const p = ((adventureOf(s, ctx.mod) || {}).pictures || []).find((x) => x.url === a.url);
  if (!p) no('That picture is not one of this adventure\'s.');
  showArt(s, p);
};
H['art.close'] = (s, a, ctx) => { hostOnly(ctx); artUp(s).now = null; };

export function viewFor(state, role) {
  if (role === 'host') return state;
  const s = structuredClone(state);
  for (const [id, k] of Object.entries(s.creatures)) if (k.hidden) delete s.creatures[id];
  s.rolls = s.rolls.filter((r) => !r.secret);
  s.hostNotes = '';
  delete s.seeds; delete s.seedLog; delete s.seedNow; delete s.drift; delete s.driftKey; delete s.restAfter;
  s.story = s.story.filter((e) => e.kind !== 'host');
  if (s.art) s.art = { now: s.art.now, n: s.art.n }; // which pictures were shown is the host's
  delete s.cast; // the table's memory is the host's and the Director's
  // The map: only who this screen can see, and no host notes on zones.
  if (s.map) {
    s.map.at = Object.fromEntries(Object.entries(s.map.at || {}).filter(([k]) => (k.startsWith('char:') ? !!s.chars[k.slice(5)] : !!s.creatures[k.slice(9)])));
    s.map.zones = Object.fromEntries(Object.entries(s.map.zones || {}).map(([id, list]) => [id, list.map((z) => ({ ...z, note: '' }))]));
    delete s.map.cameFrom; delete s.map.lastNote;
  }
  return s;
}

export const ACTIONS = Object.keys(H);
