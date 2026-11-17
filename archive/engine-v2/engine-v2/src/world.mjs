// The game state and everything that is not a Pulse War: sites, flags, events, Clocks, hazards, interactables.
// Plain data in g.s (structuredClone-able); the four data files are g.D and are never changed.
import { parseEffect } from './data.mjs';
import { bandIdx, bandAt, threshold, buildPool, rollPool, homeostatic, conditionMods } from './rules.mjs';

export const clone = (g) => ({ D: g.D, s: structuredClone(g.s) });

export function say(g, text, kind = 'line') { g.s.log.push({ n: g.s.log.length + 1, kind, text }); }

export function newGame(D, { seed = 1, handIds = null } = {}) {
  const ids = handIds || D.vector.hands;
  const s = {
    rngState: seed >>> 0, log: [], flags: {}, events: [], eventCount: {}, scene: { siteId: null, n: 0 }, ended: null,
    clocks: Object.fromEntries(D.vector.clocks.map((c) => [c.id, { n: 0, max: c.segments }])),
    orgs: {}, order: [], cres: {}, nextCid: 1, fight: null, pending: null, chase: null,
    hazardFired: {}, discovered: {}, disarmed: {}, done: {}, awarded: {}, offers: {}, spawned: {}, gaps: {}, stamped: false,
    sceneEvents: {}, sessionEvents: {}, modifiers: [],
  };
  for (const id of ids) {
    const h = D.hands[id];
    const w = D.apparatus[(h.weapons.find((x) => x.carried !== false) || h.weapons[0]).id];
    const soak = h.grafts.reduce((a, gid) => a + ((D.grafts[gid] || {}).soak || 0), 0);
    s.orgs[id] = {
      id, name: h.hand, phenotype: h.phenotype, level: h.level, baselines: { ...h.baselines }, pathways: { ...h.pathways },
      mi: h.derived.miMax, miMax: h.derived.miMax, atp: h.derived.atpMax, atpMax: h.derived.atpMax, stress: 0,
      countdown: 0, countdownMax: h.derived.countdown, oathBoxes: h.derived.oath, oaths: [], substrate: h.substrate,
      spec: { C: 0, G: 0, P: 0, T: 0 }, bulk: h.derived.bulk, mtBase: h.derived.mt, ppMax: h.derived.pp, pp: 0, soak,
      weapon: w, conditions: [], reserve: 0, close: 0, zone: null, state: 'up', codon: 0, drifted: false,
    };
    s.order.push(id);
  }
  return { D, s };
}

export const orgs = (g) => g.s.order.map((id) => g.s.orgs[id]);
export const upOrgs = (g) => orgs(g).filter((o) => o.state === 'up');
export const site = (g) => g.D.sites[g.s.scene.siteId];
export const creaturesHere = (g) => Object.values(g.s.cres).filter((c) => c.siteId === g.s.scene.siteId);
export const liveCreatures = (g) => creaturesHere(g).filter((c) => !c.down && !c.stoodDown);
export const hostileCreatures = (g) => liveCreatures(g).filter((c) => c.stance === 'hostile' || c.stance === 'hunting');

export function spawn(g, def, siteId) {
  const b = g.D.blocks[def.block];
  const out = [];
  for (let i = 0; i < def.count; i++) {
    const cid = `c${g.s.nextCid++}`;
    const n = b.numbers;
    const c = {
      cid, block: b.id, name: def.count > 1 ? `${b.name} ${String.fromCharCode(65 + i)}` : b.name, siteId,
      band: def.band, stance: def.stance, mt: n.mt, mi: n.segments ? 0 : n.mi, miMax: n.segments ? 0 : n.mi,
      seg: n.segments || 0, segMax: n.segments || 0, soak: n.soak, bd: n.bd, type: n.type, pool: n.pool, ppMax: n.pp, pp: 0,
      conditions: [], reserve: 0, down: false, stoodDown: null, ladder: b.ladder, uses: {}, braced: false,
      attacked: false, hit: false, struck: null, held: def.stance === 'guarding' ? true : false, first: true,
      hostileOn: def.hostileOn || [], standsDownOn: def.standsDownOn || [], leavesOn: def.leavesOn || [],
    };
    g.s.cres[cid] = c;
    out.push(c);
  }
  return out;
}

// ---- Clocks ----
export function moveClock(g, id, change, why) {
  const c = g.s.clocks[id];
  const before = c.n;
  c.n = Math.max(0, Math.min(c.max, c.n + change));
  if (c.n === before) return false;
  say(g, `${id} ${change > 0 ? 'moves forward' : 'falls back'}: ${why}.`, 'clock');
  if (c.n > before) emit(g, `clock:${id}:${c.n}`);
  if (c.n === c.max) {
    const rec = g.D.vector.clocks.find((x) => x.id === id);
    if (rec && rec.atFull) end(g, rec.atFull);
  }
  return true;
}

export function end(g, endingId) {
  if (g.s.ended) return;
  g.s.ended = endingId;
  const e = g.D.vector.endings.find((x) => x.id === endingId);
  say(g, e ? e.says : endingId, 'ending');
}

// ---- Events: the one place Clocks, creatures' stance and hazards react ----
export function emit(g, name, ctx = {}) {
  const s = g.s;
  s.events.push(name);
  s.eventCount[name] = (s.eventCount[name] || 0) + 1;
  const sceneKey = `${s.scene.n}:${name}`;
  const first = !s.sceneEvents[sceneKey];
  s.sceneEvents[sceneKey] = true;
  const firstSession = !s.sessionEvents[name];
  s.sessionEvents[name] = true;
  // 1. Clock triggers, from the Vector's table.
  for (const t of g.D.vector.clockTriggers) {
    if (t.event !== name) continue;
    if (t.site !== 'any' && t.site !== s.scene.siteId) continue;
    if (t.limit === 'per-scene' && !first) continue;
    if (t.limit === 'per-session' && !firstSession) continue;
    moveClock(g, t.clock, t.change, name);
  }
  // 2. Creatures: stance changes, standing down, leaving.
  for (const c of creaturesHere(g)) {
    if (c.down || c.stoodDown) continue;
    if (c.standsDownOn.includes(name)) { c.stoodDown = name; say(g, `${c.name} stands down.`, 'stance'); }
    else if (c.hostileOn.includes(name) && c.stance !== 'hostile') { c.stance = 'hostile'; say(g, `${c.name} turns on the Cohort.`, 'stance'); }
  }
  // 3. Creatures that arrive on an event.
  const sit = site(g);
  if (sit) for (const def of sit.creatures) {
    const key = `${sit.id}:${def.block}:${def.band}`;
    const hit = (def.present && def.present === `on:${name}`) || (def.alsoPresentOn || []).includes(name);
    if (hit && !s.spawned[key]) {
      s.spawned[key] = true;
      for (const c of spawn(g, def, sit.id)) say(g, `${c.name} arrives.`, 'arrive');
    }
  }
  if (!s.fight && !s.chase && hostileCreatures(g).length) s.wantFight = true;
  // 4. Hazards whose trigger is this event.
  if (sit) for (const hz of sit.hazards) if ((hz.trigger || []).some((t) => t === name)) fireHazard(g, hz, ctx);
}

export function hazardKey(g, hz) {
  const f = g.s.fight;
  if (hz.frequency === 'once') return hz.id;
  return f ? `${hz.id}:cycle${f.cycle}:${g.s.scene.n}` : `${hz.id}:scene${g.s.scene.n}`;
}

export function fireHazard(g, hz, ctx = {}) {
  const s = g.s;
  if (s.disarmed[hz.id]) return false;
  if (hz.discovery && false) return false;
  if (hz.clockGate && s.clocks[hz.clockGate.clock].n < hz.clockGate.at) return false;
  const key = hazardKey(g, hz);
  if (s.hazardFired[key]) return false; // the budget: once per Cycle in a Pulse War, once per scene outside, or once
  s.hazardFired[key] = true;
  const targets = hz.targets === 'one' ? [ctx.org || upOrgs(g)[0]].filter(Boolean)
    : hz.targets === 'zone' ? upOrgs(g).filter((o) => o.zone && (hz.trigger || []).some((t) => t.endsWith(`:${o.zone}`)))
      : upOrgs(g);
  say(g, `${hz.name} goes off.`, 'hazard');
  for (const o of targets) {
    if (hz.amount > 0) hurt(g, o, hz.amount, hz.type, `${hz.name}`);
    for (const cid of hz.conditions || []) addCondition(g, o, cid);
  }
  if (hz.bandShift) for (const c of liveCreatures(g)) c.band = bandAt(bandIdx(c.band) + hz.bandShift);
  const sp = g.D.afterHazard && g.D.afterHazard[hz.id];
  if (sp) startSetPiece(g, sp);
  return true;
}

export function startSetPiece(g, id) {
  if (id === 'the-race') {
    g.s.fight = null;
    for (const c of liveCreatures(g)) c.stoodDown = 'the-race';
    g.s.chase = { id, cycle: 0, limit: 3, pos: Object.fromEntries(upOrgs(g).map((o) => [o.id, 'far'])), out: [] };
    say(g, 'The gut contracts. It is a race now, not a fight.', 'set-piece');
  }
}

// ---- Bodies ----
export function addCondition(g, body, id, cycles = null) {
  if (!g.D.conditions[id]) throw new Error(`Unknown condition ${id}`);
  if (!(body.conditions || (body.conditions = [])).some((c) => c.id === id)) body.conditions.push({ id, left: g.D.conditions[id].timed ? 2 : null });
}

export function hurt(g, o, amount, type, why) {
  const dmg = Math.max(1, amount - (o.soak || 0));
  const before = o.mi;
  o.mi = Math.max(0, o.mi - dmg);
  if (o.mi === 0 && o.state === 'up') { o.state = 'dormant'; say(g, `${o.name} goes down.`, 'down'); checkAllDown(g); }
  return { dmg, before, after: o.mi };
}

export function checkAllDown(g) {
  if (upOrgs(g).length === 0 && !g.s.ended) {
    if (g.s.chase || g.s.clocks.TOLL.n >= g.s.clocks.TOLL.max) end(g, 'carcass-ends');
  }
}

export function mark(g, o, n = 1) {
  o.stress += n;
  if (o.stress >= g.D.core.stress.max) {
    o.stress = 5;
    o.countdown = Math.min(o.countdownMax, o.countdown + 2);
    say(g, `${o.name}'s body turns on itself.`, 'collapse');
    if (o.countdown >= o.countdownMax) o.state = 'lysed';
  }
}

// ---- Entering a site ----
export function enterSite(g, siteId) {
  const s = g.s;
  const sit = g.D.sites[siteId];
  const from = s.scene.siteId;
  s.scene = { siteId, n: s.scene.n + 1 };
  s.fight = null;
  for (const o of orgs(g)) { o.close = 0; o.zone = null; o.pp = 0; o.reserve = 0; }
  say(g, sit.readAloud, 'arrive');
  s.wantFight = false;
  for (const def of sit.creatures) {
    if (def.present === 'on-arrival' && !s.spawned[`${siteId}:${def.block}:${def.band}`]) {
      s.spawned[`${siteId}:${def.block}:${def.band}`] = true;
      spawn(g, def, siteId);
    }
  }
  for (const other of Object.values(g.D.sites)) for (const aw of other.awards || []) maybeAward(g, aw, `arrive:${siteId}`);
  for (const [id, a] of Object.entries(s.cres)) if (a.siteId !== siteId && !a.down) a.stoodDown = a.stoodDown || 'left-behind';
  emit(g, `arrive:${siteId}`);
  if (hostileCreatures(g).length) s.wantFight = true;
}

function condMet(g, t) {
  let m;
  if ((m = String(t).match(/^flag:(.+)$/))) return !!g.s.flags[m[1]];
  if ((m = String(t).match(/^not-destroyed:(.+)$/))) return !Object.values(g.s.cres).some((c) => c.block === m[1] && c.down);
  if ((m = String(t).match(/^offer:(.+)$/))) return !!g.s.offers[m[1]];
  return false;
}

export function maybeAward(g, aw, trigger) {
  if (g.s.awarded[aw.id] && aw.once) return;
  const ons = [].concat(aw.on || []);
  if (!ons.includes(trigger)) return;
  if ((aw.if || []).some((c) => !condMet(g, c))) return;
  g.s.awarded[aw.id] = true;
  for (const o of orgs(g)) o.codon += aw.codon;
  say(g, `The Cohort earns ${aw.codon} Codon each (${aw.id}).`, 'award');
}

// ---- Effects of interactables ----
export function applyEffect(g, tok, ctx) {
  const e = parseEffect(tok);
  const s = g.s;
  switch (e.kind) {
    case 'nothing': return;
    case 'flag': s.flags[e.arg] = true; emit(g, `flag:${e.arg}`); return;
    case 'event': emit(g, e.arg, ctx); return;
    case 'discover': s.discovered[e.arg] = true; return;
    case 'disarm': s.disarmed[e.arg] = true; return;
    case 'leaves': for (const c of creaturesHere(g)) if (c.block === e.arg && !c.down) { c.stoodDown = 'left'; say(g, `${c.name} drifts away.`, 'stance'); } return;
    case 'award': for (const aw of site(g).awards || []) maybeAward(g, aw, ctx.interactId || e.arg); return;
    case 'offer': s.offers[e.arg] = true; return;
    case 'oath': return; // filed by the move itself
    case 'gain': ctx.org.substrate += e.unit === 'S' ? e.n : 0; if (e.unit !== 'S') ctx.org.spec[e.unit] = (ctx.org.spec[e.unit] || 0) + e.n; return;
    case 'stamp': s.stamped = true; for (const o of orgs(g)) o.stamped = { ...o.spec }; return;
    case 'yield': if (e.arg === 'site') ctx.org.spec.C += 1; else ctx.org.substrate += 5; return;
    case 'strike-by': { const c = creaturesHere(g).find((x) => x.block === e.arg && !x.down); if (c) { c.stance = 'hostile'; c.pendingStrike = ctx.org.id; } return; }
    case 'hostile': return;
    case 'condition': for (const o of upOrgs(g)) addCondition(g, o, e.arg.split(':')[1]); return;
    case 'rewind': return;
    case 'gain-overflow': { const [u, base, per, cap] = e.arg.split(':'); ctx.org.substrate += Math.min(+cap, +base + +per * (ctx.overflow || 0)); return; }
    case 'reveal': case 'move': case 'site-modifier': case 'advantage': case 'blind': case 'roll':
      if (e.kind === 'move') ctx.org.zone = e.arg.split(' ')[0];
      return; // narration-side effects: the Director is told, the Engine keeps nothing
    default: s.gaps[tok] = true;
  }
}

// ---- Interactables ----
export function needsState(g, o, needs) {
  if (!needs) return { ok: true };
  let m;
  if ((m = needs.match(/^flag:(.+)$/))) return { ok: !!g.s.flags[m[1]] };
  if ((m = needs.match(/^discovered:(.+)$/))) return { ok: !!g.s.discovered[m[1]] };
  if ((m = needs.match(/^found:(.+)$/))) return { ok: !!g.s.discovered[m[1]] };
  if ((m = needs.match(/^offer:(.+)$/))) return { ok: !!g.s.offers[m[1]] };
  if (needs === 'oath-box') return { ok: o.oathBoxes - o.oaths.length > 0 };
  if (needs === 'water') return { ok: o.substrate >= 1 };
  if (needs === 'unstamped') return { ok: orgs(g).some((x) => Object.values(x.spec).some((v) => v > 0)) };
  if ((m = needs.match(/^(\d+) ([CS]) per body$/))) {
    const per = +m[1];
    const total = upOrgs(g).length * per;
    const have = m[2] === 'S' ? upOrgs(g).reduce((a, x) => a + x.substrate, 0) : upOrgs(g).reduce((a, x) => a + x.spec.C, 0);
    return { ok: have >= total };
  }
  if (needs.startsWith('manual:')) return { ok: false, manual: needs.slice(7) }; // the Engine does not know how to check it yet
  return { ok: false, manual: needs };
}

export function pay(g, o, needs) {
  let m;
  if (needs === 'water') o.substrate -= 1;
  if (needs === 'oath-box') return;
  if ((m = (needs || '').match(/^(\d+) ([CS]) per body$/))) {
    for (const x of upOrgs(g)) { if (m[2] === 'S') x.substrate -= +m[1]; else x.spec.C -= +m[1]; }
  }
}

export function poolFor(g, o, spec) {
  // "OSM + Chemoreception", "OSM or RTC + Synthesis": the first baseline listed is used (the other is a choice).
  const m = String(spec || '').match(/^([A-Z]{3})(?: or ([A-Z]{3}))? \+ ([A-Za-z ]+)$/);
  if (!m) return null;
  const pick = m[2] && o.baselines[m[2]] > o.baselines[m[1]] ? m[2] : m[1];
  const cm = conditionMods(g.D, o);
  const mods = [];
  if (cm[pick.toLowerCase()]) mods.push({ id: 'condition', dice: cm[pick.toLowerCase()] });
  for (const sm of g.s.modifiers) mods.push(sm);
  return { baseline: pick, pathway: m[3], ...buildPool(g.D, { base: o.baselines[pick], path: o.pathways[m[3]] || 0, mods, stress: o.stress }) };
}

export function interact(g, o, it) {
  const s = g.s;
  const key = `${s.scene.siteId}/${it.id}`;
  const ns = needsState(g, o, it.needs);
  const ctx = { org: o, interactId: it.id };
  for (const t of it.onAttempt || []) applyEffect(g, t, ctx);
  let result = { ok: true, rolled: null };
  const p = it.pool ? poolFor(g, o, it.pool) : null;
  if (p && it.threshold != null) {
    const at = threshold(g.D, it.threshold);
    if (!s.fight && it.unhurried && homeostatic(p.pool, at)) result = { ok: true, rolled: null, homeostatic: true, at };
    else {
      const r = rollPool(g, p.pool, at);
      if (r.inhibitors) mark(g, o, r.inhibitors);
      result = { ok: r.success, rolled: r, at, pool: p.pool };
      ctx.overflow = r.overflow;
    }
  }
  pay(g, o, it.needs);
  if (it.action === 'swear') o.oaths.push({ at: s.scene.siteId, id: it.id });
  if (result.ok) { for (const t of it.onSuccess || []) applyEffect(g, t, { ...ctx, overflow: ctx.overflow }); if (!it.repeatable) s.done[key] = true; }
  else for (const t of it.onFailure || []) applyEffect(g, t, ctx);
  // Awards that fire when this interactable is done.
  if (result.ok) for (const aw of site(g).awards || []) maybeAward(g, aw, it.id);
  return result;
}
