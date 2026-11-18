import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newSession, apply, restart, viewFor } from '../engine/ledger.js';
import { parseSeed, seedHere } from '../engine/seeds.js';
import { makeRng } from '../engine/dice.js';
import { scenario } from '../data/first-carve.js';
import { loadBestiary } from '../data/bestiary-all.js';
import { briefing } from '../brain/director.js';
import { toolbox } from '../brain/tools.js';
import { createDirector } from '../brain/manager.js';
import { seedText } from '../brain/seedwriter.js';

const bestiary = loadBestiary();
const rng = makeRng(5);
const ctx = (role, pid) => ({ role, pid, rng, now: 0, scenario, bestiary });
const t1 = Object.values(bestiary).find((b) => b.tier === 1 && b.id !== 'gnaw-swarm');
const SEED = `# Seed: Vey's Crew
Fits: The First Carve, any site
Tone: a rival who is almost friendly

## People
- Captain Ossa Vey (person): runs a rival salvage skiff. She wants the Gut Stone before the Cohort. She fears the Guild's claim-runners.
- Tib (person): Vey's nephew. He wants out.

## Places
- Vey's skiff (place): moored at the wound lip, salt barrels on deck.

## Threads
- The unpaid rite (thread): Vey owes the Ash a corpse-rite.

## Encounter
- 2 ${t1.id} at Mid: Vey's crew baited them to slow the Cohort.

## Secrets
- Vey already has half the serial.

## How it can end
- Vey takes a deal.
- Vey is arrested at the arch.
`;

test('a seed is read into people, places, threads, one encounter, secrets and endings', () => {
  const s = parseSeed(SEED, { bestiary, scenario });
  assert.deepEqual(s.problems, []);
  assert.equal(s.title, "Vey's Crew");
  assert.equal(s.fits.vector, 'The First Carve');
  assert.equal(s.cards.length, 4);
  assert.equal(s.cards[0].name, 'Captain Ossa Vey');
  assert.equal(s.cards[0].kind, 'person');
  assert.equal(s.cards[0].facts.length, 3);
  assert.equal(s.cards[2].kind, 'place');
  assert.deepEqual({ id: s.encounter.blockId, n: s.encounter.count, band: s.encounter.band }, { id: t1.id, n: 2, band: 'mid' });
  assert.equal(s.secrets.length, 1);
  assert.equal(s.endings.length, 2);
});

test('the check: a made-up creature, too many, too tough, no title, prices', () => {
  const tough = Object.values(bestiary).find((b) => b.tier >= 4);
  const bad = parseSeed(`## People\n- Vey (person): pays 40 S for the serial.\n## Encounter\n- 5 ${tough.id} at Near: a horde\n`, { bestiary, scenario });
  assert.ok(bad.problems.some((p) => /title/.test(p)));
  assert.ok(bad.problems.some((p) => /Tier/.test(p)));
  assert.ok(bad.problems.some((p) => /one to three/.test(p)));
  assert.ok(bad.warnings.some((w) => /price, a reward or damage/.test(w)));
  const fake = parseSeed('# Seed: X\n## People\n- A (person): b.\n## Encounter\n- 1 space-dragon at Far: why not\n', { bestiary, scenario });
  assert.ok(fake.problems.some((p) => /not a creature in the Lytic Bestiary/.test(p)));
  // A creature named in words is found.
  const named = parseSeed(`# Seed: X\n## People\n- A (person): b.\n## Encounter\n- 1 ${t1.name} at Far: why not\n`, { bestiary, scenario });
  assert.equal(named.encounter.blockId, t1.id);
});

test('seeds: the host saves one, players never see it, it survives a new game, and the Director reads it only with ad-lib on', () => {
  let s = newSession(scenario);
  assert.throws(() => apply(s, { type: 'seed.save', text: '## People\n- A (person): b.' }, ctx('host', null)), /needs fixing first/);
  assert.throws(() => apply(s, { type: 'seed.save', text: SEED }, { ...ctx('host', null), ai: true }), /host's/);
  s = apply(s, { type: 'seed.save', text: SEED }, ctx('host', null));
  const id = Object.keys(s.seeds)[0];
  assert.equal(s.seeds[id].on, true);
  assert.equal(viewFor(s, 'player', 'p1').seeds, undefined, 'secrets stay off player screens');
  assert.ok(!/Vey's Crew/.test(briefing(s, scenario, bestiary, {})), 'ad-lib off: not in the briefing');
  s = apply(s, { type: 'improv.set', improv: 'adlib' }, ctx('host', null));
  const b = briefing(s, scenario, bestiary, {});
  assert.match(b, /YOUR HOST'S STORY SEEDS/);
  assert.match(b, /Captain Ossa Vey \(person\)/);
  assert.match(b, /SECRET .*half the serial/);
  assert.match(b, new RegExp(`seed "${id}"`));
  s = apply(s, { type: 'seed.toggle', id, on: false }, ctx('host', null));
  assert.ok(!seedHere(s.seeds[id], s, scenario));
  s = apply(s, { type: 'seed.toggle', id, on: true }, ctx('host', null));
  const next = restart(s, scenario, { keepPlayers: true });
  assert.ok(next.seeds[id], 'the library carries into a new game');
  assert.equal(next.improv, 'adlib');
  s = apply(s, { type: 'seed.remove', id }, ctx('host', null));
  assert.deepEqual(s.seeds, {});
});

test('a seed for another Vector waits; a seed for one site comes only there', () => {
  let s = apply(newSession(scenario), { type: 'improv.set', improv: 'adlib' }, ctx('host', null));
  s = apply(s, { type: 'seed.save', text: SEED.replace('The First Carve, any site', 'The Ninth Shift, any site') }, ctx('host', null));
  const other = Object.values(s.seeds)[0];
  assert.ok(other.warnings.some((w) => /waits until/.test(w)));
  assert.equal(seedHere(other, s, scenario), false);
  s = apply(s, { type: 'seed.save', text: SEED.replace('The First Carve, any site', 'The First Carve, The Soft Field') }, ctx('host', null));
  const soft = Object.values(s.seeds).find((x) => x.fits.site === 'The Soft Field');
  assert.equal(seedHere(soft, s, scenario), false, 'not at the Toll-Vent');
  s = apply(s, { type: 'scene.set', siteId: 'soft-field' }, ctx('host', null));
  assert.equal(seedHere(soft, s, scenario), true);
});

test('the Director brings a seed\'s encounter with invent_encounter, once', () => {
  let s = apply(newSession(scenario), { type: 'improv.set', improv: 'adlib' }, ctx('host', null));
  s = apply(s, { type: 'seed.save', text: SEED }, ctx('host', null));
  const id = Object.keys(s.seeds)[0];
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  const r = T.run('invent_encounter', { block: t1.id, count: 2, band: 'mid', why: "Vey's crew baited them", seed: id });
  assert.ok(!r.refused, JSON.stringify(r));
  assert.match(briefing(T.state, scenario, bestiary, {}), /cannot come here/);
});

test('the Director writes a seed from an idea, and tries once more when the first does not pass the check', async () => {
  const replies = ['Here you go:\n```\n# Seed: Half a seed\n## Encounter\n- 9 space-dragon at Far: oops\n```', `${SEED}`];
  const sent = [];
  const makeProvider = () => ({
    id: 'scripted', model: 'scripted', listModels: async () => [{ id: 'gemini-9.9-flash', name: 'Scripted' }],
    start: () => ({ send: async (t) => { sent.push(t); return { text: replies.shift() || '', calls: [], usage: { in: 1, out: 1 } }; }, results: async () => ({ text: '', calls: [], usage: { in: 1, out: 1 } }) }),
  });
  const d = createDirector({ getState: () => newSession(scenario), commit: () => {}, scenario, bestiary, rng, saveDir: mkdtempSync(join(tmpdir(), 'oxseed-')), onChange: () => {}, makeProvider });
  await d.op({ op: 'config', mode: 'copilot', apiKey: 'k' });
  await d.op({ op: 'seed.write', idea: 'a rival salvage captain who wants the Gut Stone' });
  for (let i = 0; i < 100 && (!d.view('host').seed || d.view('host').seed.busy); i++) await new Promise((r) => setTimeout(r, 5));
  const v = d.view('host').seed;
  assert.equal(v.problems.length, 0, JSON.stringify(v));
  assert.match(v.text, /^# Seed: Vey's Crew/);
  assert.match(sent[0], /THE HOST'S IDEA OR STORY:\na rival salvage captain/);
  assert.match(sent[0], new RegExp(t1.id));
  assert.match(sent[1], /does not pass the check/);
  assert.equal(seedText('blah\n```md\n# Seed: A\nx\n```\nthanks'), '# Seed: A\nx');
});

test('a named character from a printed Vector is not a creature to invent', () => {
  const named = Object.values(bestiary).find((b) => /\(/.test(b.name) && b.tier <= 2);
  const s = parseSeed(`# Seed: X\n## People\n- A (person): b.\n## Encounter\n- 1 ${named.id} at Near: a cameo\n`, { bestiary, scenario });
  assert.ok(s.problems.some((p) => /named character/.test(p)), JSON.stringify(s.problems));
});
