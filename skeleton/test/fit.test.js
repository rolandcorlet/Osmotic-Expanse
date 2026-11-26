// Fights fitted to the party at the table, for every Skeleton game (engine/scale.js, the D&D Director's fitting,
// 26 Nov): the adventure says who it is written for; a smaller party meets fewer creatures, then weaker ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { table, diver, mod } from './helpers.js';
import * as SCALE from '../engine/scale.js';
import { simulatePlace } from '../engine/simulate.js';

test('the party an adventure is written for is read from its words or its numbers', () => {
  assert.deepEqual(SCALE.designedParty({ party: '2 to 4 divers', level: 1 }), { size: [2, 4], level: 1 });
  assert.deepEqual(SCALE.designedParty({ party: 'four investigators of level 2' }), { size: [4, 4], level: 2 });
  assert.deepEqual(SCALE.designedParty({ party: { size: [3, 5], level: 2 } }), { size: [3, 5], level: 2 });
});

test('a party inside the written size and level is left alone', () => {
  const plan = SCALE.planFight({ groups: [{ key: 'a', id: 'glass-eel', count: 2 }], designed: { size: [2, 4], level: 1 }, levels: [1, 1], ix: mod.ix.creature });
  assert.equal(plan, null);
});

test('one diver alone at the causeway meets fewer eels, and the fitting is told to the host only', () => {
  const T = table(5);
  T.s.fitOff = false;
  const m = diver(T, 'p1', 0);
  T.host({ type: 'site.move', siteId: 'causeway' });
  const before = Object.values(T.s.creatures).filter((k) => k.siteId === 'causeway').length;
  T.host({ type: 'fight.start' });
  const after = Object.values(T.s.creatures).filter((k) => k.siteId === 'causeway').length;
  const fit = T.s.fits.causeway;
  assert.ok(fit && fit.text, 'fitted');
  assert.ok(after < before || fit.plan.health < 1 || fit.plan.blows < 1, `${before} -> ${after}: ${fit.text}`);
  assert.ok(T.s.story.some((e) => e.kind === 'host' && /Fitted to this party/.test(e.text)));
  void m;
});

test('a lone boss too strong for a small party hits for less as well', () => {
  const plan = SCALE.planFight({ groups: [{ key: 'b', id: 'tidewarden', count: 1 }], designed: { size: [4, 4], level: 2 }, levels: [1], ix: mod.ix.creature });
  assert.ok(plan && plan.health === 0.5 && plan.blows < 1, JSON.stringify(plan));
});

test('the simulation: one diver against the Bell Chamber wipes less once it is fitted', () => {
  const adv = mod.adventures[0];
  const on = simulatePlace({ mod, adventure: adv, siteId: 'bell', heroes: 1, runs: 40 });
  assert.ok(on.runs > 0);
  assert.ok(on.wiped / on.runs < 0.9, JSON.stringify(on));
});

test('ringing the bell (a Lore success in the Bell Chamber) stops the Tidewarden fighting', () => {
  const T = table(5);
  const m = diver(T, 'p1', 0);
  for (const id of ['causeway', 'nave', 'bell']) T.host({ type: 'site.move', siteId: id });
  T.host({ type: 'fight.start' });
  const w = Object.values(T.s.creatures).find((k) => k.base === 'tidewarden');
  for (let k = 0; k < 30 && !T.s.creatures[w.id].calm; k++) {
    T.host({ type: 'roll.ask', charIds: [m.id], stat: 'nerve', skill: 'lore', at: 8, reason: 'ring the bell' });
    T.as('p1', { type: 'roll.make', id: T.s.requests[0].id });
  }
  assert.ok(T.s.creatures[w.id].calm && T.s.creatures[w.id].down);
});
