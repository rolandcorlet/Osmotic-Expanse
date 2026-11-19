// Every Burst in the catalogue (CORE §6.4), cast at the table: it pays, rolls and lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSession, apply, bondedDomain, burstCost } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { BURSTS, EV } from '../engine/bursts.js';
import { scenario } from '../data/first-carve.js';

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));

function fightWith(burst, { level = 16, block = 'enzymatic-horror' } = {}) {
  const rng = makeRng(5);
  let s = newSession(scenario);
  const ctx = (role, pid) => ({ role, pid, rng, now: 0, scenario, bestiary });
  const host = (a) => { s = apply(s, a, ctx('host', null)); return s; };
  const as = (pid, a) => { s = apply(s, a, ctx('player', pid)); return s; };
  as('p1', { type: 'join', name: 'Roly' });
  as('p1', { type: 'zero.agree' });
  as('p1', { type: 'claim', organismId: 'wall', name: 'Bresk' });
  as('p2', { type: 'join', name: 'Sam' });
  as('p2', { type: 'zero.agree' });
  as('p2', { type: 'claim', organismId: 'eyes', name: 'Brost' });
  host({ type: 'fight.start', creatures: [{ blockId: block, count: 1, band: 'near' }] });
  const w = s.organisms.wall;
  w.level = level; w.bursts = [burst]; w.base.RTC = 5; w.base.VSC = Math.max(w.base.VSC, 3); for (const n of ['Catalysis', 'Protean Folding', 'Pressure Folding', 'Signal Discourse', 'Somatic Shaping']) w.pathways[n] = 3; w.atp = 99; w.atpMax = 99; w.substrate = 10; w.ppMax = 6;
  for (let i = 0; i < 20 && s.fight.turn !== 'org:wall'; i++) host({ type: 'turn.next' });
  s.fight.actors['org:wall'].pp = 6;
  return { host, as, get s() { return s; } };
}

// A strong roll with one 6, so it succeeds without Runaway Catalysis.
const strong = (n) => [6, ...Array(n - 1).fill(5)];
// Two 6s and no 1s: Runaway Catalysis.
const runaway = (n) => [6, 6, ...Array(n - 2).fill(5)];

for (const b of BURSTS) {
  test(`Burst: ${b.n} pays its printed cost, rolls and lands`, () => {
    const t = fightWith(b.n);
    const c = Object.values(t.s.creatures)[0];
    const before = { cmi: c.mi, atp: t.s.organisms.wall.atp, pp: t.s.fight.actors['org:wall'].pp };
    const cost = burstCost(t.s.organisms.wall, b);
    if (b.n === 'Resynthesis Call') { t.s.organisms.eyes.mi = 0; t.s.organisms.eyes.dormant = true; }
    if (b.n === 'Mend Function') t.s.organisms.eyes.conditions.push({ name: 'Brittle' });
    const ally = b.on === 'ally' ? 'eyes' : undefined;
    if (ally && b.apply.heal) t.s.organisms.eyes.mi = 5;
    t.as('p1', { type: 'act', organismId: 'wall', action: 'burst', burst: b.n, targetId: b.on === 'creature' || b.vs === 'MT' ? c.cid : undefined, allyId: ally });
    const q = t.s.requests.at(-1);
    assert.equal(q.kind, 'burst');
    assert.equal(t.s.fight.actors['org:wall'].pp, before.pp - b.pp, 'PP as printed');
    assert.equal(t.s.organisms.wall.atp, before.atp - cost.atp, 'ATP as printed');
    t.as('p1', { type: 'roll', requestId: q.id, dice: strong(q.pool.dice) });
    const r = t.s.rolls.at(-1);
    assert.equal(r.success, true, `${b.n} should succeed on a strong roll (pool ${q.pool.dice} vs ${q.at})`);
    const now = t.s.creatures[c.cid];
    const eyes = t.s.organisms.eyes;
    if (b.apply.dmg) assert.ok(now.mi < before.cmi, 'damage lands');
    for (const name of b.apply.cond || []) assert.ok(now.conditions.some((x) => x.name === name) || eyes.conditions.some((x) => x.name === name), `${name} is applied`);
    if (b.apply.heal) assert.ok(eyes.mi > 5, 'heals');
    if (b.apply.revive) assert.equal(eyes.dormant, false);
    if (b.apply.mend) assert.ok(!eyes.conditions.some((x) => x.name === 'Brittle'));
    if (b.apply.regen) assert.ok(eyes.regen && eyes.regen.left === 3);
    if (b.apply.rally) assert.ok(eyes.stress === 0);
    if (!b.apply.dmg && !b.apply.cond && !b.apply.heal && !b.apply.revive && !b.apply.mend && !b.apply.regen && !b.apply.rally && !b.apply.temp && !b.apply.soakZero) {
      assert.ok((r.notes || []).some((x) => x.includes(b.e.slice(0, 20)) || (b.note && x.includes(b.note.slice(0, 20)))), 'the Director is told what it does');
    }
  });
}

test('Bursts: damage is Effect Value + Overflow - soak, and Runaway doubles the Effect Value', () => {
  const t = fightWith('Enzyme Spit');
  const c = Object.values(t.s.creatures)[0];
  t.as('p1', { type: 'act', organismId: 'wall', action: 'burst', burst: 'Enzyme Spit', targetId: c.cid });
  let q = t.s.requests.at(-1);
  t.as('p1', { type: 'roll', requestId: q.id, dice: strong(q.pool.dice) });
  const r = t.s.rolls.at(-1);
  assert.equal(r.damage, EV[1] + r.overflow - c.soak);
  assert.equal(t.s.creatures[c.cid].soak, c.soak - 1); // -1 soak until repaired

  const t2 = fightWith('Signal Knife');
  const c2 = Object.values(t2.s.creatures)[0];
  t2.as('p1', { type: 'act', organismId: 'wall', action: 'burst', burst: 'Signal Knife', targetId: c2.cid });
  q = t2.s.requests.at(-1);
  t2.as('p1', { type: 'roll', requestId: q.id, dice: runaway(q.pool.dice) });
  const r2 = t2.s.rolls.at(-1);
  assert.equal(r2.runaway, true);
  assert.equal(r2.damage, EV[1] * 2 + r2.overflow - c2.soak);
  assert.ok(t2.s.creatures[c2.cid].conditions.some((x) => x.name === 'Marked'), 'the Rider comes with Runaway');
});

test('Bursts: a miss spends the cost and does nothing else', () => {
  const t = fightWith('Corrosive Catalyst');
  const c = Object.values(t.s.creatures)[0];
  t.as('p1', { type: 'act', organismId: 'wall', action: 'burst', burst: 'Corrosive Catalyst', targetId: c.cid });
  const q = t.s.requests.at(-1);
  t.as('p1', { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(1) });
  assert.equal(t.s.creatures[c.cid].mi, c.mi);
  assert.ok(!t.s.creatures[c.cid].conditions.some((x) => x.name === 'Brittle'));
});

test('Bursts: refused when unknown, above your Tier, Locked or short of ATP', () => {
  const t = fightWith('Enzyme Spit', { level: 1 });
  const c = Object.values(t.s.creatures)[0];
  assert.throws(() => t.as('p1', { type: 'act', organismId: 'wall', action: 'burst', burst: 'Lock Sequence', targetId: c.cid }), /does not know Lock Sequence/);
  t.s.organisms.wall.bursts = ['Total Dissolution'];
  assert.throws(() => t.as('p1', { type: 'act', organismId: 'wall', action: 'burst', burst: 'Total Dissolution', targetId: c.cid }), /Tier 4/);
  t.s.organisms.wall.bursts = ['Enzyme Spit'];
  t.s.organisms.wall.conditions.push({ name: 'Locked' });
  assert.throws(() => t.as('p1', { type: 'act', organismId: 'wall', action: 'burst', burst: 'Enzyme Spit', targetId: c.cid }), /Locked/);
  t.s.organisms.wall.conditions = [];
  t.s.organisms.wall.atp = 1;
  assert.throws(() => t.as('p1', { type: 'act', organismId: 'wall', action: 'burst', burst: 'Enzyme Spit', targetId: c.cid }), /costs \d+ ATP/);
});

test('Bursts: outside the Bonded Domain costs +2 ATP and 1 Stress', () => {
  const t = fightWith('Enzyme Spit');
  const w = t.s.organisms.wall;
  const dom = bondedDomain(w);
  const inDom = BURSTS.find((b) => b.d === dom && b.t === 1);
  const outDom = BURSTS.find((b) => b.d !== dom && b.t === 1);
  assert.equal(burstCost(w, inDom).atp, inDom.atp);
  assert.equal(burstCost(w, outDom).atp, outDom.atp + 2);
  assert.equal(burstCost(w, outDom).stress, 1);
});
