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
import { toolbox } from '../brain/tools.js';
import { readFileSync } from 'node:fs';
import { prepareSrd } from '../engine/library.js';
import { ADVENTURES } from '../data/adventures/index.js';
import { srd, adventure, table, hero } from './helpers.js';

const srdAll = JSON.parse(readFileSync(new URL('../../data/srd.engine.json', import.meta.url), 'utf8'));
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

test('replay: the tool calls iq3_s made in the 26 Nov bench still get the same kind of answer', () => {
  const lines = readFileSync(new URL('./replay/bench-26nov-iq3s.calls.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean);
  assert.ok(lines.length >= 20);
  let calls = 0;
  for (const line of lines) {
    const rec = JSON.parse(line);
    const adv = ADVENTURES.find((a) => a.id === rec.adventure);
    for (const c of replayRecord(rec, { adventure: adv, srd: srdAll })) { calls += 1; assert.ok(!c.regression, `${rec.label}: ${c.name} was ${c.was}, now ${c.now}: ${c.text}`); }
  }
  assert.ok(calls > 50);
});

test('a tool\'s required part under another name is read as meant, and said (bench part 4, 26 Nov)', () => {
  const T = table(24);
  hero(T, 'p1', 'Bryn');
  const tb = toolbox({ state: T.s, adventure, srd, rng: makeRng(1), now: 1 });
  const r = tb.run('add_quest', { quest: 'Find the forge that stamps the masks.' });
  assert.ok(r.ok && !r.refused, JSON.stringify(r));
  assert.match(r.assumed, /"quest" was read as add_quest's "text"/);
  assert.ok(tb.state.quests.some((q) => /forge that stamps/.test(q.text)));
  // Two parts that could be meant: nothing is guessed.
  const two = tb.run('add_quest', { goal: 'a', title: 'b' });
  assert.ok(two.refused);
  // The recorded refusal from the bench replays as a fix.
  const rec = { v: 1, adventure: 'lantern', part: 4, run: 1, label: 'step 2', state: packState(T.s), calls: [{ name: 'add_quest', args: { quest: 'Find the forge.' }, was: 'refused', text: 'Write the quest.' }] };
  assert.ok(replayRecord(rec, { adventure, srd })[0].fixed);
});
