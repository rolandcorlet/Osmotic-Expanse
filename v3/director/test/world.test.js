// v3 17 Nov: the Director's tools pay the Clocks' bite (Tolerance Thresholds, BADGE dice) and the
// briefing says what is in force.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newSession, apply } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { toolbox } from '../brain/tools.js';
import { briefing } from '../brain/director.js';
import { loadBestiary } from '../data/bestiary-all.js';
import { scenario as ninth } from '../data/ninth-shift.js';
import { scenario as swallow } from '../data/long-swallow.js';

const bestiary = loadBestiary();
function seated(sc) {
  const rng = makeRng(3);
  let s = newSession(sc);
  const ctx = (pid) => ({ role: 'player', pid, rng, now: 0, scenario: sc, bestiary });
  s = apply(s, { type: 'join', name: 'Roly' }, ctx('p1'));
  s = apply(s, { type: 'zero.agree' }, ctx('p1'));
  s = apply(s, { type: 'claim', organismId: 'eyes', name: 'Brost' }, ctx('p1'));
  return { s, rng };
}

test('a Tolerance contest is held to its printed Threshold, which follows the Host\'s mood', () => {
  const { s, rng } = seated(swallow);
  const T = toolbox({ state: s, scenario: swallow, bestiary, rng });
  assert.match(T.run('ask_for_roll', { organism: 'eyes', baseline: 'OSM', pathway: 'Chemoreception', threshold: 12, what_for: 'Answer the Sentinel\'s challenge' }).refused, /AT 14/);
  assert.match(T.run('ask_for_roll', { organism: 'eyes', baseline: 'OSM', pathway: 'Chemoreception', threshold: 14, what_for: 'Answer the Sentinel\'s challenge', sponsored: true }).refused, /AT 10/);
  assert.ok(T.run('ask_for_roll', { organism: 'eyes', baseline: 'OSM', pathway: 'Chemoreception', threshold: 10, what_for: 'Answer the Sentinel\'s challenge', sponsored: true }).waiting_for);
  T.run('move_clock', { clock: 'GOODWILL', change: -1, why: 'struck the wall' });
  assert.match(briefing(T.state, swallow, bestiary), /GOODWILL is Wary/);
  assert.match(briefing(T.state, swallow, bestiary), /Tolerance contest \(a Sentinel's challenge\) is AT 18 now, AT 18 if/);
});

test('BADGE pays dice against the Hegemony and the Court, and only there', () => {
  const { s, rng } = seated(ninth);
  const T = toolbox({ state: s, scenario: ninth, bestiary, rng });
  T.run('move_clock', { clock: 'BADGE', change: 1, why: 'took the good money' });
  T.run('move_clock', { clock: 'BADGE', change: 1, why: 'printed for the Hegemony' });
  T.run('ask_for_roll', { organism: 'eyes', baseline: 'AFF', threshold: 12, what_for: 'Talk the clerk round', facing: 'court' });
  const q = T.state.requests[T.state.requests.length - 1];
  assert.ok(q.pool.mods.some((m) => /BADGE 2, The Contractor/.test(m.label) && m.dice === 1), JSON.stringify(q.pool.mods));
  assert.match(briefing(T.state, ninth, bestiary), /BADGE 2 \(The Contractor\)/);
});

test('the jammed pump: the Director stops CHURN and the briefing says so', () => {
  const { s, rng } = seated(swallow);
  const T = toolbox({ state: s, scenario: swallow, bestiary, rng });
  assert.equal(T.run('move_clock', { clock: 'CHURN', change: 0, stop: true, why: 'the pump is jammed' }).stopped, true);
  assert.match(briefing(T.state, swallow, bestiary), /CHURN is STOPPED/);
  assert.ok(T.run('move_clock', { clock: 'CHURN', change: 1, why: 'schedule' }).refused);
});

test('BADGE is paid once even when the Director adds it too; a jump says only where it landed', () => {
  const { s, rng } = seated(ninth);
  const T = toolbox({ state: s, scenario: ninth, bestiary, rng });
  T.run('ask_for_roll', { organism: 'eyes', baseline: 'AFF', threshold: 12, what_for: 'Argue the clause', facing: 'court', modifiers: [{ label: 'BADGE 0, Kin of the Row', dice: -1 }, { label: 'the exhibit', dice: 1 }] });
  const q = T.state.requests[T.state.requests.length - 1];
  assert.equal(q.pool.mods.filter((m) => /BADGE/.test(m.label)).length, 1, JSON.stringify(q.pool.mods));
  for (let i = 0; i < 4; i++) T.run('end_beat', { why: 'a day' });
  const said = T.state.log.map((e) => e.text);
  assert.ok(said.some((t) => /PAPER 4: the decision is issued/.test(t)));
  assert.ok(!said.some((t) => /PAPER 3:/.test(t)), 'the hearing was not moved forward; the date came');
});

test('LICENCE stages are said at the segment the book prints', () => {
  const { s, rng } = seated(swallow);
  const T = toolbox({ state: s, scenario: swallow, bestiary, rng });
  for (let i = 0; i < 3; i++) T.run('end_beat', { why: 'a day' });
  const said = T.state.log.map((e) => e.text);
  assert.ok(said.some((t) => /LICENCE 3: the first cut/.test(t)), said.join(' | '));
  assert.ok(!said.some((t) => /LICENCE 2: the first cut/.test(t)));
});
