// The bench script's quest checks: a quest is expected to finish only when the walk reaches the earlier
// place the item it hands over was won at. Otherwise the step is left out, not failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateScript } from '../engine/script-gen.js';

const adv = (questDone) => ({
  quests: ['Find the bell.', 'Ring the bell at the tower.'],
  questDone,
  sites: [
    { id: 'gate', name: 'The Gate', exits: [{ to: 'yard', label: 'into the yard' }] },
    { id: 'yard', name: 'The Yard', exits: [{ to: 'gate', label: 'back to the gate' }, { to: 'tower', label: 'up to the tower' }] },
    { id: 'tower', name: 'The Tower', exits: [{ to: 'yard', label: 'down to the yard' }] },
    { id: 'crypt', name: 'The Crypt', exits: [] },
  ],
});
const sayings = (script) => script.filter((s) => s.expect && s.expect.includes('complete_quest')).map((s) => s.gen);

test('a quest whose earlier place the walk reaches is expected to finish', () => {
  const script = generateScript(adv([
    { match: 'find the bell', at: ['yard'], when: 'the bell is found' },
    { match: 'ring the bell', at: ['tower'], when: 'the bell is rung' },
  ]), { places: 6, heroes: 2 });
  assert.deepEqual(sayings(script), ['quest find the bell', 'quest ring the bell']);
});

test('a quest whose earlier place the walk never reaches is not expected to finish', () => {
  const script = generateScript(adv([
    { match: 'find the bell', at: ['crypt'], when: 'the bell is found' },
    { match: 'ring the bell', at: ['tower'], when: 'the bell is rung' },
  ]), { places: 6, heroes: 2 });
  assert.deepEqual(sayings(script), []);
});

test('a place whose rule calms its monsters on a check gets a try at that, not an attack', () => {
  const a = { quests: [], sites: [
    { id: 'road', name: 'The Road', exits: [{ to: 'fort', label: 'to the fort' }] },
    { id: 'fort', name: 'The Fort', exits: [{ to: 'road', label: 'back' }], foes: [{ monster: 'guard', name: 'Patrol', count: 2 }], rules: [{ when: 'succeed persuasion', do: 'calm', target: 'Patrol' }] },
  ] };
  const s = generateScript(a, { places: 4, heroes: 2 }).filter((x) => x.at === 'fort');
  assert.ok(s.some((x) => /Persuasion/.test(x.say) && x.expect.includes('ask_for_roll')));
  assert.ok(!s.some((x) => /attack/i.test(x.say)));
});
