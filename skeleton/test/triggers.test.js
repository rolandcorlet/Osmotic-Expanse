// An adventure's own rules (engine/triggers.js, run by engine/ledger.js): checked with the module, carried
// out by the Engine when their moment comes, once unless they say otherwise, and told to the Director.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRules, rulesAt } from '../engine/triggers.js';
import { briefing } from '../brain/director.js';
import { mod, table, diver } from './helpers.js';

const adv = mod.adventures[0];

test('the sample adventure\'s rules check clean; a broken one is named', () => {
  assert.deepEqual(checkRules(mod, adv), []);
  const bad = { ...adv, sites: [{ id: 'x', rules: [{ when: 'fail juggling', do: 'tick', clock: 'nope' }, { when: 'teleport', do: 'dance' }] }], rules: [] };
  const e = checkRules(mod, bad).join('\n');
  assert.match(e, /"juggling" is not a stat or skill/);
  assert.match(e, /no clock "nope"/);
  assert.match(e, /"teleport" is not a moment/);
  assert.match(e, /"do: dance"/);
});

test('a failed Sneak in the nave wakes the choir: the Engine starts the fight by itself', () => {
  const T = table(5);
  const a = diver(T, 'p1', 0);
  T.host({ type: 'site.move', siteId: 'causeway' });
  T.host({ type: 'site.move', siteId: 'nave' });
  for (let k = 0; k < 30 && !T.s.fight; k++) {
    T.host({ type: 'roll.ask', charIds: [a.id], stat: 'grace', skill: 'sneak', at: 40, reason: 'creep past the pews' });
    const q = T.s.requests[0];
    T.as('p1', { type: 'roll.make', id: q.id });
  }
  assert.ok(T.s.fight, 'the fight started');
  assert.ok(T.s.story.some((e) => /drowned choir lifts its heads/.test(e.text)));
  assert.ok(T.s.fired['nave/choir-wakes']);
});

test('a round of fighting in the nave ticks the tide once; the Director is told the rules waiting here', () => {
  const T = table(6);
  diver(T, 'p1', 0);
  T.host({ type: 'site.move', siteId: 'causeway' });
  T.host({ type: 'site.move', siteId: 'nave' });
  assert.match(briefing(T.s, mod, {}), /Rules here .*the drowned choir|Rules here .*fails: a fight starts/);
  T.host({ type: 'fight.start' });
  for (let k = 0; k < 12 && T.s.fight && T.s.fight.round < 3; k++) T.host({ type: 'fight.next' });
  assert.equal(T.s.clocks.find((c) => c.id === 'tide').filled, 1);
  assert.equal(rulesAt(adv, 'nave').find((r) => r.id === 'loud-fight').once, true);
});

test('a creature or character named as the briefing writes them ("k3 Glass eel", "c1 (Moll Tarrow)") is found', async () => {
  const { target } = await import('../engine/ledger.js');
  const T = table(2);
  const a = diver(T, 'p1', 0);
  T.host({ type: 'site.move', siteId: 'causeway' });
  const k = Object.values(T.s.creatures)[0];
  assert.equal(target(T.s, `${k.id} ${k.name}`).id, k.id);
  assert.equal(target(T.s, `${a.id} (${a.name})`).id, a.id);
  assert.equal(target(T.s, `${a.id} ${a.name}`).id, a.id);
});
