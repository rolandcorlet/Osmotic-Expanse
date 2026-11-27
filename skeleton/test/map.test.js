// The map's geometry for every Skeleton game (engine/map.js, from the D&D Director): squares, not feet, and
// the game's own move, reach, range and cover (upgrade plan step 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as MAP from '../engine/map.js';

test('a game\'s own map rules, and the defaults when it gives none', () => {
  assert.deepEqual(MAP.mapRules({ rules: {} }), { square: '5 ft', move: 6, reach: 1, range: 10, cover: { half: 2, full: 5 } });
  assert.deepEqual(MAP.mapRules({ rules: { map: { square: '2 m', move: 4, reach: 2, range: 8, cover: { half: 1 } } } }), { square: '2 m', move: 4, reach: 2, range: 8, cover: { half: 1, full: 5 } });
});

test('reach and movement are counted in squares', () => {
  const a = { zone: 'z', x: 1, y: 1 };
  assert.ok(MAP.inReach(a, { zone: 'z', x: 2, y: 2 }));
  assert.ok(!MAP.inReach(a, { zone: 'z', x: 3, y: 1 }));
  assert.ok(MAP.inReach(a, { zone: 'z', x: 3, y: 1 }, 2), 'a reach of two squares');
  assert.ok(!MAP.inReach(a, { zone: 'y', x: 1, y: 1 }), 'another zone is never in reach');
  assert.equal(MAP.speedOf({}, MAP.mapRules({ rules: { map: { move: 4 } } })), 4);
  assert.deepEqual(MAP.budget({ conds: [] }, { speed: 4, used: { moved: 1 } }), { left: 3, per: 1, speed: 4, total: 4 });
  assert.equal(MAP.budget({ conds: ['Prone'] }, { speed: 4 }).per, 2);
  assert.equal(MAP.budget({ conds: ['Held'] }, { speed: 4 }).speed, 0, 'a game\'s own word for held');
  assert.equal(MAP.budget({ conds: [], down: true }, { speed: 4 }).speed, 0);
});

test('zones: three of their own when a place gives none, and a path between them', () => {
  const z = MAP.autoZones();
  assert.deepEqual(z.map((x) => x.name), ['Near side', 'Middle', 'Far side']);
  assert.deepEqual(MAP.zonePath(z, 'near', 'far'), ['near', 'middle', 'far']);
});

import { mod, table, diver } from './helpers.js';
import { viewFor } from '../engine/ledger.js';

test('everyone at the party\'s place has a square; travel brings the party in by the way they came', () => {
  const T = table(4);
  const a = diver(T, 'p1', 0);
  const b = diver(T, 'p2', 1);
  const at = T.s.map.at;
  assert.ok(at[`char:${a.id}`] && at[`char:${b.id}`], 'both on the map');
  assert.equal(at[`char:${a.id}`].site, T.s.scene.siteId);
  assert.notDeepEqual([at[`char:${a.id}`].x, at[`char:${a.id}`].y], [at[`char:${b.id}`].x, at[`char:${b.id}`].y], 'never on the same square');
  T.host({ type: 'site.move', siteId: 'causeway' });
  assert.equal(T.s.map.at[`char:${a.id}`].site, 'causeway');
  assert.equal(T.s.map.cameFrom, 'dock');
});

test('a player moves their own character; in a fight only on their turn and as far as the game allows', () => {
  const T = table(4);
  const a = diver(T, 'p1', 0);
  diver(T, 'p2', 1);
  T.as('p1', { type: 'map.move', who: a.id, zone: 'middle' });
  assert.equal(T.s.map.at[`char:${a.id}`].zone, 'middle');
  assert.ok(T.s.story.some((e) => new RegExp(`${a.name} moves to Middle`).test(e.text)));
  assert.throws(() => T.as('p2', { type: 'map.move', who: a.id, zone: 'far' }), /not your character/);
  // In a fight: a creature to fight, and only on their own turn.
  T.host({ type: 'creature.add', base: mod.bestiary.creatures[0].id, count: 1 });
  T.host({ type: 'fight.start' });
  const mine = T.s.fight.order.findIndex((o) => o.key === `char:${a.id}`);
  T.s.fight.turn = (mine + 1) % T.s.fight.order.length;
  assert.throws(() => T.as('p1', { type: 'map.move', who: a.id, x: 0, y: 0 }), /not .*turn/);
  T.s.fight.turn = mine; T.s.fight.moved = 0;
  const p = T.s.map.at[`char:${a.id}`];
  T.as('p1', { type: 'map.move', who: a.id, x: p.x === 0 ? 1 : 0, y: p.y });
  assert.ok(T.s.fight.moved >= 1);
  T.s.fight.moved = 6;
  const q = T.s.map.at[`char:${a.id}`];
  assert.throws(() => T.as('p1', { type: 'map.move', who: a.id, x: q.x === 0 ? 1 : 0, y: q.y }), /0 left this turn/);
});

test('players never see where a hidden creature stands', () => {
  const T = table(4);
  diver(T, 'p1', 0);
  T.host({ type: 'creature.add', base: mod.bestiary.creatures[0].id, count: 1, hidden: true });
  const k = Object.keys(T.s.map.at).find((x) => x.startsWith('creature:'));
  assert.ok(k, 'the host sees it placed');
  assert.ok(!viewFor(T.s, 'player').map.at[k]);
});
