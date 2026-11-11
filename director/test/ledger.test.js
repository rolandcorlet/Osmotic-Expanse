import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSession, apply, viewFor, RuleError, orgMT } from '../engine/ledger.js';
import * as R from '../engine/rules.js';
import { makeRng } from '../engine/dice.js';
import { scenario, publicScenario } from '../data/first-carve.js';

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));

function table(seed = 7) {
  const rng = makeRng(seed);
  let s = newSession(scenario);
  const ctx = (role, pid) => ({ role, pid, rng, now: 0, scenario, bestiary });
  const host = (a) => { s = apply(s, a, ctx('host', null)); return s; };
  const as = (pid, a) => { s = apply(s, a, ctx('player', pid)); return s; };
  return { host, as, get s() { return s; } };
}

function seated() {
  const t = table();
  t.as('p1', { type: 'join', name: 'Roly' });
  t.as('p1', { type: 'claim', organismId: 'wall', name: 'Bresk of the Sixth Choir' });
  t.as('p2', { type: 'join', name: 'Sam' });
  t.as('p2', { type: 'claim', organismId: 'eyes', name: 'Brost of the Third Current' });
  return t;
}

// Put a chosen actor on turn by ending turns until it is theirs.
function bringToTurn(t, k) {
  for (let i = 0; i < 20 && t.s.fight.turn !== k; i++) t.host({ type: 'turn.next' });
  assert.equal(t.s.fight.turn, k);
}

test('rules: reading a roll', () => {
  const r = R.readRoll([6, 5, 4, 4, 2, 1], 12);
  assert.deepEqual([r.inhibitors, r.total, r.success, r.overflow, r.runaway], [1, 21, true, 9, false]);
  assert.equal(R.readRoll([2, 3, 5, 6, 6, 4], 12).runaway, true); // no 1s, two 6s
  assert.equal(R.readRoll([6, 6, 1], 8).runaway, false); // an Inhibitor spoils it
  const exact = R.readRoll([2, 2, 2, 2, 2, 2, 1], 12);
  assert.deepEqual([exact.total, exact.success, exact.overflow], [12, true, 0]);
});

test('rules: pools, the cap and Stress', () => {
  assert.equal(R.buildPool({ baseline: 4, pathway: 1, mods: [{ label: 'Flail', dice: 1 }] }).dice, 6);
  assert.equal(R.buildPool({ baseline: 4, pathway: 1, stress: 3 }).dice, 4);
  assert.equal(R.buildPool({ baseline: 4, pathway: 1, stress: 6 }).dice, 2);
  const capped = R.buildPool({ baseline: 3, mods: [{ dice: 4 }, { dice: 4 }] });
  assert.equal(capped.dice, 8);
  assert.equal(capped.capped, true);
  assert.equal(R.homeostatic(7), 21);
});

test('rules: damage, soak, swarms, Breach, Stress 8', () => {
  assert.equal(R.damage({ overflow: 9, bd: 4, soak: 0 }), 13);
  assert.equal(R.damage({ overflow: 0, bd: 1, soak: 1 }), 1); // a hit always deals at least 1
  assert.equal(R.damage({ overflow: 3, bd: 2, effectValue: 4, runaway: true }), 13); // Effect Value twice
  assert.equal(R.damage({ overflow: 6, bd: 2, soak: 0, braced: true, type: 'Kinetic' }), 4);
  assert.equal(R.segmentsRemoved(9), 4);
  assert.equal(R.segmentsRemoved(0), 1);
  assert.deepEqual(R.applyDamage(5, 13), { mi: 0, dormant: true, breach: true, countdownMarks: 1 });
  assert.equal(R.applyDamage(5, 12).breach, false);
  assert.deepEqual(R.markStress(6, 2), { stress: 5, collapses: 1, countdownMarks: 2 });
  assert.equal(R.detection(14, 10).firstVolley, 'A');
  assert.equal(R.detection(12, 10).firstVolley, null);
});

test('the Four Hands match the printed arithmetic', () => {
  for (const h of scenario.hands) {
    assert.equal(R.pulsePoints(h.base.DFF), h.pp, `${h.hand} PP`);
    assert.equal(R.membraneThreshold(h.base.DFF), h.mt, `${h.hand} MT`);
    assert.equal(R.flow(h.base.DFF), h.flow, `${h.hand} Flow`);
    assert.equal(R.countdownBoxes(h.base.VSC, h.hull), h.countdown, `${h.hand} Countdown`);
    const wrap = h.kit.some((k) => k.startsWith('Lipid Weave Wrap')) ? 5 : 0;
    assert.equal(R.maxMI(h.base.VSC, h.hull, 1) + wrap, h.mi, `${h.hand} MI`);
  }
});

test('joining, claiming and naming', () => {
  const t = seated();
  assert.equal(t.s.organisms.wall.name, 'Bresk of the Sixth Choir');
  assert.equal(t.s.organisms.wall.playerId, 'p1');
  assert.throws(() => t.as('p2', { type: 'claim', organismId: 'wall' }), RuleError);
  assert.throws(() => t.as('p2', { type: 'rename', organismId: 'wall', name: 'X' }), /not your organism/);
});

test('a check: own dice, Inhibitors mark Stress, the roll is recorded', () => {
  const t = seated();
  t.host({ type: 'request.check', organismId: 'wall', label: 'Cross the wound lip', baseline: 'VSC', pathway: 'Pressure Tolerance', mods: [{ label: 'Eyes marked the pocket', dice: 1 }], at: 12 });
  const q = t.s.requests[0];
  assert.equal(q.pool.dice, 7);
  assert.throws(() => t.as('p2', { type: 'roll', requestId: q.id }), /not your organism/);
  assert.throws(() => t.as('p1', { type: 'roll', requestId: q.id, dice: [2, 2, 2] }), /Expected 7 dice/);
  t.as('p1', { type: 'roll', requestId: q.id, dice: [2, 2, 2, 2, 2, 2, 1] });
  const r = t.s.rolls.at(-1);
  assert.deepEqual([r.total, r.success, r.overflow, r.source, r.inhibitors], [12, true, 0, 'own', 1]);
  assert.equal(t.s.organisms.wall.stress, 1);
  assert.equal(t.s.requests.length, 0);
});

test('unhurried and the Baseline meets the Threshold: no dice, no Stress', () => {
  const t = seated();
  t.host({ type: 'request.check', organismId: 'eyes', label: 'Taste the water', baseline: 'OSM', pathway: 'Chemoreception', at: 12, unhurried: true });
  assert.equal(t.s.requests.length, 0);
  const r = t.s.rolls.at(-1);
  assert.deepEqual([r.source, r.total, r.success, r.dice.length], ['baseline', 21, true, 0]);
  // Severe is out of reach unhurried, so it becomes a roll.
  t.host({ type: 'request.check', organismId: 'eyes', label: 'Read the serial', baseline: 'OSM', pathway: 'Chemoreception', at: 24, unhurried: true });
  assert.equal(t.s.requests.length, 1);
});

test('Pulse Points: none outside a fight, a full set at the start of each turn', () => {
  const t = seated();
  assert.throws(() => t.as('p1', { type: 'act', organismId: 'wall', action: 'drift' }), /only spent in a Pulse War/);
  t.host({ type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 2, band: 'near' }] });
  const f = t.s.fight;
  assert.equal(f.cycle, 1);
  assert.equal(f.order.length, 4);
  const first = f.actors[f.turn];
  assert.equal(first.pp, first.ppMax); // the first Cycle of a new fight starts with full PP
  bringToTurn(t, 'org:wall');
  assert.equal(t.s.fight.actors['org:wall'].pp, 5);
  t.as('p1', { type: 'act', organismId: 'wall', action: 'drift', band: 'contact' });
  assert.equal(t.s.fight.actors['org:wall'].pp, 4);
  assert.throws(() => t.as('p2', { type: 'act', organismId: 'wall', action: 'drift' }), /not your organism/);
  // Unspent PP do not carry: run the Cycle out and the Wall is back to 5 on its next turn.
  t.host({ type: 'cycle.end' });
  assert.equal(t.s.fight.cycle, 2);
  bringToTurn(t, 'org:wall');
  assert.equal(t.s.fight.actors['org:wall'].pp, 5);
  t.host({ type: 'fight.end' });
  assert.equal(t.s.fight, null);
});

test('the printed first Cycle (Vector 6.4): the Wall, the Flail and a swarm', () => {
  const t = seated();
  t.host({ type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'contact' }], ownDice: { wall: 6, eyes: 6, 'Order I: Lytic Swarms': 1 } });
  const swarm = Object.values(t.s.creatures)[0];
  bringToTurn(t, 'org:wall');
  // Heavy costs 1 extra PP (CORE 9.3), so the Flail is a 3-PP Strike.
  t.as('p1', { type: 'strike', organismId: 'wall', weaponId: 'chitin-flail', targetId: swarm.cid });
  let q = t.s.requests[0];
  assert.equal(t.s.fight.actors['org:wall'].pp, 2);
  assert.equal(q.at, 12);
  assert.equal(q.pool.dice, 7); // VSC 4 + Membrane Penetration 1 + Flail 1 + Braced 1 (did not Drift)
  t.host({ type: 'request.adjust', requestId: q.id, label: 'Match the book: no Brace', dice: -1 });
  q = t.s.requests[0];
  assert.equal(q.pool.dice, 6);
  t.as('p1', { type: 'roll', requestId: q.id, dice: [6, 5, 4, 4, 2, 1] });
  const r = t.s.rolls.at(-1);
  assert.deepEqual([r.total, r.overflow, r.segments, r.inhibitors], [21, 9, 4, 1]);
  assert.equal(t.s.creatures[swarm.cid].segments, 2);
  assert.equal(t.s.organisms.wall.stress, 1);
  // The swarm, down to 2 Segments, gets one Strike. BD 1 against soak 1 still deals the minimum 1.
  t.as('p1', { type: 'act', organismId: 'wall', action: 'reserve' });
  t.as('p1', { type: 'turn.end', organismId: 'wall' });
  bringToTurn(t, `cre:${swarm.cid}`);
  t.host({ type: 'creature.strike', cid: swarm.cid, targetId: 'wall' });
  q = t.s.requests[0];
  assert.equal(q.at, 13);
  assert.equal(q.canReact, true);
  assert.throws(() => t.host({ type: 'creature.strike', cid: swarm.cid, targetId: 'wall', cost: 0 }), /1 Strike per 2 Segments/);
  t.host({ type: 'roll', requestId: q.id, dice: [6, 5, 2] });
  assert.equal(t.s.rolls.at(-1).damage, 1);
  assert.equal(t.s.organisms.wall.mi, 38);
});

test('Deflect: a held Reserve makes the Membrane Threshold +4 for one attack', () => {
  const t = seated();
  t.host({ type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'contact' }], ownDice: { wall: 6, eyes: 6, 'Order I: Lytic Swarms': 1 } });
  const swarm = Object.values(t.s.creatures)[0];
  bringToTurn(t, 'org:eyes');
  t.as('p2', { type: 'act', organismId: 'eyes', action: 'reserve' });
  t.as('p2', { type: 'turn.end', organismId: 'eyes' });
  bringToTurn(t, `cre:${swarm.cid}`);
  t.host({ type: 'creature.strike', cid: swarm.cid, targetId: 'eyes' });
  const q = t.s.requests[0];
  assert.equal(q.at, 14);
  t.as('p2', { type: 'react', requestId: q.id, kind: 'deflect' });
  assert.equal(t.s.requests[0].at, 18);
  assert.throws(() => t.as('p2', { type: 'react', requestId: q.id, kind: 'brace' }), RuleError);
  t.host({ type: 'roll', requestId: q.id, dice: [6, 6, 5] }); // 17: a hit on 14, a miss on 18
  assert.equal(t.s.rolls.at(-1).success, false);
  assert.equal(t.s.organisms.eyes.mi, 27);
});

test('a Breach sends an organism straight to Dormancy and marks a box', () => {
  const t = seated();
  t.host({ type: 'set', target: { kind: 'org', id: 'eyes' }, field: 'mi', value: 4 });
  t.host({ type: 'damage', target: { kind: 'org', id: 'eyes' }, amount: 12, dtype: 'Kinetic' });
  const o = t.s.organisms.eyes;
  assert.deepEqual([o.mi, o.dormant, o.countdown], [0, true, 1]);
  // Stabilise: RTC + Synthesis against 12 + Level, restoring Overflow + 4.
  t.as('p1', { type: 'stabilise', organismId: 'wall', targetId: 'eyes' });
  const q = t.s.requests[0];
  assert.equal(q.at, 13);
  t.host({ type: 'request.adjust', requestId: q.id, label: 'Coagulant help', dice: 3 });
  t.as('p1', { type: 'roll', requestId: q.id, dice: [6, 5, 4, 2] });
  assert.deepEqual([t.s.organisms.eyes.mi, t.s.organisms.eyes.dormant, t.s.organisms.eyes.countdown], [8, false, 0]);
});

test('Vent, Reconstitution and the CARCASS price of rest', () => {
  const t = seated();
  t.host({ type: 'set', target: { kind: 'org', id: 'wall' }, field: 'stress', value: 3 });
  t.host({ type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1 }] });
  bringToTurn(t, 'org:wall');
  t.as('p1', { type: 'act', organismId: 'wall', action: 'vent' });
  assert.deepEqual([t.s.organisms.wall.stress, t.s.organisms.wall.atp, t.s.fight.actors['org:wall'].pp], [1, 8, 4]);
  assert.throws(() => t.host({ type: 'rest' }), /Nobody rests/);
  t.host({ type: 'fight.end' });
  t.host({ type: 'rest' });
  assert.deepEqual([t.s.organisms.wall.stress, t.s.organisms.wall.atp], [0, 10]);
  assert.equal(t.s.clocks.CARCASS.filled, 1);
});

test('player screens never receive creature numbers or Director notes', () => {
  const t = seated();
  t.host({ type: 'creature.add', creatures: [{ blockId: 'fold-sentinel', count: 1 }, { blockId: 'receptor-lurker', count: 1, hidden: true }] });
  const v = viewFor(t.s, 'player', 'p1');
  const seen = Object.values(v.creatures);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].mt, undefined);
  assert.equal(seen[0].mi, undefined);
  assert.equal(seen[0].pool, undefined);
  assert.equal(seen[0].looks, 'unhurt');
  const open = JSON.stringify(publicScenario());
  assert.ok(!open.includes('BSP'));
  assert.ok(!open.includes('Nine-Folds'));
  assert.equal(viewFor(t.s, 'host', null).creatures[Object.keys(t.s.creatures)[0]].mt, 13);
});

test('MT follows conditions', () => {
  const t = seated();
  t.host({ type: 'condition', target: { kind: 'org', id: 'wall' }, name: 'Jostled' });
  assert.equal(orgMT(t.s.organisms.wall), 11);
});

test('Split Frequency: hold PP, step back in later, and the Cycle turns over by itself', () => {
  const t = seated();
  t.host({ type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1 }], ownDice: { wall: 5, eyes: 6, 'Order I: Lytic Swarms': 1 } });
  const swarm = Object.values(t.s.creatures)[0];
  assert.deepEqual(t.s.fight.order, ['org:eyes', 'org:wall', `cre:${swarm.cid}`]);
  assert.equal(t.s.fight.turn, 'org:eyes');
  // The Eyes spends 1 and holds the other 5.
  t.as('p2', { type: 'act', organismId: 'eyes', action: 'sense' });
  t.as('p2', { type: 'turn.end', organismId: 'eyes', hold: true });
  assert.equal(t.s.fight.actors['org:eyes'].status, 'holding');
  assert.equal(t.s.fight.turn, 'org:wall');
  // It is the Wall's turn, but the holder may act now, after... and the Wall may not act for the Eyes.
  assert.throws(() => t.as('p1', { type: 'act', organismId: 'eyes', action: 'drift' }), /not your organism/);
  t.as('p1', { type: 'turn.end', organismId: 'wall' });
  t.as('p2', { type: 'act', organismId: 'eyes', action: 'drift', band: 'Mid' });
  assert.equal(t.s.fight.actors['org:eyes'].pp, 4);
  // The swarm ends; only the holder is left, so the Cycle waits for them.
  t.host({ type: 'turn.end', cid: swarm.cid });
  assert.equal(t.s.fight.cycle, 1);
  t.as('p2', { type: 'turn.end', organismId: 'eyes' });
  // Everyone is done: Cycle 2 begins, the Eyes is first again with a full 6 PP.
  assert.equal(t.s.fight.cycle, 2);
  assert.equal(t.s.fight.turn, 'org:eyes');
  assert.equal(t.s.fight.actors['org:eyes'].pp, 6);
});

test('Stress eases by 1 after a Cycle with no ATP spent and no damage taken', () => {
  const t = seated();
  t.host({ type: 'set', target: { kind: 'org', id: 'wall' }, field: 'stress', value: 2 });
  t.host({ type: 'set', target: { kind: 'org', id: 'eyes' }, field: 'stress', value: 4 });
  t.host({ type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1 }], ownDice: { wall: 6, eyes: 6, 'Order I: Lytic Swarms': 1 } });
  bringToTurn(t, 'org:eyes');
  t.as('p2', { type: 'act', organismId: 'eyes', action: 'vent' }); // spends ATP: 4 -> 2, and no further easing
  t.host({ type: 'cycle.end' });
  assert.equal(t.s.organisms.wall.stress, 1);
  assert.equal(t.s.organisms.eyes.stress, 2);
});

test('a Dormant organism Leaks a Countdown box on each of its turns', () => {
  const t = seated();
  t.host({ type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1 }], ownDice: { wall: 6, eyes: 1, 'Order I: Lytic Swarms': 1 } });
  t.host({ type: 'damage', target: { kind: 'org', id: 'eyes' }, amount: 27, ignoreSoak: true });
  assert.equal(t.s.organisms.eyes.dormant, true);
  assert.throws(() => t.as('p2', { type: 'act', organismId: 'eyes', action: 'drift' }), /Dormant/);
  t.host({ type: 'cycle.end' });
  t.host({ type: 'cycle.end' });
  assert.ok(t.s.organisms.eyes.countdown >= 1);
});

test('Stress at 3 takes a die off every pool', () => {
  const t = seated();
  t.host({ type: 'set', target: { kind: 'org', id: 'wall' }, field: 'stress', value: 3 });
  t.host({ type: 'request.check', organismId: 'wall', baseline: 'VSC', pathway: 'Pressure Tolerance', at: 12 });
  assert.equal(t.s.requests[0].pool.dice, 5);
});
