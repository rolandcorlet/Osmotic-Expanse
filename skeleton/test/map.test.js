// The map's geometry for every Skeleton game (engine/map.js, from the D&D Director): squares, not feet, and
// the game's own move, reach, range and cover (upgrade plan step 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as MAP from '../engine/map.js';

test('a game\'s own map rules, and the defaults when it gives none', () => {
  assert.deepEqual(MAP.mapRules({ rules: {} }), { square: '5 ft', move: 6, reach: 1, range: 10, cover: { half: 2, full: 5 }, stuck: [] });
  assert.deepEqual(MAP.mapRules({ rules: { map: { square: '2 m', move: 4, reach: 2, range: 8, cover: { half: 1 } } } }), { square: '2 m', move: 4, reach: 2, range: 8, cover: { half: 1, full: 5 }, stuck: [] });
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

test('a melee attack steps up to its target; with distance deciding, too far or past range is refused', () => {
  const T = table(4);
  const a = diver(T, 'p1', 0);
  const base = mod.bestiary.creatures.find((c) => (c.attacks || []).length);
  T.host({ type: 'creature.add', base: base.id, count: 1 });
  const k = Object.values(T.s.creatures).find((x) => x.base === base.id);
  T.s.map.at[`creature:${k.id}`] = { site: T.s.scene.siteId, zone: 'far', x: 3, y: 3 };
  T.host({ type: 'fight.start' });
  T.s.creatures[k.id].health = 999; T.s.creatures[k.id].healthMax = 999; // it must stand for the second half
  T.s.fight.turn = T.s.fight.order.findIndex((o) => o.key === `char:${a.id}`); T.s.fight.used = 0;
  const weapon = T.s.chars[a.id].gear.find((g) => mod.ix.gear[g] && mod.ix.gear[g].kind === 'weapon' && !/gun|bow/i.test(mod.ix.gear[g].name));
  T.as('p1', { type: 'attack', charId: a.id, gearId: weapon, target: k.id });
  const pa = T.s.map.at[`char:${a.id}`]; const pk = T.s.map.at[`creature:${k.id}`];
  assert.equal(pa.zone, pk.zone, 'stepped up into its zone');
  assert.ok(Math.max(Math.abs(pa.x - pk.x), Math.abs(pa.y - pk.y)) <= 1, 'and beside it');
  // Distance decides: the Director's creature cannot cross the whole place to strike.
  T.host({ type: 'map.show', reach: true });
  T.s.fight.turn = T.s.fight.order.findIndex((o) => o.key === `creature:${k.id}`); T.s.fight.used = 0;
  T.s.map.at[`char:${a.id}`] = { site: T.s.scene.siteId, zone: 'near', x: 0, y: 3 };
  T.s.map.at[`creature:${k.id}`] = { site: T.s.scene.siteId, zone: 'far', x: 5, y: 3 };
  assert.throws(() => T.ai({ type: 'creature.act', creature: k.id, attack: base.attacks[0].name, target: a.id }), /too far .* to strike this turn/);
});

import { briefing } from '../brain/director.js';
import { toolbox } from '../brain/tools.js';
import { makeRng } from '../engine/dice.js';

test('the Director sees the map and moves creatures on it', () => {
  const T = table(5);
  const a = diver(T, 'p1', 0);
  const base = mod.bestiary.creatures.find((c) => (c.attacks || []).length);
  T.host({ type: 'creature.add', base: base.id, count: 1 });
  const k = Object.values(T.s.creatures).find((x) => x.base === base.id);
  const b = briefing(T.s, mod, {});
  assert.match(b, /MAP \(zones about six squares across, a square is 5 ft/);
  assert.match(b, new RegExp(`- Near side: ${a.name}`));
  assert.match(b, new RegExp(`- Far side: ${k.name}`));
  const tb = toolbox({ state: T.s, mod, rng: makeRng(1), now: 1 });
  const r1 = tb.run('move_creature', { who: [k.name], to_zone: 'Middle' });
  assert.ok(!r1.note, JSON.stringify(r1));
  assert.match(r1.map, new RegExp(`- Middle: ${k.name}`));
  assert.match(tb.run('move_creature', { who: [k.name], to_zone: 'the moon' }).note, /no zone called "the moon"/);
  // In a fight, no place given: it closes in on a character.
  tb.state = { ...tb.state };
  T.s = tb.state; T.host({ type: 'fight.start' });
  const tb2 = toolbox({ state: T.s, mod, rng: makeRng(1), now: 1 });
  const r3 = tb2.run('move_creature', { who: [k.name] });
  assert.match(r3.note || '', new RegExp(`closes in on ${a.name}`));
  assert.match(r3.map, /Close enough to strike: /);
});

test('a rule for entering a zone fires for the character who steps in; arriving at the place is another rule', async () => {
  const adv = mod.ix.adventure[mod.adventures[0].id];
  const start = adv.sites.find((x) => x.id === adv.start);
  const saved = start.rules;
  start.rules = [...(saved || []),
    { id: 'far-key', when: 'enter far side', do: 'give', item: 'Brass key', say: 'Something glints in the weed.' },
    { id: 'arrive', when: 'enter', do: 'say', say: 'Gulls everywhere.', once: false }];
  try {
    const T = table(6);
    const a = diver(T, 'p1', 0);
    const b = diver(T, 'p2', 1);
    const arrivals = () => T.s.story.filter((e) => /Gulls everywhere/.test(e.text)).length;
    const before = arrivals();
    T.as('p2', { type: 'map.move', who: b.id, zone: 'far' });
    assert.deepEqual(T.s.chars[b.id].items, ['Brass key']);
    assert.ok(!(T.s.chars[a.id].items || []).length);
    assert.equal(arrivals(), before, 'moving between zones is not arriving');
    const bad = { ...adv, sites: [{ id: 'x', rules: [{ when: 'enter the attic', do: 'say', say: 'x' }] }], rules: [] };
    assert.match((await import('../engine/triggers.js')).checkRules(mod, bad).join('\n'), /no zone here is called "the attic"/);
  } finally { start.rules = saved; }
});

test('the travel map lays out places whose exits are plain ids (the Skeleton) or { to } (the D&D Director)', () => {
  // Two roads out of the first place: both lead one step on, side by side.
  const plain = MAP.travelLayout([{ id: 'a', exits: ['b', 'c'] }, { id: 'b', exits: ['a'] }, { id: 'c', exits: ['a'] }]);
  const objs = MAP.travelLayout([{ id: 'a', exits: [{ to: 'b' }, { to: 'c' }] }, { id: 'b', exits: [] }, { id: 'c', exits: [] }]);
  assert.deepEqual(plain, objs);
  assert.equal(plain.b.x, plain.c.x);
  assert.ok(plain.a.x < plain.b.x && plain.b.y !== plain.c.y);
});

test('a game\'s own condition that stops moving holds a character in place (Saltglass\'s Snared)', () => {
  assert.deepEqual(MAP.mapRules(mod).stuck, ['snared']);
  const T = table(5);
  const a = diver(T, 'p1', 0);
  T.host({ type: 'cond.add', target: a.id, cond: 'snared' });
  assert.throws(() => T.as('p1', { type: 'map.move', who: a.id, zone: 'middle' }), /cannot move \(snared\)/);
  T.host({ type: 'map.move', who: a.id, zone: 'middle' }); // the host can still put anyone anywhere
  assert.equal(T.s.map.at[`char:${a.id}`].zone, 'middle');
  assert.equal(MAP.budget({ conds: ['snared'] }, { speed: 6, used: { moved: 0 }, stuck: ['snared'] }).left, 0);
});

test('moving someone to the zone they already stand in changes nothing and is not refused', () => {
  const T = table(6);
  const a = diver(T, 'p1', 0);
  const was = { ...T.s.map.at[`char:${a.id}`] };
  T.as('p1', { type: 'map.move', who: a.id, zone: was.zone });
  assert.deepEqual(T.s.map.at[`char:${a.id}`], was);
  assert.match(T.s.map.lastNote, /already in/);
});

test('a big battle map is cut into zones that cover all of it, never more than sixteen (28 Nov)', () => {
  for (const [c, r] of [[20, 20], [30, 30], [60, 30], [50, 50], [6, 10], [30, 45]]) {
    const z = MAP.zonesFromSiteMap(c, r);
    assert.ok(z.length >= 1 && z.length <= MAP.MAX_ZONES, `${c}x${r}: ${z.length} zones`);
    const area = z.reduce((t, x) => t + x.w * x.h, 0);
    assert.ok(Math.abs(area - 1) < 0.02, `${c}x${r} covers ${area}`);
    for (const x of z) { assert.ok(x.w * c <= MAP.MAX_CELLS + 0.5 && x.h * r <= MAP.MAX_CELLS + 0.5); }
  }
  assert.equal(MAP.zonesFromSiteMap(20, 20).length, 9);
});
