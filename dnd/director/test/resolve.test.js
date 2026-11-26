// The shared refusal layer: every "no" is nothing-to-change, fixed (with what was assumed), or a real no
// with the valid choices, for the screens and for every Director tool alike.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attempt, explain } from '../engine/ledger.js';
import { toolbox } from '../brain/tools.js';
import { makeRng } from '../engine/dice.js';
import { srd, adventure, table, hero } from './helpers.js';

const ctxOf = (T, extra = {}) => ({ role: 'host', pid: null, rng: makeRng(5), now: 5, adventure, srd, ...extra });

test('attempt sorts every answer into done, nothing changed or refused', () => {
  const T = table(3);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  T.host({ type: 'fight.start', autoRoll: true });
  const again = attempt(T.s, { type: 'fight.start' }, ctxOf(T));
  assert.equal(again.status, 'nochange');
  assert.match(again.text, /^Nothing changed: A fight is already on/);
  assert.equal(again.state, T.s, 'nothing changed means the same state');
  const nowhere = attempt(T.s, { type: 'quest.done', id: 'slay the dragon of the moon' }, ctxOf(T));
  assert.equal(nowhere.status, 'refused');
  assert.ok(nowhere.options.length >= 1, 'the open quests are the choices');
  const near = attempt(T.s, { type: 'cond.add', target: 'Goblin scot 2', cond: 'knocked prone' }, ctxOf(T));
  assert.equal(near.status, 'done');
  assert.match(near.text, /Assumed: "Goblin scot 2" is Goblin scout 2\. "knocked prone" is the condition prone\./);
});

test('explain adds the choices only when the words do not already list them', () => {
  assert.equal(explain({ status: 'refused', message: 'No such zone. Zones: Road, Mill.', options: ['Road', 'Mill'] }), 'No such zone. Zones: Road, Mill.');
  assert.equal(explain({ status: 'refused', message: 'No such zone.', options: ['Road', 'Mill'] }), 'No such zone. Choose from: Road, Mill.');
  assert.equal(explain({ status: 'nochange', message: 'Nothing is hidden here.', hint: 'Carry on.' }), 'Nothing changed: Nothing is hidden here. Carry on.');
});

test('the Engine fixes what has one obvious reading, and says so', () => {
  const T = table(4);
  const bryn = hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  // A save named by a skill is that skill's ability; no DC is a medium one.
  let r = attempt(T.s, { type: 'roll.ask', pcIds: [bryn.id], kind: 'save', skill: 'acrobatics', reason: 'the slick slabs' }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'done');
  const q = r.state.requests.at(-1);
  assert.equal(q.ability, 'dex');
  assert.equal(q.dc, 13);
  assert.match(r.text, /a Dexterity save/);
  // A plural or near monster name.
  r = attempt(T.s, { type: 'foe.add', monster: 'giant rats', count: 2 }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'done');
  assert.ok(Object.values(r.state.foes).some((f) => f.mid === 'giant-rat'));
  // An attack named loosely.
  r = attempt(T.s, { type: 'attack', pcId: bryn.id, attack: 'battle axe', target: 'Goblin scout 1' }, ctxOf(T));
  assert.equal(r.status, 'done', r.text);
  // A place named by the words of an exit: from the Mill Road, "the watchtower" is the path up to the gate.
  r = attempt(T.s, { type: 'site.move', siteId: 'the old watchtower' }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'done', r.text);
  assert.equal(r.state.scene.siteId, 'tower-gate');
  assert.match(r.text, /The way to "the old watchtower" from here/);
});

test('a monster weapon by another name is used, a spell it lacks is nothing changed with its choices', () => {
  const T = table(6);
  const ila = hero(T, 'p1', 'Ila', 'cleric');
  T.host({ type: 'foe.add', monster: 'skeleton', count: 1, name: 'Bones' });
  const foe = Object.values(T.s.foes).find((f) => f.name === 'Bones');
  let r = attempt(T.s, { type: 'foe.act', foeId: foe.id, action: 'Scimitar', targets: [ila.id] }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'done');
  assert.match(r.text, /Bones has no Scimitar: it attacks with its Shortsword/);
  r = attempt(T.s, { type: 'foe.act', foeId: foe.id, action: 'Fireball', targets: [ila.id] }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'nochange');
  assert.ok(r.options.includes('Shortsword'));
});

test('every Director tool answers in the same three ways', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  const tb = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 2 });
  assert.ok(!tb.run('start_combat', {}).refused);
  const twice = tb.run('start_combat', {});
  assert.match(twice.note, /^Nothing changed: A fight is already on/);
  assert.ok(twice.fight || twice.round || twice.waiting_on, 'with where the fight stands');
  const travel = tb.run('move_party', { place: 'thornwick' });
  assert.match(travel.note, /Nothing changed: The party cannot travel during a fight/);
  const quest = tb.run('complete_quest', { quest: 'the dragon' });
  assert.match(quest.refused, /There is no such quest/);
  assert.equal(tb.refusals, 1);
});

test('completing a written quest the party was never given is a note (bench part 4, 27 Nov)', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  const adv = { ...adventure, questDone: [...(adventure.questDone || []), { match: 'blackreed', at: ['blackreed'], when: 'the mill is cleared' }] };
  const tb = toolbox({ state: T.s, adventure: adv, srd, rng: makeRng(2), now: 2 });
  const r = tb.run('complete_quest', { quest: 'blackreed' });
  assert.match(r.note, /never took on a quest for "blackreed"/);
  assert.equal(tb.refusals, 0);
});
