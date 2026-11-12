// The Ledger: the one shared record of the session. Every screen reads it and
// only this file writes it. An action goes in, a new Ledger comes out, or a
// RuleError explains in plain words why the action is not allowed.

import { rollDice, checkOwnDice, d6 } from './dice.js';
import * as R from './rules.js';
import { successChance } from './odds.js';

export class RuleError extends Error {}

const MAX_ROLLS = 400;
const MAX_LOG = 400;

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const key = (kind, id) => `${kind}:${id}`;

// ---------------------------------------------------------------- new session
export function newGameId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newSession(scenario) {
  const s = {
    v: 1,
    seq: 0,
    scenarioId: scenario.id,
    title: scenario.title,
    // One game, from New game to New game. Its history is kept under saves/games/<gameId>.
    gameId: newGameId(),
    scene: { siteId: scenario.sites[0].id },
    players: {},
    organisms: {},
    creatures: {},
    clocks: {},
    fight: null,
    // Which site hazard last went off, and when. CORE 8.1: a Cycle is six seconds of combat, so
    // inside a Pulse War a hazard is budgeted per Cycle; outside one there are no Cycles and the
    // unit is the scene, whose number is sceneNo (bumped by scene.set, where the place or the
    // purpose changes). Bench 12-13 Nov: this budget was only prose for the Director, so the same
    // gas pocket went off twice in one scene.
    hazards: {},
    sceneNo: 1,
    requests: [],
    rolls: [],
    log: [],
    story: [],
    // Session zero: agreed before play. The pause word stops the scene at once.
    zero: { pauseWord: 'SLACK WATER', tone: '', lines: [], open: true },
    cohesion: 0, // the table's shared trust; an Oath kept pays one (CORE 11.4)
    // The table's memory: people, factions, places and threads met in play, so the Director
    // keeps them consistent and can bring them back. Host and Director only.
    cast: {},
    // How far the Director may go beyond the page: 'page' (nothing it was not given),
    // 'callbacks' (people and threads from earlier may return; the default), and later
    // 'adlib' (it may also invent people and encounters, written down as canon).
    improv: 'callbacks',
    // Sharing out the harvest (Roly, 12 Nov 2026): every Specimen is offered in turn, by a picking
    // order that rotates and is kept for the whole game. Take it or pass, you go to the back.
    loot: { order: [], queue: [], offer: null, auto: {} }, // auto: a player's standing choice per grade
    nextId: 1,
  };
  for (const h of scenario.hands) s.organisms[h.id] = makeOrganism(h);
  for (const c of scenario.clocks) s.clocks[c.id] = { id: c.id, name: c.name, segments: c.segments, filled: 0, says: c.says };
  return s;
}

// A new game. With keepPlayers the table stays seated: the same people and the same session-zero
// terms, and, in the same Vector, the same organisms under the names they gave them, on fresh
// sheets. A different Vector has different organisms, so everyone chooses again.
export function restart(old, scenario, { keepPlayers = false } = {}) {
  const s = newSession(scenario);
  if (keepPlayers && old) {
    const same = old.scenarioId === scenario.id;
    s.zero = { ...s.zero, ...clone(old.zero || {}) };
    for (const [pid, p] of Object.entries(old.players || {})) {
      const oid = same && p.organismId && s.organisms[p.organismId] ? p.organismId : null;
      s.players[pid] = { name: p.name, organismId: oid, agreed: !!p.agreed };
      if (oid) {
        const was = (old.organisms || {})[oid] || {};
        s.organisms[oid].playerId = pid;
        if (was.named) { s.organisms[oid].name = was.name; s.organisms[oid].named = true; }
      }
    }
  }
  if (keepPlayers && old && old.scenarioId === scenario.id && old.loot) {
    s.loot.order = (old.loot.order || []).filter((id) => s.organisms[id] && s.organisms[id].playerId);
    s.loot.auto = clone(old.loot.auto || {});
  }
  const seated = Object.keys(s.players).length;
  say(s, { now: 0 }, `A new game of ${scenario.title} begins${seated ? `, with ${seated} at the table` : ''}.`, 'scene');
  return s;
}

function makeOrganism(h) {
  return {
    id: h.id,
    hand: h.hand,
    name: h.name || h.hand,
    named: false,
    phenotype: h.phenotype,
    level: h.level || 1,
    base: { ...h.base },
    pathways: { ...h.pathways },
    hull: h.hull,
    mi: h.mi,
    miMax: h.mi,
    atp: h.atp,
    atpMax: h.atp,
    stress: 0,
    ppMax: h.pp,
    mt: h.mt,
    flow: h.flow,
    soak: h.soak || 0,
    countdown: 0,
    countdownMax: h.countdown,
    oath: h.oath ?? null,
    oathMax: h.oath ?? null,
    substrate: h.substrate || 0,
    codon: 0,
    weapons: (h.weapons || []).map((w) => ({ ...w })),
    kit: (h.kit || []).slice(),
    notes: h.notes || '',
    tie: h.tie || '',
    firstMove: h.firstMove || '',
    conditions: [],
    band: null,
    dormant: false,
    playerId: null,
  };
}

export function makeCreature(block, { cid, name, band = 'near', siteId = null, group = null } = {}) {
  const swarm = block.segments != null;
  return {
    cid,
    blockId: block.id,
    name: name || block.name,
    cls: block.cls || '',
    tier: block.tier || 1,
    mt: block.mt,
    mi: swarm ? null : block.mi,
    miMax: swarm ? null : block.mi,
    segments: swarm ? block.segments : null,
    segMax: swarm ? block.segments : null,
    soak: block.soak || 0,
    bracedSoak: block.bracedSoak || 0,
    bracedMt: block.bracedMt || 0,
    canReact: !/caged|wounded/i.test(block.cls || ''), // Bestiary: Reactive Osmosis is open to Standards, Elites, Catastrophes and swarm clusters
    bd: block.bd || 0,
    type: block.type || '',
    pool: block.pool,
    ppMax: block.pp,
    flow: block.flow ?? null,
    freqMod: block.freqMod || 0,
    band,
    siteId,
    group: group || block.order || block.id,
    conditions: [],
    down: false,
    hidden: false,
  };
}

// --------------------------------------------------------------------- apply
// ctx: { role: 'host' | 'player' | 'table', pid, rng, now, scenario, bestiary }
export function apply(state, action, ctx) {
  if (!action || typeof action.type !== 'string') throw new RuleError('That action is not understood.');
  const h = HANDLERS[action.type];
  if (!h) throw new RuleError(`Unknown action "${action.type}".`);
  if (h.host && ctx.role !== 'host') throw new RuleError('Only the host can do that.');
  if (ctx.role === 'table') throw new RuleError('The table screen only watches.');
  const s = clone(state);
  s.seq += 1;
  if (!s.story) s.story = []; // sessions saved before the story existed
  h.run(s, action, ctx);
  if (s.rolls.length > MAX_ROLLS) s.rolls = s.rolls.slice(-MAX_ROLLS);
  if (s.log.length > MAX_LOG) s.log = s.log.slice(-MAX_LOG);
  if (s.story.length > MAX_LOG) s.story = s.story.slice(-MAX_LOG);
  return s;
}

// ------------------------------------------------------------------- helpers
// The picking order: every seated organism, in the order kept; newcomers join at the back.
function lootOrder(s) {
  s.loot = s.loot || { order: [], queue: [], offer: null };
  const seated = Object.keys(s.organisms).filter((id) => s.organisms[id].playerId);
  s.loot.order = s.loot.order.filter((id) => seated.includes(id));
  for (const id of seated) if (!s.loot.order.includes(id)) s.loot.order.push(id);
  return s.loot.order;
}
function queueLoot(s, ctx, got, from) {
  lootOrder(s);
  for (const k of GRADES) for (let i = 0; i < (got[k] || 0); i++) s.loot.queue.push({ id: newId(s, 'i'), grade: k, from, siteId: s.scene.siteId });
  if (!s.loot.offer) offerNext(s, ctx);
}
// The front of the order is offered the first item waiting.
function offerNext(s, ctx) {
  const order = lootOrder(s);
  const item = s.loot.queue[0];
  if (!item || !order.length) { s.loot.offer = null; return; }
  s.loot.offer = { itemId: item.id, orgId: order[0], passes: 0 };
  settleAuto(s, ctx);
}
// A player's standing choice ("take every C that comes to me") answers for them when their turn
// comes. Items still go round in order; nobody takes out of turn.
function settleAuto(s, ctx) {
  for (let guard = 0; guard < 400 && s.loot.offer; guard++) {
    const off = s.loot.offer;
    const item = s.loot.queue.find((x) => x.id === off.itemId);
    const rule = ((s.loot.auto || {})[off.orgId] || {})[item.grade];
    if (rule !== 'take' && rule !== 'pass') return;
    decide(s, ctx, rule === 'take', true);
  }
}
// Whoever was offered goes to the back of the order, whether they took it or passed.
function rotate(s, orgId) {
  const o = s.loot.order;
  const i = o.indexOf(orgId);
  if (i >= 0) { o.splice(i, 1); o.push(orgId); }
}
const CAST_KINDS = ['person', 'faction', 'place', 'thread'];
const MAX_CAST = 400;
const MAX_FACTS = 16;
function isCohort(s, name) {
  const n = castKey(name);
  return Object.values(s.organisms || {}).some((o) => [o.name, o.hand].some((v) => v && castKey(v) === n)
    || String(o.name || '').split(/ of (?:the )?/i).some((part) => part.trim().length > 2 && castKey(part) === n));
}
function lootDecide(s, a, ctx, take) {
  const L = s.loot || {};
  const off = L.offer;
  if (!off) throw new RuleError('Nothing is being shared out.');
  if (ctx.ai) throw new RuleError('The players choose what they take. Wait for them.');
  if (ctx.role !== 'host') {
    const p = s.players[ctx.pid];
    if (!p || p.organismId !== off.orgId) throw new RuleError(`It is ${s.organisms[off.orgId].name}'s choice.`);
  }
  if (a.itemId && a.itemId !== off.itemId) throw new RuleError('That item has already been decided.');
  // "Take it, and every one of this grade after": the standing choice is set, then this item is taken.
  if (a.always) {
    const item = L.queue.find((x) => x.id === off.itemId);
    setAuto(s, off.orgId, item.grade, take ? 'take' : 'pass');
  }
  decide(s, ctx, take, false);
}
function setAuto(s, orgId, grade, rule) {
  s.loot.auto = s.loot.auto || {};
  s.loot.auto[orgId] = { ...(s.loot.auto[orgId] || {}) };
  if (rule) s.loot.auto[orgId][grade] = rule; else delete s.loot.auto[orgId][grade];
}
function decide(s, ctx, take, auto) {
  const L = s.loot;
  const off = L.offer;
  const item = L.queue.find((x) => x.id === off.itemId);
  const o = s.organisms[off.orgId];
  rotate(s, off.orgId);
  if (take) {
    o.specimens = o.specimens || { C: 0, G: 0, P: 0, T: 0 };
    o.specimens[item.grade] += 1;
    L.queue = L.queue.filter((x) => x.id !== item.id);
    say(s, ctx, `${o.name} takes a ${item.grade} Specimen from ${item.from}${auto ? ' (a standing choice)' : ''}.`, 'award');
    if (!auto) offerNext(s, ctx); else nextQuiet(s);
    return;
  }
  const passes = off.passes + 1;
  if (passes >= L.order.length) {
    L.queue = L.queue.filter((x) => x.id !== item.id);
    say(s, ctx, `Nobody takes the ${item.grade} Specimen from ${item.from}: it is left in the water.`, 'table');
    if (!auto) offerNext(s, ctx); else nextQuiet(s);
    return;
  }
  say(s, ctx, `${o.name} passes on a ${item.grade} Specimen from ${item.from}${auto ? ' (a standing choice)' : ''}.`, 'table');
  L.offer = { itemId: item.id, orgId: L.order[0], passes };
  if (!auto) settleAuto(s, ctx);
}
// Inside settleAuto's loop: set the next offer without recursing back into it.
function nextQuiet(s) {
  const item = s.loot.queue[0];
  s.loot.offer = item && s.loot.order.length ? { itemId: item.id, orgId: s.loot.order[0], passes: 0 } : null;
}
function castKey(name) { return 'k-' + String(name).toLowerCase().replace(/^(the|a|an) /, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48); }
// A name the Vector prints is from the page; otherwise the Director made it up, or the host or
// the chronicle wrote down something that came up in play.
function castOrigin(name, ctx, asked) {
  const n = String(name).toLowerCase().replace(/^(the|a|an) /, '');
  const text = JSON.stringify((ctx.scenario || {}).sites || []).toLowerCase();
  if (n.length >= 3 && text.includes(n)) return 'page';
  if (['page', 'table', 'improvised'].includes(asked)) return asked;
  return ctx.ai ? 'improvised' : 'table';
}
function say(s, ctx, text, kind = 'info') {
  s.log.push({ seq: s.seq, t: ctx.now || 0, text, kind });
}

function newId(s, prefix) {
  const id = `${prefix}${s.nextId}`;
  s.nextId += 1;
  return id;
}

function org(s, id) {
  const o = s.organisms[id];
  if (!o) throw new RuleError('That organism is not in this session.');
  return o;
}

function cre(s, cid) {
  const c = s.creatures[cid];
  if (!c) throw new RuleError('That creature is not in this scene.');
  return c;
}

function mayControl(s, ctx, orgId) {
  if (ctx.role === 'host') return true;
  const o = s.organisms[orgId];
  return !!o && o.playerId === ctx.pid;
}

function needControl(s, ctx, orgId) {
  if (!mayControl(s, ctx, orgId)) throw new RuleError('That is not your organism.');
}

function hasCond(body, name) {
  return body.conditions.some((c) => c.name === name);
}

function condSum(body, field) {
  return body.conditions.reduce((a, c) => a + ((R.CONDITIONS[c.name] || {})[field] || 0), 0);
}

// Put a printed condition on a set of bodies, or lift it off them, and tell the table once.
// Both the `condition` action's area form and a hazard firing use this, so a condition that
// belongs to a whole chamber costs one call and produces one line, never one per body.
function applyConditionTo(s, ctx, bodies, name, on) {
  if (!bodies.length || !R.CONDITIONS[name]) return 0;
  let touched = 0;
  for (const body of bodies) {
    if (!on) {
      const before = body.conditions.length;
      body.conditions = body.conditions.filter((c) => c.name !== name);
      if (body.conditions.length !== before) touched++;
      continue;
    }
    if (hasCond(body, name)) continue;
    const c = { name };
    if (R.CONDITIONS[name].timed && s.fight) c.until = s.fight.cycle + 1;
    body.conditions.push(c);
    touched++;
  }
  const who = bodies.map((x) => x.name).join(', ');
  const verb = bodies.length === 1 ? 'is' : 'are';
  say(s, ctx, on ? `${who} ${verb} ${name}: ${R.CONDITIONS[name].effect}` : `${who} ${verb} no longer ${name}.`, 'info');
  return touched;
}

export function orgMT(o) {
  return o.mt + condSum(o, 'mt');
}

export function creMT(c) {
  return c.mt + condSum(c, 'mt') + (hasCond(c, 'Braced') ? (c.bracedMt || 0) : 0);
}

function creSoak(c) {
  return c.soak + (hasCond(c, 'Braced') ? c.bracedSoak : 0);
}

function ppFor(s, a) {
  if (a.kind === 'org') {
    const o = s.organisms[a.id];
    return Math.max(0, o.ppMax + condSum(o, 'pp'));
  }
  const c = s.creatures[a.id];
  return Math.max(0, c.ppMax + condSum(c, 'pp'));
}

function actorOf(s, kind, id) {
  return s.fight ? s.fight.actors[key(kind, id)] : null;
}

function nameOf(s, kind, id) {
  return kind === 'org' ? s.organisms[id].name : s.creatures[id].name;
}

function spendPP(s, a, cost, what) {
  if (!a) return;
  if (a.status !== 'acting' && a.status !== 'holding') {
    throw new RuleError(`It is not ${nameOf(s, a.kind, a.id)}'s turn. Wait for your turn, or re-enter if you are holding.`);
  }
  if (a.pp < cost) throw new RuleError(`${what} costs ${cost} PP and ${nameOf(s, a.kind, a.id)} has ${a.pp}.`);
  a.pp -= cost;
}

function addStress(s, ctx, o, n, why) {
  if (n <= 0) return;
  const r = R.markStress(o.stress, n);
  o.stress = r.stress;
  if (r.collapses) {
    o.countdown = clamp(o.countdown + r.countdownMarks, 0, o.countdownMax);
    say(s, ctx, `${o.name} reaches Stress 8: Autophagic Collapse. ${r.countdownMarks} Lysis Countdown boxes marked; Stress drops to 5.`, 'danger');
    checkLysis(s, ctx, o);
  }
  if (why) say(s, ctx, `${o.name} marks ${n} Stress (${why}). Stress is ${o.stress}: ${R.stressNote(o.stress)}.`, 'stress');
}

function checkLysis(s, ctx, o) {
  if (o.countdown >= o.countdownMax) say(s, ctx, `${o.name}'s Lysis Countdown is full: Total Lysis (CORE 5.6).`, 'danger');
}

// THE FIRST CARVE 3.1-3.3 print what the *place* pays on its own: "Advance +1 when: ... the Cohort
// opens a new panel", "-1 when the Cohort harvests what it kills (each body harvested: -1, never
// below 0)", "Advance +1 when: the Cohort is loud in the channels (a Pulse War...)". Those are not
// the Director's discretionary advance, so 3.4's cap (one segment per Clock per session, held by
// `aiAdvanced`) stays exactly as printed and untouched. `scenario.rules.clockTriggers` names which
// Clock each event moves, so another Vector hangs its own clocks on the same events. Rewinds clamp
// at 0 because the page says never below 0.
const clockTrigger = (ctx, name) => (((((ctx || {}).scenario || {}).rules) || {}).clockTriggers || {})[name] || '';
// The promise has to be words the table said: quotes, asterisks and case off, and the promise must
// sit inside something a seated player has said recently (the Cohort promises together). Framing it
// as "X's own words: ..." is not their words, so a promise that merely *contains* a player's
// sentence does not pass.
const oathNorm = (t) => String(t || '').toLowerCase().replace(/[*"_\u201c\u201d]/g, '').replace(/\s+/g, ' ').trim();
function spokenAtTable(s, promise) {
  const p = oathNorm(promise);
  if (!p) return false;
  return (s.story || []).filter((e) => e.kind === 'say').slice(-40).some((e) => {
    const t = oathNorm(e.text);
    return !!t && (t === p || (p.length >= 12 && t.includes(p)));
  });
}

function payClock(s, ctx, id, delta, why) {
  const c = s.clocks[id];
  if (!c || !delta) return null;
  const before = c.filled;
  c.filled = clamp(c.filled + delta, 0, c.segments);
  if (c.filled === before) return null;
  say(s, ctx, `${c.name} moves to ${c.filled} of ${c.segments}: ${why}.`, 'clock');
  return `${c.name} is now ${c.filled} of ${c.segments} (${why})`;
}

// When a site's hazard may go off again, so the Engine, the briefing and the tools all read the
// same budget. CORE 8.1: a Cycle is six seconds of combat, so inside a Pulse War a hazard is
// budgeted per Cycle; outside one there are no Cycles and the unit is the scene (sceneNo, which
// scene.set bumps when the place, the purpose or the people change). `cycle` is null when no
// Pulse War is running.
export function hazardBudget(s, siteId) {
  const cycle = s.fight ? s.fight.cycle : null;
  const scene = s.sceneNo || 1;
  const seen = (s.hazards || {})[siteId];
  if (!seen || seen.cycle !== cycle || seen.scene !== scene) return { open: true, cycle, scene };
  return { open: false, cycle, scene, until: cycle == null ? 'the next scene' : `Cycle ${cycle + 1}` };
}

// Soak applies once, minimum 1 (§4.8). Shared by the host's plain damage ruling and by a hazard
// going off, so both pay the same arithmetic.
function applyDamage(s, ctx, t, amount, dtype, ignoreSoak) {
  if (t.kind === 'org') {
    const o = org(s, t.id);
    const dmg = ignoreSoak ? amount : Math.max(1, amount - o.soak);
    const before = o.mi;
    hurtOrganism(s, ctx, o, dmg);
    say(s, ctx, `${o.name} takes ${dmg} ${dtype || ''} damage${ignoreSoak ? ' (soak ignored)' : o.soak ? ` (${amount} - soak ${o.soak})` : ''}: MI ${before} to ${o.mi}.`, 'hit');
  } else {
    const c = cre(s, t.id);
    if (c.segments != null) {
      c.segments = Math.max(0, c.segments - amount);
      c.down = c.segments === 0;
      say(s, ctx, `${c.name} loses ${amount} Segments${c.down ? ' and is broken' : `: ${c.segments} left`}.`, 'hit');
    } else {
      hurtCreature(s, ctx, c, { overflow: 0, dmg: ignoreSoak ? amount : Math.max(1, amount - creSoak(c)) });
    }
  }
}

function hurtOrganism(s, ctx, o, dmg) {
  const r = R.applyDamage(o.mi, dmg);
  o.mi = r.mi;
  const a = actorOf(s, 'org', o.id);
  if (a) a.tookDamage = true;
  if (r.breach) {
    o.countdown = clamp(o.countdown + 1, 0, o.countdownMax);
    say(s, ctx, `Breach: the hit exceeds ${o.name}'s remaining MI by 8 or more. Straight to Dormancy, and a Countdown box is marked (${o.countdown} of ${o.countdownMax}).`, 'danger');
  }
  if (r.dormant && !o.dormant) {
    o.dormant = true;
    if (!hasCond(o, 'Leaking')) o.conditions.push({ name: 'Leaking', auto: true });
    if (!r.breach) say(s, ctx, `${o.name} is at 0 MI: Dormant and Leaking. An ally at Contact can stabilise with Synthesise (RTC + Synthesis, Threshold ${R.stabiliseAT(o.level)}).`, 'danger');
    checkLysis(s, ctx, o);
  }
  return r;
}

function hurtCreature(s, ctx, c, { overflow, dmg }) {
  if (c.segments != null) {
    const gone = Math.min(c.segments, R.segmentsRemoved(overflow));
    c.segments -= gone;
    if (c.segments <= 0) {
      c.down = true;
      say(s, ctx, `${c.name} loses ${gone} Segments and is broken.`, 'hit');
    } else {
      say(s, ctx, `${c.name} loses ${gone} Segments: ${c.segments} of ${c.segMax} left.`, 'hit');
    }
    return { segments: gone };
  }
  c.mi = Math.max(0, c.mi - dmg);
  if (c.mi === 0) {
    c.down = true;
    say(s, ctx, `${c.name} takes ${dmg} damage and goes down.`, 'hit');
  } else {
    say(s, ctx, `${c.name} takes ${dmg} damage.`, 'hit');
  }
  return { damage: dmg };
}

const SIGNATURE = {
  kinetic: 'push 1 Drift per 4 Overflow, break a graft slot, or inflict Jostled',
  lytic: 'inflict Brittle, -1 soak until repaired, or dissolve one Vial',
  osmotic: 'inflict Turgid or Flaccid, knock into the next band, or force a Fluid Navigation save',
  thermal: 'ignite the fluid for 1 Cycle, inflict Catabolic, or cauterise',
  thermic: 'ignite the fluid for 1 Cycle, inflict Catabolic, or cauterise',
  voltaic: 'inflict Locked or Overclocked, interrupt a Sustained Reaction, or Mark',
  genetic: 'inflict Hijacked, steal a Vial or held Specimen, or force a Sequence save',
};

function poolForCheck(o, { baseline, pathway, mods }) {
  if (!R.BASELINES.includes(baseline)) throw new RuleError('Choose a Baseline: VSC, DFF, RTC, OSM or AFF.');
  const rank = pathway ? (o.pathways[pathway] || 0) : 0;
  const p = R.buildPool({ baseline: o.base[baseline] + condBase(o, baseline), pathway: rank, mods: mods || [], stress: o.stress });
  p.baselineName = baseline;
  p.pathwayName = pathway || null;
  return p;
}

// Conditions that change a Baseline Grade for pools (§4.7).
function condBase(o, baseline) {
  let d = 0;
  if (baseline === 'DFF' && hasCond(o, 'Turgid')) d -= 2;
  if (baseline === 'DFF' && hasCond(o, 'Lodged')) d -= 1;
  if (baseline === 'VSC' && hasCond(o, 'Flaccid')) d -= 2;
  if (baseline === 'RTC' && hasCond(o, 'Denatured')) d -= 2;
  return d;
}

function cleanMods(mods) {
  if (!Array.isArray(mods)) return [];
  return mods
    .map((m) => ({ label: String(m.label || 'Modifier').slice(0, 40), dice: Math.trunc(Number(m.dice) || 0) }))
    .filter((m) => m.dice !== 0)
    .slice(0, 8);
}

// Add or remove dice on a waiting roll, keeping the +5 / -5 cap and Stress honest.
function addDice(s, req, label, dice) {
  const prior = req.pool.parts.filter((p) => !p.label.startsWith('Stress '));
  const stress = req.actor.kind === 'org' ? s.organisms[req.actor.id].stress : 0;
  const fixedPart = prior.find((p) => p.label === 'Printed pool');
  const basePart = prior.find((p) => p.label === 'Baseline');
  const pathPart = prior.find((p) => p.label === 'Pathway');
  const mods = prior.filter((p) => p !== fixedPart && p !== basePart && p !== pathPart).concat([/^Overdrive/.test(label) ? { label, dice, uncapped: true } : { label, dice }]);
  const next = R.buildPool({ baseline: basePart ? basePart.dice : 0, pathway: pathPart ? pathPart.dice : 0, fixed: fixedPart ? fixedPart.dice : null, mods, stress });
  next.baselineName = req.pool.baselineName;
  next.pathwayName = req.pool.pathwayName;
  req.pool = next;
  req.chance = req.at != null ? successChance(Math.min(30, next.dice), req.at) : null;
}

// CORE 1.3: the circumstances a player may claim for their own roll.
export const SITUATIONS = {
  ally1: { label: 'An ally helps', dice: 1 },
  ally2: { label: 'Two allies help', dice: 2 },
  position: { label: 'Good position', dice: 1 },
  tonic1: { label: 'Wrong tonic', dice: -1 },
  tonic2: { label: 'Wrong tonic, badly', dice: -2 },
  cover2: { label: 'Target in partial cover', dice: -2 },
  cover4: { label: 'Target in heavy cover', dice: -4 },
  squeezed: { label: 'Squeezed or pinned', dice: -2 },
};
function situationMods(list) {
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(list) ? list : []) {
    const group = String(id).replace(/\d$/, '');
    if (!SITUATIONS[id] || seen.has(group)) continue;
    seen.add(group);
    out.push({ ...SITUATIONS[id] });
  }
  return out;
}

function pushRequest(s, req) {
  req.id = newId(s, 'q');
  req.status = 'pending';
  req.madeSeq = s.seq;
  req.chance = req.at != null ? successChance(Math.min(30, req.pool.dice), req.at) : null;
  s.requests.push(req);
  return req;
}

function recordRoll(s, ctx, entry) {
  entry.id = newId(s, 'r');
  entry.seq = s.seq;
  entry.t = ctx.now || 0;
  s.rolls.push(entry);
  return entry;
}

// Roll dice for a request, or accept the dice a player rolled themselves.
function diceFor(ctx, n, own) {
  if (own != null) return { dice: checkOwnDice(own, n), source: 'own' };
  return { dice: rollDice(n, ctx.rng), source: 'app' };
}

// ------------------------------------------------------- resolving a request
function resolve(s, ctx, req, ownDice) {
  const { dice, source } = diceFor(ctx, req.pool.dice, ownDice);
  const read = R.readRoll(dice, req.at);
  const notes = [];
  const entry = {
    who: req.actor.name,
    whoKind: req.actor.kind,
    whoId: req.actor.id,
    label: req.label,
    kind: req.kind,
    n: req.pool.dice,
    parts: req.pool.parts,
    dice: read.dice,
    inhibitors: read.inhibitors,
    total: read.total,
    at: req.at,
    success: read.success,
    overflow: read.overflow,
    shortBy: read.shortBy,
    runaway: read.runaway,
    source,
    by: ctx.role === 'host' ? 'host' : (s.players[ctx.pid] || {}).name || 'player',
    practice: !!req.practice,
    notes,
  };

  let stressBefore = 0;
  if (req.actor.kind === 'org') {
    const o = s.organisms[req.actor.id];
    stressBefore = o.stress;
    if (read.inhibitors && !req.practice) {
      addStress(s, ctx, o, read.inhibitors, `${read.inhibitors} Inhibitor${read.inhibitors > 1 ? 's' : ''}`);
      entry.stressMarked = read.inhibitors;
      entry.stressNow = o.stress;
    }
    if (!read.success && stressBefore >= 7 && !req.practice) {
      const c = d6(ctx.rng);
      notes.push(`Stress 7 and a failed roll: Cascade d6 = ${c}, ${R.CASCADE[c].name}. ${R.CASCADE[c].effect}`);
    }
  }
  if (read.runaway) notes.push('Runaway Catalysis: no Inhibitors and two or more 6s. You gain the Rider, and any Effect Value counts twice.');

  if (req.kind === 'check') {
    if (read.success && read.overflow > 0) notes.push(`Overflow ${read.overflow} buys something: say what.`);
  } else if (req.kind === 'attack') {
    resolveAttack(s, ctx, req, read, entry, notes);
  } else if (req.kind === 'incoming') {
    resolveIncoming(s, ctx, req, read, entry, notes);
  } else if (req.kind === 'harvest') {
    const o = s.organisms[req.actor.id];
    if (o) entry.harvest = applyHarvest(s, ctx, o, req.harvest, { success: read.success, overflow: read.overflow || 0 }, notes);
  } else if (req.kind === 'stabilise') {
    const t = s.organisms[req.target.id];
    if (read.success && t) {
      t.mi = clamp(read.overflow + 4, 0, t.miMax);
      t.dormant = false;
      t.conditions = t.conditions.filter((c) => !(c.name === 'Leaking' && c.auto));
      t.countdown = clamp(t.countdown - 1, 0, t.countdownMax);
      notes.push(`${t.name} is stabilised at ${t.mi} MI and one Countdown box is closed.`);
    }
  }

  req.status = 'done';
  s.requests = s.requests.filter((q) => q.id !== req.id);
  recordRoll(s, ctx, entry);
  const verdict = req.at == null ? `total ${read.total}` : read.success ? `success, Overflow ${read.overflow}` : `short by ${read.shortBy}`;
  say(s, ctx, `${req.actor.name} rolls ${req.label}: ${read.dice.join(', ')} = ${read.total}${req.at != null ? ` against ${req.at}` : ''}: ${verdict}.`, 'roll');
  return entry;
}

// ------------------------------------------------------------------ harvest
// CORE 2.4: a Synthesise action (or ten minutes outside a fight), 1 Bulk, an OSM or RTC check
// at tier x 4 + 8. Success: the printed Specimens. Failure ruins the sample: Substrate instead.
const GRADES = ['C', 'G', 'P', 'T'];
export function parseHarvest(text) {
  const out = { C: 0, G: 0, P: 0, T: 0 };
  const head = String(text || '').split('·')[0];
  for (const m of head.matchAll(/\b([CGPT])(\d+)\b/g)) out[m[1]] += Number(m[2]);
  return out;
}
export const bulkCap = (o) => (o.base.VSC || 0) * 5;
const gradeText = (g) => GRADES.filter((k) => g[k]).map((k) => `${g[k]} ${k}`).join(', ') || 'nothing';

function applyHarvest(s, ctx, o, h, { success, overflow }, notes) {
  o.specimens = o.specimens || { C: 0, G: 0, P: 0, T: 0 };
  o.bulk = (o.bulk || 0) + 1;
  let got = null;
  let sub = 0;
  if (h.cid) {
    const c = s.creatures[h.cid];
    if (c) { c.harvested = true; c.harvestPending = false; }
    // 3.3: "Rewind -1 when: the Cohort harvests what it kills (each body harvested: -1, never
    // below 0)". The body is out of the water whether the sample came away clean or ruined.
    const back = payClock(s, ctx, clockTrigger(ctx, 'bodyCut'), -1, `the body of ${c ? c.name : h.what} is cut and out of the water`);
    if (back) notes.push(back);
    if (success) got = { ...h.yield };
    else sub = 5 * (h.yield.C || 0);
  } else {
    const carcass = (s.clocks.CARCASS || {}).filled || 0;
    if (success) got = carcass <= 1 && overflow >= 4 ? { C: 3, G: 1, P: 0, T: 0 } : { C: 4, G: 0, P: 0, T: 0 };
    else sub = 10;
    s.scene.cuts = (s.scene.cuts || 0) + 1;
    // 3.1: "Advance +1 when: ... the Cohort opens a new panel (oxygen gets in; the job has a cost)."
    const cost = payClock(s, ctx, clockTrigger(ctx, 'panelOpens'), 1, `${h.what} is open to the oxygen`);
    if (cost) notes.push(cost);
  }
  if (got) queueLoot(s, ctx, got, h.what);
  if (sub) o.substrate += sub;
  // Codon the site prints per harvested creature (THE FIRST CARVE §8.1: 1.5 a swarm) is paid here,
  // on a clean harvest, to each organism in the Cohort.
  if (got && h.cid) {
    const c = s.creatures[h.cid];
    const site = ((ctx.scenario || {}).sites || []).find((x) => x.id === (c ? c.siteId : s.scene.siteId)) || {};
    const pay = c && (site.harvestPays || {})[c.blockId];
    if (pay && pay.codon) {
      const ids = Object.keys(s.organisms).filter((id) => s.organisms[id].playerId);
      for (const id of ids) s.organisms[id].codon = Math.round((s.organisms[id].codon + Number(pay.codon)) * 10) / 10;
      say(s, ctx, `${pay.codon} Codon each for harvesting ${c.name}.`, 'award');
      notes.push(`${pay.codon} Codon each for the Cohort, as printed for a harvested ${c.name.replace(/ [A-Z]$/, '')}.`);
    }
  }
  const over = o.bulk > bulkCap(o);
  const line = success ? `${o.name} harvests ${h.what}: ${gradeText(got)} Specimens, unstamped, to be shared out in the picking order.` : `${o.name} ruins the cut of ${h.what}: ${sub} S of Substrate instead.`;
  notes.push(`${line} Bulk carried ${o.bulk} of ${bulkCap(o)}${over ? ' (over: -2 DFF and Stress when moving fast)' : ''}.`);
  say(s, ctx, line, 'award');
  return { got, substrate: sub };
}

function resolveAttack(s, ctx, req, read, entry, notes) {
  if (!read.success) return;
  const w = req.weapon || {};
  if (req.target.kind === 'cre') {
    const c = s.creatures[req.target.id];
    if (!c) return;
    const soak = creSoak(c);
    const dmg = R.damage({ overflow: read.overflow, bd: w.bd || 0, soak, runaway: read.runaway, flank: !!req.flank, type: w.type });
    entry.damage = dmg;
    entry.working = `Overflow ${read.overflow}${req.flank ? ' + 1 Flank Breach' : ''} + BD ${w.bd || 0} - soak ${soak} = ${dmg}`;
    const out = hurtCreature(s, ctx, c, { overflow: read.overflow + (req.flank ? 1 : 0), dmg });
    if (out.segments != null) {
      entry.segments = out.segments;
      entry.working = `Swarm: Overflow ${read.overflow} / 3, rounded up, + 1 = ${out.segments} Segments`;
    }
    // Recorded for the Director: whether the thing struck is still up.
    entry.targetName = c.name;
    entry.targetDown = !!c.down;
    if ((w.props || []).includes('Lodged') && !c.down && !hasCond(c, 'Lodged')) {
      c.conditions.push({ name: 'Lodged' });
      notes.push(`Lodged: the ${w.name} stays in. ${c.name} is at -1 DFF until it is removed.`);
    }
  }
  const sig = SIGNATURE[String(w.type || '').toLowerCase()];
  if (sig) notes.push(`${w.type} signature, choose one: ${sig}.`);
}

function resolveIncoming(s, ctx, req, read, entry, notes) {
  const o = s.organisms[req.target.id];
  if (!o) return;
  if (req.reaction === 'deflect') notes.push('Deflect: Membrane Threshold +4 against this attack.');
  if (!read.success) return;
  const dmg = R.damage({ overflow: read.overflow, bd: req.bd || 0, soak: o.soak, runaway: read.runaway, braced: req.reaction === 'brace', type: req.dtype });
  entry.damage = dmg;
  entry.working = `Overflow ${read.overflow} + BD ${req.bd || 0} - soak ${o.soak} = ${Math.max(1, read.overflow + (req.bd || 0) - o.soak)}${req.reaction === 'brace' ? `, Braced: halved to ${dmg}` : ''}`;
  const before = o.mi;
  hurtOrganism(s, ctx, o, dmg);
  say(s, ctx, `${o.name} takes ${dmg} ${req.dtype || ''} damage: MI ${before} to ${o.mi}.`, 'hit');
  const sig = SIGNATURE[String(req.dtype || '').toLowerCase()];
  if (sig) notes.push(`${req.dtype} signature, the attacker chooses one: ${sig}.`);
}

// ------------------------------------------------------------ the Pulse War
// What happens to a body when its turn comes round, before it may act.
// Returns false when it cannot act this Cycle (Dormant, or a creature that is down).
function turnStartEffects(s, ctx, a) {
  if (a.kind === 'org') {
    const o = s.organisms[a.id];
    if (o.dormant) {
      // §5.4: a Dormant organism Leaks at the start of each of its turns.
      o.countdown = clamp(o.countdown + 1, 0, o.countdownMax);
      say(s, ctx, `${o.name} is Dormant and Leaking: a Countdown box is marked (${o.countdown} of ${o.countdownMax}).`, 'danger');
      checkLysis(s, ctx, o);
      return false;
    }
    if (hasCond(o, 'Leaking') && o.mi > 0) {
      o.mi = Math.max(0, o.mi - 1);
      say(s, ctx, `${o.name} is Leaking: 1 MI lost, now ${o.mi}.`, 'hit');
    }
    return true;
  }
  // A creature that is down, or has stood down, takes no turn.
  return !s.creatures[a.id].down && !s.creatures[a.id].stoodDown;
}

function beginTurn(s, ctx, a) {
  const f = s.fight;
  if (!turnStartEffects(s, ctx, a)) {
    a.status = 'done';
    a.pp = 0;
    return false;
  }
  a.status = 'acting';
  a.pp = ppFor(s, a);
  f.turn = a.key;
  say(s, ctx, `Cycle ${f.cycle}: ${nameOf(s, a.kind, a.id)} acts with ${a.pp} PP.`, 'turn');
  return true;
}

function advanceTurn(s, ctx) {
  const f = s.fight;
  if (!f) return;
  for (let guard = 0; guard < 500; guard++) {
    const nextKey = f.order.find((k) => f.actors[k].status === 'waiting');
    if (nextKey) {
      if (beginTurn(s, ctx, f.actors[nextKey])) return;
      continue;
    }
    f.turn = null;
    const holding = f.order.filter((k) => f.actors[k].status === 'holding');
    if (holding.length) return; // holders may still re-enter and act
    endCycle(s, ctx);
  }
}

function endCycle(s, ctx) {
  const f = s.fight;
  for (const k of f.order) {
    const a = f.actors[k];
    if (a.kind === 'org') {
      const o = s.organisms[a.id];
      if (hasCond(o, 'Overclocked')) addStress(s, ctx, o, 2, 'Overclocked at the end of the Cycle');
      // §5.8: -1 Stress at the end of a Cycle with no ATP spent and no damage taken.
      if (!o.dormant && !a.spentAtp && !a.tookDamage && o.stress > 0) {
        o.stress -= 1;
        say(s, ctx, `${o.name} spent no ATP and took no damage this Cycle: Stress eases to ${o.stress}.`, 'stress');
      }
    }
    const body = a.kind === 'org' ? s.organisms[a.id] : s.creatures[a.id];
    body.conditions = body.conditions.filter((c) => !(c.until != null && c.until <= f.cycle));
    a.pp = 0;
    a.status = 'waiting';
    a.reserve = false;
    a.reacted = false;
    a.drifted = false;
    a.spentAtp = false;
    a.tookDamage = false;
    a.strikes = 0;
  }
  say(s, ctx, `End of Cycle ${f.cycle}. Unspent Pulse Points and unused Reserves are lost.`, 'turn');
  f.cycle += 1;
  f.turn = null;
}

function finishActor(s, ctx, a, hold) {
  if (hold && a.pp > 0) {
    a.status = 'holding';
    say(s, ctx, `${nameOf(s, a.kind, a.id)} holds ${a.pp} PP (Split Frequency) and may re-enter after any later organism acts.`, 'turn');
  } else {
    a.status = 'done';
    a.pp = 0; // ending a turn without holding gives up what is left (a held Reserve stays)
  }
  if (s.fight.turn === a.key) s.fight.turn = null;
}

function rollFrequency(s, ctx, label, who, mod, kind, id, own) {
  const given = Number(own);
  const die = Number.isInteger(given) && given >= 1 && given <= 6 ? given : d6(ctx.rng);
  const freq = die + mod;
  recordRoll(s, ctx, {
    who, whoKind: kind, whoId: id, label, kind: 'frequency', n: 1, parts: [{ label: 'd6', dice: 1 }],
    dice: [die], inhibitors: 0, total: freq, at: null, source: die === given ? 'own' : 'app', by: 'engine', notes: [`Frequency = d6 (${die}) + ${mod} = ${freq}`],
  });
  return { die, freq };
}

function addToFight(s, ctx, kind, id, freq, die) {
  const f = s.fight;
  const k = key(kind, id);
  if (f.actors[k]) return;
  const body = kind === 'org' ? s.organisms[id] : s.creatures[id];
  f.actors[k] = {
    key: k, kind, id, freq, die, pp: 0, ppMax: body.ppMax, status: 'waiting',
    reserve: false, reacted: false, drifted: false, spentAtp: false, tookDamage: false, strikes: 0,
  };
  f.order.push(k);
}

function sortOrder(s) {
  const f = s.fight;
  const entries = f.order.map((k) => {
    const a = f.actors[k];
    const body = a.kind === 'org' ? s.organisms[a.id] : s.creatures[a.id];
    return { k, freq: a.freq, pp: body.ppMax, osm: a.kind === 'org' ? body.base.OSM : 0, player: a.kind === 'org' };
  });
  f.order = R.frequencyOrder(entries).map((e) => e.k);
}

function spawn(s, ctx, list, bestiary) {
  const made = [];
  for (const item of list || []) {
    const block = item.custom ? customBlock(item.custom) : bestiary[item.blockId];
    if (!block) throw new RuleError(`No block called "${item.blockId}" in the Bestiary.`);
    const count = clamp(Math.trunc(Number(item.count) || 1), 1, 12);
    const have = Object.values(s.creatures).filter((c) => c.blockId === block.id && c.siteId === s.scene.siteId).length;
    for (let i = 0; i < count; i++) {
      const cid = newId(s, 'c');
      const label = count + have > 1 ? `${item.name || block.name} ${String.fromCharCode(65 + ((have + i) % 26))}` : (item.name || block.name);
      const c = makeCreature(block, { cid, name: label, band: item.band || 'near', siteId: s.scene.siteId });
      if (item.hidden) c.hidden = true;
      s.creatures[cid] = c;
      made.push(c);
    }
  }
  return made;
}

function customBlock(c) {
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const name = String(c.name || 'Creature').slice(0, 40);
  return {
    id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name, cls: 'Custom', tier: n(c.tier, 1), mt: n(c.mt, 12), mi: n(c.mi, 10),
    segments: c.segments ? n(c.segments, 6) : null, soak: n(c.soak, 0), bd: n(c.bd, 1),
    type: String(c.type || 'Kinetic'), pool: n(c.pool, 3), pp: n(c.pp, 2), flow: n(c.flow, 4),
  };
}

// ------------------------------------------------------------------ handlers
const HANDLERS = {
  // ---- players
  // Session zero. The host sets the tone and the pause word; anyone may add a line
  // that stays off the page; every player agrees before they take an organism.
  'zero.set': {
    host: true,
    run(s, a, ctx) {
      const z = s.zero;
      if (typeof a.pauseWord === 'string' && a.pauseWord.trim()) z.pauseWord = a.pauseWord.trim().slice(0, 24);
      if (typeof a.tone === 'string') z.tone = a.tone.trim().slice(0, 300);
      if (a.open != null) z.open = !!a.open;
      say(s, ctx, `Session zero: the pause word is ${z.pauseWord}.`, 'table');
    },
  },
  'zero.line': {
    run(s, a, ctx) {
      const z = s.zero;
      const text = String(a.text || '').trim().slice(0, 120);
      if (a.remove) {
        z.lines = z.lines.filter((l) => l !== a.remove);
        say(s, ctx, 'A line was taken off the list.', 'table');
        return;
      }
      if (!text) throw new RuleError('Say what to leave out, in a few words.');
      if (z.lines.length >= 20) throw new RuleError('The list is full. Take one off first.');
      if (z.lines.some((l) => l.toLowerCase() === text.toLowerCase())) return;
      z.lines.push(text);
      // Who asked for it is nobody's business: the line is shared, the name is not.
      say(s, ctx, `Off the page for this table: ${text}.`, 'table');
    },
  },
  'zero.agree': {
    run(s, a, ctx) {
      const p = s.players[ctx.pid];
      if (!p) throw new RuleError('Join the table first.');
      if (p.agreed) return;
      p.agreed = true;
      say(s, ctx, `${p.name} has read session zero and is ready.`, 'table');
    },
  },
  join: {
    run(s, a, ctx) {
      const name = String(a.name || '').trim().slice(0, 24);
      if (!name) throw new RuleError('Tell the table your name.');
      if (!ctx.pid) throw new RuleError('This device has no player id.');
      const had = s.players[ctx.pid];
      s.players[ctx.pid] = { name, organismId: had ? had.organismId : null, agreed: had ? !!had.agreed : false };
      if (!had) say(s, ctx, `${name} joins the table.`, 'table');
    },
  },
  claim: {
    run(s, a, ctx) {
      const pid = ctx.role === 'host' && a.pid ? a.pid : ctx.pid;
      const p = s.players[pid];
      if (!p) throw new RuleError('Join the table first.');
      if (!p.agreed && ctx.role !== 'host') throw new RuleError('Read session zero and agree before you take an organism.');
      const o = org(s, a.organismId);
      if (o.playerId && o.playerId !== pid) throw new RuleError(`${o.name} is already being played.`);
      if (p.organismId && p.organismId !== o.id && s.organisms[p.organismId]) s.organisms[p.organismId].playerId = null;
      o.playerId = pid;
      p.organismId = o.id;
      const nm = String(a.name || '').trim().slice(0, 40);
      if (nm) {
        o.name = nm;
        o.named = true;
      }
      lootOrder(s);
      say(s, ctx, `${p.name} plays ${o.name} (${o.hand}).`, 'table');
    },
  },
  release: {
    run(s, a, ctx) {
      const pid = ctx.role === 'host' && a.pid ? a.pid : ctx.pid;
      const p = s.players[pid];
      if (p && p.organismId && s.organisms[p.organismId]) s.organisms[p.organismId].playerId = null;
      if (p) p.organismId = null;
    },
  },
  rename: {
    run(s, a, ctx) {
      needControl(s, ctx, a.organismId);
      const o = org(s, a.organismId);
      const nm = String(a.name || '').trim().slice(0, 40);
      if (!nm) throw new RuleError('A name cannot be empty.');
      o.name = nm;
      o.named = true;
    },
  },
  weapon: {
    // Choose which printed kit option an organism carries (for example the Eyes: Dagger or Pistol).
    run(s, a, ctx) {
      needControl(s, ctx, a.organismId);
      const o = org(s, a.organismId);
      const w = o.weapons.find((x) => x.id === a.weaponId);
      if (!w) throw new RuleError('That Apparatus is not in this kit.');
      o.weapons.forEach((x) => { if (x.choice && x.choice === w.choice) x.carried = x.id === w.id; });
    },
  },

  // ---- the story: what players say they do, and what the Director narrates
  say: {
    run(s, a, ctx) {
      const text = String(a.text || '').trim().slice(0, 600);
      if (!text) throw new RuleError('Say something first.');
      let o = null;
      if (ctx.role === 'host') {
        o = a.organismId ? org(s, a.organismId) : null;
      } else {
        const p = s.players[ctx.pid];
        if (!p) throw new RuleError('Join the table first.');
        o = p.organismId ? s.organisms[p.organismId] : null;
        if (!o) throw new RuleError('Choose your organism first.');
      }
      s.story.push({ id: newId(s, 's'), seq: s.seq, t: ctx.now || 0, site: s.scene.siteId, kind: 'say', who: o ? o.name : 'The host', orgId: o ? o.id : null, text });
    },
  },
  narrate: {
    host: true,
    run(s, a, ctx) {
      const text = String(a.text || '').trim().slice(0, 2400);
      if (!text) throw new RuleError('There is nothing to narrate.');
      s.story.push({ id: newId(s, 's'), seq: s.seq, t: ctx.now || 0, site: s.scene.siteId, kind: 'narration', who: 'The Director', by: a.by === 'ai' ? 'ai' : 'host', text });
    },
  },

  // ---- rolls
  roll: {
    run(s, a, ctx) {
      const req = s.requests.find((q) => q.id === a.requestId);
      if (!req) throw new RuleError('That roll is no longer waiting.');
      if (req.actor.kind === 'org') needControl(s, ctx, req.actor.id);
      else if (ctx.role !== 'host') {
        // The player being struck may let the dice fall; the Engine rolls them, in the open.
        if (!(req.kind === 'incoming' && req.target && mayControl(s, ctx, req.target.id))) throw new RuleError('Creature dice are rolled by the host, in the open.');
        resolve(s, ctx, req, null);
        return;
      }
      resolve(s, ctx, req, a.dice);
    },
  },
  quickRoll: {
    run(s, a, ctx) {
      needControl(s, ctx, a.organismId);
      const o = org(s, a.organismId);
      const pool = poolForCheck(o, { baseline: a.baseline, pathway: a.pathway, mods: cleanMods(a.mods) });
      const at = a.at == null || a.at === '' ? null : clamp(Math.trunc(Number(a.at)), 1, 60);
      const label = String(a.label || (a.pathway ? `${a.baseline} + ${a.pathway}` : a.baseline)).slice(0, 60);
      const req = { kind: 'check', actor: { kind: 'org', id: o.id, name: o.name }, label, pool, at, practice: !!a.practice };
      pushRequest(s, req);
      resolve(s, ctx, req, a.dice);
    },
  },
  'request.check': {
    host: true,
    run(s, a, ctx) {
      const o = org(s, a.organismId);
      const pool = poolForCheck(o, { baseline: a.baseline, pathway: a.pathway, mods: cleanMods(a.mods) });
      const at = clamp(Math.trunc(Number(a.at) || 12), 1, 60);
      const label = String(a.label || (a.pathway ? `${a.baseline} + ${a.pathway}` : a.baseline)).slice(0, 60);
      const base = R.homeostatic(pool.dice);
      // Unhurried means unopposed: during a Pulse War nothing is unopposed, so the Director must roll.
      if (ctx.ai && a.unhurried && s.fight) throw new RuleError('Not unhurried during a Pulse War: ask for the roll.');
      if (a.unhurried && base >= at) {
        // §1.6: unopposed and unhurried, and the Baseline meets the Threshold. No dice, no Stress.
        recordRoll(s, ctx, {
          who: o.name, whoKind: 'org', whoId: o.id, label, kind: 'check', n: pool.dice, parts: pool.parts, dice: [],
          inhibitors: 0, total: base, at, success: true, overflow: 0, runaway: false, source: 'baseline', by: 'host',
          notes: [`No roll: unhurried and unopposed, and the Homeostatic Baseline (${pool.dice} dice x 3 = ${base}) meets Threshold ${at}.`],
        });
        say(s, ctx, `${o.name}: ${label}. No roll. Baseline ${base} meets Threshold ${at}.`, 'roll');
        return;
      }
      const req = { kind: 'check', actor: { kind: 'org', id: o.id, name: o.name }, label, pool, at, extra: cleanMods(a.mods) };
      if (a.unhurried) req.note = `Baseline ${base} does not meet Threshold ${at}, so this needs dice.`;
      pushRequest(s, req);
      say(s, ctx, `${o.name} is asked to roll ${label}: ${pool.dice} dice against Threshold ${at}.`, 'ask');
    },
  },
  'request.cancel': {
    host: true,
    run(s, a, ctx) {
      const req = s.requests.find((q) => q.id === a.requestId);
      if (!req) return;
      if (req.ppCost && s.fight) {
        const act = s.fight.actors[key(req.actor.kind, req.actor.id)];
        if (act) act.pp += req.ppCost;
      }
      s.requests = s.requests.filter((q) => q.id !== req.id);
      say(s, ctx, `The roll for ${req.label} is withdrawn.`, 'info');
    },
  },
  'request.adjust': {
    // The host adds or removes dice on a waiting roll, with a reason, before it is rolled.
    host: true,
    run(s, a, ctx) {
      const req = s.requests.find((q) => q.id === a.requestId);
      if (!req) throw new RuleError('That roll is no longer waiting.');
      const add = cleanMods([{ label: a.label || 'Director', dice: a.dice }]);
      if (!add.length) return;
      addDice(s, req, add[0].label, add[0].dice);
      const next = req.pool;
      say(s, ctx, `${req.label}: ${add[0].dice > 0 ? '+' : ''}${add[0].dice} dice (${add[0].label}). Now ${next.dice} dice.`, 'ask');
    },
  },
  'creature.roll': {
    host: true,
    run(s, a, ctx) {
      const n = clamp(Math.trunc(Number(a.n) || 1), 1, 30);
      const at = a.at == null || a.at === '' ? null : clamp(Math.trunc(Number(a.at)), 1, 60);
      const who = String(a.who || 'The Director').slice(0, 40);
      const req = { kind: 'check', actor: { kind: 'cre', id: a.cid || null, name: who }, label: String(a.label || 'Open roll').slice(0, 60), pool: R.buildPool({ fixed: n }), at };
      pushRequest(s, req);
      resolve(s, ctx, req, a.dice);
    },
  },

  // ---- the scene
  'scene.set': {
    host: true,
    run(s, a, ctx) {
      const site = ctx.scenario.sites.find((x) => x.id === a.siteId);
      if (!site) throw new RuleError('That site is not in this Vector.');
      if (s.fight) throw new RuleError('End the Pulse War before changing the scene.');
      // 3.3: "Advance +1 when: the Cohort kills and leaves a body unharvested". The moment of
      // leaving is now: each broken, uncut body at the site being walked out of is a Feeder that
      // was not killed (8.3: "in a long fight, a Feeder becomes four Feeders").
      for (const c of Object.values(s.creatures)) {
        if (c.siteId === s.scene.siteId && c.down && !c.harvested && !c.stoodDown) {
          payClock(s, ctx, clockTrigger(ctx, 'bodyLeft'), 1, `${c.name} was left uncut in the water`);
        }
      }
      s.scene = { siteId: site.id };
      // A new scene re-arms the site hazards (CORE 8.1: "once per scene" resets when the place,
      // the purpose or the people change).
      s.sceneNo = (s.sceneNo || 1) + 1;
      s.requests = [];
      for (const o of Object.values(s.organisms)) o.band = null;
      say(s, ctx, `New scene: ${site.name}.`, 'scene');
    },
  },
  'creature.add': {
    host: true,
    run(s, a, ctx) {
      const made = spawn(s, ctx, a.creatures, ctx.bestiary);
      if (s.fight) {
        const groups = {};
        for (const c of made) {
          if (!groups[c.group]) groups[c.group] = rollFrequency(s, ctx, 'Frequency', c.name.replace(/ [A-Z]$/, ''), c.freqMod, 'cre', c.cid);
          addToFight(s, ctx, 'cre', c.cid, groups[c.group].freq, groups[c.group].die);
        }
        sortOrder(s);
      }
      if (made.length) say(s, ctx, `${made.map((c) => c.name).join(', ')} ${made.length > 1 ? 'are' : 'is'} here.`, 'scene');
    },
  },
  'creature.remove': {
    host: true,
    run(s, a) {
      const c = cre(s, a.cid);
      delete s.creatures[c.cid];
      if (s.fight) {
        const k = key('cre', c.cid);
        delete s.fight.actors[k];
        s.fight.order = s.fight.order.filter((x) => x !== k);
        if (s.fight.turn === k) s.fight.turn = null;
      }
      s.requests = s.requests.filter((q) => !(q.actor.kind === 'cre' && q.actor.id === c.cid) && !(q.target && q.target.kind === 'cre' && q.target.id === c.cid));
    },
  },
  clock: {
    host: true,
    run(s, a, ctx) {
      const c = s.clocks[a.id];
      if (!c) throw new RuleError('No such Clock.');
      const before = c.filled;
      const delta = Math.trunc(Number(a.delta) || 0);
      if (a.by === 'ai' && delta > 0) {
        // Clock discipline (Vector 3.4): at most one segment per Clock per session.
        if (delta > 1 || c.aiAdvanced) throw new RuleError(`Clock discipline: ${c.name} may advance at most one segment per session, and it already has.`);
        c.aiAdvanced = true;
      }
      c.filled = clamp(c.filled + delta, 0, c.segments);
      if (c.filled !== before) say(s, ctx, `${c.name} is at ${c.filled} of ${c.segments}.${a.why ? ` ${String(a.why).slice(0, 120)}` : ''}`, 'clock');
    },
  },
  note: {
    host: true,
    run(s, a, ctx) {
      const t = String(a.text || '').trim().slice(0, 400);
      if (t) say(s, ctx, t, 'note');
    },
  },
  rest: {
    // §5.10 Reconstitution. In The First Carve each one costs a CARCASS segment (Vector §7.4).
    host: true,
    run(s, a, ctx) {
      if (s.fight) throw new RuleError('Nobody rests in a Pulse War.');
      const ids = (a.organismIds && a.organismIds.length ? a.organismIds : Object.keys(s.organisms)).filter((id) => s.organisms[id]);
      for (const id of ids) {
        const o = s.organisms[id];
        if (o.dormant) continue;
        const r = R.reconstitute({ mi: o.mi, miMax: o.miMax, atpMax: o.atpMax, vsc: o.base.VSC, hull: o.hull });
        o.mi = r.mi;
        o.atp = r.atp;
        o.stress = 0;
        o.conditions = o.conditions.filter((c) => c.name !== 'Catabolic' && c.name !== 'Bloom');
      }
      say(s, ctx, 'Reconstitution: one Fugue Interval (about an hour). Full ATP, all Stress cleared, MI healed by VSC + Hull.', 'rest');
      const rule = ctx.scenario.rules && ctx.scenario.rules.reconstitutionCostsClock;
      if (rule && s.clocks[rule] && !a.free) {
        const c = s.clocks[rule];
        c.filled = clamp(c.filled + 1, 0, c.segments);
        say(s, ctx, `Rest costs value here: ${c.name} is at ${c.filled} of ${c.segments}.`, 'clock');
      }
    },
  },

  // ---- host corrections
  set: {
    host: true,
    run(s, a, ctx) {
      const t = a.target || {};
      const v = a.value;
      const num = () => Math.trunc(Number(v) || 0);
      if (t.kind === 'org') {
        const o = org(s, t.id);
        switch (a.field) {
          case 'mi': o.mi = clamp(num(), 0, o.miMax); o.dormant = o.mi === 0; if (!o.dormant) o.conditions = o.conditions.filter((c) => !(c.name === 'Leaking' && c.auto)); break;
          case 'miMax': o.miMax = clamp(num(), 1, 400); o.mi = Math.min(o.mi, o.miMax); break;
          case 'atp': o.atp = clamp(num(), 0, o.atpMax); break;
          case 'stress': o.stress = clamp(num(), 0, R.STRESS_MAX - 1); break;
          case 'substrate': o.substrate = Math.max(0, num()); break;
          case 'codon': o.codon = Math.max(0, Number(v) || 0); break;
          case 'countdown': o.countdown = clamp(num(), 0, o.countdownMax); break;
          case 'oath': o.oath = Math.max(0, num()); if (o.oathMax == null) o.oathMax = o.oath; break;
          case 'soak': o.soak = Math.max(0, num()); break;
          case 'band': o.band = v || null; break;
          case 'name': o.name = String(v || '').trim().slice(0, 40) || o.name; o.named = true; break;
          case 'pp': { const act = actorOf(s, 'org', o.id); if (act) act.pp = Math.max(0, num()); break; }
          default: throw new RuleError(`"${a.field}" cannot be set.`);
        }
        return;
      }
      if (t.kind === 'cre') {
        const c = cre(s, t.id);
        switch (a.field) {
          case 'mi': if (c.mi != null) { c.mi = clamp(num(), 0, c.miMax); c.down = c.mi === 0; } break;
          case 'segments': if (c.segments != null) { c.segments = clamp(num(), 0, 40); c.segMax = Math.max(c.segMax, c.segments); c.down = c.segments === 0; } break;
          case 'band': c.band = v || 'near'; break;
          case 'name': c.name = String(v || '').trim().slice(0, 40) || c.name; break;
          case 'mt': c.mt = clamp(num(), 1, 40); break;
          case 'soak': c.soak = Math.max(0, num()); break;
          case 'pool': c.pool = clamp(num(), 1, 30); break;
          case 'hidden': c.hidden = !!v; break;
          case 'pp': { const act = actorOf(s, 'cre', c.cid); if (act) act.pp = Math.max(0, num()); break; }
          default: throw new RuleError(`"${a.field}" cannot be set.`);
        }
        return;
      }
      throw new RuleError('Choose an organism or a creature.');
    },
  },
  damage: {
    // A plain damage ruling by the host: soak applies once, minimum 1 (§4.8). A site's printed
    // hazard goes through `hazard` below, which also keeps the firing budget.
    host: true,
    run(s, a, ctx) {
      const amount = Math.max(0, Math.trunc(Number(a.amount) || 0));
      if (!amount) return;
      applyDamage(s, ctx, a.target || {}, amount, a.dtype, a.ignoreSoak);
    },
  },
  hazard: {
    // A printed site hazard going off. The Director may only ask for what the page prices
    // (checked in brain/tools.js, which reads the site's Hazard note); the Engine owns when it
    // may go off again. CORE 8.1: a Cycle is six seconds of combat and a scene ends when the
    // place, the purpose or the people change. So: once per Cycle inside a Pulse War, once per
    // scene outside one. The CODEX's lair action (§3.2, "once per Cycle, after everyone") is the
    // same budget seen from inside a fight.
    host: true,
    run(s, a, ctx) {
      if (!s.hazards) s.hazards = {}; // sessions saved before hazards had a budget
      const amount = Math.max(0, Math.trunc(Number(a.amount) || 0));
      if (!amount) return;
      const siteId = String(a.siteId || s.scene.siteId);
      const site = (ctx.scenario.sites || []).find((x) => x.id === siteId) || {};
      const name = site.name || siteId;
      const budget = hazardBudget(s, siteId);
      if (!budget.open) {
        throw new RuleError(budget.cycle == null
          ? `${name}: its hazard has already gone off in this scene. It goes off once per scene, so say what has changed (the Cohort moves on and comes back, or the place itself changes) before it hurts anyone again.`
          : `${name}: its hazard has already gone off in Cycle ${budget.cycle}. Once per Cycle, not twice.`);
      }
      s.hazards[siteId] = { cycle: budget.cycle, scene: budget.scene, seq: s.seq };
      if (a.why) say(s, ctx, String(a.why).slice(0, 200), 'hazard');
      // An area hazard is one firing that pays everyone at once. The Toll-Vent pocket prints
      // "1 band shift to all in the chamber", so the Director must not have to call it four
      // times (bench 13 Nov, run 3: it tried, and three of those calls were refusals).
      // The same Effect clause often prices a condition beside the damage: the Toll-Vent prints
      // "6 Kinetic, Jostled, 1 band shift to all in the chamber". Bench 13 Nov (13nov_am run 3):
      // the second firing had no set_condition after it, so Jostled never landed and no flag
      // existed to say so. The page pays it with the firing, to the same bodies it hurts.
      const paid = (a.conditions || []).filter((n) => R.CONDITIONS[n]);
      if (a.area) {
        const bodies = Object.values(s.organisms).filter((o) => o.playerId);
        for (const o of bodies) applyDamage(s, ctx, { kind: 'org', id: o.id }, amount, a.dtype, a.ignoreSoak);
        for (const n of paid) applyConditionTo(s, ctx, bodies, n, true);
        return;
      }
      applyDamage(s, ctx, a.target || {}, amount, a.dtype, a.ignoreSoak);
      if (paid.length && (a.target || {}).kind === 'org') {
        for (const n of paid) applyConditionTo(s, ctx, [org(s, a.target.id)], n, true);
      }
    },
  },
  heal: {
    host: true,
    run(s, a, ctx) {
      const o = org(s, (a.target || {}).id);
      const amount = Math.max(0, Math.trunc(Number(a.amount) || 0));
      if (o.dormant) throw new RuleError('A Dormant organism can only be brought back by stabilisation (CORE 5.4).');
      const before = o.mi;
      o.mi = clamp(o.mi + amount, 0, o.miMax);
      say(s, ctx, `${o.name} recovers ${o.mi - before} MI, now ${o.mi}.`, 'rest');
    },
  },
  condition: {
    host: true,
    run(s, a, ctx) {
      if (!R.CONDITIONS[a.name]) throw new RuleError('That is not a printed condition.');
      // An area condition is one the page prices for the whole chamber. The Toll-Vent pocket
      // prints "Effect: 6 Kinetic, Jostled, 1 band shift to all in the chamber", so Jostled is
      // every body's, not one target's (bench 13 Nov: the Director put it on a single organism,
      // then had to call it again for the next one). Same set of bodies hazard_damage pays.
      if (a.area) {
        applyConditionTo(s, ctx, Object.values(s.organisms).filter((o) => o.playerId), a.name, a.on !== false);
        return;
      }
      const t = a.target || {};
      const body = t.kind === 'org' ? org(s, t.id) : cre(s, t.id);
      if (a.on === false) {
        body.conditions = body.conditions.filter((c) => c.name !== a.name);
        say(s, ctx, `${body.name} is no longer ${a.name}.`, 'info');
        return;
      }
      if (hasCond(body, a.name)) return;
      const c = { name: a.name };
      if (R.CONDITIONS[a.name].timed && s.fight) c.until = s.fight.cycle + 1;
      body.conditions.push(c);
      say(s, ctx, `${body.name} is ${a.name}: ${R.CONDITIONS[a.name].effect}`, 'info');
    },
  },
  award: {
    host: true,
    run(s, a, ctx) {
      const ids = (a.organismIds && a.organismIds.length ? a.organismIds : Object.keys(s.organisms).filter((id) => s.organisms[id].playerId));
      const codon = Number(a.codon) || 0;
      const sub = Math.trunc(Number(a.substrate) || 0);
      // The Director may pay a printed reward once per organism per site: a repeated
      // "why" at the same site is the same payment twice (a toll paid at the gate and again at the cut-lane).
      const why = String(a.why || '').trim().toLowerCase();
      s.paid = s.paid || [];
      if (why) {
        // The Director may pay a printed reward once per organism per site. The host is not
        // held to that, but what the host pays is still recorded, so the briefing stays honest
        // about what the page still owes.
        if (ctx.ai) {
          for (const id of ids) {
            if (s.paid.some((p) => p.org === id && p.site === s.scene.siteId && p.why === why)) {
              throw new RuleError(`${org(s, id).name} has already been paid for that at this site. Pay a printed reward once.`);
            }
          }
        }
        for (const id of ids) s.paid.push({ org: id, site: s.scene.siteId, why, codon, substrate: sub });
      }
      for (const id of ids) {
        const o = org(s, id);
        o.codon = Math.max(0, Math.round((o.codon + codon) * 10) / 10);
        o.substrate = Math.max(0, o.substrate + sub);
      }
      const bits = [];
      if (codon) bits.push(`${codon} Codon`);
      if (sub) bits.push(`${sub} S`);
      if (bits.length) say(s, ctx, `${bits.join(' and ')} each${a.why ? `: ${String(a.why).slice(0, 120)}` : ''}.`, 'award');
    },
  },

  // ---- Pulse War: start, order, end
  'fight.start': {
    host: true,
    run(s, a, ctx) {
      if (s.fight) throw new RuleError('A Pulse War is already running.');
      spawn(s, ctx, a.creatures, ctx.bestiary);
      const orgIds = (a.organismIds && a.organismIds.length ? a.organismIds : Object.keys(s.organisms).filter((id) => s.organisms[id].playerId));
      if (!orgIds.length) throw new RuleError('No organisms are in play yet. Players must join and choose a Hand first.');
      const here = Object.values(s.creatures).filter((c) => c.siteId === s.scene.siteId && !c.down);
      s.fight = { cycle: 1, order: [], actors: {}, turn: null, startedSeq: s.seq };
      // 3.2: "Advance +1 when: ... the Cohort is loud in the channels (a Pulse War, a collapsed
      // panel, a corpse left in the water)". Once per scene: the law clock notices the noise, not
      // every swing inside it.
      const loudId = clockTrigger(ctx, 'loud');
      const loud = s.clocks[loudId];
      if (loud && loud.loudScene !== s.sceneNo) { loud.loudScene = s.sceneNo; payClock(s, ctx, loudId, 1, 'a Pulse War in the open: the channels are loud'); }
      for (const id of orgIds) {
        const o = org(s, id);
        const mod = o.base.DFF + condBase(o, 'DFF') + (o.pathways['Pulse Discipline'] || 0);
        const r = rollFrequency(s, ctx, 'Frequency', o.name, mod, 'org', o.id, (a.ownDice || {})[o.id]);
        addToFight(s, ctx, 'org', o.id, r.freq, r.die);
      }
      // CODEX 3.2: roll Frequency once per Order-group, not per creature.
      const groups = {};
      for (const c of here) {
        if (!groups[c.group]) groups[c.group] = rollFrequency(s, ctx, 'Frequency', c.name.replace(/ [A-Z]$/, ''), c.freqMod, 'cre', c.cid, (a.ownDice || {})[c.group]);
        addToFight(s, ctx, 'cre', c.cid, groups[c.group].freq, groups[c.group].die);
      }
      sortOrder(s);
      say(s, ctx, `A Pulse War begins. Order: ${s.fight.order.map((k) => `${nameOf(s, s.fight.actors[k].kind, s.fight.actors[k].id)} (${s.fight.actors[k].freq})`).join(', ')}.`, 'turn');
      advanceTurn(s, ctx);
    },
  },
  'fight.end': {
    host: true,
    run(s, a, ctx) {
      if (!s.fight) return;
      // The Director may not end a Pulse War while a creature on this site is still up:
      // the host ends it by hand once the creatures have fled or yielded.
      const up = Object.values(s.creatures).filter((c) => c.siteId === s.scene.siteId && !c.down && !c.stoodDown);
      if (ctx.ai && up.length) {
        throw new RuleError(`${up[0].name} is still up and fighting on this site. If it has yielded, fled or was never fighting, stand it down first, with the reason.`);
      }
      const cycles = s.fight.cycle;
      s.fight = null;
      s.requests = [];
      say(s, ctx, `The Pulse War is over after ${cycles} Cycle${cycles > 1 ? 's' : ''}. Pulse Points exist only inside a fight; the next fight starts with a full set.`, 'turn');
    },
  },
  // Harvest a downed creature (cid) or, where the site allows it, the site itself.
  harvest: {
    run(s, a, ctx) {
      const o = org(s, a.organismId);
      needControl(s, ctx, o.id);
      if (o.dormant) throw new RuleError(`${o.name} is Dormant and cannot act.`);
      if (s.requests.some((q) => q.actor.kind === 'org' && q.actor.id === o.id)) throw new RuleError(`${o.name} already has a roll waiting.`);
      const site = (ctx.scenario.sites || []).find((x) => x.id === s.scene.siteId) || {};
      let h;
      let tier;
      if (a.cid) {
        const c = cre(s, a.cid);
        if (c.siteId !== s.scene.siteId) throw new RuleError(`${c.name} is not at this site.`);
        if (!c.down) throw new RuleError(`${c.name} is still up. Only a destroyed creature can be harvested.`);
        if (c.harvested) throw new RuleError(`${c.name} has already been harvested.`);
        if (c.harvestPending) throw new RuleError(`Someone is already harvesting ${c.name}.`);
        const block = (ctx.bestiary || {})[c.blockId] || {};
        tier = Number(block.tier) || 1;
        h = { cid: c.cid, what: c.name, yield: parseHarvest(block.harvest) };
        c.harvestPending = true;
      } else {
        if (!site.harvest) throw new RuleError('Nothing is printed to cut at this site. Harvest a destroyed creature instead.');
        const carcass = (s.clocks.CARCASS || {}).filled || 0;
        if (carcass >= 6) throw new RuleError('CARCASS is full: there is nothing left worth cutting.');
        tier = site.harvest.tier || 1;
        h = { what: site.harvest.what || 'the site', site: site.id, carcass };
      }
      const baseline = ['OSM', 'RTC'].includes(a.baseline) ? a.baseline : (o.base.RTC >= o.base.OSM ? 'RTC' : 'OSM');
      const claw = o.weapons.some((w) => w.id === 'harvest-claw' && w.carried !== false);
      const carcassNow = (s.clocks.CARCASS || {}).filled || 0;
      const at = R.harvestAT(tier) + (!a.cid && carcassNow >= 3 ? 2 : 0);
      const pool = poolForCheck(o, { baseline, pathway: 'Synthesis', mods: claw ? [{ label: 'Harvest Claw', dice: 2 }] : [] });
      const label = `Harvest ${h.what}`.slice(0, 60);
      if (s.fight) {
        // A Synthesise action: 2 PP. The Harvest Claw gives one free Harvest per Pulse War.
        const act = actorOf(s, 'org', o.id);
        if (!act) throw new RuleError(`${o.name} is not in this fight.`);
        s.fight.freeHarvest = s.fight.freeHarvest || {};
        if (claw && !s.fight.freeHarvest[o.id]) { spendPP(s, act, 0, 'Harvest'); s.fight.freeHarvest[o.id] = true; }
        else spendPP(s, act, 2, 'Harvest (a Synthesise action)');
      } else {
        const base = R.homeostatic(pool.dice);
        if (base >= at) {
          // Ten unhurried minutes and the Baseline meets the Threshold: no dice (a Baseline pass has no Overflow).
          const notes = [`No roll: unhurried, and the Homeostatic Baseline (${pool.dice} dice x 3 = ${base}) meets Threshold ${at}.`];
          const out = applyHarvest(s, ctx, o, h, { success: true, overflow: 0 }, notes);
          recordRoll(s, ctx, { who: o.name, whoKind: 'org', whoId: o.id, label, kind: 'harvest', n: pool.dice, parts: pool.parts, dice: [], inhibitors: 0, total: base, at, success: true, overflow: 0, runaway: false, source: 'baseline', by: 'host', notes, harvest: out });
          return;
        }
      }
      pushRequest(s, { kind: 'harvest', actor: { kind: 'org', id: o.id, name: o.name }, label, pool, at, harvest: h, extra: [] });
      say(s, ctx, `${o.name} sets to harvesting ${h.what}: ${pool.dice} dice against Threshold ${at}.`, 'ask');
    },
  },
  // The post's priced choice: a d12 on the site's printed table, rolled once and then fixed.
  'post.offer': {
    host: true,
    run(s, a, ctx) {
      const site = (ctx.scenario.sites || []).find((x) => x.id === s.scene.siteId) || {};
      if (!site.post || !Array.isArray(site.pricedChoice)) throw new RuleError('There is no Tally Post with a priced choice at this site.');
      s.posts = s.posts || {};
      if (s.posts[site.id]) return; // already rolled: the offer stands
      const own = a.roll != null ? Math.trunc(Number(a.roll)) : null;
      if (own != null && (own < 1 || own > 12)) throw new RuleError('The priced choice is a d12: 1 to 12.');
      const roll = own != null ? own : 1 + Math.floor(ctx.rng() * 12);
      const row = site.pricedChoice.find((r) => roll >= r.lo && roll <= r.hi);
      s.posts[site.id] = { roll, offer: row.offer, price: row.price, takeOneIn: row.takeOneIn || 0 };
      say(s, ctx, `At the Tally Post (d12 = ${roll}): ${row.offer}. The price: ${row.price}.`, 'info');
    },
  },
  // The Tally Post weighs, grades and stamps a cut. Stamped Specimens are property; unstamped are not.
  'harvest.stamp': {
    host: true,
    run(s, a, ctx) {
      const site = (ctx.scenario.sites || []).find((x) => x.id === s.scene.siteId) || {};
      if (!site.post) throw new RuleError('There is no Tally Post at this site.');
      if (s.loot && s.loot.queue && s.loot.queue.length) throw new RuleError(`${s.loot.queue.length} harvested Specimen${s.loot.queue.length === 1 ? ' is' : 's are'} still being shared out. Finish sharing first.`);
      if (ctx.ai && Array.isArray(site.pricedChoice) && !(s.posts || {})[site.id]) throw new RuleError('Roll the post\'s priced choice first (tally_post_offer): the clerk\'s offer decides what stamp is on the table.');
      const ids = (a.organismIds && a.organismIds.length ? a.organismIds : Object.keys(s.organisms).filter((id) => s.organisms[id].playerId));
      let any = false;
      for (const id of ids) {
        const o = org(s, id);
        const sp = o.specimens || { C: 0, G: 0, P: 0, T: 0 };
        if (!GRADES.some((k) => sp[k])) continue;
        o.stamped = o.stamped || { C: 0, G: 0, P: 0, T: 0 };
        // Where the post's offer takes a share (the Guild's third), it comes off the cut as it is stamped.
        const share = ((s.posts || {})[site.id] || {}).takeOneIn || 0;
        const taken = { C: 0, G: 0, P: 0, T: 0 };
        if (share && !a.noShare) for (const k of GRADES) { taken[k] = Math.floor(sp[k] / share); sp[k] -= taken[k]; }
        if (GRADES.some((k) => taken[k])) say(s, ctx, `The post keeps its share of ${o.name}'s cut: ${gradeText(taken)}.`, 'award');
        for (const k of GRADES) { o.stamped[k] += sp[k]; sp[k] = 0; }
        o.specimens = sp;
        any = true;
        say(s, ctx, `${o.name}'s cut is weighed, graded and stamped: now holding ${gradeText(o.stamped)} stamped.`, 'award');
      }
      if (!any) throw new RuleError('Nobody is carrying an unstamped cut.');
    },
  },
  // An organism swears a promise into one of its Oath boxes. The box is spent and the
  // promise is kept on its sheet, with who witnessed it and where.
  'oath.swear': {
    host: true,
    run(s, a, ctx) {
      const o = org(s, a.organismId);
      if (o.oath == null) throw new RuleError(`${o.name} has no Oath boxes printed for its Hand. An organism with Oath boxes must swear.`);
      if (o.oath <= 0) throw new RuleError(`${o.name} has no Oath boxes left.`);
      const promise = String(a.promise || '').trim().slice(0, 200);
      if (!promise) throw new RuleError('Say what is promised, in the player\'s own words.');
      if (/\bto be asked\b|ask (?:them|the player) first|own words:?\s*$/i.test(promise)) throw new RuleError('That is the Director asking itself, not a player promising. Ask what they swear, then call swear_oath with what they say.');
      // Bench run 3 of 13 Nov: the Director swore `Bresk's own words: "..." - to be asked what is
      // promised.`, the Engine wrote it into the record, and `recall` read that scaffolding back to
      // Bresk later as his own oath. The Director may only swear words that reached the table; a
      // human host may still phrase one freely (ctx.ai marks Director-only limits).
      if (ctx.ai && !spokenAtTable(s, promise)) throw new RuleError(`No player said that, so it is not an Oath yet: nothing at the table matches "${promise.slice(0, 70)}". Ask what ${o.name} swears, then call swear_oath with exactly their words.`);
      const witness = String(a.witness || '').trim().slice(0, 60);
      o.oath -= 1;
      o.oaths = o.oaths || [];
      o.oaths.push({ id: `v${s.nextId++}`, promise, witness, siteId: s.scene.siteId, open: true });
      say(s, ctx, `${o.name} swears an Oath${witness ? `, witnessed by ${witness}` : ''}: "${promise}". Oath boxes left: ${o.oath} of ${o.oathMax}.`, 'award');
    },
  },
  // An Oath is kept or broken (CORE 11.4, FIRST CARVE p.329). Keeping one that cost something
  // real pays the table a Cohesion. Breaking one marks 2 Countdown boxes and leaves a scar, and
  // the witness drops a rung: oath-breaking is a plot, not a punishment, so the Engine only
  // writes the price and leaves the plot to the table.
  'oath.settle': {
    host: true,
    run(s, a, ctx) {
      const o = org(s, a.organismId);
      const open = (o.oaths || []).filter((v) => v.open);
      if (!open.length) throw new RuleError(`${o.name} has no Oath open.`);
      const v = a.oathId ? open.find((x) => x.id === a.oathId) : (open.length === 1 ? open[0] : null);
      if (!v) throw new RuleError(`Say which Oath: ${open.map((x) => `${x.id} ("${x.promise.slice(0, 40)}")`).join(', ')}.`);
      const why = String(a.why || '').trim().slice(0, 160);
      v.open = false;
      v.kept = !!a.kept;
      v.why = why;
      if (a.kept) {
        s.cohesion = (s.cohesion || 0) + 1;
        // 3.2: "Rewind -1 when: ... the Cohort keeps an Oath in front of a faction that notices".
        if (v.witness) payClock(s, ctx, clockTrigger(ctx, 'oathKept'), -1, `${o.name}'s Oath was kept in front of ${v.witness}`);
        say(s, ctx, `${o.name} keeps the Oath: "${v.promise}"${why ? ` — ${why}` : ''}. Cohesion ${s.cohesion}.`, 'award');
      } else {
        o.countdown = clamp(o.countdown + 2, 0, o.countdownMax);
        o.conditions = o.conditions || [];
        o.conditions.push({ name: 'Oath-scar', why: v.promise.slice(0, 60) });
        say(s, ctx, `${o.name} breaks the Oath: "${v.promise}"${why ? ` — ${why}` : ''}. Two Lysis Countdown boxes marked (${o.countdown} of ${o.countdownMax}), and a scar.${v.witness ? ` ${v.witness} drops a rung.` : ''}`, 'danger');
      }
    },
  },
  // Sharing out the harvest. The offered player (or the host for them) takes the item or passes.
  'loot.take': {
    run(s, a, ctx) { lootDecide(s, a, ctx, true); },
  },
  'loot.pass': {
    run(s, a, ctx) { lootDecide(s, a, ctx, false); },
  },
  // A player's standing choice for a grade: 'take', 'pass', or cleared.
  'loot.auto': {
    run(s, a, ctx) {
      if (ctx.ai) throw new RuleError('The players choose what they take.');
      lootOrder(s);
      const orgId = ctx.role === 'host' ? a.organismId : (s.players[ctx.pid] || {}).organismId;
      if (!orgId || !s.organisms[orgId]) throw new RuleError('Which organism?');
      if (!GRADES.includes(a.grade)) throw new RuleError('Choose a grade: C, G, P or T.');
      if (a.rule != null && !['take', 'pass'].includes(a.rule)) throw new RuleError('Choose take, pass, or nothing.');
      setAuto(s, orgId, a.grade, a.rule || null);
      say(s, ctx, a.rule ? `${s.organisms[orgId].name} will ${a.rule} every ${a.grade} Specimen offered.` : `${s.organisms[orgId].name} will choose each ${a.grade} Specimen again.`, 'table');
      if (s.loot.offer) settleAuto(s, ctx);
    },
  },
  // The host may set the picking order by hand (a new arrival, a correction).
  'loot.order': {
    host: true,
    run(s, a, ctx) {
      if (ctx.ai) throw new RuleError('The picking order is the table\'s, not the Director\'s.');
      const cur = lootOrder(s);
      const want = (Array.isArray(a.order) ? a.order : []).filter((id) => cur.includes(id));
      if (want.length !== cur.length) throw new RuleError('Give the whole picking order, each organism once.');
      s.loot.order = want;
      if (s.loot.offer) s.loot.offer.orgId = want[0];
      say(s, ctx, `The picking order is now ${want.map((id) => s.organisms[id].name).join(', ')}.`, 'table');
    },
  },
  // The table's memory. One card per person, faction, place or thread, found again by name.
  // origin says where it came from: the page, the table (it came up in play), or improvised.
  'cast.remember': {
    host: true,
    run(s, a, ctx) {
      s.cast = s.cast || {};
      const list = Array.isArray(a.entries) ? a.entries : [a];
      let any = false;
      let skipped = 0;
      for (const e of list.slice(0, 20)) {
        const name = String(e.name || '').trim().slice(0, 60);
        if (!name) continue;
        if (isCohort(s, name)) { skipped += 1; continue; } // their sheet already keeps them
        const kind = CAST_KINDS.includes(e.kind) ? e.kind : 'person';
        const key = castKey(name);
        let c = s.cast[key];
        if (!c) {
          if (Object.keys(s.cast).length >= MAX_CAST) throw new RuleError(`The table's memory holds ${MAX_CAST} cards. Ask the host to clear some first.`);
          c = s.cast[key] = { id: key, name, kind, siteId: s.scene.siteId, origin: castOrigin(name, ctx, e.origin), firstSeq: s.seq, lastSeq: s.seq, facts: [] };
        }
        c.lastSeq = s.seq;
        if (e.kind && CAST_KINDS.includes(e.kind)) c.kind = e.kind;
        const fact = String(e.fact || '').trim().slice(0, 240);
        if (fact && !c.facts.some((f) => f.text.toLowerCase() === fact.toLowerCase())) {
          c.facts.push({ text: fact, seen: e.seen !== false, seq: s.seq, siteId: s.scene.siteId });
          if (c.facts.length > MAX_FACTS) c.facts = c.facts.slice(-MAX_FACTS);
        }
        any = true;
      }
      if (!any && !skipped) throw new RuleError('Give a name to remember.');
    },
  },
  'cast.forget': {
    host: true,
    run(s, a) {
      const c = (s.cast || {})[a.id];
      if (!c) throw new RuleError('That card is not in the table\'s memory.');
      if (a.fact != null) c.facts = c.facts.filter((f, i) => i !== Number(a.fact));
      else delete s.cast[a.id];
    },
  },
  'improv.set': {
    host: true,
    run(s, a, ctx) {
      if (ctx.ai) throw new RuleError('Only the host decides how far the Director may go beyond the page.');
      if (!['page', 'callbacks'].includes(a.improv)) throw new RuleError('Choose "page" or "callbacks". Ad-libbing is not built yet.');
      s.improv = a.improv;
    },
  },
  // A creature yields, flees, or was never part of the fight. It takes no more turns and no
  // longer holds the Pulse War open. A player who strikes it brings it back.
  'creature.standDown': {
    host: true,
    run(s, a, ctx) {
      const c = cre(s, a.cid);
      if (c.down) throw new RuleError(`${c.name} is down.`);
      if (a.off) {
        // The host may put a stood-down creature back into the fight.
        if (!c.stoodDown) return;
        c.stoodDown = null;
        say(s, ctx, `${c.name} is back in the fight.`, 'turn');
        return;
      }
      if (c.stoodDown) throw new RuleError(`${c.name} has already stood down.`);
      const why = String(a.why || '').trim().slice(0, 120) || (ctx.ai ? '' : 'it is not fighting');
      if (!why) throw new RuleError('Say why it stands down: it yielded, it fled, or it was never fighting.');
      c.stoodDown = { why };
      say(s, ctx, `${c.name} stands down: ${why}.`, 'turn');
      if (!s.fight) return;
      const act = s.fight.actors[key('cre', c.cid)];
      if (!act) return;
      act.reserve = false;
      if (act.status === 'acting' || act.status === 'holding') {
        const wasTurn = s.fight.turn === act.key;
        finishActor(s, ctx, act, false);
        if (wasTurn || !s.fight.turn) advanceTurn(s, ctx);
      }
    },
  },
  'turn.end': {
    run(s, a, ctx) {
      if (!s.fight) throw new RuleError('There is no Pulse War running.');
      const kind = a.cid ? 'cre' : 'org';
      const id = a.cid || a.organismId;
      if (kind === 'org') needControl(s, ctx, id);
      else if (ctx.role !== 'host') throw new RuleError('Only the host moves creatures.');
      const act = s.fight.actors[key(kind, id)];
      if (!act) throw new RuleError('They are not in this fight.');
      if (act.status !== 'acting' && act.status !== 'holding') throw new RuleError('It is not their turn.');
      const wasTurn = s.fight.turn === act.key;
      finishActor(s, ctx, act, !!a.hold && act.status === 'acting');
      if (wasTurn || !s.fight.turn) advanceTurn(s, ctx);
    },
  },
  'turn.next': {
    host: true,
    run(s, a, ctx) {
      if (!s.fight) throw new RuleError('There is no Pulse War running.');
      const cur = s.fight.turn ? s.fight.actors[s.fight.turn] : null;
      if (cur) finishActor(s, ctx, cur, false);
      advanceTurn(s, ctx);
    },
  },
  'cycle.end': {
    host: true,
    run(s, a, ctx) {
      if (!s.fight) throw new RuleError('There is no Pulse War running.');
      // Anyone whose turn never came still Leaks: the Cycle passed for them too.
      for (const k of s.fight.order) {
        const act = s.fight.actors[k];
        if (act.status === 'waiting') turnStartEffects(s, ctx, act);
        act.status = 'done';
      }
      s.fight.turn = null;
      endCycle(s, ctx);
      advanceTurn(s, ctx);
    },
  },

  // ---- Pulse War: what an organism does with its Pulse Points
  act: {
    run(s, a, ctx) {
      needControl(s, ctx, a.organismId);
      const o = org(s, a.organismId);
      if (!s.fight) throw new RuleError('Pulse Points are only spent in a Pulse War. Outside a fight, just say what you do.');
      const act = actorOf(s, 'org', o.id);
      if (!act) throw new RuleError(`${o.name} is not in this fight.`);
      if (o.dormant) throw new RuleError(`${o.name} is Dormant and cannot act.`);
      const def = R.ACTIONS[a.action];
      if (!def || a.action === 'strike') throw new RuleError('Choose Drift, Vent, Sense, Synthesise, Burst or Reserve.');
      let cost = def.cost;
      if (a.action === 'burst') cost = clamp(Math.trunc(Number(a.cost) || 3), 3, 5);
      if (a.action === 'reserve' && act.reserve) throw new RuleError('You are already holding a Reserve.');
      if (a.action === 'vent') {
        const atp = R.atpCost(2, { stress: o.stress, conditions: o.conditions.map((c) => c.name) });
        if (o.atp < atp) throw new RuleError(`Vent costs ${atp} ATP and ${o.name} has ${o.atp}.`);
        spendPP(s, act, cost, 'Vent');
        o.atp -= atp;
        act.spentAtp = true;
        o.stress = Math.max(0, o.stress - 2);
        o.conditions = o.conditions.filter((c) => c.name !== 'Overclocked' && c.name !== 'Turgid');
        say(s, ctx, `${o.name} Vents: 1 PP and ${atp} ATP. Stress is ${o.stress}. ${act.pp} PP left.`, 'act');
        return;
      }
      if (a.action === 'burst') {
        const atp = R.atpCost(cost, { stress: o.stress, conditions: o.conditions.map((c) => c.name) });
        if (o.atp < atp) throw new RuleError(`That Burst costs ${atp} ATP and ${o.name} has ${o.atp}.`);
        spendPP(s, act, cost, 'That Burst');
        o.atp -= atp;
        act.spentAtp = true;
        say(s, ctx, `${o.name} begins a Burst: ${cost} PP and ${atp} ATP. ${act.pp} PP left.`, 'act');
        return;
      }
      spendPP(s, act, cost, def.name);
      if (a.action === 'drift') {
        act.drifted = true;
        if (a.band) o.band = a.band;
        o.conditions = o.conditions.filter((c) => c.name !== 'Braced');
        say(s, ctx, `${o.name} Drifts${a.band ? ` to ${a.band}` : ''} (up to ${o.flow} Drifts). ${act.pp} PP left.`, 'act');
      } else if (a.action === 'reserve') {
        act.reserve = true;
        say(s, ctx, `${o.name} holds a Reserve for a Reactive Osmosis. ${act.pp} PP left.`, 'act');
      } else {
        say(s, ctx, `${o.name}: ${def.name}. ${act.pp} PP left.`, 'act');
      }
    },
  },
  strike: {
    run(s, a, ctx) {
      needControl(s, ctx, a.organismId);
      const o = org(s, a.organismId);
      if (o.dormant) throw new RuleError(`${o.name} is Dormant and cannot act.`);
      const carried = o.weapons.filter((w) => w.carried !== false);
      const w = carried.find((x) => x.id === a.weaponId) || carried[0];
      if (!w) throw new RuleError(`${o.name} carries no Apparatus.`);
      const c = cre(s, a.targetId);
      if (c.down) throw new RuleError(`${c.name} is already down.`);
      if (c.stoodDown) {
        // Striking a creature that had stood down brings it back into the fight.
        c.stoodDown = null;
        say(s, ctx, `${c.name} had stood down. Struck, it is back in the fight.`, 'turn');
      }
      const act = actorOf(s, 'org', o.id);
      const heavy = (w.props || []).includes('Heavy');
      const cost = 2 + (heavy ? 1 : 0);
      if (s.fight) {
        if (!act) throw new RuleError(`${o.name} is not in this fight.`);
        spendPP(s, act, cost, heavy ? `A Strike with the ${w.name} (Heavy)` : 'A Strike');
        act.strikes += 1;
      }
      const baseName = w.cls === 'Weight' ? 'VSC' : w.cls === 'Resonator' ? 'RTC' : w.cls === 'Projector' ? (o.base.RTC > o.base.DFF ? 'RTC' : 'DFF') : 'DFF';
      const pathName = w.cls === 'Resonator' ? 'Catalysis' : 'Membrane Penetration';
      const mods = [];
      if (w.bonus) mods.push({ label: w.name, dice: w.bonus });
      const braced = (w.props || []).includes('Braced');
      if (braced && s.fight && act && !act.drifted) mods.push({ label: 'Braced (did not Drift)', dice: 1 });
      if (a.momentum && !braced) mods.push({ label: 'Momentum', dice: a.current ? 3 : 2 });
      if (hasCond(c, 'Marked')) mods.push({ label: 'Target is Marked', dice: 2 });
      for (const m of situationMods(a.situation)) mods.push(m);
      if (ctx.role === 'host') for (const m of cleanMods(a.mods)) mods.push(m);
      const pool = R.buildPool({ baseline: o.base[baseName] + condBase(o, baseName), pathway: o.pathways[pathName] || 0, mods, stress: o.stress });
      pool.baselineName = baseName;
      pool.pathwayName = pathName;
      const tier = clamp(a.tier || 1, 1, 5);
      const type = a.momentum && !braced ? 'Kinetic' : (w.type === 'any' ? (a.dtype || 'Kinetic') : w.type);
      pushRequest(s, {
        kind: 'attack', actor: { kind: 'org', id: o.id, name: o.name }, target: { kind: 'cre', id: c.cid, name: c.name },
        label: `Strike: ${w.name} at ${c.name}`, pool, at: creMT(c), atLabel: 'Membrane Threshold',
        weapon: { id: w.id, name: w.name, bd: (w.bd || [0])[tier - 1] || 0, type, props: w.props || [] }, ppCost: s.fight ? cost : 0, flank: !!a.flank,
      });
      say(s, ctx, `${o.name} Strikes ${c.name} with the ${w.name}${s.fight ? `: ${cost} PP, ${act.pp} left` : ''}. ${pool.dice} dice against Membrane Threshold ${creMT(c)}.`, 'act');
      // A creature holding a Reserve Deflects the first attack against it (Bestiary: +4 to its defending Threshold).
      const cAct = actorOf(s, 'cre', c.cid);
      if (cAct && cAct.reserve && !cAct.reacted) {
        const req = s.requests[s.requests.length - 1];
        cAct.reserve = false;
        cAct.reacted = true;
        req.at += 4;
        req.reaction = 'deflect';
        req.reactor = c.name;
        req.chance = successChance(Math.min(30, req.pool.dice), req.at);
        say(s, ctx, `${c.name} spends its Reserve: Deflect. Its Membrane Threshold against this attack is ${req.at}.`, 'act');
      }
    },
  },
  react: {
    // §4.10 Reactive Osmosis, spent from a held Reserve against one incoming attack.
    run(s, a, ctx) {
      const req = s.requests.find((q) => q.id === a.requestId && q.kind === 'incoming');
      if (!req) throw new RuleError('That attack is no longer waiting.');
      const helperId = a.organismId || req.target.id;
      needControl(s, ctx, helperId);
      const act = actorOf(s, 'org', helperId);
      if (!act || !act.reserve) throw new RuleError('A Reactive Osmosis needs a held Reserve (1 PP, set aside on your turn).');
      if (act.reacted) throw new RuleError('One Reactive Osmosis per Cycle.');
      if (req.reaction) throw new RuleError('A reaction has already been made against this attack.');
      if (a.kind !== 'deflect' && a.kind !== 'brace' && a.kind !== 'inhibit') throw new RuleError('Choose Deflect, Brace or Inhibit.');
      const helper = s.organisms[helperId];
      if (a.kind === 'inhibit') {
        // CORE 1.8 and 4.10: 3 ATP and the Reserve take 2 dice off a hostile roll.
        const atp = R.atpCost(3, { stress: helper.stress, conditions: helper.conditions.map((c) => c.name) });
        if (helper.atp < atp) throw new RuleError(`Inhibition costs ${atp} ATP and ${helper.name} has ${helper.atp}.`);
        helper.atp -= atp;
        act.spentAtp = true;
        addDice(s, req, `Inhibited by ${helper.name}`, -2);
      }
      act.reserve = false;
      act.reacted = true;
      req.reaction = a.kind;
      req.reactor = helper.name;
      if (a.kind === 'deflect') {
        req.at += 4;
        req.chance = successChance(Math.min(30, req.pool.dice), req.at);
      }
      say(s, ctx, `${s.organisms[helperId].name} spends the Reserve: ${R.REACTIONS[a.kind].name}. ${R.REACTIONS[a.kind].does}`, 'act');
    },
  },
  overdrive: {
    // CORE 1.8: pay energy or body for dice, once per roll.
    run(s, a, ctx) {
      const req = s.requests.find((q) => q.id === a.requestId);
      if (!req || req.actor.kind !== 'org') throw new RuleError('That roll is no longer waiting.');
      needControl(s, ctx, req.actor.id);
      const o = org(s, req.actor.id);
      if (req.overdrive) throw new RuleError('You cannot Overdrive twice on the same roll.');
      const act = actorOf(s, 'org', o.id);
      if (a.with === 'mi') {
        if (o.mi <= 4) throw new RuleError(`Overdriving with the body costs 4 MI and ${o.name} has ${o.mi}.`);
        o.mi -= 4;
        addStress(s, ctx, o, 1, 'Overdrive paid in body');
        addDice(s, req, 'Overdrive (4 MI)', 4);
      } else {
        const atp = R.atpCost(4, { stress: o.stress, conditions: o.conditions.map((c) => c.name) });
        if (o.atp < atp) throw new RuleError(`Overdrive costs ${atp} ATP and ${o.name} has ${o.atp}.`);
        o.atp -= atp;
        if (act) act.spentAtp = true;
        addDice(s, req, `Overdrive (${atp} ATP)`, 2);
      }
      req.overdrive = a.with === 'mi' ? 'mi' : 'atp';
      say(s, ctx, `${o.name} Overdrives: ${req.overdrive === 'mi' ? '4 MI for 4 more dice, and 1 Stress' : '2 more dice for ATP'}. Now ${req.pool.dice} dice.`, 'act');
    },
  },
  stabilise: {
    run(s, a, ctx) {
      needControl(s, ctx, a.organismId);
      const o = org(s, a.organismId);
      const t = org(s, a.targetId);
      if (!t.dormant) throw new RuleError(`${t.name} is not Dormant.`);
      if (o.dormant) throw new RuleError(`${o.name} is Dormant and cannot act.`);
      const act = actorOf(s, 'org', o.id);
      if (s.fight && act) spendPP(s, act, 2, 'Synthesise');
      const pool = poolForCheck(o, { baseline: 'RTC', pathway: 'Synthesis', mods: cleanMods(a.mods) });
      pushRequest(s, {
        kind: 'stabilise', actor: { kind: 'org', id: o.id, name: o.name }, target: { kind: 'org', id: t.id, name: t.name },
        label: `Stabilise ${t.name}`, pool, at: R.stabiliseAT(t.level), ppCost: s.fight && act ? 2 : 0,
      });
      say(s, ctx, `${o.name} works to stabilise ${t.name}: ${pool.dice} dice against Threshold ${R.stabiliseAT(t.level)}.`, 'act');
    },
  },

  // ---- Pulse War: creatures (host only)
  'creature.act': {
    host: true,
    run(s, a, ctx) {
      const c = cre(s, a.cid);
      if (!s.fight) throw new RuleError('There is no Pulse War running.');
      const act = actorOf(s, 'cre', c.cid);
      if (!act) throw new RuleError(`${c.name} is not in this fight.`);
      if (c.stoodDown) throw new RuleError(`${c.name} has stood down and does not act.`);
      const cost = clamp(Math.trunc(Number(a.cost) || 1), 0, 6);
      if (a.what === 'Reserve') {
        if (c.canReact === false) throw new RuleError(`${c.name} cannot use a Reactive Osmosis.`);
        if (act.reserve) throw new RuleError(`${c.name} is already holding a Reserve.`);
        if (act.reacted) throw new RuleError('One Reactive Osmosis per Cycle.');
        spendPP(s, act, 1, 'A Reserve');
        act.reserve = true;
        say(s, ctx, `${c.name} holds a Reserve: it will Deflect the next attack against it (1 PP, ${act.pp} left).`, 'act');
        return;
      }
      spendPP(s, act, cost, String(a.what || 'That'));
      if (a.band) c.band = a.band;
      if (a.what === 'Brace' && !hasCond(c, 'Braced')) c.conditions.push({ name: 'Braced' });
      if (a.band) { c.conditions = c.conditions.filter((x) => x.name !== 'Braced'); act.drifted = true; }
      say(s, ctx, `${c.name}: ${String(a.what || 'acts').slice(0, 60)}${a.band ? ` to ${a.band}` : ''} (${cost} PP, ${act.pp} left).`, 'act');
    },
  },
  'creature.strike': {
    host: true,
    run(s, a, ctx) {
      const c = cre(s, a.cid);
      if (c.down) throw new RuleError(`${c.name} is down.`);
      if (c.stoodDown) throw new RuleError(`${c.name} has stood down and does not strike.`);
      const o = org(s, a.targetId);
      const act = actorOf(s, 'cre', c.cid);
      const cost = a.cost == null ? 2 : clamp(Math.trunc(Number(a.cost)), 0, 6);
      if (s.fight) {
        if (!act) throw new RuleError(`${c.name} is not in this fight.`);
        if (c.segments != null && !a.force) {
          const allowed = Math.floor(c.segments / 2);
          if (act.strikes >= allowed) throw new RuleError(`A swarm gets 1 Strike per 2 Segments (CORE 4.13). ${c.name} has ${c.segments} Segments and has made ${act.strikes} this Cycle.`);
        }
        spendPP(s, act, cost, 'A Strike');
        act.strikes += 1;
      }
      const mods = cleanMods(a.mods);
      if (hasCond(o, 'Marked')) mods.push({ label: 'Target is Marked', dice: 2 });
      const pool = R.buildPool({ fixed: c.pool, mods });
      const tAct = actorOf(s, 'org', o.id);
      pushRequest(s, {
        kind: 'incoming', actor: { kind: 'cre', id: c.cid, name: c.name }, target: { kind: 'org', id: o.id, name: o.name },
        label: `${c.name} strikes ${o.name}`, pool, at: orgMT(o), atLabel: 'Membrane Threshold', bd: c.bd, dtype: c.type,
        ppCost: s.fight ? cost : 0, canReact: !!(tAct && tAct.reserve && !tAct.reacted),
      });
      say(s, ctx, `${c.name} strikes at ${o.name}: ${pool.dice} dice against Membrane Threshold ${orgMT(o)}.`, 'act');
    },
  },
};

// --------------------------------------------------------------------- views
// What each kind of screen may see. Creature numbers stay with the host; the
// table sees evidence (Segments, a word for how hurt it looks), not the block.
export function viewFor(state, role, pid) {
  if (role === 'host') return state;
  const s = clone(state);
  const pub = {};
  for (const c of Object.values(s.creatures)) {
    if (c.hidden) continue;
    let looks = '';
    if (c.down) looks = 'down';
    else if (c.stoodDown) looks = 'standing down';
    else if (c.segments != null) looks = `${c.segments} of ${c.segMax} Segments`;
    else {
      const f = c.mi / c.miMax;
      looks = f >= 1 ? 'unhurt' : f > 0.66 ? 'scratched' : f > 0.33 ? 'hurt' : 'badly hurt';
    }
    pub[c.cid] = {
      cid: c.cid, blockId: c.blockId, name: c.name, band: c.band, siteId: c.siteId, down: c.down, stoodDown: !!c.stoodDown, harvested: !!c.harvested,
      segments: c.segments, segMax: c.segMax, looks, conditions: c.conditions,
    };
  }
  s.creatures = pub;
  if (s.fight) {
    for (const k of Object.keys(s.fight.actors)) {
      const a = s.fight.actors[k];
      if (a.kind === 'cre' && !pub[a.id]) {
        delete s.fight.actors[k];
        s.fight.order = s.fight.order.filter((x) => x !== k);
      } else if (a.kind === 'cre') {
        a.pp = null;
        a.ppMax = null;
      }
    }
  }
  s.requests = s.requests.filter((q) => !(q.actor.kind === 'cre' && q.actor.id && !pub[q.actor.id]));
  for (const q of s.requests) { delete q.bd; }
  s.log = s.log.filter((l) => l.kind !== 'note-host');
  delete s.cast; // the Director's memory, which may hold what the players have not been told
  s.me = pid && s.players[pid] ? { pid, ...s.players[pid] } : null;
  return s;
}
