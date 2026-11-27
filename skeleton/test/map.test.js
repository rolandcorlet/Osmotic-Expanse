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
