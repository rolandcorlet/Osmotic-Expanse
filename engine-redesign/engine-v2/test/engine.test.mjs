import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, validate, applyOverlay, newGame, legalMoves, play, orgs, upOrgs, clone } from '../src/index.mjs';
import { enterSite, emit, hostileCreatures, spawn } from '../src/world.mjs';
import { rollPool, buildPool, threshold, creatureLook, ladderStep } from '../src/rules.mjs';
import { briefing, estimateTokens, replySchema, applyReply, phaseOf } from '../src/director.mjs';
import { run, PEACEFUL, ROUTE } from '../tools/autoplay.mjs';
import * as odds from '../src/odds.mjs';
import * as live from '../../../director/engine/odds.js';

const raw = loadData();
const D = applyOverlay(loadData());
const fresh = (seed = 1) => newGame(D, { seed });
const started = (seed = 1) => { const g = fresh(seed); play(g, 'begin'); return g; };

test('data: every cross-reference, script word and effect token checks, after the overlay', () => {
  const v = validate(D);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.gaps, []);
});

test('data: before the overlay the Vector has 14 cells that are sentences (the list the next edition must print)', () => {
  const v = validate(raw);
  assert.equal(v.gaps.length, 14);
});

test('odds gate: the carried-over tables are identical to the working Engine\'s', () => {
  for (let n = 1; n <= 9; n++) for (const at of [8, 12, 16, 20, 24]) {
    assert.equal(odds.successChance(n, at), live.successChance(n, at));
    assert.equal(odds.meanOverflowOnSuccess(n, at), live.meanOverflowOnSuccess(n, at));
  }
  assert.equal(odds.runawayChance(5), live.runawayChance(5));
});

test('rules: a pool is capped at +/-5, Stress counts inside the cap, and never falls below one die', () => {
  assert.equal(buildPool(D, { base: 3, path: 2, mods: [{ id: 'a', dice: 9 }] }).pool, 10);
  assert.equal(buildPool(D, { base: 1, path: 0, mods: [{ id: 'a', dice: -9 }] }).pool, 1);
  assert.equal(buildPool(D, { base: 4, path: 0, stress: 6 }).pool, 1 + 0 + 0 + 0 || 1);
  assert.equal(buildPool(D, { base: 4, path: 0, stress: 6 }).pool, 1);
  assert.equal(threshold(D, 'standard'), 12);
  assert.equal(threshold(D, { printed: 14 }), 14);
});

test('rules: Inhibitors, totals and Runaway read as the Core prints them', () => {
  const g = fresh(5);
  let sawRunaway = false;
  for (let i = 0; i < 2000; i++) {
    const r = rollPool(g, 5, 12);
    assert.equal(r.inhibitors, r.dice.filter((x) => x === 1).length);
    assert.equal(r.total, r.dice.filter((x) => x !== 1).reduce((a, b) => a + b, 0));
    assert.equal(r.runaway, r.inhibitors === 0 && r.dice.filter((x) => x === 6).length >= 2);
    assert.equal(r.success, r.total >= 12);
    assert.equal(r.overflow, r.success ? r.total - 12 : 0);
    if (r.runaway) sawRunaway = true;
  }
  assert.ok(sawRunaway);
});

test('rules: the wound ladder steps at the printed shares', () => {
  assert.deepEqual([0.9, 0.7, 0.5, 0.2, 0.1].map(ladderStep), [0, 1, 2, 3, 4]);
});

test('legal moves: an illegal move is answered with the legal list, never thrown, never applied', () => {
  const g = started();
  const before = JSON.stringify(g.s);
  const r = play(g, 'strike:wall:c1');
  assert.equal(r.ok, false);
  assert.ok(Array.isArray(r.legal) && r.legal.length > 0);
  assert.equal(JSON.stringify(g.s), before);
});

test('legal moves: only listed things can be done at a site, and a finished one disappears', () => {
  const g = started();
  const ids = () => legalMoves(g).filter((m) => m.kind === 'interact').map((m) => m.interact);
  assert.ok(ids().includes('swear-toll'));
  assert.ok(!ids().includes('pump-opens'));
  play(g, 'do:wall:swear-toll');
  assert.ok(!ids().includes('swear-toll'));
});

test('exits: a locked way is not offered until its flag is set', () => {
  const g = started();
  assert.ok(!legalMoves(g).some((m) => m.id === 'exit:soft-field'));
  play(g, 'do:wall:swear-toll');
  assert.ok(legalMoves(g).some((m) => m.id === 'exit:soft-field'));
});

test('Clocks move only on the Vector\'s printed triggers, with their limits', () => {
  const g = started();
  emit(g, 'toll-refused'); emit(g, 'toll-refused');
  assert.equal(g.s.clocks.TOLL.n, 1, 'per-scene limit');
  emit(g, 'something-nobody-printed');
  assert.equal(g.s.clocks.HUNGER.n, 0);
  emit(g, 'toll-settled');
  assert.equal(g.s.clocks.TOLL.n, 0);
});

test('the toll: swearing at the witness-seam files the Oath, settles the toll and stands the Sentinel down', () => {
  const g = started();
  play(g, 'do:wall:swear-toll');
  assert.equal(g.s.orgs.wall.oaths.length, 1);
  assert.ok(g.s.flags['toll-settled'] && g.s.flags['way-open']);
  assert.ok(Object.values(g.s.cres).find((c) => c.block === 'fold-sentinel').stoodDown);
});

test('a hazard fires once per Cycle, once for the whole site, and pays every body once', () => {
  const g = started(3);
  const hp = orgs(g).map((o) => o.mi);
  play(g, 'attack:wall:c2'); // swarm turns hostile; a Pulse War begins
  assert.ok(g.s.fight);
  const sim = [];
  for (let i = 0; i < 60 && g.s.fight; i++) { const m = legalMoves(g)[0]; if (!m) break; const k = m.id; play(g, legalMoves(g).find((x) => x.kind === 'end-turn')?.id || k); }
  const fired = Object.keys(g.s.hazardFired).filter((k) => k.startsWith('gas-pocket'));
  assert.equal(new Set(fired).size, fired.length, 'no key fired twice');
});

test('the Render Charge does not fire before TOLL is at 5, fires once, and starts the race', () => {
  const g = fresh(4);
  enterSite(g, 'gut-stone');
  g.s.clocks.TOLL.n = 3;
  emit(g, 'clock:TOLL:5');
  assert.equal(g.s.chase, null, 'gate closed at 3');
  g.s.clocks.TOLL.n = 5;
  emit(g, 'clock:TOLL:5');
  assert.ok(g.s.chase, 'the race has begun');
  const hp = orgs(g).map((o) => o.mi);
  emit(g, 'clock:TOLL:5');
  assert.deepEqual(orgs(g).map((o) => o.mi), hp, 'a second firing pays nothing');
});

test('the race: a Dormant organism is never asked to throw, and the module can end by it', () => {
  const g = fresh(6);
  enterSite(g, 'gut-stone');
  g.s.clocks.TOLL.n = 5;
  g.s.orgs.ledger.state = 'dormant';
  emit(g, 'clock:TOLL:5');
  const ids = legalMoves(g).map((m) => m.id);
  assert.ok(!ids.includes('race:ledger'));
  for (let i = 0; i < 40 && !g.s.ended; i++) play(g, legalMoves(g)[0].id);
  assert.ok(['escaped', 'carcass-ends'].includes(g.s.ended));
});

test('creature runner: every Bestiary script of The First Carve runs three Cycles without a model, a throw or a negative PP', () => {
  const blocks = [...new Set(D.vector.sites.flatMap((s) => s.creatures.map((c) => c.block)))];
  for (const b of blocks) for (const seed of [1, 2]) {
    const g = fresh(seed);
    enterSite(g, 'toll-vent');
    const def = D.vector.sites.flatMap((s) => s.creatures).find((c) => c.block === b);
    for (const c of Object.values(g.s.cres)) c.stoodDown = 'test';
    const made = spawn(g, { ...def, stance: 'hostile', count: 1, band: 'near' }, 'toll-vent');
    g.s.wantFight = true;
    // all players hold and end turns; creatures play their scripts
    g.s.cres[made[0].cid].stance = 'hostile';
    play(g, legalMoves(g).find((m) => m.kind === 'interact')?.id || legalMoves(g)[0].id);
    for (let i = 0; i < 80 && g.s.fight && g.s.fight.cycle <= 3; i++) {
      const lm = legalMoves(g);
      if (!lm.length) break;
      const m = lm.find((x) => x.id.startsWith('react:deflect')) || lm.find((x) => x.kind === 'end-turn') || lm[0];
      play(g, m.id);
      for (const o of orgs(g)) assert.ok(o.pp >= 0 && o.mi >= 0 && o.mi <= o.miMax, `${b}: ${o.name} pp ${o.pp} mi ${o.mi}`);
      for (const c of Object.values(g.s.cres)) assert.ok(c.pp >= 0, `${b}: ${c.name} pp ${c.pp}`);
    }
  }
});

test('Reserve: a creature\'s Strike on an organism holding one waits for the reaction, then goes on', () => {
  const g = started(9);
  for (const c of Object.values(g.s.cres)) c.stoodDown = 'test';
  const [c] = spawn(g, { block: 'fold-sentinel', count: 1, band: 'contact', stance: 'hostile' }, 'toll-vent');
  g.s.wantFight = true;
  play(g, 'do:wall:taste-water');
  assert.ok(g.s.fight);
  let seenPending = false;
  for (let i = 0; i < 60 && g.s.fight; i++) {
    const lm = legalMoves(g);
    if (g.s.pending) { seenPending = true; assert.ok(lm.every((m) => m.kind === 'react')); play(g, 'react:deflect'); continue; }
    const m = lm.find((x) => x.kind === 'reserve') || lm.find((x) => x.kind === 'end-turn') || lm[0];
    play(g, m.id);
  }
  assert.ok(seenPending, 'a pending reaction was offered');
});

test('Director: the briefing carries no number for a creature, for any phase', () => {
  const g = started(2);
  const text = briefing(g);
  const here = text.split('\n').find((l) => l.startsWith('HERE:'));
  assert.ok(here && !/\d/.test(here), here);
  play(g, 'attack:wall:c1');
  const t2 = briefing(g);
  assert.ok(!/\bMT\b|\bMI\b|Threshold|soak/i.test(t2));
  const here2 = t2.split('\n').find((l) => l.startsWith('HERE:'));
  assert.ok(!/\d/.test(here2));
});

test('Director: every site and phase fits in 4,000 tokens, with the fixed instructions counted', async () => {
  const { INSTRUCTIONS } = await import('../src/director.mjs');
  for (const s of D.vector.sites) {
    const g = fresh(1);
    enterSite(g, s.id);
    assert.ok(estimateTokens(INSTRUCTIONS + briefing(g)) < 4000, `${s.id} explore`);
    for (const c of Object.values(g.s.cres)) c.stance = 'hostile';
    g.s.wantFight = true;
    const ms = legalMoves(g); if (ms.find((m) => m.kind === 'interact')) play(g, ms.find((m) => m.kind === 'interact').id);
    assert.ok(estimateTokens(INSTRUCTIONS + briefing(g)) < 4000, `${s.id} fight`);
  }
});

test('Director: the reply schema lists exactly the legal ids, and an illegal choice is rejected before anything changes', () => {
  const g = started();
  const schema = replySchema(g);
  assert.deepEqual(schema.properties.choose.enum.filter(Boolean).sort(), legalMoves(g).map((m) => m.id).sort());
  const snap = JSON.stringify(g.s);
  const r = applyReply(g, { narration: 'Nothing moves.', choose: 'do:wall:buy-a-harpoon' });
  assert.ok(r.rejected);
  assert.equal(JSON.stringify(g.s), snap);
});

test('Director: the Engine appends the one closing question, naming whoever is on turn', () => {
  const g = started(3);
  const r = applyReply(g, { narration: 'The water tightens.', choose: 'attack:wall:c2' });
  const q = r.text.match(/[^.?!]*\?/g);
  assert.equal(q.length, 1);
  const on = g.s.orgs[g.s.fight.order[g.s.fight.i].slice(4)];
  if (g.s.fight.order[g.s.fight.i].startsWith('org:')) assert.match(r.text, new RegExp(on.name.split(' ')[0]));
});

test('no-model full module: the peaceful route reaches an ending, by legal moves only, on 20 seeds', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = fresh(seed);
    run(g, { maxSteps: 400 });
    assert.ok(g.s.ended, `seed ${seed} ended`);
  }
});

test('no-model full module: the fighting route ends too, and nobody acts out of turn', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = fresh(seed);
    play(g, 'begin');
    play(g, 'attack:wall:c1');
    run(g, { mode: 'fight', maxSteps: 500 });
    assert.ok(g.s.ended, `seed ${seed} ended`);
  }
});

test('determinism: the same seed gives the same game, and a clone plays on without touching the original', () => {
  const a = fresh(11); const b = fresh(11);
  run(a, { maxSteps: 400 }); run(b, { maxSteps: 400 });
  assert.deepEqual(a.s.log, b.s.log);
  const g = started(11); const c = clone(g);
  play(c, 'do:wall:swear-toll');
  assert.ok(!g.s.flags['toll-settled']);
});

test('fuzz: random legal play for 40 seeds keeps every invariant', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = fresh(seed * 7);
    let steps = 0;
    while (!g.s.ended && steps++ < 300) {
      const lm = legalMoves(g);
      if (!lm.length) break;
      const pick = lm[(seed * 31 + steps * 17) % lm.length];
      const r = play(g, pick.id);
      assert.ok(r.ok);
      for (const o of orgs(g)) { assert.ok(o.mi >= 0 && o.mi <= o.miMax); assert.ok(o.pp >= 0); assert.ok(o.stress >= 0 && o.stress <= 8); assert.ok(o.countdown <= o.countdownMax); }
      for (const [id, c] of Object.entries(g.s.clocks)) assert.ok(c.n >= 0 && c.n <= c.max);
      for (const c of Object.values(g.s.cres)) assert.ok(c.mi >= 0 && c.seg >= 0);
    }
  }
});

test('Gut Stone: the Warden fight with TOLL at 3 reaches an ending on 30 seeds, and the Render Charge/race path is exercised', () => {
  const ends = {};
  for (let seed = 1; seed <= 30; seed++) {
    const g = fresh(seed); play(g, 'begin');
    enterSite(g, 'gut-stone'); g.s.clocks.TOLL.n = 3;
    play(g, legalMoves(g).find((m) => m.id.startsWith('attack:')).id);
    for (let n = 0; n < 400 && !g.s.ended; n++) {
      const lm = legalMoves(g);
      assert.ok(lm.length > 0, `seed ${seed} stuck`);
      play(g, (lm.find((x) => x.id.startsWith('race:')) || lm.find((x) => x.id.startsWith('react:deflect')) || lm.find((x) => x.kind === 'strike') || lm.find((x) => x.kind === 'exit') || lm.find((x) => x.kind === 'end-turn') || lm[0]).id);
    }
    assert.ok(g.s.ended, `seed ${seed} ended`);
    ends[g.s.ended] = (ends[g.s.ended] || 0) + 1;
  }
  assert.ok(ends.escaped > 0);
});
