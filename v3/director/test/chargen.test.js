import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHand, preview, SEATS } from '../data/chargen/build.js';
import { ATLAS } from '../data/chargen/model.generated.js';
import { scenario } from '../data/first-carve.js';
import { newSession, apply, restart } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));
const KEYS = ['VSC', 'DFF', 'RTC', 'OSM', 'AFF'];
// The choices that describe The First Carve's four Hands. Each printed Hand names one extra Pathway;
// the Atlas asks for two, so the second is the first one left over (it changes no number compared here).
const HANDS = {
  wall: { lineage: 'Immunan', phenotype: 'Phagocyte Guard', array: { VSC: 4, DFF: 3, RTC: 2, OSM: 3, AFF: 4 }, kit: { apparatus: 'Chitin Flail', graft: 'Lipid Weave Wrap' } },
  ledger: { lineage: 'Epithalian', phenotype: 'Amino Acid Smith', array: { VSC: 4, DFF: 3, RTC: 4, OSM: 3, AFF: 2 }, kit: {} },
  rider: { lineage: 'Flagellan', phenotype: 'Current Rider', array: { VSC: 2, DFF: 4, RTC: 3, OSM: 4, AFF: 3 }, kit: { apparatus: 'Peptide Blade', graft: 'Lipid Weave Wrap' } },
  eyes: { lineage: 'Lysosan', phenotype: 'Pathogen Scout', array: { VSC: 3, DFF: 4, RTC: 3, OSM: 4, AFF: 2 }, kit: {} },
};
const withExtras = (h) => {
  const ph = ATLAS.phenotypes.find((p) => h.phenotype.endsWith(p.n)); const granted = ph.p || {};
  const extras = Object.keys(h.pathways).filter((n) => !granted[n]);
  extras.push(ATLAS.pathways.map((p) => p.n).find((n) => !granted[n] && !extras.includes(n)));
  return { ...HANDS[h.id], extras };
};

test('chargen parity: the Atlas maths rebuilds every printed First Carve Hand, number for number', () => {
  for (const h of scenario.hands) {
    const b = buildHand(withExtras(h), { seat: h.id });
    for (const k of ['mi', 'atp', 'pp', 'mt', 'flow', 'countdown', 'soak', 'hull']) assert.equal(b[k], h[k], `${h.id} ${k}`);
    for (const k of KEYS) assert.equal(b.base[k], h.base[k], `${h.id} ${k}`);
    if (h.id === 'wall' || h.id === 'rider') assert.equal(b.substrate, h.substrate, `${h.id} purse`);
  }
});

test('chargen refuses an illegal build, in plain words', () => {
  const bad = { lineage: 'Barophil', phenotype: 'Current Rider', array: { VSC: 5, DFF: 4, RTC: 3, OSM: 3, AFF: 2 }, extras: ['Vigour'], kit: { apparatus: 'Pressure Ram', graft: 'Full Testate Carapace' } };
  const { problems } = preview(bad, 1);
  assert.ok(problems.some((p) => /4,4,3,3,2/.test(p)));
  assert.ok(problems.some((p) => /two additional Pathways/.test(p)));
  assert.ok(problems.some((p) => /Flagellan Phenotype/.test(p)));
  assert.ok(problems.some((p) => /kit costs/.test(p)));
  assert.throws(() => buildHand(bad, { seat: 'wall' }));
  assert.equal(SEATS.length, 4);
});

test('random legal builds all seat cleanly', () => {
  let r = 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const arr = [4, 4, 3, 3, 2];
  for (let i = 0; i < 200; i++) {
    const lin = ATLAS.lineages[Math.floor(rnd() * 6)];
    const phs = ATLAS.phenotypes.filter((p) => p.t === lin.n); const ph = phs[Math.floor(rnd() * phs.length)];
    const sh = arr.slice().sort(() => rnd() - .5); const array = Object.fromEntries(KEYS.map((k, j) => [k, sh[j]]));
    const free = ATLAS.pathways.map((p) => p.n).filter((n) => !(ph.p || {})[n]).sort(() => rnd() - .5);
    const b = buildHand({ lineage: lin.n, phenotype: ph.n, array, extras: free.slice(0, 2), kit: {} }, { seat: 'eyes' });
    assert.ok(b.mi > 0 && b.pp >= 3 && b.mt >= 10, `${lin.n} ${ph.n}`);
  }
});

function seated() {
  const rng = makeRng(3); let s = newSession(scenario);
  const ctx = (role, pid) => ({ role, pid, rng, now: 0, scenario, bestiary });
  const as = (pid, a) => { s = apply(s, a, ctx('player', pid)); };
  const host = (a) => { s = apply(s, a, ctx('host', null)); };
  as('p1', { type: 'join', name: 'Roly' }); as('p1', { type: 'zero.agree' });
  as('p2', { type: 'join', name: 'Sam' }); as('p2', { type: 'zero.agree' });
  return { as, host, get s() { return s; } };
}

test('org.build seats a custom organism in a free seat, keeps the seat\'s story hook, and refuses a taken seat', () => {
  const t = seated();
  const c = { lineage: 'Barophil', phenotype: 'Osmotic Brute', array: { VSC: 4, DFF: 3, RTC: 2, OSM: 3, AFF: 4 }, extras: ['Chemoreception', 'Signal Discourse'], kit: { apparatus: 'Osmotic Maul' }, name: 'Gorm the Unmoved' };
  t.as('p1', { type: 'org.build', seat: 'wall', choices: c });
  const o = t.s.organisms.wall;
  assert.equal(o.custom, true); assert.equal(o.name, 'Gorm the Unmoved'); assert.equal(o.playerId, 'p1');
  assert.match(o.phenotype, /Barophil Osmotic Brute/);
  assert.equal(o.tie, scenario.hands[0].tie);
  assert.equal(o.weapons[0].name, 'Osmotic Maul');
  assert.throws(() => t.as('p2', { type: 'org.build', seat: 'wall', choices: c }), /already being played/);
  assert.throws(() => t.as('p2', { type: 'org.build', seat: 'eyes', choices: { ...c, array: { VSC: 5, DFF: 5, RTC: 5, OSM: 5, AFF: 5 } } }));
  t.host({ type: 'zero.set', custom: false });
  assert.throws(() => t.as('p2', { type: 'org.build', seat: 'eyes', choices: c }), /turned off/);
  const again = restart(t.s, scenario, { keepPlayers: true });
  assert.equal(again.organisms.wall.custom, true, 'a new game in the same Vector keeps the build');
  assert.equal(again.organisms.wall.name, 'Gorm the Unmoved');
});

test('starting higher: Growth choices must all be spent, Adaptations cost Substrate, Bursts respect the Tier', () => {
  const c = { lineage: 'Barophil', phenotype: 'Osmotic Brute', array: { VSC: 4, DFF: 3, RTC: 2, OSM: 3, AFF: 4 }, extras: ['Chemoreception', 'Signal Discourse'], kit: { apparatus: 'Osmotic Maul' } };
  assert.throws(() => buildHand(c, { level: 4, seat: 'wall' }), /Spend 3 more Synthesis Choices/);
  const l4 = buildHand({ ...c, grown: { VSC: 1 }, rankBumps: { 'Pressure Tolerance': 2 } }, { level: 4, seat: 'wall' });
  assert.equal(l4.base.VSC, 6);
  assert.equal(l4.substrate, 40 - 25);
  // 40 S at Level 4: a 25 S maul plus a 60 S Adaptation is too dear
  assert.throws(() => buildHand({ ...c, grown: { VSC: 1 }, rankBumps: { 'Pressure Tolerance': 1 }, adaptations: ['Denser Wall'] }, { level: 4, seat: 'wall' }), /cost 85 S and you have 40 S/);
  // Tier II Bursts open at Level 6
  assert.throws(() => buildHand({ ...c, grown: { VSC: 1, AFF: 1 }, bursts: ['Bridge Fold'] }, { level: 4, seat: 'wall' }), /Tier 2/);
  const g7 = { ...c, grown: { VSC: 1, AFF: 1 }, rankBumps: { Vigour: 2 }, bursts: ['Bridge Fold'] };
  const l7 = buildHand({ ...g7, adaptations: ['Denser Wall'] }, { level: 7, seat: 'wall' });
  const l7b = buildHand({ ...g7, rankBumps: { Vigour: 3 } }, { level: 7, seat: 'wall' });
  assert.equal(l7.substrate, 150 - 25 - 60);
  assert.equal(l7.mi - l7b.mi, 6, 'Denser Wall adds 6 MI');
  assert.ok(l7.kit.some((k) => /Burst: Bridge Fold/.test(k)));
  assert.ok(l7.kit.some((k) => /Adaptation: Denser Wall/.test(k)));
  assert.throws(() => buildHand({ ...g7, bursts: [], adaptations: ['Graft Mastery'] }, { level: 7, seat: 'wall' }), /Specimen/);
  assert.throws(() => buildHand({ ...c, bursts: ['Peptide Snare'] }, { level: 1, seat: 'wall' }), /Synthesis Choices spent/);
});
