// Story seeds and the travel nudge in the Skeleton (the D&D Director's, 26 Nov, for every game): the Engine
// brings a seed in at its moment and rolls its chance, the Director may bring one in on its judgement, a camp
// attacked finishes its rest after the fight, and a journey told in words is sent back for move_party.
import test from 'node:test';
import assert from 'node:assert/strict';
import { table, diver, mod } from './helpers.js';
import { viewFor } from '../engine/ledger.js';
import * as SEEDS from '../engine/seeds.js';
import * as SCALE from '../engine/scale.js';
import { briefing, directorTurn, travelledInWords } from '../brain/director.js';

const CAMP = '# Seed: Eels in the dark\nWhen: camp in the wild\nChance: 100%\nHook: Something slides out of the black water.\nEncounter: glass-eel x6';
const LOST = '# Seed: The ferryman\nWhen: lost after 3 turns\nHook: An old ferryman poles out of the mist and offers a ride.\nEncounter: none';
const GUARDS = '# Seed: Pell\'s lads\nWhere: dock\nWhen: the party picks a fight with Auntie Pell\nHook: Two dock hands step out with hooks.\nEncounter: glass-eel x2';

function party(seed = 5) {
  const T = table(seed);
  diver(T, 'p1', 0); diver(T, 'p2', 1);
  T.host({ type: 'narrate', text: 'The lamps gutter. Moll, what do you do?' });
  return T;
}
const add = (T, text) => { T.host({ type: 'seed.save', text }); return T.s.seeds.at(-1); };
function scripted(script) {
  return { start() {
    let i = 0;
    const next = () => { const r = script[Math.min(i++, script.length - 1)]; return Promise.resolve({ text: r.text || '', calls: (r.calls || []).map((c, n) => ({ id: `c${i}-${n}`, ...c })), usage: { in: 0, out: 0 } }); };
    return { send: next, results: next };
  } };
}

test('a seed\'s lines are read, and creature weights size a meeting to the party', () => {
  const p = SEEDS.seedPlan(CAMP);
  assert.equal(p.kind, 'camp'); assert.equal(p.limit, 'daily'); assert.deepEqual(p.creatures, [{ id: 'glass-eel', count: 6 }]);
  assert.equal(SEEDS.seedPlan(LOST).turns, 3);
  assert.equal(SEEDS.seedPlan(GUARDS).who, 'Auntie Pell');
  const { groups } = SCALE.sizeGroups([{ id: 'glass-eel', count: 6 }], [1, 1], mod.ix.creature, 'easy');
  assert.ok(groups[0].count >= 1 && groups[0].count < 6);
});

test('a camp seed attacks the camp at an unsafe place, and the rest finishes after the fight', () => {
  const T = party();
  add(T, CAMP);
  T.host({ type: 'site.move', siteId: 'causeway' });
  const c = Object.values(T.s.chars)[0];
  T.s.chars[c.id].health = 1;
  T.host({ type: 'rest', kind: 'long' });
  assert.ok(T.s.fight, 'the camp is attacked');
  assert.ok(T.s.fight.order.every((o) => !o.key.startsWith('creature:') || T.s.creatures[o.key.slice(9)].base === 'glass-eel'));
  assert.equal(T.s.chars[c.id].health, 1, 'not rested yet');
  T.host({ type: 'fight.end' });
  assert.equal(T.s.chars[c.id].health, T.s.chars[c.id].healthMax, 'rested after the fight');
});

test('a lost seed comes in after its turns of nothing moving on; the Director may choose one, logged as its choice', () => {
  const T = party();
  add(T, LOST);
  for (let k = 0; k < 4; k++) T.host({ type: 'seed.check' });
  assert.equal(T.s.seedNow.title, 'The ferryman');
  assert.equal(T.s.seedLog.at(-1).by, 'engine');
  const U = party();
  const g = add(U, GUARDS);
  U.ai({ type: 'seed.fire', seed: g.id, why: 'Moll threatens Auntie Pell' });
  assert.equal(U.s.seedLog.at(-1).by, 'director');
  assert.ok(Object.values(U.s.creatures).some((k) => k.base === 'glass-eel' && !k.hidden));
});

test('the players never see the seeds, their log or the host lines', () => {
  const T = party();
  const s = add(T, LOST);
  T.ai({ type: 'seed.fire', seed: s.id, why: 'x' });
  const v = viewFor(T.s, 'player');
  assert.equal(v.seeds, undefined); assert.equal(v.seedLog, undefined);
  assert.ok(!v.story.some((e) => /Story seed/.test(e.text)));
});

test('the briefing lists the free seeds with when they come, and says when one comes into play', () => {
  const T = party();
  add(T, GUARDS);
  const s = add(T, LOST);
  let b = briefing(T.s, mod, {});
  assert.match(b, /STORY SEEDS/); assert.match(b, /picks a fight with Auntie Pell/);
  T.ai({ type: 'seed.fire', seed: s.id, why: 'stuck' });
  b = briefing(T.s, mod, { lastSeq: 0 });
  assert.match(b, /A STORY SEED COMES INTO PLAY NOW/);
});

test('a journey told in words is sent back for move_party; a name in talk is not travel', async () => {
  const T = party();
  assert.equal(travelledInWords('Auntie Pell says the Sunken Causeway floods at dusk. Moll, what do you do?', T.s, mod), null);
  assert.equal(travelledInWords('You set off along the dock and soon reach the Sunken Causeway, water to your knees. Moll?', T.s, mod).id, 'causeway');
  const provider = scripted([
    { text: 'You set off along the dock and soon reach the Sunken Causeway. Moll, what do you do?' },
    { calls: [{ name: 'move_party', args: { place: 'causeway' } }] },
    { text: 'Cold water rises around your knees on the Sunken Causeway. Moll, what do you do?' },
  ]);
  const out = await directorTurn({ state: T.s, mod, provider, rng: () => 0.5, reason: 'test' });
  assert.equal(out.state.scene.siteId, 'causeway');
});
