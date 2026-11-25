import test from 'node:test';
import assert from 'node:assert/strict';
import { newSession, apply, viewFor, openAdventure, RuleError } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { srd, BASE } from './helpers.js';
import { toolbox } from '../brain/tools.js';
import { briefing } from '../brain/director.js';

// A small place to fight in: a road, a gate arch and a wall walk above it.
const ADV = {
  id: 'maptest', name: 'Map test',
  sites: [
    { id: 'road', name: 'The road', exits: [{ to: 'gate', label: 'up to the gate' }] },
    {
      id: 'gate', name: 'The gate', exits: [{ to: 'road', label: 'down' }],
      zones: [
        { name: 'Path', x: 0.02, y: 0.3, w: 0.3, h: 0.4, from: ['road'] },
        { name: 'Gate arch', x: 0.36, y: 0.3, w: 0.3, h: 0.4, links: ['path', 'wall-walk', 'yard'] },
        { name: 'Wall walk', x: 0.36, y: 0.0, w: 0.3, h: 0.26, tags: ['high-ground', 'half-cover'], note: 'the sentries sit here' },
        { name: 'Yard', x: 0.7, y: 0.3, w: 0.28, h: 0.4 },
        { name: 'Far tower', x: 0.7, y: 0.75, w: 0.28, h: 0.24, links: ['yard'] },
      ],
      foes: [{ monster: 'goblin', count: 2, name: 'Sentry', zone: 'wall walk' }],
    },
  ],
};
function table(seed = 3) {
  const rng = makeRng(seed);
  let now = 1000;
  const ctx = (role, pid, extra = {}) => ({ role, pid, rng, now: (now += 1000), adventure: ADV, srd, ...extra });
  const T = {
    s: openAdventure({ ...newSession(ADV), auto: { rules: true, scale: 'off' } }, ADV, ctx('host', null)), // fights as written
    host(action) { T.s = apply(T.s, action, ctx('host', null)); return T.s; },
    ai(action) { T.s = apply(T.s, action, ctx('host', null, { ai: true })); return T.s; },
    as(pid, action) { T.s = apply(T.s, action, ctx('player', pid)); return T.s; },
  };
  return T;
}
function hero(T, pid, name) {
  const c = srd.classes.find((x) => x.id === 'fighter');
  T.as(pid, { type: 'join', name: `${name}'s player` });
  T.as(pid, { type: 'pc.create', input: { name, race: 'human', class: 'fighter', method: 'standard', base: BASE, skills: c.skillFrom.slice(0, c.skillChoose), background: 'acolyte' } });
  return Object.values(T.s.pcs).find((p) => p.name === name);
}
const at = (T, who) => T.s.map.at[who.startsWith('pc:') || who.startsWith('foe:') ? who : `pc:${Object.values(T.s.pcs).find((p) => p.name === who).id}`];
const foeKey = (T, name) => `foe:${Object.values(T.s.foes).find((f) => f.name === name).id}`;

test('a place with no zones of its own gets three, and the party stands together in the first', () => {
  const T = table();
  hero(T, 'p1', 'Bram'); hero(T, 'p2', 'Hilde');
  assert.deepEqual(T.s.map.zones.road.map((z) => z.name), ['Near side', 'Middle', 'Far side']);
  const a = at(T, 'Bram'); const b = at(T, 'Hilde');
  assert.equal(a.zone, 'near'); assert.equal(b.zone, 'near');
  assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1);
  assert.equal(T.s.map.show.zones, true);
});

test('arriving: in by the way they came, the monsters on their own zone and hidden from the players', () => {
  const T = table();
  hero(T, 'p1', 'Bram');
  T.host({ type: 'site.move', siteId: 'gate' });
  assert.equal(at(T, 'Bram').zone, 'path');
  const sentry = at(T, foeKey(T, 'Sentry 1'));
  assert.equal(sentry.zone, 'wall-walk');
  const pv = viewFor(T.s, 'player', 'p1');
  assert.equal(Object.keys(pv.map.at).filter((k) => k.startsWith('foe:')).length, 0);
  assert.equal(pv.map.zones.gate.find((z) => z.id === 'wall-walk').note, '');
  assert.equal(T.s.map.zones.gate.find((z) => z.id === 'wall-walk').note, 'the sentries sit here');
  T.host({ type: 'foe.reveal' });
  assert.equal(Object.keys(viewFor(T.s, 'player', 'p1').map.at).filter((k) => k.startsWith('foe:')).length, 2);
});

test('outside a fight a player walks their own character anywhere there is a way; not someone else\'s', () => {
  const T = table();
  const bram = hero(T, 'p1', 'Bram'); hero(T, 'p2', 'Hilde');
  T.host({ type: 'site.move', siteId: 'gate' });
  T.as('p1', { type: 'map.move', who: `pc:${bram.id}`, zone: 'Yard' });
  assert.equal(at(T, 'Bram').zone, 'yard');
  assert.match(T.s.story.at(-1).text, /Bram moves to Yard/);
  T.as('p1', { type: 'map.move', who: `pc:${bram.id}`, zone: 'yard', x: 2, y: 2 });
  assert.deepEqual([at(T, 'Bram').x, at(T, 'Bram').y], [2, 2]);
  assert.throws(() => T.as('p2', { type: 'map.move', who: `pc:${bram.id}`, zone: 'path' }), /not your character/);
  const hk = `pc:${Object.values(T.s.pcs).find((p) => p.name === 'Hilde').id}`;
  T.as('p2', { type: 'map.move', who: hk, zone: 'yard', x: 3, y: 3 });
  assert.throws(() => T.as('p2', { type: 'map.move', who: hk, zone: 'yard', x: 2, y: 2 }), /already standing/);
  assert.throws(() => T.as('p1', { type: 'map.move', who: `pc:${bram.id}`, zone: 'moon' }), /no zone called/);
});

test('in a fight: only on your turn, within your movement; Dash doubles it', () => {
  const T = table();
  const bram = hero(T, 'p1', 'Bram'); const hilde = hero(T, 'p2', 'Hilde');
  T.host({ type: 'site.move', siteId: 'gate' });
  T.host({ type: 'fight.start', autoRoll: true });
  const cur = T.s.fight.order[T.s.fight.turn].key;
  // Bring the order round to Bram.
  for (let i = 0; i < 6 && T.s.fight.order[T.s.fight.turn].key !== `pc:${bram.id}`; i++) T.host({ type: 'fight.next' });
  void cur;
  assert.equal(T.s.fight.order[T.s.fight.turn].key, `pc:${bram.id}`);
  assert.throws(() => T.as('p2', { type: 'map.move', who: `pc:${hilde.id}`, zone: 'gate arch' }), /not Hilde's turn/);
  const start = at(T, 'Bram');
  // One square: 5 feet.
  T.as('p1', { type: 'map.move', who: `pc:${bram.id}`, zone: 'path', x: Math.min(5, start.x + 1), y: start.y });
  assert.equal(T.s.fight.used.moved, 5);
  // The far side of the gate arch is out of reach on a walk; with Dash it is not.
  assert.throws(() => T.as('p1', { type: 'map.move', who: `pc:${bram.id}`, zone: 'gate arch', x: 5, y: start.y }), /feet of movement.*Dash doubles it/);
  T.as('p1', { type: 'map.dash', who: `pc:${bram.id}` });
  assert.equal(T.s.fight.used.action, true);
  T.as('p1', { type: 'map.move', who: `pc:${bram.id}`, zone: 'gate arch', x: 5, y: start.y });
  assert.equal(at(T, 'Bram').zone, 'gate-arch');
  assert.ok(T.s.fight.used.moved > 30 && T.s.fight.used.moved <= 60);
  assert.throws(() => T.as('p1', { type: 'map.dash', who: `pc:${bram.id}` }), /already used their action/);
});

test('the AI Director moves a monster up to a character; leaving its reach invites an opportunity attack', () => {
  const T = table();
  const bram = hero(T, 'p1', 'Bram');
  T.host({ type: 'site.move', siteId: 'gate' });
  T.host({ type: 'fight.start', autoRoll: true });
  const s1 = foeKey(T, 'Sentry 1');
  T.ai({ type: 'map.move', who: 'Sentry 1', engage: 'Bram' });
  const a = at(T, s1); const b = at(T, 'Bram');
  assert.equal(a.zone, b.zone);
  assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1);
  assert.match(T.s.story.at(-1).text, /Sentry 1 moves to Path and closes in on Bram/);
  for (let i = 0; i < 6 && T.s.fight.order[T.s.fight.turn].key !== `pc:${bram.id}`; i++) T.host({ type: 'fight.next' });
  T.as('p1', { type: 'map.move', who: `pc:${bram.id}`, zone: 'gate arch' });
  assert.ok(T.s.story.some((e) => /Bram moves out of Sentry 1's reach: Sentry 1 may make an opportunity attack/.test(e.text)));
});

test('Disengage: no opportunity attack', () => {
  const T = table();
  const bram = hero(T, 'p1', 'Bram');
  T.host({ type: 'site.move', siteId: 'gate' });
  T.host({ type: 'fight.start', autoRoll: true });
  T.ai({ type: 'map.move', who: 'Sentry 1', engage: 'Bram' });
  for (let i = 0; i < 6 && T.s.fight.order[T.s.fight.turn].key !== `pc:${bram.id}`; i++) T.host({ type: 'fight.next' });
  T.as('p1', { type: 'map.dash', who: `pc:${bram.id}`, kind: 'disengage' });
  T.as('p1', { type: 'map.move', who: `pc:${bram.id}`, zone: 'gate arch' });
  assert.ok(!T.s.story.some((e) => /opportunity attack/.test(e.text)));
});

test('a monster the AI Director sends too far stops where its movement runs out', () => {
  const T = table();
  hero(T, 'p1', 'Bram');
  T.host({ type: 'site.move', siteId: 'gate' });
  T.host({ type: 'fight.start', autoRoll: true });
  T.ai({ type: 'map.move', who: 'Sentry 2', zone: 'path', x: 0, y: 5 }); // wall walk -> gate arch -> path: close enough
  assert.equal(at(T, foeKey(T, 'Sentry 2')).zone, 'path');
  // From the path to the far tower is path -> arch -> yard -> tower: too far for a goblin in one turn.
  T.ai({ type: 'map.move', who: 'Sentry 2', zone: 'far tower' });
  assert.notEqual(at(T, foeKey(T, 'Sentry 2')).zone, 'far-tower');
  assert.match(T.s.map.lastNote, /can only get as far as/);
});

test('the DM edits zones, adds a battle map and switches maps off; bad pictures are refused', () => {
  const T = table();
  hero(T, 'p1', 'Bram');
  T.host({ type: 'map.zones', zones: [{ name: 'Bridge' }, { name: 'Ford', tags: ['water', 'difficult'] }] });
  assert.equal(at(T, 'Bram').zone, 'bridge');
  T.host({ type: 'map.grid', zoneId: 'ford', cols: 8, rows: 5, walls: [[1, 0, 1, 4], ['x']] });
  assert.deepEqual(T.s.map.grids['road/ford'], { cols: 8, rows: 5, walls: [[1, 0, 1, 4]], doors: [] });
  assert.throws(() => T.host({ type: 'map.travel', url: 'https://evil.example/x.png', w: 10, h: 10 }), /could not be used/);
  T.host({ type: 'map.travel', url: '/maps/0123456789abcdef0123.png', w: 1600, h: 1000 });
  assert.equal(T.s.map.travel.w, 1600);
  T.host({ type: 'map.site', url: '/maps/0123456789abcdef0123.png', w: 1200, h: 600, cols: 24, rows: 12, split: true });
  assert.equal(T.s.map.zones.road.length, 8);
  assert.equal(at(T, 'Bram').zone, 'area-a1');
  T.host({ type: 'map.show', grid: false, travel: false });
  assert.deepEqual(T.s.map.show, { travel: false, zones: true, grid: false, reach: false });
  assert.throws(() => T.as('p1', { type: 'map.show', grid: true }), RuleError);
  T.host({ type: 'map.pos', siteId: 'gate', x: 0.7, y: 0.2 });
  assert.deepEqual(T.s.map.pos.gate, { x: 0.7, y: 0.2 });
});

test('an old saved game with no map gets one on its next change', () => {
  const T = table();
  hero(T, 'p1', 'Bram');
  delete T.s.map;
  T.host({ type: 'time.pass', hours: 1 });
  assert.ok(T.s.map && T.s.map.at[`pc:${Object.keys(T.s.pcs)[0]}`]);
});

test('a melee attack steps up to its target; with the reach rules on, only within the attacker\'s movement', () => {
  const T = table();
  const bram = hero(T, 'p1', 'Bram');
  T.host({ type: 'site.move', siteId: 'gate' });
  T.host({ type: 'fight.start', autoRoll: true });
  for (let i = 0; i < 6 && T.s.fight.order[T.s.fight.turn].key !== `pc:${bram.id}`; i++) T.host({ type: 'fight.next' });
  const s1 = Object.values(T.s.foes).find((f) => f.name === 'Sentry 1');
  // Rules off: the map follows the story, Bram closes in and swings.
  T.as('p1', { type: 'attack', pcId: bram.id, attack: bram.attacks.find((x) => x.melee).id, target: `foe:${s1.id}` });
  const a = at(T, 'Bram'); const b = at(T, `foe:${s1.id}`);
  assert.equal(a.zone, b.zone);
  assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1);
  assert.ok(T.s.story.some((e) => /Bram moves to Wall walk and closes in on Sentry 1/.test(e.text)));
});

test('with the reach rules on, a target too far to reach this turn is refused, and a monster cannot cross the map and strike', () => {
  const T = table();
  const bram = hero(T, 'p1', 'Bram');
  T.host({ type: 'site.move', siteId: 'gate' });
  T.host({ type: 'map.show', reach: true });
  T.host({ type: 'fight.start', autoRoll: true });
  T.ai({ type: 'map.move', who: 'Sentry 2', zone: 'far tower', x: 5, y: 5 });
  for (let i = 0; i < 6 && T.s.fight.order[T.s.fight.turn].key !== `pc:${bram.id}`; i++) T.host({ type: 'fight.next' });
  const s2 = Object.values(T.s.foes).find((f) => f.name === 'Sentry 2');
  assert.throws(() => T.as('p1', { type: 'attack', pcId: bram.id, attack: bram.attacks.find((x) => x.melee).id, target: `foe:${s2.id}` }), /out of reach.*feet of movement/);
  for (let i = 0; i < 6 && T.s.fight.order[T.s.fight.turn].key !== `foe:${s2.id}`; i++) T.host({ type: 'fight.next' });
  // The AI Director's monster too far to strike closes in instead (the Engine fixes the call and says so).
  const rollsBefore = T.s.rolls.length;
  const zoneBefore = T.s.map.at[`foe:${s2.id}`].zone;
  T.ai({ type: 'foe.act', foeId: s2.id, action: 'Scimitar', targets: [bram.id] });
  assert.equal(T.s.rolls.length, rollsBefore, 'no attack roll from so far away');
  assert.notEqual(T.s.map.at[`foe:${s2.id}`].zone, zoneBefore, 'it moved toward Bram');
  // Its shortbow reaches, but not at its best from so far.
  T.ai({ type: 'foe.act', foeId: s2.id, action: 'Shortbow', targets: [bram.id] });
  assert.equal(T.s.rolls.at(-1).kind, 'attack');
});

test('the AI Director: move_creature by names, a note for a zone that is not there, and the MAP in its briefing', () => {
  const T = table();
  const bram = hero(T, 'p1', 'Bram');
  T.host({ type: 'site.move', siteId: 'gate' });
  T.host({ type: 'foe.reveal' });
  const tb = toolbox({ state: T.s, adventure: ADV, srd, rng: makeRng(1), now: 1 });
  const r1 = tb.run('move_creature', { who: ['Sentry 1'], to_zone: 'the yard' });
  assert.ok(!r1.refused && !r1.note, JSON.stringify(r1));
  assert.match(r1.map, /Yard: Sentry 1/);
  const r2 = tb.run('move_creature', { who: 'Sentry 2', to_zone: 'the moon' });
  assert.match(r2.note, /no zone called "the moon".*Zones: Path, Gate arch, Wall walk, Yard, Far tower/);
  const r3 = tb.run('move_creature', { who: ['Sentry 2'], engage: 'Bram' });
  assert.ok(!r3.note, JSON.stringify(r3));
  const b = briefing(tb.state, ADV, srd, { reason: 'test' });
  assert.match(b, /MAP \(zones about 30 feet across/);
  assert.match(b, /- Wall walk \(high ground, half cover \(\+2 AC\)\): nobody\. the sentries sit here/);
  assert.match(b, /Within melee reach: Bram and Sentry 2/);
  assert.match(b, /Ways between zones: .*Gate arch–Wall walk/);
  void bram;
});

test('the AI Director: with the reach rules on, a monster too far to strike charges instead', () => {
  const T = table();
  const bram = hero(T, 'p1', 'Bram');
  T.host({ type: 'site.move', siteId: 'gate' });
  T.host({ type: 'map.show', reach: true });
  T.host({ type: 'fight.start', autoRoll: true });
  T.ai({ type: 'map.move', who: 'Sentry 1', zone: 'far tower', x: 5, y: 5 });
  const s1 = Object.values(T.s.foes).find((f) => f.name === 'Sentry 1');
  for (let i = 0; i < 6 && T.s.fight.order[T.s.fight.turn].key !== `foe:${s1.id}`; i++) T.host({ type: 'fight.next' });
  const tb = toolbox({ state: T.s, adventure: ADV, srd, rng: makeRng(1), now: 1 });
  const r = tb.run('monster_action', { monster: 'Sentry 1', action: 'Scimitar', targets: ['Bram'] });
  assert.ok(!r.refused, r.refused);
  assert.match(r.assumed, /too far from Bram to attack this turn, so it closed in/);
  assert.notEqual(tb.state.map.at[`foe:${s1.id}`].zone, 'far-tower');
  void bram;
});
