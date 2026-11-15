// The Pulse War: order, Cycles, player actions, and the creature runner that plays Bestiary scripts with no model call.
import { parseWhen, parseDo } from './data.mjs';
import { bandIdx, bandAt, buildPool, rollPool, conditionMods, creatureLook } from './rules.mjs';
import { upOrgs, orgs, creaturesHere, liveCreatures, hostileCreatures, emit, say, hurt, mark, end, addCondition, site } from './world.mjs';
import { d6 } from './rng.mjs';

const keyOrg = (id) => `org:${id}`;
const keyCre = (id) => `cre:${id}`;

export function dist(c, o) { return Math.max(0, bandIdx(c.band) - o.close); }
const reachOf = (D, o) => bandIdx(String(o.weapon.band).toLowerCase());
export const strikeCost = (o) => 2 + (o.weapon.props.includes('Heavy') ? 1 : 0);
export function orgMT(D, o, extra = 0) { const m = conditionMods(D, o); return o.mtBase + (m.mt || 0) + extra; }
export function orgPP(D, o) { return Math.max(0, o.ppMax + (conditionMods(D, o).pp || 0)); }

export function startFight(g) {
  const s = g.s;
  if (s.fight) return;
  const foes = hostileCreatures(g);
  if (!foes.length) return;
  emit(g, 'pulse-war-starts');
  if (s.chase || s.ended) return; // a Clock the war moved may have ended it (the Render Charge)
  const rows = [];
  for (const o of upOrgs(g)) rows.push({ key: keyOrg(o.id), f: d6(g) + o.baselines.DFF + (o.pathways['Pulse Discipline'] || 0), player: 1 });
  for (const c of foes) rows.push({ key: keyCre(c.cid), f: d6(g) + (g.D.blocks[c.block].numbers.freqMod || 0), player: 0 });
  rows.sort((a, b) => b.f - a.f || b.player - a.player);
  s.fight = { cycle: 1, order: rows.map((r) => r.key), i: -1, started: s.scene.n };
  say(g, 'A Pulse War begins.', 'fight');
  startCycle(g);
}

function startCycle(g) {
  const f = g.s.fight;
  f.i = -1;
  for (const o of orgs(g)) { o.drifted = false; o.hurtThisCycle = false; for (const c of o.conditions) if (c.left != null) c.left -= 1; o.conditions = o.conditions.filter((c) => c.left == null || c.left > 0); }
  for (const c of creaturesHere(g)) { if (c.segMax && !c.down) c.seg = Math.min(c.segMax, c.seg + 1); c.braced = false; c.strikes = 0; }
  const sit = site(g);
  for (const o of upOrgs(g)) if (o.zone) emit(g, `in-zone:${o.zone}`, { org: o });
}

function actorBody(g, key) { return key.startsWith('org:') ? g.s.orgs[key.slice(4)] : g.s.cres[key.slice(4)]; }

export function currentActor(g) {
  const f = g.s.fight;
  return f && f.i >= 0 ? f.order[f.i] : null;
}

// Run the fight forward until a player must choose, a reaction is pending, or the war ends.
export function advance(g) {
  const s = g.s;
  for (let guard = 0; guard < 400 && s.fight && !s.pending && !s.ended; guard++) {
    if (fightOver(g)) { endFight(g); return; }
    const f = s.fight;
    const key = currentActor(g);
    const body = key ? actorBody(g, key) : null;
    const live = body && (key.startsWith('org:') ? body.state === 'up' : !body.down && !body.stoodDown);
    if (key && live && f.turnOpen) {
      if (key.startsWith('cre:')) { if (runCreature(g, body, true) === 'wait') return; endTurn(g); continue; }
      return; // a player's turn: wait for a move
    }
    // open the next turn
    f.i += 1;
    if (f.i >= f.order.length) { endCycle(g); continue; }
    const k = f.order[f.i];
    const b = actorBody(g, k);
    f.turnOpen = false;
    if (k.startsWith('org:')) {
      if (b.state === 'dormant') { b.countdown += 1; say(g, `${b.name} is slipping.`, 'down'); if (b.countdown >= b.countdownMax) { b.state = 'lysed'; say(g, `${b.name} is lost to Total Lysis.`, 'down'); } continue; }
      if (b.state !== 'up') continue;
      b.pp = orgPP(g.D, b); b.hit = false; f.turnOpen = true;
      if (b.stress < 0) b.stress = 0;
      return; // wait for the player
    }
    if (b.down || b.stoodDown) continue;
    b.pp = Math.max(0, b.ppMax + (conditionMods(g.D, b).pp || 0)); f.turnOpen = true; b.running = false; b.struck = null; b.hit = false;
  }
}

export function endTurn(g) {
  const f = g.s.fight;
  if (!f) return;
  const key = currentActor(g);
  const b = key ? actorBody(g, key) : null;
  if (b) { b.pp = 0; if (key.startsWith('cre:')) { b.running = false; b.first = false; } }
  f.turnOpen = false;
}

function endCycle(g) {
  const f = g.s.fight;
  for (const o of orgs(g)) { o.reserve = 0; o.pp = 0; if (o.state === 'up' && !o.hurtThisCycle && o.stress > 0 && !o.atpSpent) o.stress -= 1; o.atpSpent = false; }
  for (const c of creaturesHere(g)) c.reserve = 0;
  f.cycle += 1;
  if (fightOver(g)) { endFight(g); return; }
  startCycle(g);
}

export function fightOver(g) {
  const hostile = hostileCreatures(g);
  return hostile.length === 0 || upOrgs(g).length === 0;
}

export function endFight(g) {
  const s = g.s;
  if (!s.fight) return;
  s.fight = null; s.pending = null;
  for (const o of orgs(g)) { o.pp = 0; o.reserve = 0; }
  say(g, 'The Pulse War ends.', 'fight');
  if (upOrgs(g).length === 0 && !s.chase) end(g, 'carcass-ends');
}

// ---- Player actions in a fight (costs from the action table) ----
export function playerPool(D, o, c) {
  const cls = o.weapon.cls;
  const base = cls === 'Resonator' ? 'RTC' : cls === 'Weight' ? 'VSC' : 'DFF';
  const path = cls === 'Resonator' ? 'Catalysis' : 'Membrane Penetration';
  const mods = [];
  if (o.weapon.bonusDice) mods.push({ id: 'apparatus', dice: o.weapon.bonusDice });
  if (o.weapon.props.includes('Braced') && !o.drifted) mods.push({ id: 'braced', dice: 1 });
  const cm = conditionMods(D, o);
  if (cm[base.toLowerCase()]) mods.push({ id: 'condition', dice: cm[base.toLowerCase()] });
  const p = buildPool(D, { base: o.baselines[base], path: o.pathways[path] || 0, mods, stress: o.stress });
  return { ...p, base, path };
}

export function playerStrike(g, o, c) {
  const D = g.D;
  o.pp -= strikeCost(o);
  const p = playerPool(D, o, c);
  const at = c.mt + (c.braced ? g.D.blocks[c.block].numbers.bracedMt : 0);
  const r = rollPool(g, p.pool, at);
  if (r.inhibitors) mark(g, o, r.inhibitors);
  c.attacked = true;
  let dmg = 0;
  if (r.success) {
    const bd = o.weapon.bd[Math.min(o.level - 1, o.weapon.bd.length - 1)];
    const soak = Math.max(0, c.soak + (c.braced ? D.blocks[c.block].numbers.bracedSoak : 0));
    if (c.segMax) { dmg = Math.ceil(r.overflow / 3) + 1; c.seg = Math.max(0, c.seg - dmg); if (c.seg === 0) c.down = true; }
    else { dmg = Math.max(1, r.overflow + bd - soak); c.mi = Math.max(0, c.mi - dmg); if (c.mi === 0) c.down = true; }
  }
  say(g, r.success ? `${o.name} hits ${c.name}: ${creatureLook(c)}.` : `${o.name} misses ${c.name}.`, 'strike');
  emit(g, 'strike', { org: o });
  if (o.zone) emit(g, `strike:in-zone:${o.zone}`, { org: o });
  if (r.success && o.weapon.type === 'Kinetic') emit(g, 'kinetic-hit', { org: o });
  if (o.drifted && o.weapon.props.includes('Momentum')) emit(g, 'momentum', { org: o });
  if (c.down) { say(g, `${c.name} is destroyed.`, 'down'); }
  return { roll: r, dmg };
}

// ---- Creatures ----
function whenOk(g, c, r) {
  const f = g.s.fight;
  for (const w of parseWhen(r.when)) {
    switch (w.t) {
      case 'always': break;
      case 'first-turn': if (!c.first) return false; break;
      case 'cycle': if (f.cycle !== w.n) return false; break;
      case 'pp': if (c.pp < w.n) return false; break;
      case 'foe-in': if (!upOrgs(g).some((o) => dist(c, o) <= bandIdx(w.band))) return false; break;
      case 'no-foe-in-reach': if (upOrgs(g).some((o) => dist(c, o) <= 0)) return false; break;
      case 'marked-foe-in': if (!upOrgs(g).some((o) => o.conditions.some((x) => x.id === 'Marked') && dist(c, o) <= bandIdx(w.band))) return false; break;
      case 'attached': if (!c.hostId) return false; break;
      case 'corpse-in-contact': case 'corpse-at-site': if (!creaturesHere(g).some((x) => x.down) && !orgs(g).some((o) => o.state === 'dormant')) return false; break;
      case 'ally-hit-marked': if (!c.allyHitMarked) return false; break;
      case 'hurt': if ((c.segMax ? c.seg / c.segMax : c.mi / c.miMax) > 0.6) return false; break;
      case 'was-attacked': if (!c.attacked) return false; break;
      case 'did-hit': if (!c.hit) return false; break;
      case 'not-braced': if (c.braced) return false; break;
      case 'uses-left': { const sp = g.D.blocks[c.block].specials.find((x) => x.id === w.id); if (!sp || (sp.limit && (c.uses[w.id] || 0) >= 1)) return false; break; }
      default: return false;
    }
  }
  return true;
}

export function pickTarget(g, c, name) {
  const ups = upOrgs(g);
  if (!ups.length) return null;
  const near = [...ups].sort((a, b) => dist(c, a) - dist(c, b) || a.mi - b.mi);
  switch (name) {
    case 'slowest': return [...ups].sort((a, b) => a.baselines.DFF - b.baselines.DFF || dist(c, a) - dist(c, b))[0];
    case 'loudest': return [...ups].sort((a, b) => b.stress - a.stress)[0];
    case 'marked': return ups.find((o) => o.conditions.some((x) => x.id === 'Marked')) || near[0];
    case 'holding-reserve': return ups.find((o) => o.reserve > 0) || near[0];
    case 'host': return (c.hostId && g.s.orgs[c.hostId]) || near[0];
    case 'read-target': return (c.readId && g.s.orgs[c.readId]) || near[0];
    case 'struck': return (c.struck && g.s.orgs[c.struck]) || near[0];
    default: return near[0];
  }
}

const REACH = 0; // a creature strikes at Contact (the Bestiary prints no reach for a Strike: a gap the report lists)

function canDo(g, c, d) {
  switch (d.a) {
    case 'strike': { if (c.pp < 2) return false; if (c.segMax && c.strikes >= Math.min(3, Math.floor(c.seg / 2))) return false; const t = pickTarget(g, c, d.target); return !!t && dist(c, t) <= REACH; }
    case 'special': { const sp = g.D.blocks[c.block].specials.find((x) => x.id === d.id); if (!sp || c.pp < sp.pp) return false; if (sp.limit && (c.uses[d.id] || 0) >= 1) return false; return !!pickTarget(g, c, d.target); }
    case 'drift-toward': return c.pp >= 1 && bandIdx(c.band) > 0;
    case 'drift-away': return c.pp >= 1 && bandIdx(c.band) < 4;
    case 'drift-through': return c.pp >= 1;
    case 'brace': return c.pp >= 1 && !c.braced;
    case 'reserve': return c.pp >= 1 && !c.reserve;
    case 'announce': return !c.announced;
    case 'end': return true;
    default: return false;
  }
}

// Plays the script from where it stands. Returns 'wait' if a player's Reserve may interrupt, else 'done'.
export function runCreature(g, c, resume = false) {
  if (!resume) { c.first = c.first && false; }
  const D = g.D;
  const b = D.blocks[c.block];
  if (!c.running) { c.running = true; c.announced = false; c.done = new Set(); }
  for (let iter = 0; iter < 30; iter++) {
    let did = null;
    for (const [idx, r] of b.script.entries()) {
      const d = parseDo(r.do);
      if (!['strike', 'drift-toward', 'drift-away', 'drift-through', 'special'].includes(d.a) && c.done.has(idx)) continue;
      if (!whenOk(g, c, r) || !canDo(g, c, d)) continue;
      did = { idx, d };
      break;
    }
    if (!did) return 'done';
    const { idx, d } = did;
    if (d.a === 'end') return 'done';
    if (d.a === 'announce') { c.announced = true; c.done.add(idx); say(g, `${c.name} shows its intent.`, 'cue'); continue; }
    if (d.a === 'brace') { c.pp -= 1; c.braced = true; c.done.add(idx); continue; }
    if (d.a === 'reserve') { c.pp -= 1; c.reserve = 1; c.done.add(idx); continue; }
    if (d.a === 'drift-toward') { c.pp -= 1; c.band = bandAt(bandIdx(c.band) - 1); continue; }
    if (d.a === 'drift-away') { c.pp -= 1; c.band = bandAt(bandIdx(c.band) + 1); continue; }
    if (d.a === 'drift-through') { c.pp -= 1; c.done.add(idx); continue; }
    const t = pickTarget(g, c, d.target);
    if (d.a === 'strike') {
      c.pp -= 2; c.strikes = (c.strikes || 0) + 1;
      if (t.reserve > 0 && !t.reacted) { g.s.pending = { kind: 'react', cid: c.cid, target: t.id, dice: 0, special: null }; return 'wait'; }
      creatureStrike(g, c, t, null);
      continue;
    }
    if (d.a === 'special') {
      const sp = b.specials.find((x) => x.id === d.id);
      c.pp -= sp.pp; c.uses[sp.id] = (c.uses[sp.id] || 0) + 1;
      creatureSpecial(g, c, sp, t);
      continue;
    }
  }
  return 'done';
}

export function creatureStrike(g, c, t, reaction, diceMod = 0) {
  const D = g.D;
  const marked = t.conditions.some((x) => x.id === 'Marked') ? 2 : 0;
  const pool = Math.max(1, c.pool + diceMod + marked);
  const at = orgMT(D, t, reaction === 'deflect' ? 4 : 0);
  const r = rollPool(g, pool, at);
  c.hit = false;
  if (r.success) {
    c.hit = true; c.struck = t.id;
    let amount = r.overflow + c.bd;
    let dmg = Math.max(1, amount - (t.soak || 0));
    if (reaction === 'brace' && (c.type === 'Kinetic' || c.type === 'Osmotic')) dmg = Math.max(1, Math.floor(dmg / 2));
    const before = t.mi;
    t.mi = Math.max(0, t.mi - dmg);
    t.hurtThisCycle = true;
    say(g, `${c.name} hurts ${t.name}.`, 'strike');
    if (before - dmg <= -8) { t.countdown += 1; }
    if (t.mi === 0 && t.state === 'up') { t.state = 'dormant'; say(g, `${t.name} goes down.`, 'down'); }
    if (c.type === 'Lytic' && t.weaponCorroded !== true) t.soak = Math.max(0, t.soak - 0);
  } else say(g, `${c.name} misses ${t.name}.`, 'strike');
  // marked allies: the Bestiary's ally-hit-marked cue
  for (const a of liveCreatures(g)) a.allyHitMarked = r.success && t.conditions.some((x) => x.id === 'Marked');
  return r;
}

function creatureSpecial(g, c, sp, t) {
  const e = sp.effect || {};
  if (e.damage && t) { const r = hurt(g, t, e.damage, e.type, sp.name); say(g, `${c.name} uses ${sp.name} on ${t.name}.`, 'strike'); return; }
  if (e.strikes && t) { const n = e.strikes === 'one per live Segment' ? Math.min(3, c.seg ? Math.ceil(c.seg / 2) : 1) : 1; for (let i = 0; i < n; i++) creatureStrike(g, c, t, null, e.dice || 0); return; }
  if (e.allyFreeStrike && t) { const ally = liveCreatures(g).find((x) => x.cid !== c.cid); if (ally) creatureStrike(g, ally, t, null, 0); return; }
  if (e.conditions && t) { for (const id of [].concat(e.conditions)) { try { addCondition(g, t, id); } catch (er) { g.s.gaps[`special:${sp.id}`] = true; } } return; }
  g.s.gaps[`special:${c.block}:${sp.id}`] = true; // a special whose effect shape the runner does not know yet: narrated, costs paid
  say(g, `${c.name} uses ${sp.name}.`, 'cue');
}

export function resolveReaction(g, choice) {
  const p = g.s.pending;
  const c = g.s.cres[p.cid];
  const t = g.s.orgs[p.target];
  g.s.pending = null;
  if (choice !== 'none') { t.reserve = 0; t.reacted = true; }
  creatureStrike(g, c, t, choice === 'none' ? null : choice);
  t.reacted = false;
  c.running = true;
  advance(g);
}
