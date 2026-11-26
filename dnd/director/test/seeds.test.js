// Story seeds in play (engine/seeds.js, engine/ledger.js): the Engine brings a seed in at its moment (a camp
// somewhere unsafe, a party getting nowhere, trouble picked with someone who is not a foe) and rolls its
// chance; the Director may bring one in on its own judgement; both are logged, and the players never see it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as SEEDS from '../engine/seeds.js';
import { viewFor } from '../engine/ledger.js';
import { briefing, beforeTurn } from '../brain/director.js';
import { toolbox } from '../brain/tools.js';
import { srd, adventure, table, hero } from './helpers.js';

const CAMP = '# Seed: Wolves in the night\nWhere: any\nWhen: camp in the wild\nChance: 100%\nHook: Howling.\nEncounter: wolf x6';
const LOST = '# Seed: The pedlar\nWhen: lost after 3 turns\nHook: A pedlar with a cart knows the road.\nEncounter: none';
const GUARDS = '# Seed: The miller\'s sons\nWhen: the party picks a fight with the miller\nHook: Two big lads come out of the barn.\nEncounter: thug x2';

function party(seed = 5) {
  const T = table(seed);
  hero(T, 'p1', 'Bryn');
  hero(T, 'p2', 'Ila', 'cleric');
  T.s.started = true;
  return T;
}
const seed = (T, text) => { T.host({ type: 'seed.save', text }); return T.s.seeds[T.s.seeds.length - 1]; };

test('a seed\'s When, Chance, Limit and Encounter lines are read', () => {
  const c = SEEDS.seedPlan('# Seed: X\nWhen: camp in the wild\nChance: 25%\nEncounter: wolf x2, dire-wolf (Vundrel)');
  assert.equal(c.kind, 'camp'); assert.equal(c.chance, 25); assert.equal(c.limit, 'daily');
  assert.deepEqual(c.monsters, [{ id: 'wolf', count: 2, name: '' }, { id: 'dire-wolf', count: 1, name: 'Vundrel' }]);
  const l = SEEDS.seedPlan(LOST);
  assert.equal(l.kind, 'lost'); assert.equal(l.turns, 3); assert.equal(l.limit, 'once'); assert.deepEqual(l.monsters, []);
  const p = SEEDS.seedPlan(GUARDS);
  assert.equal(p.kind, 'provoke'); assert.equal(p.who, 'miller');
  assert.equal(SEEDS.seedPlan('# Seed: Y\nHook: z').kind, 'any');
  assert.ok(SEEDS.seedPlan('# Seed: W\nWhen: camp\nEncounter: any').choose);
});

test('an inn is a safe place to rest; a road with foes on it is not', () => {
  assert.equal(SEEDS.safePlace(adventure.sites.find((x) => x.id === 'thornwick')), true);
  assert.equal(SEEDS.safePlace(adventure.sites.find((x) => x.id === 'mill-road')), false);
});

test('a camp seed attacks the camp, sized to the party, and the party finishes its rest after the fight', () => {
  const T = party();
  seed(T, CAMP);
  T.host({ type: 'site.move', siteId: 'mill-road' });
  const pc = Object.values(T.s.pcs)[0];
  T.s.pcs[pc.id].hp = 3;
  T.host({ type: 'rest.long' });
  assert.ok(T.s.fight, 'the camp is attacked');
  const wolves = Object.values(T.s.foes).filter((f) => f.mid === 'wolf');
  assert.ok(wolves.length >= 1 && wolves.length < 6, `sized down from six: ${wolves.length}`);
  assert.equal(T.s.pcs[pc.id].hp, 3, 'not rested yet');
  assert.equal(T.s.seedLog.at(-1).by, 'engine');
  assert.ok(T.s.restAfter);
  T.host({ type: 'fight.end' });
  assert.equal(T.s.pcs[pc.id].hp, T.s.pcs[pc.id].maxHp, 'the rest finished after the fight');
  assert.ok(!T.s.restAfter);
  assert.match(T.s.story.at(-1).text, /finishes its rest/);
});

test('no camp seed at an inn, and a missed chance is logged without an encounter', () => {
  const T = party();
  seed(T, CAMP);
  T.host({ type: 'rest.long' }); // at the Ford Inn
  assert.ok(!T.s.fight); assert.ok(!(T.s.seedLog || []).length);
  const U = party(9);
  seed(U, CAMP.replace('100%', '1%'));
  U.host({ type: 'site.move', siteId: 'mill-road' });
  U.host({ type: 'rest.long' });
  assert.ok(!U.s.fight);
  const row = U.s.seedLog.at(-1);
  assert.equal(row.fired, false); assert.ok(row.roll > 1);
});

test('a camp seed comes once a day at most', () => {
  const T = party();
  seed(T, CAMP);
  T.host({ type: 'site.move', siteId: 'mill-road' });
  T.host({ type: 'rest.long' });
  T.host({ type: 'fight.end' });
  const n = T.s.seedLog.length;
  T.s.time.day = T.s.seedLog.at(-1).day; // the same day again
  T.host({ type: 'rest.long' });
  assert.equal(T.s.seedLog.length, n);
});

test('a lost seed comes in after its turns of nothing moving on, once', () => {
  const T = party();
  seed(T, LOST);
  for (let k = 0; k < 3; k++) T.host({ type: 'seed.check' });
  assert.ok(!T.s.seedNow, 'the first check only notes where things stand');
  T.host({ type: 'seed.check' });
  assert.equal(T.s.seedNow.title, 'The pedlar');
  assert.equal(T.s.seedLog.at(-1).by, 'engine');
  for (let k = 0; k < 8; k++) T.host({ type: 'seed.check' });
  assert.equal(T.s.seedLog.filter((r) => r.fired).length, 1, 'once');
});

test('moving on resets the count', () => {
  const T = party();
  seed(T, LOST);
  for (let k = 0; k < 3; k++) T.host({ type: 'seed.check' });
  T.host({ type: 'site.move', siteId: 'mill-road' });
  T.host({ type: 'seed.check' });
  assert.ok(!T.s.seedNow);
  assert.equal(T.s.drift, 0);
});

test('picking a fight with the named person brings the defenders out; someone else does not', () => {
  const T = party();
  seed(T, GUARDS);
  T.host({ type: 'seed.check', event: 'provoke', text: 'I punch the innkeeper' });
  assert.ok(!T.s.seedNow);
  T.host({ type: 'seed.check', event: 'provoke', text: 'I shove the miller into the river' });
  assert.equal(T.s.seedNow.title, 'The miller\'s sons');
  assert.ok(Object.values(T.s.foes).some((f) => f.mid === 'thug' && !f.hidden));
});

test('the Director may bring a seed in on its judgement, and it is logged as its choice', () => {
  const T = party();
  const s = seed(T, LOST);
  T.ai({ type: 'seed.fire', seed: s.id, why: 'they keep circling the ford' });
  const row = T.s.seedLog.at(-1);
  assert.equal(row.by, 'director'); assert.match(row.why, /circling/);
  assert.throws(() => T.ai({ type: 'seed.fire', seed: s.id, why: 'again' }), /cannot happen/);
});

test('the players never see the seeds or what they did', () => {
  const T = party();
  const s = seed(T, LOST);
  T.ai({ type: 'seed.fire', seed: s.id, why: 'x' });
  const v = viewFor(T.s, 'player', 'p1');
  assert.equal(v.seeds, undefined); assert.equal(v.seedLog, undefined); assert.equal(v.seedNow, undefined);
});

test('sizing keeps a seed\'s meeting minor', () => {
  const { groups, hp } = SEEDS.sizeFoes([{ id: 'ogre', count: 3, name: '' }], [1, 1], srd, 'easy');
  assert.equal(groups[0].count, 1);
  assert.ok(hp < 1 && hp >= 0.5);
  assert.ok(SEEDS.wildFoes({ name: 'Dark wood' }, [1, 1], srd, () => 0).length);
});

test('the Director is told a seed has come in, and its free seeds with when they come', () => {
  const T = party();
  seed(T, GUARDS);
  const s = seed(T, LOST);
  let b = briefing(T.s, adventure, srd, { lastSeq: 0 });
  assert.match(b, /THE DM'S OWN STORY SEEDS/);
  assert.match(b, /when the party picks a fight with miller/);
  T.ai({ type: 'seed.fire', seed: s.id, why: 'stuck' });
  b = briefing(T.s, adventure, srd, { lastSeq: 0 });
  assert.match(b, /A STORY SEED COMES INTO PLAY NOW/);
  assert.match(b, /A pedlar with a cart/);
});

test('before the Director\'s turn the Engine checks whether the party is getting anywhere', () => {
  const T = party();
  seed(T, LOST);
  let st = T.s;
  for (let k = 0; k < 5; k++) {
    const box = toolbox({ state: st, adventure, srd, rng: () => 0.5, now: 1 });
    beforeTurn(box, st);
    st = box.state;
  }
  assert.equal(st.seedNow && st.seedNow.title, 'The pedlar');
});

test('a camp seed the Director brings in by hand still attacks the camp, and the rest finishes after', () => {
  const T = party();
  const s = seed(T, CAMP);
  T.host({ type: 'site.move', siteId: 'mill-road' });
  const pc = Object.values(T.s.pcs)[0];
  T.s.pcs[pc.id].hp = 2;
  T.ai({ type: 'seed.fire', seed: s.id, why: 'they camp by the road' });
  assert.ok(T.s.fight && T.s.restAfter);
  assert.ok(T.s.fight.order.every((o) => !o.key.startsWith('foe:') || T.s.foes[o.key.slice(4)].mid === 'wolf'), 'only the wolves, not the goblins hiding here');
  T.host({ type: 'fight.end' });
  assert.equal(T.s.pcs[pc.id].hp, T.s.pcs[pc.id].maxHp);
});
