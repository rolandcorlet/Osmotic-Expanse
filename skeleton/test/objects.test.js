// A place's objects and the rules that wait for them (upgrade plan step 5, from the D&D Director):
// "use <object>", "if carries <item>", "do give", the Director's use_object and the screens' Use buttons.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRules } from '../engine/triggers.js';
import { briefing } from '../brain/director.js';
import { toolbox } from '../brain/tools.js';
import { makeRng } from '../engine/dice.js';
import { mod, table, diver } from './helpers.js';

const adv = mod.ix.adventure[mod.adventures[0].id];
const start = adv.sites.find((x) => x.id === adv.start);
start.objects = ['Sea chest', { name: 'Lamp room door', about: 'Locked, brass.' }];
start.rules = [...(start.rules || []),
  { id: 'chest', when: 'use sea chest', do: 'give', item: 'Brass key', say: 'Under the oilcloth: a brass key.' },
  { id: 'door-open', when: 'use lamp room door', if: 'carries brass key', do: 'say', say: 'The key turns.', once: false },
  { id: 'door-shut', when: 'use lamp room door', if: 'not carries brass key', do: 'say', say: 'The door will not move.', once: false }];

test('objects check with the module; a rule for an object that is not there is named', () => {
  assert.deepEqual(checkRules(mod, adv), []);
  const bad = { ...adv, sites: [{ id: 'x', objects: ['Bell'], rules: [{ when: 'use organ', do: 'give' }] }], rules: [] };
  const e = checkRules(mod, bad).join('\n');
  assert.match(e, /no object here is called "organ" \(objects: Bell\)/);
  assert.match(e, /say what is given/);
});

test('using the chest gives the user the key; the door then opens for them only', () => {
  const T = table(3);
  const a = diver(T, 'p1', 0);
  const b = diver(T, 'p2', 1);
  T.as('p2', { type: 'object.use', who: b.id, object: 'lamp room door', how: 'try' });
  assert.ok(T.s.story.some((e) => /tries the Lamp room door/.test(e.text)));
  assert.ok(T.s.story.some((e) => /door will not move/.test(e.text)));
  T.as('p1', { type: 'object.use', who: a.id, object: 'chest', how: 'open' });
  assert.deepEqual(T.s.chars[a.id].items, ['Brass key']);
  assert.ok(T.s.story.some((e) => /gets Brass key/.test(e.text)));
  T.as('p1', { type: 'object.use', who: a.id, object: 'lamp room door' });
  assert.ok(T.s.story.some((e) => /The key turns/.test(e.text)));
  // The chest gives once.
  T.as('p2', { type: 'object.use', who: b.id, object: 'sea chest' });
  assert.equal((T.s.chars[b.id].items || []).length, 0);
  assert.throws(() => T.as('p2', { type: 'object.use', who: a.id, object: 'chest' }), /not your character/);
});

test('the Director sees the objects here and can use one', () => {
  const T = table(4);
  const a = diver(T, 'p1', 0);
  assert.match(briefing(T.s, mod, {}), /Objects here: Sea chest, Lamp room door: Locked, brass\./);
  const tb = toolbox({ state: T.s, mod, rng: makeRng(2), now: 2 });
  const out = tb.run('use_object', { character: a.name, object: 'sea chest', how: 'open' });
  assert.ok(!out.refused, JSON.stringify(out));
  assert.deepEqual(tb.state.chars[a.id].items, ['Brass key']);
  assert.ok(tb.run('use_object', { character: a.name, object: '' }).refused);
});
