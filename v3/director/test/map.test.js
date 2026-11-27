// The v3 map (engine/map.js and the Ledger's map, 28 Nov 2026): one square is one Drift, and with the map on
// a creature's band is its Drifts to the nearest organism (docs/superpowers/specs/2026-11-28-v3-map-design.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSession, apply, viewFor, driftsBetween } from '../engine/ledger.js';
import * as R from '../engine/rules.js';
import { makeRng } from '../engine/dice.js';
import { scenario } from '../data/first-carve.js';

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));
function table(seed = 7) {
  const rng = makeRng(seed);
  let s = newSession(scenario);
  const ctx = (role, pid) => ({ role, pid, rng, now: 0, scenario, bestiary });
  return { host: (a) => { s = apply(s, a, ctx('host', null)); return s; }, as: (pid, a) => { s = apply(s, a, ctx('player', pid)); return s; }, get s() { return s; } };
}
function seated() {
  const t = table();
  t.as('p1', { type: 'join', name: 'Roly' }); t.as('p1', { type: 'zero.agree' }); t.as('p1', { type: 'claim', organismId: 'wall', name: 'Bresk' });
  t.as('p2', { type: 'join', name: 'Sam' }); t.as('p2', { type: 'zero.agree' }); t.as('p2', { type: 'claim', organismId: 'eyes', name: 'Brost' });
  return t;
}
const block = 'gnaw-swarm';
const drifts = (t, cid, org = 'wall') => driftsBetween(t.s, scenario, `org:${org}`, `cre:${cid}`);
const nearest = (t, cid) => Math.min(...['wall', 'eyes'].map((o) => drifts(t, cid, o)));

test('the site\'s printed zones, and the Cohort on squares where it came in', () => {
  const t = seated();
  const zones = t.s.map.zones['toll-vent'];
  assert.deepEqual(zones.map((z) => z.name), scenario.sites[0].zones.map((z) => z.name));
  const a = t.s.map.at['org:wall']; const b = t.s.map.at['org:eyes'];
  assert.ok(a && b && a.site === 'toll-vent' && a.zone === zones[0].id);
  assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
});

test('a creature stands at its band, and its band follows the map', () => {
  const t = seated();
  t.host({ type: 'creature.add', creatures: [{ blockId: block, count: 1, band: 'near' }] });
  const c = Object.values(t.s.creatures)[0];
  const d = nearest(t, c.cid);
  assert.ok(d >= 1 && d <= 3, `near is 1 to 3 Drifts, got ${d}`);
  assert.equal(t.s.creatures[c.cid].band, 'near');
  // The host puts it right beside the Wall: Contact.
  const w = t.s.map.at['org:wall'];
  t.host({ type: 'map.move', who: `cre:${c.cid}`, zone: w.zone, x: w.x + 1, y: w.y });
  assert.equal(nearest(t, c.cid), 0);
  assert.equal(t.s.creatures[c.cid].band, 'contact');
  // The host sets a band by hand: the token goes to that distance.
  t.host({ type: 'set', target: { kind: 'cre', id: c.cid }, field: 'band', value: 'far' });
  const f = nearest(t, c.cid);
  assert.ok(f >= 10 && f <= 20, `far is 10 to 20 Drifts, got ${f}`);
  assert.equal(t.s.creatures[c.cid].band, 'far');
});

test('the Director setting a band moves the token there', () => {
  const t = seated();
  t.host({ type: 'creature.add', creatures: [{ blockId: block, count: 1, band: 'contact' }] });
  const c = Object.values(t.s.creatures)[0];
  assert.equal(nearest(t, c.cid), 0);
  t.host({ type: 'fight.start', creatures: [] });
  for (let i = 0; i < 12 && t.s.fight.turn !== `cre:${c.cid}`; i++) t.host({ type: 'turn.next' });
  t.host({ type: 'creature.act', cid: c.cid, what: 'Drift', cost: 1, band: 'mid' });
  const d = nearest(t, c.cid);
  assert.ok(d >= 4 && d <= 9, `mid is 4 to 9 Drifts, got ${d}`);
  assert.equal(t.s.creatures[c.cid].band, R.bandOf(d).id);
});

test('a player moves their own organism; in a Pulse War it is a Drift, on their turn', () => {
  const t = seated();
  const z0 = t.s.map.zones['toll-vent'][0].id;
  t.as('p1', { type: 'map.move', who: 'wall', zone: z0, x: 3, y: 3 });
  assert.deepEqual([t.s.map.at['org:wall'].x, t.s.map.at['org:wall'].y], [3, 3]);
  assert.throws(() => t.as('p2', { type: 'map.move', who: 'wall', zone: z0, x: 4, y: 4 }), /not your organism/);
  t.host({ type: 'creature.add', creatures: [{ blockId: block, count: 1, band: 'far' }] });
  t.host({ type: 'fight.start', creatures: [] });
  for (let i = 0; i < 12 && t.s.fight.turn !== 'org:eyes'; i++) t.host({ type: 'turn.next' });
  assert.throws(() => t.as('p1', { type: 'map.move', who: 'wall', zone: z0, x: 2, y: 3 }), /not Bresk's turn|not .*turn/);
  for (let i = 0; i < 12 && t.s.fight.turn !== 'org:wall'; i++) t.host({ type: 'turn.next' });
  const pp = t.s.fight.actors['org:wall'].pp;
  t.as('p1', { type: 'map.move', who: 'wall', zone: z0, x: 1, y: 3 }); // two squares: one Drift (Flow 6)
  assert.equal(t.s.fight.actors['org:wall'].pp, pp - 1);
  t.as('p1', { type: 'map.move', who: 'wall', zone: z0, x: 1, y: 1 }); // two more, from the same Drift
  assert.equal(t.s.fight.actors['org:wall'].pp, pp - 1);
});

test('players never see where a hidden creature stands', () => {
  const t = seated();
  t.host({ type: 'creature.add', creatures: [{ blockId: block, count: 1, band: 'mid' }] });
  const c = Object.values(t.s.creatures)[0];
  t.host({ type: 'set', target: { kind: 'cre', id: c.cid }, field: 'hidden', value: true });
  const v = viewFor(t.s, 'player', 'p1');
  assert.equal(v.map.at[`cre:${c.cid}`], undefined);
  assert.ok(v.map.at['org:wall']);
});

import { briefing } from '../brain/director.js';
test('the Director\'s briefing shows the zones and who stands in each, and stops when the map is off', () => {
  const t = seated();
  t.host({ type: 'creature.add', creatures: [{ blockId: block, count: 1, band: 'near' }] });
  const b = briefing(t.s, scenario, bestiary, {});
  assert.match(b, /# THE MAP/);
  assert.match(b, new RegExp(`- ${scenario.sites[0].zones[0].name}: .*Bresk`));
  t.host({ type: 'map.show', zones: false, grid: false });
  assert.doesNotMatch(briefing(t.s, scenario, bestiary, {}), /# THE MAP/);
});

test('moving an organism to the zone it already stands in changes nothing and is not refused', () => {
  const t = seated();
  const was = { ...t.s.map.at['org:wall'] };
  t.as('p1', { type: 'map.move', who: 'wall', zone: was.zone });
  assert.deepEqual(t.s.map.at['org:wall'], was);
});
import * as MAP from '../engine/map.js';

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
