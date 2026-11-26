// The fight simulation (engine/simulate.js): every place with creatures is fought many times by the
// pregenerated characters, and the verdicts say where a party wins, is wiped out or is at risk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateAdventure, simText } from '../engine/simulate.js';
import { mod } from './helpers.js';

test('each place with creatures is fought; more characters win more often', () => {
  const adv = mod.adventures[0];
  const two = simulateAdventure({ mod, adventure: adv, heroes: 2, runs: 20 });
  const three = simulateAdventure({ mod, adventure: adv, heroes: 3, runs: 20 });
  assert.deepEqual(two.map((r) => r.site), ['causeway', 'nave', 'bell']);
  assert.ok(two.every((r) => r.runs === 20));
  const won = (rs) => rs.reduce((a, r) => a + r.won, 0);
  assert.ok(won(three) >= won(two));
  const t = simText(two);
  assert.match(t.text, /causeway .* won \d+%/);
  assert.ok(t.problems >= 1, 'the Tidewarden is meant to be deadly in a straight fight');
});
