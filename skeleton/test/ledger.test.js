import test from 'node:test';
import assert from 'node:assert/strict';
import { table, diver, mod } from './helpers.js';
import { RuleError, viewFor } from '../engine/ledger.js';

test('players join and take ready-made characters; health comes from the module', () => {
  const T = table();
  const m = diver(T, 'p1', 0);
  assert.equal(m.name, 'Moll Tarrow');
  assert.equal(m.healthMax, 8 + 4 * 2);
  assert.deepEqual(m.gear, ['gaff-hook', 'shell-plate']);
  assert.throws(() => T.as('p2', { type: 'char.pregen', index: 0 }), RuleError);
});
test('building a character checks points; the origin adds its bonus', () => {
  const T = table();
  T.as('p1', { type: 'join', name: 'Ann' });
  const input = { name: 'Nel', origin: 'reefborn', calling: 'hookhand', stats: { brawn: 4, grace: 2, wits: 2, nerve: 2 }, skills: { fight: 2, swim: 1, sense: 1 } };
  assert.throws(() => T.as('p1', { type: 'char.create', input: { ...input, stats: { brawn: 4, grace: 4, wits: 2, nerve: 2 } } }), /Spend exactly 6/);
  T.as('p1', { type: 'char.create', input });
  const ch = T.s.chars[T.s.players.p1.charId];
  assert.equal(ch.stats.brawn, 5);
});
test('a roll asked for: snags mark strain, failure applies its cost', () => {
  const T = table(3);
  const m = diver(T, 'p1', 0);
  T.host({ type: 'roll.ask', charIds: [m.id], stat: 'brawn', skill: 'swim', at: 'Abyssal', reason: 'the current', fail: { damage: 3 } });
  const q = T.s.requests[0];
  assert.equal(q.at, 20);
  T.as('p1', { type: 'roll.make', id: q.id, dice: [1, 1, 3, 2, 2, 1] });
  const ch = T.s.chars[m.id];
  assert.equal(ch.strain, 3);
  assert.equal(ch.health, ch.healthMax - 3);
  assert.match(T.s.story.at(-1).text, /Blackout/);
});
test('a fight: initiative, attacks on turns, creatures fall, xp shared at the end', () => {
  const T = table(5);
  const m = diver(T, 'p1', 0);
  T.host({ type: 'site.move', siteId: 'causeway' });
  T.host({ type: 'fight.start' });
  assert.ok(T.s.fight.order.length >= 3);
  let guard = 0;
  while (T.s.fight && guard++ < 60) {
    const cur = T.s.fight.order[T.s.fight.turn].key;
    if (cur === `char:${m.id}`) {
      const eel = Object.values(T.s.creatures).find((k) => !k.down && k.siteId === 'causeway');
      if (eel) T.as('p1', { type: 'attack', charId: m.id, target: eel.id });
      T.as('p1', { type: 'fight.next' });
    } else {
      const k = T.s.creatures[cur.split(':')[1]];
      if (!T.s.chars[m.id].down) T.ai({ type: 'creature.act', creature: k.id, target: m.id });
      T.ai({ type: 'fight.next' });
    }
    if (!Object.values(T.s.creatures).some((k) => !k.down && k.siteId === 'causeway')) T.host({ type: 'fight.end' });
    if (T.s.chars[m.id].down && T.s.fight) T.host({ type: 'fight.end' });
  }
  assert.equal(T.s.fight, null);
});
test('the AI ending a won fight beats what still stands in the record; a party that flees leaves it standing', () => {
  const T = table(5);
  const m = diver(T, 'p1', 0);
  T.host({ type: 'site.move', siteId: 'causeway' });
  T.host({ type: 'fight.start' });
  const foes = () => Object.values(T.s.creatures).filter((k) => k.siteId === 'causeway' && !k.hidden);
  assert.ok(foes().some((k) => !k.down));
  const xp = T.s.chars[m.id].xp || 0;
  T.ai({ type: 'fight.end' });
  assert.equal(T.s.fight, null);
  assert.ok(foes().every((k) => k.down && k.health === 0));
  assert.match(T.s.story.map((e) => e.text).join(' '), /beaten as the fight ends/);
  assert.ok((T.s.chars[m.id].xp || 0) > xp);
  const U = table(5);
  diver(U, 'p1', 0);
  U.host({ type: 'site.move', siteId: 'causeway' });
  U.host({ type: 'fight.start' });
  U.ai({ type: 'fight.end', award: false });
  assert.ok(Object.values(U.s.creatures).some((k) => k.siteId === 'causeway' && !k.down));
});
test('out of turn is refused for the AI and players; hidden creatures stay off players\' screens', () => {
  const T = table(9);
  const m = diver(T, 'p1', 0);
  T.host({ type: 'site.move', siteId: 'causeway' });
  assert.equal(Object.keys(viewFor(T.s, 'player').creatures).length, 0);
  T.host({ type: 'fight.start' });
  const cur = T.s.fight.order[T.s.fight.turn].key;
  const eel = Object.values(T.s.creatures)[0];
  if (cur.startsWith('char')) assert.throws(() => T.ai({ type: 'creature.act', creature: eel.id, target: m.id }), /not .* turn/);
  else assert.throws(() => T.as('p1', { type: 'attack', charId: m.id, target: eel.id }), /not .* turn/);
});
test('the AI may only travel along exits, and a quest closes only where the adventure says', () => {
  const T = table();
  diver(T, 'p1', 0);
  assert.throws(() => T.ai({ type: 'site.move', siteId: 'bell' }), /way leads to/);
  T.ai({ type: 'site.move', siteId: 'causeway' });
  assert.throws(() => T.ai({ type: 'quest.done', id: 'bell' }), /Not yet/);
  T.ai({ type: 'site.move', siteId: 'dock' });
  T.ai({ type: 'quest.done', id: 'bell' });
  assert.ok(T.s.quests[0].done);
});
test('a condition that bleeds hurts at the start of the turn', () => {
  const T = table(2);
  const m = diver(T, 'p1', 0);
  T.host({ type: 'site.move', siteId: 'causeway' });
  T.host({ type: 'cond.add', target: m.id, cond: 'bleeding' });
  T.host({ type: 'fight.start' });
  for (let i = 0; i < 4 && T.s.chars[m.id].health === T.s.chars[m.id].healthMax; i++) T.host({ type: 'fight.next' });
  assert.ok(T.s.chars[m.id].health < T.s.chars[m.id].healthMax);
});
