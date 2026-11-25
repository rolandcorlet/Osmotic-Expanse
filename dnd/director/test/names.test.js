import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../engine/names.js';
import { toolbox } from '../brain/tools.js';
import { makeRng } from '../engine/dice.js';
import { table, hero, srd, adventure } from './helpers.js';

const people = [{ id: 'f1', name: 'Grisk' }, { id: 'f2', name: 'Goblin scout 1' }, { id: 'f3', name: 'Goblin scout 2' }, { id: 'c1', name: 'Bryn Ashford' }, { id: 'c2', name: 'Hilde' }];
const nm = (x) => [x.id, x.name];
test('names: near misses find the one meant; anything unclear finds nobody', () => {
  assert.equal(N.pick(people, 'Grisk the bugbear', nm).id, 'f1');
  assert.equal(N.pick(people, 'the Grisk', nm).id, 'f1');
  assert.equal(N.pick(people, 'goblin scout1', nm).id, 'f2');
  assert.equal(N.pick(people, 'Goblin Scout 2', nm).id, 'f3');
  assert.equal(N.pick(people, 'goblin', nm), null); // two goblins: say which
  assert.equal(N.pick(people, 'Bryn', nm).id, 'c1');
  assert.equal(N.pick(people, 'Hilda', nm).id, 'c2');
  assert.equal(N.pick(people, 'Marta Hale', nm), null);
  assert.equal(N.pick(people, '', nm), null);
});

test('conditions and skills in everyday words', () => {
  const C = srd.conditions.map((x) => x.id);
  assert.equal(N.condition('Knocked prone', C), 'prone');
  assert.equal(N.condition('paralysed', C), 'paralyzed');
  assert.equal(N.condition('Frightened', C), 'frightened');
  assert.equal(N.condition('scared', C), 'frightened');
  assert.equal(N.condition('nothing', C), null);
  assert.equal(N.condition('disadvantaged aim? no', C), null);
  assert.equal(N.skill('Perception', srd.skills), 'perception');
  assert.equal(N.skill('perceive', srd.skills), 'perception');
  assert.equal(N.skill('animal handling', srd.skills), 'animal-handling');
  assert.equal(N.skill('Sleight of Hand', srd.skills), 'sleight-of-hand');
  assert.equal(N.skill('lockpicking', srd.skills), null);
});

test('the AI Director: nothing to change is a note, never a refusal; a rule broken is still refused', () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  const tb = toolbox({ state: T.s, adventure, srd, rng: makeRng(1), now: 1 });
  const r1 = tb.run('end_combat', {});
  assert.ok(!r1.refused, JSON.stringify(r1));
  assert.match(r1.note || '', /Nothing changed/);
  const r2 = tb.run('add_condition', { target: 'bryn', condition: 'knocked prone' });
  assert.ok(!r2.refused && !r2.note, JSON.stringify(r2));
  assert.ok(Object.values(tb.state.pcs)[0].conds.includes('prone'));
  const r3 = tb.run('ask_for_roll', { characters: ['Bryn'], kind: 'check', skill: 'perceive', dc: 12, reason: 'Look around' });
  assert.ok(r3.asked, JSON.stringify(r3));
  assert.equal(tb.state.requests.at(-1).skill, 'perception');
  const r4 = tb.run('move_party', { place: 'the moon' });
  assert.ok(r4.refused, 'a place that is not there is still refused, with the choices');
  assert.match(r4.refused, /Places:/);
  assert.equal(tb.refusals, 1);
});
