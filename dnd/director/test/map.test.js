import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../engine/map.js';

test('zones: ids, boxes and a chain of links when none are written', () => {
  const z = M.normZones([{ name: 'Gate arch' }, { name: 'Wall walk', tags: ['high-ground', 'half-cover', 'nonsense'] }, { name: 'Gate arch' }]);
  assert.deepEqual(z.map((x) => x.id), ['gate-arch', 'wall-walk', 'gate-arch-2']);
  assert.deepEqual(z[0].links, ['wall-walk']);
  assert.deepEqual(z[1].links.sort(), ['gate-arch', 'gate-arch-2']);
  assert.deepEqual(z[1].tags, ['high-ground', 'half-cover']);
  assert.equal(z[0].entry, true);
  for (const x of z) { assert.ok(x.x >= 0 && x.x + x.w <= 1.0001); assert.ok(x.y >= 0 && x.y + x.h <= 1.0001); assert.equal(x.cols, 6); }
});

test('zones: links written by name are made both ways', () => {
  const z = M.normZones([{ name: 'Road' }, { name: 'Gate', links: ['road', 'Yard'] }, { name: 'Yard' }, { name: 'Tower door', links: ['yard'] }]);
  assert.deepEqual(M.zoneOf(z, 'road').links, ['gate']);
  assert.deepEqual(M.zoneOf(z, 'yard').links.sort(), ['gate', 'tower-door']);
  assert.deepEqual(M.zonePath(z, 'road', 'tower-door'), ['road', 'gate', 'yard', 'tower-door']);
  assert.equal(M.findZone(z, 'the tower door').id, 'tower-door');
  assert.equal(M.findZone(z, 'YARD').id, 'yard');
  assert.equal(M.findZone(z, 'moon'), null);
});

test('battle grid: diagonal steps count as one square, walls block, enemies cannot be passed', () => {
  const g = { cols: 6, rows: 6, walls: [] };
  const d = M.reach(g, [[0, 0]]);
  assert.equal(d.get(5 * 6 + 5), 5); // the far corner is five diagonal steps
  // A wall down the middle with a gap at the bottom.
  const w = { cols: 6, rows: 6, walls: [[3, 0, 3, 5]] };
  const dw = M.reach(w, [[2, 0]]);
  assert.equal(dw.get(0 * 6 + 3), 11); // round the end of the wall: down 5, across, up 5
  // An enemy in the doorway.
  const blocked = new Set([5 * 6 + 3]);
  const db = M.reach(w, [[2, 0]], { blocked });
  assert.equal(db.get(0 * 6 + 3), undefined);
  // Squeezing diagonally through the corner where two walls meet is not allowed.
  const corner = { cols: 3, rows: 3, walls: [[1, 0, 1, 1], [1, 1, 3, 1]] };
  const dc = M.reach(corner, [[0, 0]]);
  assert.notEqual(dc.get(1 * 3 + 1), 1);
});

test('moving from zone to zone: walk to the side, step across, carry on', () => {
  const zones = M.normZones([{ name: 'West', x: 0, y: 0.2, w: 0.3, h: 0.6 }, { name: 'East', x: 0.5, y: 0.2, w: 0.3, h: 0.6 }]);
  const m = M.newMap();
  assert.equal(M.sideToward(zones[0], zones[1]), 'right');
  // From the left edge of West (x 0) to the left edge of East: 5 steps to the right edge, 1 across.
  assert.equal(M.stepsBetween(m, 's', zones, { zone: 'west', x: 0, y: 2 }, { zone: 'east', x: 0, y: 2 }), 6);
  // Further into East costs more.
  assert.equal(M.stepsBetween(m, 's', zones, { zone: 'west', x: 0, y: 2 }, { zone: 'east', x: 3, y: 2 }), 9);
  // Not linked: no way.
  const apart = M.normZones([{ name: 'A', links: [] }, { name: 'B', links: [] }, { name: 'C', links: ['b'] }]);
  assert.equal(M.stepsBetween(m, 's', apart, { zone: 'a', x: 0, y: 0 }, { zone: 'b', x: 0, y: 0 }), null);
});

test('movement left this turn: speed, Dash, prone, difficult ground, conditions', () => {
  assert.deepEqual(M.budget({ conds: [] }, { speed: 30, used: { moved: 10 } }), { left: 20, per: 5, speed: 30, total: 30 });
  assert.equal(M.budget({ conds: [] }, { speed: 30, used: { moved: 10, dash: true } }).left, 50);
  assert.equal(M.budget({ conds: ['prone'] }, { speed: 30, used: {} }).per, 10);
  assert.equal(M.budget({ conds: [] }, { speed: 30, used: {}, zoneTags: ['difficult'] }).per, 10);
  assert.equal(M.budget({ conds: ['grappled'] }, { speed: 30, used: {} }).left, 0);
  assert.equal(M.budget({ conds: [], exhaustion: 2 }, { speed: 30, used: {} }).left, 15);
  assert.equal(M.budget({ conds: [] }, { speed: 30 }).left, null);
  assert.equal(M.speedOf({ speed: 'ignored' }, { speed: '40 ft., climb 30 ft.' }), 40);
  assert.equal(M.speedOf({ speed: 25 }), 25);
});

test('a Universal VTT file gives the grid, the walls (joined) and the doors', () => {
  const uvtt = {
    format: 0.3,
    resolution: { map_origin: { x: 1, y: 1 }, map_size: { x: 12, y: 8 }, pixels_per_grid: 70 },
    line_of_sight: [[{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 7, y: 1 }, { x: 7, y: 5 }], [{ x: 2, y: 2 }, { x: 2, y: 2 }]],
    portals: [{ position: { x: 5, y: 1 }, bounds: [{ x: 4.5, y: 1 }, { x: 5.5, y: 1 }], closed: true }],
    image: 'iVBORw0KGgo=',
  };
  const out = M.parseUvtt(uvtt);
  assert.equal(out.cols, 12); assert.equal(out.rows, 8); assert.equal(out.ppg, 70);
  assert.deepEqual(out.walls, [[0, 0, 6, 0], [6, 0, 6, 4]]);
  assert.deepEqual(out.doors, [[3.5, 0, 4.5, 0]]);
  assert.equal(out.image, 'iVBORw0KGgo=');
  assert.throws(() => M.parseUvtt({}), /squares/);
});

test('a site map: zones cut from the picture, each zone its own piece with its own walls', () => {
  const zones = M.zonesFromSiteMap(18, 12);
  assert.equal(zones.length, 6);
  assert.deepEqual(zones.map((z) => z.name).slice(0, 3), ['Area A1', 'Area A2', 'Area A3']);
  assert.deepEqual(M.zoneOf(zones, 'area-a1').links.sort(), ['area-a2', 'area-b1']);
  const m = M.newMap();
  m.sites.s = { url: '/maps/x.png', w: 1260, h: 840, cols: 18, rows: 12, walls: [[0, 3, 18, 3], [7, 0, 7, 12]], doors: [] };
  const g = M.gridOf(m, 's', M.zoneOf(zones, 'area-a2'));
  assert.equal(g.cols, 6); assert.equal(g.rows, 6);
  assert.deepEqual(g.walls, [[0, 3, 6, 3], [1, 0, 1, 6]]);
  assert.equal(g.img.x0, 6); assert.equal(g.img.y0, 0);
});

test('placing: the free square nearest a point', () => {
  const g = { cols: 6, rows: 6 };
  assert.deepEqual(M.freeNear(g, new Set(), ...M.anchor(g, 'left')), [0, 2]);
  assert.deepEqual(M.freeNear(g, new Set([2 * 6 + 0]), ...M.anchor(g, 'left')), [0, 3]);
  assert.ok(M.inReach({ zone: 'a', x: 1, y: 1 }, { zone: 'a', x: 2, y: 2 }));
  assert.ok(!M.inReach({ zone: 'a', x: 1, y: 1 }, { zone: 'a', x: 3, y: 2 }));
  assert.ok(M.inReach({ zone: 'a', x: 1, y: 1 }, { zone: 'a', x: 3, y: 2 }, 10));
  assert.ok(!M.inReach({ zone: 'a', x: 1, y: 1 }, { zone: 'b', x: 1, y: 1 }));
});

test('the travel map lays places out along their exits, and a placed one stays put', () => {
  const sites = [{ id: 'a', exits: [{ to: 'b' }, { to: 'c' }] }, { id: 'b', exits: [{ to: 'd' }] }, { id: 'c', exits: [] }, { id: 'd', exits: [] }, { id: 'e', map: { x: 0.9, y: 0.1 } }];
  const p = M.travelLayout(sites, { c: { x: 0.5, y: 0.95 } });
  assert.ok(p.a.x < p.b.x && p.b.x < p.d.x);
  assert.deepEqual(p.c, { x: 0.5, y: 0.95 });
  assert.deepEqual(p.e, { x: 0.9, y: 0.1 });
});

test('a wall along the side two zones share stops the step across; its door lets you through', () => {
  const m = M.newMap();
  m.sites.s = { url: '/maps/x.png', w: 840, h: 420, cols: 12, rows: 6, walls: [[6, 0, 6, 4]], doors: [[6, 4, 6, 6]] };
  const zones = M.zonesFromSiteMap(12, 6);
  assert.deepEqual(zones.map((z) => z.id), ['area-a1', 'area-a2']);
  // Row 0: the wall is in the way, so the way round is through the door at rows 4 and 5.
  const through = M.stepsBetween(m, 's', zones, { zone: 'area-a1', x: 5, y: 0 }, { zone: 'area-a2', x: 0, y: 0 });
  assert.ok(through >= 8, String(through));
  assert.equal(M.stepsBetween(m, 's', zones, { zone: 'area-a1', x: 5, y: 5 }, { zone: 'area-a2', x: 0, y: 5 }), 1);
});

test('a big battle map is cut into zones that cover all of it, never more than sixteen (28 Nov)', () => {
  for (const [c, r] of [[20, 20], [30, 30], [60, 30], [50, 50], [6, 10], [30, 45]]) {
    const z = M.zonesFromSiteMap(c, r);
    assert.ok(z.length >= 1 && z.length <= M.MAX_ZONES, `${c}x${r}: ${z.length} zones`);
    const area = z.reduce((t, x) => t + x.w * x.h, 0);
    assert.ok(Math.abs(area - 1) < 0.02, `${c}x${r} covers ${area}`);
    for (const x of z) { assert.ok(x.w * c <= M.MAX_CELLS + 0.5 && x.h * r <= M.MAX_CELLS + 0.5); }
  }
  assert.equal(M.zonesFromSiteMap(20, 20).length, 9);
});
