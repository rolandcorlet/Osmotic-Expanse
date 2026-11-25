// The checks before any GPU time: the fight simulation, replay and fuzz of tool calls, and bench scripts
// generated from an adventure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../engine/dice.js';
import { simulatePlace, simulateAdventure, partyOf, simText } from '../engine/simulate.js';
import { generateScript } from '../engine/script-gen.js';
import { recordTurn, replayRecord, fuzzTools, packState } from '../brain/replay.js';
import { fuzzGame } from '../brain/fuzz-game.js';
import { directorTurn } from '../brain/director.js';
import { readFileSync } from 'node:fs';
import { prepareSrd } from '../engine/library.js';
import { ADVENTURES } from '../data/adventures/index.js';
import { srd, adventure, table, hero } from './helpers.js';

const srdAll = JSON.parse(readFileSync(new URL('../../data/srd.json', import.meta.url), 'utf8'));
prepareSrd(srdAll, { adventures: ADVENTURES });

test('the simulation plays a place\'s fight through the Engine and counts wins, wipes and downs', () => {
  assert.deepEqual(partyOf('fighter:3,cleric:2'), [{ cls: 'fighter', level: 3 }, { cls: 'cleric', level: 2 }]);
  assert.equal(partyOf('5x2').length, 2);
  const r = simulatePlace({ adventure, srd, siteId: 'mill-road', party: partyOf('fighter:3,cleric:3'), runs: 8 });
  assert.equal(r.runs, 8);
  assert.ok(r.won >= 6, `two 3rd-level heroes beat the scouts (${r.won}/8)`);
  assert.ok(r.rounds >= 1);
  // A hopeless fight shows up as a wipe.
  const hopeless = { ...adventure, sites: [{ id: 'pit', name: 'The pit', exits: [], foes: [{ monster: 'ogre', count: 3, name: 'Ogre', scale: false }] }], party: { size: 1, level: 1 } };
  const h = simulateAdventure({ adventure: hopeless, srd, party: partyOf('fighter:1'), runs: 6, scale: 'off' });
  assert.match(simText(h).text, /WIPE/);
});

test('a script written from the adventure walks its places, probes its checks, fights and finishes quests', () => {
  const sc = generateScript(adventure, { places: 8, heroes: 2 });
  assert.ok(sc[0].start);
  const says = sc.filter((x) => x.say);
  assert.ok(says.some((x) => x.expect.includes('move_party') && /Mill Road north/.test(x.say)), 'goes north by the exit\'s own words');
  assert.ok(says.some((x) => x.expect.includes('start_combat') && /Goblin scout/.test(x.say)));
  assert.ok(sc.some((x) => x.fight === 'sanctum'), 'reaches the sanctum and fights there');
  assert.ok(says.some((x) => x.expect.includes('complete_quest') && x.at === 'sanctum'), 'the vanished are found there');
  assert.ok(says.every((x) => ['p1', 'p2'].includes(x.pid)));
  // Every line's place is one the walk has reached by then.
  const seen = new Set([adventure.sites[0].id]);
  for (const x of sc) { if (x.at) assert.ok(seen.has(x.at), `${x.say} at ${x.at}`); if (x.gen && x.gen.startsWith('arrive')) seen.add(x.gen.split(' ')[1]); }
});

test('replay: a recorded call that worked and is now refused is a regression; fuzzing finds no crash', async () => {
  const T = table(21);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  T.host({ type: 'narrate', text: 'The mill. Bryn?' });
  // A turn as the bench records it, from a scripted model.
  const provider = { start() { let n = 0; const replies = [{ calls: [{ id: 'a', name: 'reveal_monsters', args: {} }, { id: 'b', name: 'start_combat', args: {} }] }, { text: 'Goblins! Bryn, what do you do?' }]; return { send() { return Promise.resolve({ text: '', calls: [], usage: { in: 1, out: 1 }, ...replies[Math.min(n++, 1)] }); }, results() { return Promise.resolve({ text: '', calls: [], usage: { in: 1, out: 1 }, ...replies[Math.min(n++, 1)] }); } }; } };
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1), reason: 'test' });
  const rec = recordTurn({ part: 1, run: 1, label: 'step 1', reason: 'test', before: T.s, calls: out.calls, adventureId: 'lantern' });
  assert.deepEqual(rec.calls.map((c) => [c.name, c.was]), [['reveal_monsters', 'ok'], ['start_combat', 'ok']]);
  const again = replayRecord(JSON.parse(JSON.stringify(rec)), { adventure, srd });
  assert.ok(again.every((c) => !c.regression), 'today\'s code answers the same way');
  // A call that "worked" then and is refused now is caught.
  const broken = { ...rec, calls: [{ name: 'move_party', args: { place: 'the moon' }, was: 'ok', text: '' }] };
  assert.ok(replayRecord(broken, { adventure, srd })[0].regression);
  assert.equal(typeof packState(T.s), 'string');
  // The fuzz: every tool, many bad arguments, no crash and no empty answer.
  for (const g of fuzzGame(srdAll)) {
    const f = fuzzTools(g.s, { adventure: g.adventure, srd: srdAll });
    assert.ok(f.cases > 500);
    assert.deepEqual(f.bad, [], g.adventure.id);
  }
});
