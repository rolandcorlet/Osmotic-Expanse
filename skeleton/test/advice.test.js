// Advice: what is valid but made the AI Director stumble on the 28 Nov benches (engine/schema.js adviseAdventure).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from './helpers.js';
import { prepare, check } from '../engine/module.js';
import { adviseAdventure } from '../engine/schema.js';

const copy = (x) => JSON.parse(JSON.stringify(x));
const raw = () => ({ module: copy(mod.module), rules: copy(mod.rules), handbook: copy(mod.handbook), bestiary: copy(mod.bestiary), lore: copy(mod.lore), adventures: copy(mod.adventures) });

test('the worked example has no advice', () => {
  assert.deepEqual(check(mod).advice, []);
});
test('each bench lesson is one line of advice, and none of it is an error', () => {
  const r = raw();
  const a = r.adventures[0];
  delete a.quests[0].doneAt;                                                     // a quest with no ending place
  const dock = a.sites.find((s) => s.id === a.start);
  dock.rules = [{ id: 'slide', when: 'enter', do: 'say', say: 'The snow gives way: roll initiative!' }];   // a fight with nothing here
  const withHazard = a.sites.find((s) => (s.hazards || []).length);
  withHazard.hazards[0].fail = 'The crush.';                                     // a cost the Engine cannot pay
  const eel = r.bestiary.creatures[0];
  a.quests.push({ id: 'save-it', text: `Rescue the ${eel.name} from the nets.`, doneAt: [a.start] });   // a captive placed as a creature
  a.sites.push({ id: 'island', name: 'The Island', read: 'Nobody comes here.', notes: 'x', exits: [] });   // out of reach
  const m = prepare(r);
  const tips = adviseAdventure(m, m.adventures[0]);
  const has = (re) => assert.ok(tips.some((t) => re.test(t)), `${re} in:\n${tips.join('\n')}`);
  has(/has no "doneAt"/);
  has(/says a fight begins/);
  has(/give it a number or a condition/);
  has(/rescue or protect/);
  has(/"island" cannot be reached/);
  const c = check(m);
  assert.ok(c.ok, c.errors.join('\n'));
  assert.equal(c.advice.length, tips.length);
});
